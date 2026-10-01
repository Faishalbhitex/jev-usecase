/**
 * jev-tool-routing-langgraph-03.ts — Eksperimen 03.
 *
 * Tool routing end-to-end dengan LangGraph + Jev sebagai decision model.
 * Pola resmi dari skill `langgraph-decision-models`: Jev mengklasifikasi
 * (satu request, semua pertanyaan), lalu ROUTER BERUPA FUNGSI BIASA
 * (bukan LLM) memutuskan cabang lewat conditional edges:
 *
 *   query -> [jev_classify] -> route = "direct" | "llm" | "reject"
 *     direct : p_top >= 0.7  -> tool LangChain dieksekusi LANGSUNG (tanpa LLM)
 *     llm    : 0.3 < p_top < 0.7 -> Gemini, dengan klasifikasi Jev dilampirkan
 *     reject : p_top <= 0.3  -> yakin tidak ada tool cocok, tanpa panggil model
 *
 * Threshold 0.7/0.3 adalah titik awal; kalibrasi dengan ~100 label lokal
 * per workload (lihat paper JEV-as-a-Judge & skill langgraph-decision-models:
 * confidence mengukur bentuk distribusi, bukan kebenaran — gate hanya di
 * zona ambigu).
 *
 * Tools di sini adalah fungsi lokal deterministik (data contoh), agar jalur
 * "eksekusi langsung dari hasil klasifikasi Jev" bisa dibuktikan tanpa
 * tergantung API eksternal. Tool menerima { query } dan mengekstrak sendiri
 * kebutuhannya dengan aturan sederhana (demo-grade; produksi: slot-filling).
 *
 * Kaki Gemini memakai SDK resmi @google/genai (interactions API) sesuai skill
 * gemini-api-dev. Kaki OpenRouter dan Ollama memakai paket `openai` lewat
 * endpoint OpenAI-compatible masing-masing. Dari VM ini, cabang llm bisa
 * diuji dengan LLM_PROVIDER=openrouter atau ollama (konektor vault tersedia);
 * Gemini butuh GEMINI_API_KEY valid (jalankan dari VPS bila perlu).
 *
 * Cara jalan:
 *   export OPENROUTER_API_KEY=<redacted>   # untuk Jev (+ llm via OpenRouter)
 *   export GEMINI_API_KEY=<redacted>            # opsional, untuk llm via Gemini
 *   export LLM_PROVIDER=openrouter                # atau "gemini" (default) atau "ollama"
 *   export OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free  # opsional
 *   export GEMINI_MODEL=gemini-3.8-flash          # opsional
 *   export OLLAMA_MODEL=gpt-oss:20b               # opsional (model cloud Ollama)
 *   npm install && npm run q03
 *
 * Output dibuat verbose: model Jev + model LLM, daftar tools, query per kasus,
 * top-3 probabilitas Jev, alasan route, prompt mentah + jawaban mentah LLM,
 * pilihan tool hasil parsing, hasil eksekusi, dan token per kasus + total.
 */

import { StateGraph, StateSchema, START, END } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { noul } from "@typesafe-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { createJevClient } from "./jev-openrouter-transport.js";

// ---------------------------------------------------------------------------
// Tools: fungsi lokal deterministik (data contoh, bukan API eksternal)
// ---------------------------------------------------------------------------

const CITIES = [
  "jakarta", "surabaya", "bandung", "medan", "denpasar",
  "makassar", "yogyakarta", "semarang", "palembang", "balikpapan",
];

const getWeather = tool(
  async ({ query }: { query: string }) => {
    const q = query.toLowerCase();
    const city = CITIES.find((c) => q.includes(c));
    if (!city) return "Kota tidak dikenali dalam query. (data contoh)";
    const nama = city.charAt(0).toUpperCase() + city.slice(1);
    return "Cuaca di " + nama + ": cerah berawan, 31C, kelembapan 70%. (data contoh statis)";
  },
  {
    name: "get_weather",
    description:
      "Memberikan prakiraan cuaca untuk sebuah kota yang disebut di query. Data contoh statis.",
    schema: z.object({ query: z.string().describe("Query asli pengguna") }),
  },
);

