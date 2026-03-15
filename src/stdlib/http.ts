// brief http stdlib - http.fetch, http.post

import type { BriefValue, BriefResult } from "./core.js";

export async function httpFetch(url: BriefValue): Promise<BriefResult> {
  if (typeof url !== "string") return { kind: "failed", reason: "http.fetch url must be a string" };
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) return { kind: "failed", reason: `HTTP ${res.status}: ${text}` };
    return { kind: "ok", value: text };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function httpPost(url: BriefValue, body: BriefValue): Promise<BriefResult> {
  if (typeof url !== "string") return { kind: "failed", reason: "http.post url must be a string" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { kind: "failed", reason: `HTTP ${res.status}: ${text}` };
    return { kind: "ok", value: text };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}
