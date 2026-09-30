/**
 * jev-quickstart-sdk-01.ts — Eksperimen 01.
 *
 * Sama persis dengan q00 (triase tiket support #4821), tapi memanggil Jev
 * lewat SDK resmi `@typesafe-ai/sdk`, bukan fetch mentah:
 *   - TypeSafeClient + client.systemOne()
 *   - question builder: choice(), noul(), score()
 *   - validasi, retry, dan typed answers dari kode SDK
 * Transport ke OpenRouter via modul bersama ./jev-openrouter-transport.ts.
 *
 * Cara jalan:
 *   export OPENROUTER_API_KEY=<redacted>
 *   export JEV_MODEL=typesafe/jev-1.13                        # opsional
 *   npm run q01
 */

import { choice, noul, score } from "@typesafe-ai/sdk";
import { createJevClient } from "./jev-openrouter-transport.js";

const client = createJevClient();

// ---------------------------------------------------------------------------
// State & pertanyaan: sama dengan q00
// ---------------------------------------------------------------------------

const STATE =
  "Tiket #4821 dari pelanggan paket Pro. Isi: 'Saya kena charge dua kali bulan ini, " +
  "tolong refund salah satunya secepatnya.' Riwayat: tidak pernah telat bayar. " +
  "Alternatif: (a) teruskan ke tim billing -- sesuai karena ini sengketa tagihan; " +
  "(b) jawab otomatis -- ditolak karena pelanggan minta tindakan spesifik; " +
  "(c) eskalasi ke manajer -- belum perlu karena belum ada penolakan.";

async function main() {
  console.log("Model : " + client.defaultModel);
  console.log("Via   : @typesafe-ai/sdk -> OpenRouter Decisions API\n");

  const { answers, usage, model } = await client.systemOne({
    state: STATE,
    questions: {
      intent: choice("Tim mana yang seharusnya menangani tiket ini?", {
        billing: "Sengketa tagihan, refund, atau pembayaran.",
        technical: "Bug produk atau masalah integrasi.",
        other: "Di luar billing dan technical.",
      }),
      escalate: noul("Apakah tiket ini perlu dieskalasi ke manajer sekarang?"),
      urgency: score("Seberapa mendesak tiket ini?", [
        "bisa menunggu",
        "minggu ini",
        "hari ini",
      ]),
    },
  });

  console.log("--- answers ---");

  const intent = answers.intent;
  console.log("\n[intent] type=" + intent.type);
  console.log("  choice       : " + intent.choice);
  console.log("  confidence   : " + intent.confidence);
  console.log("  probabilities: " + JSON.stringify(intent.probabilities));
  console.log(
    "  interpretasi : " + (intent.confidence < 0.4 ? "UNCERTAIN (confidence < 0.4)" : "OK"),
  );

  const esc = answers.escalate;
  const verdict = esc.noul >= 0.7 ? "YES" : esc.noul <= 0.3 ? "NO" : "UNCERTAIN";
  console.log("\n[escalate] type=" + esc.type);
  console.log("  noul : " + esc.noul + " -> " + verdict);

  const urg = answers.urgency;
  console.log("\n[urgency] type=" + urg.type);
  console.log("  score : " + urg.score + " (abaikan agregat; baca per-dimensi)");
  console.log("  legend: " + JSON.stringify(urg.legend));
  console.log("  probabilities: " + JSON.stringify(urg.probabilities));

  console.log(
    "\nusage: inputTokens=" +
      usage.input_tokens +
      " outputTokens=" +
      usage.output_tokens,
  );
  console.log("served model: " + model);
}

main().catch((err) => {
  console.error("ERROR:", err.message ?? err);
  process.exit(1);
});
