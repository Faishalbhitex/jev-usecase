# tool-routing-03

Tool routing end-to-end via LangGraph:
`query -> jev_classify -> router fungsi -> direct | llm | reject`

## File
- `jev-tool-routing-03.ts` — graph utama + 5 tool lokal
  (`get_weather`, `calculate`, `get_time`, `convert_currency`, `define_word`)
- `.muse/authd-surrogate.ts` — **khusus VM Muse**: mengambil API key
  dari vault lewat authd. Di VPS file ini tidak dipakai; kode otomatis
  memakai env biasa bila `OLLAMA_API_KEY` ada.

## Cara jalan
```bash
npm install
export OPENROUTER_API_KEY=<key>     # untuk Jev (via OpenRouter)
export LLM_PROVIDER=gemini|openrouter|ollama
export GEMINI_API_KEY=<key>         # bila LLM_PROVIDER=gemini
export OLLAMA_API_KEY=<key>         # bila LLM_PROVIDER=ollama
npm run q03
```

## Aturan routing (bisa diubah)
- `p_top >= 0.7` → direct (tool dieksekusi langsung)
- `p_top <= 0.3` → reject (tidak ada tool cocok)
- di antaranya → llm (LLM memilih tool, lalu tool dieksekusi)

Override: `JEV_CONFIDENT` dan `JEV_REJECT_BELOW`.

## Kenapa kadang `llm: 0`?
Bukan error. Dengan threshold default, ke-6 query contoh jatuh ke
direct (p >= 0.7) atau reject (p <= 0.3) — tidak ada yang masuk zona
ambigu, jadi LLM tidak pernah dipanggil. Untuk memaksa cabang LLM:
```bash
JEV_CONFIDENT=0.995 LLM_PROVIDER=ollama npm run q03
```

## Model default per provider
- gemini: `gemini-3.8-flash` (ganti via `GEMINI_MODEL`)
- openrouter: `nvidia/nemotron-3.5-lightning:free` (ganti via `OPENROUTER_MODEL`)
- ollama: `gpt-oss:20b` via `https://ollama.com/v1` (ganti via `OLLAMA_MODEL`)

## Catatan llm fallback
- OpenRouter (`LLM_PROVIDER=openrouter`): model gratis bersifat
  OpenAI-compatible. Default `nvidia/nemotron-3.5-lightning:free` adalah
  reasoning model yang berpikir lantang — pilihan tool di-parse dari baris
  `TOOL:`. Uji paksa (`JEV_CONFIDENT=0.995`): 4/5 kasus memilih tool yang
  benar, 1 kasus degenerate (rambling). Untuk fallback yang lebih stabil,
  gunakan model berbayar atau Gemini dengan key valid.
- Ollama cloud (`LLM_PROVIDER=ollama`): auth cukup `export OLLAMA_API_KEY=...`
  (di VM Muse diambil dari vault via `.muse/`). Uji paksa
  (`JEV_CONFIDENT=0.995`, 2026-10-01): 5/5 pilihan tool benar, ter-parse
  bersih satu baris, semua dieksekusi dengan hasil tepat.
