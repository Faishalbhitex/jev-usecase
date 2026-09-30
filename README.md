# jev-usecase

Eksperimen observasi **TypeSafe Jev** sebagai lapisan routing/keputusan —
bukan pengganti LLM atau agentic AI.

Lihat [PLAN.md](PLAN.md) untuk daftar hipotesis, batasan, dan arah stack.

## Setup

```sh
npm install
cp .env.example .env   # lalu isi OPENROUTER_API_KEY
```

Atau tanpa file `.env`, langsung export:

```sh
export OPENROUTER_API_KEY=sk-or-...
export OPENROUTER_BASE_URL=https://openrouter.ai/api/v1   # opsional
export JEV_MODEL=typesafe/jev-1.13                        # opsional
```

## Menjalankan

```sh
npm run q00
# sama dengan: npx tsx src/jev-quickstart-with-openrouter-00.ts
```

`q00` = quickstart Jev via OpenRouter Decisions API: satu state + tiga
pertanyaan paralel (`choice`, `noul`, `score`), hasilnya dicetak beserta
interpretasi threshold-nya.

```sh
npm run q01
# sama dengan: npx tsx src/jev-quickstart-sdk-01.ts
```

`q01` = versi SDK dari `q00`: skenario triase tiket yang sama, tapi lewat
SDK resmi `@typesafe-ai/sdk` (`TypeSafeClient.systemOne` + builder
`choice`/`noul`/`score`). Transport ke OpenRouter Decisions API
(wire-compatible) via modul bersama `src/jev-openrouter-transport.ts`.

```sh
npm run q02
# sama dengan: npx tsx src/jev-tool-routing-02.ts
```

`q02` = eksperimen tool-call routing (DITUNDA): Jev menyaring 10 kandidat
tools menjadi subset kecil per query, 6 kasus uji Bahasa Indonesia.

```sh
npm run q03
# sama dengan: npx tsx src/jev-tool-routing-langgraph-03.ts
```

`q03` = tool routing end-to-end dengan LangGraph: node Jev mengklasifikasi
query (satu pertanyaan `noul` per tool), router berupa fungsi biasa
memutuskan `direct` (p>=0.7, tool LangChain dieksekusi langsung tanpa LLM),
`llm` (zona ambigu, Gemini dengan klasifikasi Jev dilampirkan), atau
`reject` (p<=0.3). Threshold bisa dioverride via `JEV_CONFIDENT` /
`JEV_REJECT_BELOW`. Tools adalah fungsi lokal deterministik (data contoh).

Jalankan penuh di VPS (cabang Gemini butuh key valid):

```sh
git pull
npm install
export OPENROUTER_API_KEY=<redacted>   # Jev via OpenRouter (+ llm fallback gratis)
export LLM_PROVIDER=openrouter                # atau "gemini" (default)
export OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free  # opsional
# --- alternatif: llm via Gemini (butuh key valid) ---
# export GEMINI_API_KEY=<redacted>
# export GEMINI_MODEL=gemini-3.8-flash
npm run q03
```

Catatan llm fallback: model gratis OpenRouter bersifat OpenAI-compatible
(terverifikasi via `/api/v1/chat/completions`). Default
`nvidia/nemotron-3.5-lightning:free` adalah reasoning model yang berpikir
lantang — pilihan tool di-parse dari baris `TOOL:`. Uji paksa
(`JEV_CONFIDENT=0.995`): 4/5 kasus memilih tool yang benar, 1 kasus
degenerate (rambling). Untuk fallback yang lebih stabil, gunakan model
berbayar atau Gemini dengan key valid.

## Catatan

- Node 20+ (repo ini dites di Node 22 & 24).
- `node_modules/` tidak di-commit; jalankan `npm install` dulu setelah clone.
- Jangan commit `.env` (sudah di `.gitignore`).
