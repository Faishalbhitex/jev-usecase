/**
 * jev-tool-routing-02.ts -- Eksperimen 02 (DITUNDA).
 *
 * Hipotesis (PLAN.md #1): Jev menyaring kandidat tools dari katalog besar
 * menjadi subset kecil, lalu LLM hanya memilih dari subset itu.
 *
 * Memakai SDK resmi `@typesafe-ai/sdk` (TypeSafeClient + systemOne + `noul`);
 * transport ke OpenRouter via modul bersama ./jev-openrouter-transport.ts.
 *
 * Cara jalan:
 *   export OPENROUTER_API_KEY=<redacted>
 *   npm run q02
 */


import { noul } from "@typesafe-ai/sdk";
import { createJevClient } from "./jev-openrouter-transport.js";

const client = createJevClient();

// ---------------------------------------------------------------------------
// Katalog tools (simulasi toolbox agen) & kasus uji
// ---------------------------------------------------------------------------

interface Tool {
  name: string;
  description: string;
}

const TOOLS: Tool[] = [
  { name: "search_web", description: "Mencari informasi terkini di internet." },
  { name: "get_weather", description: "Melihat prakiraan cuaca sebuah kota." },
  { name: "send_email", description: "Mengirim email ke seseorang." },
  { name: "create_calendar_event", description: "Membuat acara atau jadwal di kalender." },
  { name: "calculate", description: "Melakukan perhitungan matematika." },
  { name: "translate", description: "Menerjemahkan teks antar bahasa." },
  { name: "read_file", description: "Membaca isi sebuah file di komputer." },
  { name: "database_query", description: "Mengambil data dari database." },
  { name: "book_flight", description: "Mencari atau memesan tiket pesawat." },
  { name: "summarize_text", description: "Meringkas teks yang panjang." },
];

interface TestCase {
  query: string;
  expected: string | null; // tool yang seharusnya relevan; null = tidak butuh tool
}

const CASES: TestCase[] = [
  { query: "Cuaca di Jakarta besok sore gimana?", expected: "get_weather" },
  {
    query: "Tolong kirim email ke Budi, kasih tahu rapat diundur ke jam 3 sore.",
    expected: "send_email",
  },
  { query: "Berapa 15% dari 2.450.000?", expected: "calculate" },
  { query: "Terjemahkan 'good morning' ke bahasa Jepang.", expected: "translate" },
  {
    query: "Jadwalkan meeting dengan tim produk hari Jumat jam 10 pagi.",
    expected: "create_calendar_event",
  },
  { query: "Halo, apa kabar?", expected: null },
];

const THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Eksperimen
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Model     : ${client.defaultModel}`);
  console.log(`Tools     : ${TOOLS.length} kandidat`);
  console.log(`Threshold : p >= ${THRESHOLD}\n`);

  let hits = 0;
  let graded = 0;
  let totalSubsetSize = 0;
  let totalIn = 0;
  let totalOut = 0;

  for (const [i, tc] of CASES.entries()) {
    // Satu pertanyaan noul per tool — semuanya paralel dalam satu panggilan.
    const questions: Record<string, ReturnType<typeof noul>> = {};
    for (const t of TOOLS) {
      questions[t.name] = noul(
        `Apakah tool "${t.name}" (${t.description}) relevan untuk menangani query pengguna ini?`,
      );
    }

    const { answers, usage, model } = await client.systemOne({
      state: {
        query: tc.query,
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
      },
      questions,
    });

    const ranked = TOOLS.map((t) => ({ name: t.name, p: answers[t.name].noul })).sort(
      (a, b) => b.p - a.p,
    );
    const subset = ranked.filter((r) => r.p >= THRESHOLD);
    totalSubsetSize += subset.length;
    totalIn += usage.input_tokens;
    totalOut += usage.output_tokens;

    console.log(`--- kasus ${i + 1}: "${tc.query}"`);
    const subsetStr = subset.length > 0
      ? subset.map(function (r) { return r.name + "(" + r.p.toFixed(2) + ")"; }).join(", ")
      : "(kosong - tidak butuh tool)";
    console.log("    subset (" + subset.length + "/" + TOOLS.length + "): " + subsetStr);

    if (tc.expected !== null) {
      graded++;
      const rank = ranked.findIndex((r) => r.name === tc.expected) + 1;
      const p = ranked[rank - 1].p;
      const ok = p >= THRESHOLD;
      if (ok) hits++;
      console.log(
        `    ekspektasi: ${tc.expected} → p=${p.toFixed(2)} (peringkat ${rank}/${TOOLS.length}) ${ok ? "✓ LOLOS" : "✗ GAGAL"}`,
      );
    } else {
      const ok = subset.length === 0;
      console.log(`    ekspektasi: tanpa tool ${ok ? "✓ BENAR" : "✗ SALAH"}`);
    }
    if (i === 0) console.log(`    (served model: ${model})`);
    console.log();
  }

  console.log("=== ringkasan ===");
  console.log(`recall tool ekspektasi : ${hits}/${graded}`);
  console.log(
    `rata-rata subset      : ${(totalSubsetSize / CASES.length).toFixed(1)} dari ${TOOLS.length} tools`,
  );
  console.log(`token total           : ${totalIn} in / ${totalOut} out`);
}

main().catch((err) => {
  console.error("ERROR:", err.message ?? err);
  process.exit(1);
});
