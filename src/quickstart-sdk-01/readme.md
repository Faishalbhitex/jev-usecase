# quickstart-sdk-01

Versi resmi quickstart TypeSafe Jev memakai SDK `@typesafe-ai/sdk`
(eksperimen 00 ditulis ulang dengan SDK, bukan raw fetch).

## File
- `jev-quickstart-sdk-01.ts` — quickstart via SDK resmi

## Cara jalan
```bash
npm install
export OPENROUTER_API_KEY=<key>
npm run q01
```

## Catatan
- Kode memanggil Jev lewat `../shared/jev-openrouter-transport.ts`,
  yaitu transport yang mengarahkan SDK resmi (yang default-nya ke
  `api.typesafe.ai`) ke OpenRouter Decisions API.
- Transport ini dipakai juga oleh eksperimen 02 dan 03.
