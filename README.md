# jev-usecase

Eksperimen observasi **TypeSafe Jev** sebagai lapisan routing/keputusan —
bukan pengganti LLM atau agentic AI.

Lihat [PLAN.md](PLAN.md) untuk daftar hipotesis, batasan, dan arah stack.

## Setup

```sh
npm install @typesafe-ai/sdk   # SDK resmi Jev (Node 20+)
```

## Status

- [x] Koneksi GitHub dari VM (via API, bukan SSH — SSH diblokir proxy)
- [ ] Eksperimen 1: tool-call routing
- [ ] Eksperimen 2: model routing (task-based)
- [ ] Eksperimen 3: LLM guardrail
- [ ] Eksperimen 4: RAG reranker
