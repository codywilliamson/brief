// brief ai stdlib - ai.complete, ai.stream, ai.converse, ai.toolUse via anthropic sdk

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

// multi-turn conversation
// messages is a Brief array of ["user", "msg1", "assistant", "msg2", "user", "msg3"]
export async function aiConverse(messages: BriefValue, configArg?: BriefValue): Promise<BriefResult> {
  if (!Array.isArray(messages)) {
    return { kind: "failed", reason: "ai.converse expects an array of [role, content, ...] pairs" };
  }

  const apiMessages: Anthropic.MessageParam[] = [];
  for (let i = 0; i < messages.length; i += 2) {
    const role = messages[i];
    const content = messages[i + 1];
    if (role !== "user" && role !== "assistant") {
      return { kind: "failed", reason: `invalid message role '${briefToString(role)}', expected 'user' or 'assistant'` };
    }
    apiMessages.push({ role, content: briefToString(content) });
  }

  if (apiMessages.length === 0) {
    return { kind: "failed", reason: "ai.converse requires at least one message" };
  }

  const config = parseConfig(configArg ?? null);
  const client = getClient();

  try {
    const params: Anthropic.MessageCreateParams = {
      model: config.model ?? DEFAULT_MODEL,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: apiMessages,
    };

    if (config.temperature !== undefined) params.temperature = config.temperature;
    if (config.system) params.system = config.system;

    const response = await client.messages.create(params);
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map(block => block.text)
      .join("");

    return { kind: "ok", value: text };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

// agentic tool use - sends prompt with tool definitions, returns tool calls or text
// tools is a Brief array of ["toolName", "description", "param1", "type1", ...]
export async function aiToolUse(
  prompt: BriefValue,
  tools: BriefValue,
  configArg?: BriefValue,
): Promise<BriefResult> {
  if (typeof prompt !== "string") {
    return { kind: "failed", reason: "ai.toolUse prompt must be a string" };
  }
  if (!Array.isArray(tools)) {
    return { kind: "failed", reason: "ai.toolUse tools must be an array" };
  }

  const config = parseConfig(configArg ?? null);
  const client = getClient();

  // parse tool definitions from Brief arrays
  // each tool is an array: ["name", "description", ["param1", "type", "desc"], ...]
  const apiTools: Anthropic.Tool[] = [];
  for (const tool of tools) {
    if (!Array.isArray(tool) || tool.length < 2) {
      return { kind: "failed", reason: "each tool must be [name, description, ...params]" };
    }
    const name = briefToString(tool[0]);
    const description = briefToString(tool[1]);
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (let i = 2; i < tool.length; i++) {
      const param = tool[i];
      if (Array.isArray(param) && param.length >= 2) {
        const pName = briefToString(param[0]);
        const pType = briefToString(param[1]);
        const pDesc = param.length > 2 ? briefToString(param[2]) : "";
        properties[pName] = { type: pType, description: pDesc };
        required.push(pName);
      }
    }

    apiTools.push({
      name,
      description,
      input_schema: {
        type: "object" as const,
        properties,
        required,
      },
    });
  }

  try {
    const params: Anthropic.MessageCreateParams = {
      model: config.model ?? DEFAULT_MODEL,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
      tools: apiTools,
    };

    if (config.temperature !== undefined) params.temperature = config.temperature;
    if (config.system) params.system = config.system;

    const response = await client.messages.create(params);

    // build result: array of content blocks
    const result: BriefValue[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        result.push(["text", block.text]);
      } else if (block.type === "tool_use") {
        const inputPairs: BriefValue[] = [];
        if (block.input && typeof block.input === "object") {
          for (const [k, v] of Object.entries(block.input as Record<string, any>)) {
            inputPairs.push(k);
            inputPairs.push(typeof v === "string" ? v : JSON.stringify(v));
          }
        }
        result.push(["tool_use", block.name, block.id, inputPairs]);
      }
    }

    return { kind: "ok", value: result };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}
