// brief ai stdlib - ai.complete, ai.stream
// placeholder implementations - real ones would call an LLM API

import type { BriefValue, BriefResult } from "./core.js";
import { BriefStream } from "../stream.js";

export async function aiComplete(prompt: BriefValue): Promise<BriefResult> {
  if (typeof prompt !== "string") return { kind: "failed", reason: "ai.complete prompt must be a string" };
  // placeholder: in a real implementation this would call an LLM API
  return { kind: "failed", reason: "ai.complete not configured - set BRIEF_AI_PROVIDER" };
}

export async function aiStream(prompt: BriefValue): Promise<BriefStream<string>> {
  if (typeof prompt !== "string") {
    const stream = new BriefStream<string>();
    stream.end();
    return stream;
  }
  // placeholder: in a real implementation this would stream from an LLM API
  const stream = new BriefStream<string>();
  stream.end();
  return stream;
}
