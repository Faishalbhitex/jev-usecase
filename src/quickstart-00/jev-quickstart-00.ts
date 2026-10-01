/**
 * jev-quickstart-with-openrouter-00.ts
 *
 * Quickstart: memanggil TypeSafe Jev lewat OpenRouter Decisions API.
 * Jev BUKAN LLM — ia tidak generate teks. Ia menerima `state` (fakta padat)
 * + pertanyaan terstruktur (choice / noul / score), lalu mengembalikan
 * jawaban + probabilitas terkalibrasi.
 *
 * Cara jalan:
 *   export OPENROUTER_API_KEY=sk-or-...
 *   export OPENROUTER_BASE_URL=https://openrouter.ai/api/v1   # opsional
 *   export JEV_MODEL=typesafe/jev-1.13                        # opsional
 *   npm run q00        # atau: npx tsx src/jev-quickstart-with-openrouter-00.ts
 */

// ---------------------------------------------------------------------------
// Konfigurasi dari environment
// ---------------------------------------------------------------------------

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("ERROR: OPENROUTER_API_KEY belum di-set.");
  console.error("Contoh: export OPENROUTER_API_KEY=sk-or-...");
  process.exit(1);
}

// Decisions API hidup di /api/alpha/decisions (bukan /api/v1).
const baseUrl = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const decisionsUrl = baseUrl.replace(/\/v1$/, "") + "/alpha/decisions";

// Model bisa di-override; default pin ke versi stabil.
const model = process.env.JEV_MODEL ?? "typesafe/jev-1.13";

// ---------------------------------------------------------------------------
// Tipe pertanyaan & jawaban Jev
// ---------------------------------------------------------------------------

type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria?: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

interface DecisionsRequest {
  model: string;
  state: string;
  questions: Record<string, Question>;
}

interface DecisionsResponse {
  id: string;
  model: string;
  provider: string;
  answers: Record<string, any>;
  usage?: {
    cost?: number;
    inputTokens?: number;
    outputTokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

// ---------------------------------------------------------------------------
// Contoh state: triase tiket support (1 state, 3 pertanyaan paralel)
// ---------------------------------------------------------------------------

const requestBody: DecisionsRequest = {
  model,
  state:
    "Tiket #4821 dari pelanggan paket Pro. Isi: 'Saya kena charge dua kali bulan ini, " +
    "tolong refund salah satunya secepatnya.' Riwayat: tidak pernah telat bayar. " +
    "Alternatif: (a) teruskan ke tim billing — sesuai karena ini sengketa tagihan; " +
    "(b) jawab otomatis — ditolak karena pelanggan minta tindakan spesifik; " +
    "(c) eskalasi ke manajer — belum perlu karena belum ada penolakan.",
  questions: {
    intent: {
      type: "choice",
      instructions: "Tim mana yang seharusnya menangani tiket ini?",
      criteria: {
        billing: "Sengketa tagihan, refund, atau pembayaran.",
        technical: "Bug produk atau masalah integrasi.",
        other: "Di luar billing dan technical.",
      },
    },
    escalate: {
      type: "noul",
      instructions: "Apakah tiket ini perlu dieskalasi ke manajer sekarang?",
    },
    urgency: {
      type: "score",
      instructions: "Seberapa mendesak tiket ini?",
      criteria: ["bisa menunggu", "minggu ini", "hari ini"],
    },
  },
};

// ---------------------------------------------------------------------------
// Panggil API
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Model : ${model}`);
  console.log(`URL   : ${decisionsUrl}\n`);

  const res = await fetch(decisionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Faishalbhitex/jev-usecase",
      "X-Title": "jev-usecase quickstart",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`ERROR: HTTP ${res.status}\n${text.slice(0, 500)}`);
    if (res.status === 401 || res.status === 403) {
      console.error("\nPetunjuk: cek OPENROUTER_API_KEY (awalan sk-or-...).");
    }
    process.exit(1);
  }

  const data = (await res.json()) as DecisionsResponse;

  console.log("--- answers ---");
  for (const [name, ans] of Object.entries(data.answers)) {
    console.log(`\n[${name}] type=${ans.type}`);
    if (ans.type === "choice") {
      console.log(`  choice      : ${ans.choice}`);
      console.log(`  confidence  : ${ans.confidence}`);
      console.log(`  probabilities: ${JSON.stringify(ans.probabilities)}`);
      console.log(`  interpretasi: ${ans.confidence < 0.4 ? "UNCERTAIN (confidence < 0.4)" : "OK"}`);
    } else if (ans.type === "noul") {
      const verdict = ans.noul >= 0.7 ? "YES" : ans.noul <= 0.3 ? "NO" : "UNCERTAIN";
      console.log(`  noul  : ${ans.noul} -> ${verdict}`);
    } else if (ans.type === "score") {
      console.log(`  score : ${ans.score} (abaikan agregat; baca per-dimensi)`);
      console.log(`  legend: ${JSON.stringify(ans.legend)}`);
      if (ans.probabilities) {
        console.log(`  probabilities: ${JSON.stringify(ans.probabilities)}`);
      }
    } else {
      console.log(`  ${JSON.stringify(ans)}`);
    }
  }

  if (data.usage) {
    const inTok = data.usage.inputTokens ?? data.usage.input_tokens;
    const outTok = data.usage.outputTokens ?? data.usage.output_tokens;
    console.log(`\nusage: inputTokens=${inTok} outputTokens=${outTok} cost=$${data.usage.cost}`);
  }
  console.log(`\nresponse id: ${data.id} | served model: ${data.model}`);
}

main().catch((err) => {
  console.error("ERROR:", err.message ?? err);
  process.exit(1);
});
