/**
 * jev-openrouter-transport.ts — modul bersama.
 *
 * Adapter transport resmi `@typesafe-ai/sdk` ke OpenRouter Decisions API.
 *
 * SDK didesain untuk TypeSafe API langsung (POST {baseURL}/v1/systemone),
 * sedangkan konektor yang tersedia di sini adalah OpenRouter. Untungnya
 * OpenRouter Decisions API wire-compatible: request {model, state, questions}
 * dan shape answers (choice/noul/score + probabilities) identik, jadi cukup
 * rewrite URL lewat opsi `fetch` resmi SDK:
 *
 *   POST https://api.typesafe.ai/v1/systemone
 *     -> POST https://openrouter.ai/api/alpha/decisions
 *
 * Auth tetap `Authorization: Bearer <OPENROUTER_API_KEY>` (boleh surrogate
 * hsurr:* — egress proxy menukarnya dengan key asli).
 * Kalau nanti ada TYPESAFE_API_KEY langsung, cukup hapus adapter ini.
 */

import { TypeSafeClient, type Fetch } from "@typesafe-ai/sdk";

export const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const TYPESAFE_SYSTEMONE_PATH = "/v1/systemone";

/** Fetch adapter: alihkan endpoint bawaan SDK ke OpenRouter. */
export const openRouterTransport: Fetch = async (input, init) => {
  const url = String(input);
  const target = url.endsWith(TYPESAFE_SYSTEMONE_PATH) ? OPENROUTER_DECISIONS_URL : url;
  const headers = new Headers(init?.headers);
  headers.set("HTTP-Referer", "https://github.com/Faishalbhitex/jev-usecase");
  headers.set("X-Title", "jev-usecase");
  return globalThis.fetch(target, { ...init, headers });
};

/** Client Jev siap pakai: SDK resmi + transport OpenRouter. */
export function createJevClient(): TypeSafeClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("ERROR: OPENROUTER_API_KEY belum di-set.");
    console.error("Contoh: export OPENROUTER_API_KEY=<redacted>");
    process.exit(1);
  }
  return new TypeSafeClient({
    apiKey,
    baseURL: "https://api.typesafe.ai", // penanda; transport me-rewrite ke OpenRouter
    defaultModel: process.env.JEV_MODEL ?? "typesafe/jev-1.13",
    fetch: openRouterTransport,
  });
}
