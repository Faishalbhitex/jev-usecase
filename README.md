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

## Catatan

- Node 20+ (repo ini dites di Node 22 & 24).
- `node_modules/` tidak di-commit; jalankan `npm install` dulu setelah clone.
- Jangan commit `.env` (sudah di `.gitignore`).
