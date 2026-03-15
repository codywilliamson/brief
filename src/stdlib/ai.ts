// brief ai stdlib - ai.complete, ai.stream via anthropic sdk

import Anthropic from "@anthropic-ai/sdk";
import type { BriefValue, BriefResult } from "./core.js";
import { briefToString } from "./core.js";
import { BriefStream } from "../stream.js";

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic();
  }
  return clientInstance;
}

// allow overriding for tests
export function setClient(client: Anthropic | null): void {
  clientInstance = client;
}

export interface AiConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;

function parseConfig(configArg: BriefValue): AiConfig {
  const config: AiConfig = {};
  if (configArg === null || configArg === undefined) return config;

  // config is passed as a Brief array of key-value pairs: ["model", "claude-sonnet-4-20250514", "temperature", 0.7]
  // or as individual extra args handled by the caller
  if (Array.isArray(configArg)) {
    for (let i = 0; i < configArg.length; i += 2) {
      const key = configArg[i];
      const val = configArg[i + 1];
      if (key === "model" && typeof val === "string") config.model = val;
      if (key === "maxTokens" && typeof val === "number") config.maxTokens = val;
      if (key === "temperature" && typeof val === "number") config.temperature = val;
      if (key === "system" && typeof val === "string") config.system = val;
    }
  }
  return config;
}

export async function aiComplete(prompt: BriefValue, configArg?: BriefValue): Promise<BriefResult> {
  if (typeof prompt !== "string") {
    return { kind: "failed", reason: "ai.complete prompt must be a string" };
  }

  const config = parseConfig(configArg ?? null);
  const client = getClient();

  try {
    const params: Anthropic.MessageCreateParams = {
      model: config.model ?? DEFAULT_MODEL,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    };

    if (config.temperature !== undefined) {
      params.temperature = config.temperature;
    }
    if (config.system) {
      params.system = config.system;
    }

    const response = await client.messages.create(params);

    // extract text from content blocks
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map(block => block.text)
      .join("");

    return { kind: "ok", value: text };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function aiStream(prompt: BriefValue, configArg?: BriefValue): Promise<BriefStream<string>> {
  const stream = new BriefStream<string>();

  if (typeof prompt !== "string") {
    stream.end();
    return stream;
  }

  const config = parseConfig(configArg ?? null);
  const client = getClient();

  const params: Anthropic.MessageCreateParams = {
    model: config.model ?? DEFAULT_MODEL,
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  };

  if (config.temperature !== undefined) {
    params.temperature = config.temperature;
  }
  if (config.system) {
    params.system = config.system;
  }

  // run streaming in background
  (async () => {
    try {
      const response = await client.messages.create(params);

      // response is a Stream when stream: true
      for await (const event of response as AsyncIterable<Anthropic.MessageStreamEvent>) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          stream.push(event.delta.text);
        }
      }
    } catch (e: any) {
      stream.push(`[error: ${e.message ?? String(e)}]`);
    } finally {
      stream.end();
    }
  })();

  return stream;
}
