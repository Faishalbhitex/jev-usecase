# Jev Experiment Plan (fleksibel, bisa berubah)

Tujuan: observasi / eksperimen TypeSafe Jev sebagai lapisan routing/keputusan,
bukan pengganti LLM atau agentic AI. Tidak terikat ke satu project tertentu.

## Hipotesis yang mau diuji

1. **Tool-call routing / tool candidate filtering**
   - Jev memutuskan query mana yang bisa dieksekusi langsung tanpa LLM.
   - Atau: Jev menyaring kandidat tools dari banyak tools/skills jadi subset kecil,
     lalu LLM hanya memilih dari subset itu. Relevan saat jumlah tools/skills besar.

2. **Model routing (task-based)**
   - Jev memilih model mana yang dipakai berdasarkan task/query.
   - Mirip 9router, bedanya trigger: 9router bereaksi ke error/quota,
     Jev bereaksi ke karakteristik task. Keduanya bisa diduetkan.

3. **LLM guardrail**
   - Jev sebagai lapisan guard: deteksi prompt injection & sejenisnya
     sebelum query diteruskan ke LLM.

4. **RAG reranker**
   - Jev sebagai reranker: kandidat dokumen dinilai via pertanyaan Noul/Score,
     lalu diurutkan berdasarkan skor.

## Batasan yang diketahui (cons)

- Jev tidak bisa handle multimodal.
- Jev bukan LLM: tidak memahami teks bebas seperti LLM, hanya menjawab
  pertanyaan terstruktur (choice / noul / score) atas state yang diberikan.
- Desain eksperimen harus menghormati ini: Jev = decision gate, bukan reasoner.

## Arah stack

- Bahasa: **TypeScript**.
- Jev: SDK resmi `@typesafe-ai/sdk` (Node 20+, ESM/CJS + type declarations),
  atau via OpenRouter `/decisions` (API key OpenRouter sudah terhubung).
- Framework workflow/graph/agentic: kandidat `@langchain/langgraph`
  (paling matang untuk pola routing di TS) atau `@google/adk` (ADK TypeScript
  resmi Google, lebih baru di ekosistem TS). Opsi ringan: harness TS kecil
  tanpa framework dulu, naik ke framework saat grafnya kompleks.
- Alternatif integrasi: provider `@ai-sdk/typesafe-ai` untuk Vercel AI SDK.

## Status

- [x] OpenRouter API key terhubung (Secure Vault)
- [x] Skill `jev-decision` (Python CLI) teruji end-to-end via OpenRouter
- [ ] Repo eksperimen TypeScript (belum dibuat — menunggu lampu hijau)
- [x] Eksperimen 01: quickstart via SDK resmi (`src/quickstart-sdk-01/jev-quickstart-sdk-01.ts`, `npm run q01`)
- [x] Eksperimen 02: tool routing klasifikasi-only (`src/tool-routing-02/jev-tool-routing-02.ts`, `npm run q02`) — baseline
- [x] Eksperimen 03: tool routing end-to-end via LangGraph (`src/tool-routing-03/jev-tool-routing-03.ts`, `npm run q03`): Jev classify -> router fungsi -> direct eksekusi / llm (Gemini) / reject
- [ ] Eksperimen 2: model routing
- [ ] Eksperimen 3: guardrail
- [ ] Eksperimen 4: reranker

Catatan: daftar di atas tidak harus semuanya terealisasi. Prioritas bisa berubah
mengikuti hasil observasi.
