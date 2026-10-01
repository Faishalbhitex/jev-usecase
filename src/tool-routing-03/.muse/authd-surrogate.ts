/**
 * authd-surrogate.ts — modul bersama.
 *
 * Mengambil surrogate kredensial `hsurr:*` dari authd lewat unix socket,
 * untuk dipakai sebagai API key ke host yang disetujui konektor.
 * Egress proxy menukar surrogate dengan key asli saat request keluar —
 * nilai surrogate TIDAK BOLEH di-print, di-log, atau disimpan ke file.
 *
 * Protokol: POST /v1/credentials/surrogate {"name": "<connector>"}
 *   -> { credentials: [{ name: "access_token", surrogate: "hsurr:...", placement }] }
 */

import * as net from "node:net";

const AUTHD_SOCKET = process.env.JARVIS_AUTHD_SOCK ?? "/run/hatch/auth/authd.sock";
const SURROGATE_PATH = "/v1/credentials/surrogate";

export interface SurrogateEntry {
  surrogate: string;
  placement: string;
}

// Cache per proses: satu konektor cukup diambil sekali. Selain lebih cepat,
// ini menghindari kegagalan intermiten saat memanggil authd berkali-kali
// dalam satu run (mis. tiap kasus llm).
const cache = new Map<string, SurrogateEntry>();

export async function getSurrogate(
  credentialName: string,
  entryName = "access_token",
): Promise<SurrogateEntry> {
  const key = credentialName + ":" + entryName;
  const hit = cache.get(key);
  if (hit) return hit;
  const entry = await fetchSurrogate(credentialName, entryName);
  cache.set(key, entry);
  return entry;
}

async function fetchSurrogate(
  credentialName: string,
  entryName: string,
): Promise<SurrogateEntry> {
  const body = JSON.stringify({ name: credentialName });
  const request =
    `POST ${SURROGATE_PATH} HTTP/1.1\r\n` +
    `Host: authd.local\r\n` +
    `Content-Type: application/json\r\n` +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    `Connection: close\r\n\r\n` +
    body;

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const conn = net.createConnection(AUTHD_SOCKET);
    conn.on("connect", () => conn.end(request));
    conn.on("data", (d: Buffer) => chunks.push(d));
    conn.on("end", () => resolve());
    conn.on("error", reject);
  });

  const raw = Buffer.concat(chunks).toString("utf-8");
  const sep = raw.indexOf("\r\n\r\n");
  if (sep === -1) throw new Error("authd: respons malformed");
  const payload = JSON.parse(raw.slice(sep + 4));
  const entry = (payload.credentials ?? []).find((e: { name: string }) => e.name === entryName);
  if (!entry || typeof entry.surrogate !== "string" || !entry.surrogate.startsWith("hsurr:")) {
    throw new Error(`authd: surrogate ${credentialName}:${entryName} tidak didapat`);
  }
  return { surrogate: entry.surrogate, placement: entry.placement };
}
