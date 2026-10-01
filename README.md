# jev-usecase

Observasi TypeSafe Jev sebagai lapisan routing/keputusan.

Lihat [PLAN.md](PLAN.md) untuk daftar hipotesis, batasan, dan arah stack.

## Struktur

Setiap eksperimen tinggal di foldernya sendiri: `src/{topic}-{N}/`.
Cara jalan tiap eksperimen ada di `readme.md` di dalam foldernya.

| Folder | Isi | Jalan |
|---|---|---|
| `src/quickstart-00/` | quickstart raw (ID + EN) | `npm run q00`, `npm run q00-en` |
| `src/quickstart-sdk-01/` | quickstart via SDK resmi | `npm run q01` |
| `src/tool-routing-02/` | baseline klasifikasi tool | `npm run q02` |
| `src/tool-routing-03/` | routing end-to-end via LangGraph | `npm run q03` |
| `src/shared/` | kode dipakai bersama (transport OpenRouter untuk SDK resmi) | — |
| `.muse/` | **khusus VM Muse**: helper yang mengambil API key dari vault (di VPS tidak dipakai, kode memakai env biasa) | — |

## Setup umum

```sh
npm install
export OPENROUTER_API_KEY=<key>   # dipakai Jev di semua eksperimen
```

Detail env dan perilaku tiap eksperimen: baca `readme.md` di foldernya.

## Catatan

- Node 20+ (repo ini dites di Node 22 & 24).
- `node_modules/` tidak di-commit; jalankan `npm install` dulu setelah clone.
- Jangan commit `.env` (sudah di `.gitignore`).