const calculate = tool(
  async ({ query }: { query: string }) => {
    let expr = query
      .toLowerCase()
      .replace(/dikali|dikalikan|\bkali\b|x/g, "*")
      .replace(/dibagi|dibagikan|\bbagi\b|:/g, "/")
      .replace(/ditambah|ditambahkan|\btambah\b/g, "+")
      .replace(/dikurangi|dikurangkan|\bkurang\b/g, "-")
      .replace(/berapa|hitung|hitunglah|kalkulasi/g, "");
    const cleaned = expr.replace(/[^0-9+\-*/().\s]/g, "").trim();
    if (!cleaned || !/[0-9]/.test(cleaned)) {
      return "Tidak menemukan ekspresi angka dalam query.";
    }
    try {
      const val = new Function('"use strict"; return (' + cleaned + ");")();
      if (typeof val !== "number" || !isFinite(val)) return "Hasil tidak valid.";
      return cleaned + " = " + val;
    } catch {
      return "Gagal menghitung ekspresi.";
    }
  },
  {
    name: "calculate",
    description:
      "Menghitung ekspresi aritmetika sederhana (tambah, kurang, kali, bagi) dari angka di query.",
    schema: z.object({ query: z.string().describe("Query asli pengguna") }),
  },
);

const getTime = tool(
  async (_args: { query: string }) => {
    const now = new Date();
    const s = now.toLocaleString("id-ID", {
      timeZone: "Asia/Makassar",
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    return "Waktu saat ini (WITA): " + s;
  },
  {
    name: "get_time",
    description: "Memberikan jam dan tanggal saat ini (WITA).",
    schema: z.object({ query: z.string().describe("Query asli pengguna") }),
  },
);

const RATES: Record<string, number> = {
  USD: 16500, EUR: 17800, SGD: 12300, JPY: 112, GBP: 20800, MYR: 3500, IDR: 1,
};

const convertCurrency = tool(
  async ({ query }: { query: string }) => {
    const q = query.toLowerCase();
    const amountMatch = q.match(/(\d[\d.,]*)/);
    if (!amountMatch) return "Tidak menemukan nominal dalam query.";
    const amount = parseFloat(amountMatch[1].replace(/\./g, "").replace(",", "."));
    const findCur = (): string | null => {
      if (q.includes("dolar singapura") || q.includes("dolar singapore")) return "SGD";
      if (q.includes("dolar")) return "USD";
      if (q.includes("rupiah") || q.includes("rp")) return "IDR";
      if (q.includes("euro")) return "EUR";
      if (q.includes("yen")) return "JPY";
      if (q.includes("pound") || q.includes("sterling")) return "GBP";
      if (q.includes("ringgit")) return "MYR";
      return null;
    };
    // heuristik sederhana: mata uang pertama = asal, kedua = tujuan
    const curs: string[] = [];
    const q2 = q;
    const order: Array<[RegExp, string]> = [
      [/dolar singapura|dolar singapore/, "SGD"],
      [/\bdolar\b/, "USD"],
      [/\brupiah\b|\brp\b/, "IDR"],
      [/\beuro\b/, "EUR"],
      [/\byen\b/, "JPY"],
      [/\bpound\b|\bsterling\b/, "GBP"],
      [/\bringgit\b/, "MYR"],
    ];
    for (const [re, code] of order) {
      if (re.test(q2)) curs.push(code);
    }
    const from = findCur();
    const to = curs.length > 1 ? curs[1] : curs.length === 1 && curs[0] !== from ? curs[0] : null;
    if (!from || !to) {
      return "Tidak menemukan pasangan mata uang dalam query. (kurs contoh statis)";
    }
    const result = (amount * RATES[from]) / RATES[to];
    const fmt = (n: number) =>
      n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
    return (
      fmt(amount) + " " + from + " = " + fmt(result) + " " + to + " (kurs contoh statis)"
    );
  },
  {
    name: "convert_currency",
    description:
      "Mengonversi nominal antar mata uang (dolar, rupiah, euro, yen, dst). Kurs contoh statis.",
    schema: z.object({ query: z.string().describe("Query asli pengguna") }),
  },
);

const DICT: Record<string, string> = {
  rindu: "perasaan ingin sekali bertemu atau mengalami kembali sesuatu.",
  senja: "waktu menjelang matahari terbenam; cahaya kemerahan di langit sore.",
  "gotong royong": "bekerja bersama-sama untuk kepentingan bersama.",
  lelah: "kehilangan tenaga; perlu istirahat.",
  sembari: "sambil; ketika melakukan sesuatu yang lain.",
};

const defineWord = tool(
  async ({ query }: { query: string }) => {
    const q = query.toLowerCase();
    let w: string | null = null;
    const m1 = q.match(/kata\s+['"]?([a-z\s]+?)['"]?\s*($|\?)/);
    const m2 = q.match(/['"]([a-z\s]+)['"]/);
    const m3 = q.match(/arti\s+([a-z]+)/);
    w = (m1?.[1] ?? m2?.[1] ?? m3?.[1] ?? "").trim();
    if (!w) return "Kata tidak terdeteksi dalam query.";
    const def = DICT[w];
    if (!def) return "Kata '" + w + "' tidak ada di kamus contoh.";
    return w + ": " + def + " (kamus contoh)";
  },
  {
    name: "define_word",
    description:
      "Memberikan definisi singkat sebuah kata Bahasa Indonesia. Kamus contoh kecil.",
    schema: z.object({ query: z.string().describe("Query asli pengguna") }),
  },
);

const TOOLS = [getWeather, calculate, getTime, convertCurrency, defineWord];
const TOOLMAP: Record<string, (typeof TOOLS)[number]> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

// ---------------------------------------------------------------------------
// Graph: Jev classify -> router fungsi biasa -> direct | llm | reject
// ---------------------------------------------------------------------------

const CONFIDENT = parseFloat(process.env.JEV_CONFIDENT ?? "0.7"); // p_top >= ini -> eksekusi langsung
const REJECT_BELOW = parseFloat(process.env.JEV_REJECT_BELOW ?? "0.3"); // p_top <= ini -> yakin tidak cocok

const State = new StateSchema({
  query: z.string(),
  probs: z.record(z.string(), z.number()).default({}),
  topTool: z.string().default(""),
  topP: z.number().default(0),
  route: z.string().default(""),
  result: z.string().default(""),
  llmPrompt: z.string().default(""),
  llmRaw: z.string().default(""),
  llmPick: z.string().default(""),
  llmModel: z.string().default(""),
  llmIn: z.number().default(0),
  llmOut: z.number().default(0),
  jevIn: z.number().default(0),
  jevOut: z.number().default(0),
});

type S = typeof State.State;

const client = createJevClient();

/** Node 1: satu panggilan Jev, satu pertanyaan noul per tool (paralel). */
const jevClassify = async (state: S) => {
  const questions: Record<string, ReturnType<typeof noul>> = {};
  for (const t of TOOLS) {
    questions[t.name] = noul(
      'Apakah tool "' + t.name + '" (' + t.description + ") relevan untuk menangani query ini?",
    );
  }
  const { answers, usage } = await client.systemOne({
    state: {
      query: state.query,
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    },
    questions,
  });
  const probs: Record<string, number> = {};
  for (const t of TOOLS) probs[t.name] = answers[t.name].noul;
  const ranked = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  const [topTool, topP] = ranked[0];
  const route = topP >= CONFIDENT ? "direct" : topP <= REJECT_BELOW ? "reject" : "llm";
  return {
    probs, topTool, topP, route,
    jevIn: state.jevIn + usage.input_tokens,
    jevOut: state.jevOut + usage.output_tokens,
  };
};

/** Router: fungsi biasa membaca state (bukan LLM). */
const routeFn = (state: S) => state.route;

/** Node 2a: eksekusi tool langsung dari hasil klasifikasi Jev. */
const directExec = async (state: S) => {
  const t = TOOLMAP[state.topTool];
  const out = await t.invoke({ query: state.query });
  return { result: String(out) };
};

/** Node 2b: cabang ambigu -> LLM dengan klasifikasi Jev dilampirkan.
 *
 * Tiga provider, pilih via LLM_PROVIDER:
 *   - "gemini"     (default): SDK resmi @google/genai, butuh GEMINI_API_KEY.
 *   - "openrouter"           : model gratis OpenRouter via endpoint yang
 *                              OpenAI-compatible (paket `openai`), butuh
 *                              OPENROUTER_API_KEY (sudah ada untuk Jev).
 *   - "ollama"               : model cloud Ollama via endpoint OpenAI-compatible
 *                              https://ollama.com/v1 (paket `openai`), auth via
 *                              surrogate konektor custom.ollama (./authd-surrogate.ts).
 * Model masing-masing via GEMINI_MODEL / OPENROUTER_MODEL / OLLAMA_MODEL.
 *
 * LLM hanya MEMILIH tool (dipar-parsing dari baris "TOOL: <nama>"); pilihan
 * divalidasi lalu tool dieksekusi — hasilnya yang ditampilkan sebagai hasil kasus.
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const LLM_PROVIDER = process.env.LLM_PROVIDER ?? "gemini";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3.5-lightning:free";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";
const OLLAMA_BASE_URL = "https://ollama.com/v1";

/** Label "provider/model" untuk ditampilkan di output. */
function llmLabel(): string {
  if (LLM_PROVIDER === "openrouter") return "openrouter/" + OPENROUTER_MODEL;
  if (LLM_PROVIDER === "ollama") return "ollama/" + OLLAMA_MODEL;
  return "gemini/" + GEMINI_MODEL;
}

const llmFallback = async (state: S) => {
  const ranked = Object.entries(state.probs)
    .sort((a, b) => b[1] - a[1])
    .map(([n, p]) => "- " + n + ": " + p.toFixed(2))
    .join("\n");
  const prompt =
    "Anda adalah router cadangan. Query pengguna: \"" + state.query + "\"\n" +
    "Klasifikasi awal model Jev (probabilitas tiap tool):\n" + ranked + "\n" +
    'Pilih SATU tool yang paling tepat, atau "tidak_ada".\n' +
    "Jawab dengan format: TOOL: <nama_tool> | ALASAN: <satu kalimat>";

  // Panggil provider -> { raw, inTok, outTok }. Gemini tidak mengembalikan usage.
  let raw: string;
  let inTok = 0;
  let outTok = 0;
  if (LLM_PROVIDER === "openrouter" || LLM_PROVIDER === "ollama") {
    const { default: OpenAI } = await import("openai");
    let chat;
    if (LLM_PROVIDER === "openrouter") {
      chat = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/Faishalbhitex/jev-usecase",
          "X-Title": "jev-usecase q03 llm-fallback",
        },
      });
    } else {
      // Ollama cloud: OpenAI-compatible di https://ollama.com/v1.
      // Auth: OLLAMA_API_KEY bila di-set (mis. di VPS); kalau tidak, pakai
      // surrogate konektor custom.ollama (ditukar egress proxy di VM Muse).
      let apiKey = process.env.OLLAMA_API_KEY;
      if (!apiKey) {
        const { getSurrogate } = await import("./authd-surrogate.js");
        apiKey = (await getSurrogate("custom.ollama")).surrogate;
      }
      chat = new OpenAI({ baseURL: OLLAMA_BASE_URL, apiKey });
    }
    const model = LLM_PROVIDER === "openrouter" ? OPENROUTER_MODEL : OLLAMA_MODEL;
    const completion = await chat.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      // model reasoning gratis berpikir lantang dulu sebelum menjawab,
      // jadi beri budget token cukup agar sampai ke baris TOOL:
      max_tokens: 600,
    });
    raw = completion.choices[0]?.message?.content ?? "(kosong)";
    inTok = completion.usage?.prompt_tokens ?? 0;
    outTok = completion.usage?.completion_tokens ?? 0;
  } else {
    if (!process.env.GEMINI_API_KEY) {
      return {
        llmPrompt: prompt,
        llmRaw: "",
        llmPick: "(dilewati)",
        llmModel: llmLabel(),
        result:
          "[llm] dilewati: GEMINI_API_KEY tidak tersedia. " +
          "Prompt yang AKAN dikirim tersimpan di state.llmPrompt.",
      };
    }
    const ai = new GoogleGenAI({});
    const interaction = await ai.interactions.create({
      model: GEMINI_MODEL,
      input: prompt,
    });
    raw = interaction.output_text ?? "(kosong)";
  }

  // Parse pilihan, validasi, lalu EKSEKUSI tool yang dipilih.
  const pick = raw.match(/TOOL:\s*([a-z_]+)/i)?.[1]?.toLowerCase() ?? "";
  const toolFn = TOOLMAP[pick];
  let execNote: string;
  if (toolFn) {
    const out = await toolFn.invoke({ query: state.query });
    execNote = "dieksekusi -> " + String(out);
  } else if (pick === "tidak_ada" || pick === "") {
    execNote = "tidak ada tool dipilih/dieksekusi";
  } else {
    execNote = 'pilihan "' + pick + '" tidak valid, tidak dieksekusi';
  }
  return {
    llmPrompt: prompt,
    llmRaw: raw,
    llmPick: pick || "(tidak ter-parse)",
    llmModel: llmLabel(),
    llmIn: inTok,
    llmOut: outTok,
    result:
      "[llm:" + llmLabel() + "] pilih=" + (pick || "?") + " | " + execNote,
  };
};

/** Node 2c: Jev yakin tidak ada tool yang cocok. */
const reject = async (state: S) => ({
  result:
    "Jev yakin tidak ada tool yang cocok (p_max=" + state.topP.toFixed(2) + "). Query dijawab tanpa tool.",
});

const graph = new StateGraph(State)
  .addNode("jev_classify", jevClassify)
  .addNode("direct", directExec)
  .addNode("llm", llmFallback)
  .addNode("reject", reject)
  .addEdge(START, "jev_classify")
  .addConditionalEdges("jev_classify", routeFn, ["direct", "llm", "reject"])
  .addEdge("direct", END)
  .addEdge("llm", END)
  .addEdge("reject", END)
  .compile();

// ---------------------------------------------------------------------------
// Eksperimen
// ---------------------------------------------------------------------------

const CASES = [
  "Cuaca di Jakarta hari ini bagaimana?",
  "Berapa 128 dikali 45?",
  "Jam berapa sekarang?",
  "Halo, apa kabar?",
  "Konversikan 100 dolar ke rupiah",
  "Tolong carikan prakiraan cuaca Jakarta",
];

async function main() {
  console.log("Jev model : " + client.defaultModel);
  console.log("LLM       : " + llmLabel() + (LLM_PROVIDER === "ollama" ? " (" + OLLAMA_BASE_URL + ")" : ""));
  console.log("Graph     : jev_classify -> {direct|llm|reject}");
  console.log("Aturan    : p>=" + CONFIDENT + " direct; p<=" + REJECT_BELOW + " reject; tengah -> llm");
  console.log("Tools (" + TOOLS.length + ") :");
  for (const t of TOOLS) console.log("  - " + t.name + ": " + t.description);
  console.log();

  let jevIn = 0;
  let jevOut = 0;
  let llmIn = 0;
  let llmOut = 0;
  let llmCalls = 0;
  const routes: Record<string, number> = { direct: 0, llm: 0, reject: 0 };

  for (const [i, query] of CASES.entries()) {
    const s = await graph.invoke({ query });
    // agregasi per kasus (invoke selalu mulai dari state kosong)
    jevIn += s.jevIn;
    jevOut += s.jevOut;
    llmIn += s.llmIn;
    llmOut += s.llmOut;
    if (s.route === "llm") llmCalls++;
    routes[s.route] = (routes[s.route] ?? 0) + 1;

    const top3 = Object.entries(s.probs as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n, p]) => n + "(" + (p as number).toFixed(2) + ")")
      .join(", ");
    console.log("--- kasus " + (i + 1) + ': "' + query + '"');
    console.log("    jev top3 : " + top3);
    if (s.route === "direct") {
      console.log(
        "    route    : DIRECT -> " + s.topTool +
        " (p=" + s.topP.toFixed(2) + " >= " + CONFIDENT + ")",
      );
    } else if (s.route === "reject") {
      console.log(
        "    route    : REJECT (p=" + s.topP.toFixed(2) + " <= " + REJECT_BELOW +
        ", Jev yakin tidak ada tool cocok)",
      );
    } else {
      console.log(
        "    route    : LLM (p=" + s.topP.toFixed(2) + " zona ambigu, model " + s.llmModel + ")",
      );
      console.log("    llm prompt:");
      for (const line of String(s.llmPrompt).split("\n")) console.log("      | " + line);
      console.log(
        "    llm raw  : " + String(s.llmRaw).slice(0, 300).replace(/\s+/g, " "),
      );
      console.log("    llm pilih: " + s.llmPick);
    }
    console.log("    hasil    : " + s.result);
    let tok = "jev " + s.jevIn + " in / " + s.jevOut + " out";
    if (s.route === "llm") tok += "; llm " + s.llmIn + " in / " + s.llmOut + " out";
    console.log("    tokens   : " + tok);
    console.log();
  }

  console.log("=== ringkasan ===");
  console.log("routes       : " + JSON.stringify(routes));
  console.log("jev tokens   : " + jevIn + " in / " + jevOut + " out (" + CASES.length + " kasus)");
  console.log(
    "llm tokens   : " + llmIn + " in / " + llmOut + " out (" +
    llmCalls + " panggilan, " + llmLabel() + ")",
  );
}

main().catch((err) => {
  console.error("ERROR:", err.message ?? err);
  process.exit(1);
});
