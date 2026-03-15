// brief ai stdlib - uses claude agent sdk (authenticates via user's CC install)

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { BriefValue, BriefResult } from "./core.js";
import { briefToString } from "./core.js";
import { BriefStream } from "../stream.js";

export interface AiConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

function parseConfig(configArg: BriefValue): AiConfig {
  const config: AiConfig = {};
  if (configArg === null || configArg === undefined) return config;
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

function buildQueryOptions(config: AiConfig) {
  return {
    model: config.model ?? DEFAULT_MODEL,
    permissionMode: "bypassPermissions" as const,
    allowDangerouslySkipPermissions: true,
    ...(config.system && {
      systemPrompt: config.system,
    }),
  };
}

// allow overriding the query function for tests
type QueryFn = typeof query;
let queryFn: QueryFn = query;

export function setQueryFn(fn: QueryFn | null): void {
  queryFn = fn ?? query;
}

export async function aiComplete(prompt: BriefValue, configArg?: BriefValue): Promise<BriefResult> {
  if (typeof prompt !== "string") {
    return { kind: "failed", reason: "ai.complete prompt must be a string" };
  }

  const config = parseConfig(configArg ?? null);
  const options = buildQueryOptions(config);

  try {
    let result = "";
    for await (const msg of queryFn({ prompt, options })) {
      if (msg.type === "result" && msg.subtype === "success") {
        result = msg.result;
      } else if (msg.type === "result") {
        return { kind: "failed", reason: `agent error: ${msg.subtype}` };
      }
    }
    return { kind: "ok", value: result };
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
  const options = {
    ...buildQueryOptions(config),
    includePartialMessages: true,
  };

  (async () => {
    try {
      for await (const msg of queryFn({ prompt, options })) {
        if (msg.type === "stream_event") {
          const ev = msg.event;
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            stream.push(ev.delta.text);
          }
        } else if (msg.type === "result" && msg.subtype !== "success") {
          stream.push(`[error: ${msg.subtype}]`);
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

export async function aiConverse(messages: BriefValue, configArg?: BriefValue): Promise<BriefResult> {
  if (!Array.isArray(messages)) {
    return { kind: "failed", reason: "ai.converse expects an array of [role, content, ...] pairs" };
  }

  // build a single prompt from the conversation history
  // the agent sdk uses a single prompt string, so we format the conversation
  let conversationPrompt = "";
  for (let i = 0; i < messages.length; i += 2) {
    const role = messages[i];
    const content = messages[i + 1];
    if (role !== "user" && role !== "assistant") {
      return { kind: "failed", reason: `invalid message role '${briefToString(role)}', expected 'user' or 'assistant'` };
    }
    conversationPrompt += `${role}: ${briefToString(content)}\n`;
  }

  if (conversationPrompt === "") {
    return { kind: "failed", reason: "ai.converse requires at least one message" };
  }

  return aiComplete(conversationPrompt, configArg);
}

// structured tool use - returns tool call blocks from the agent
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

  // build tool descriptions into the prompt since agent sdk handles tools natively
  const toolDescriptions = buildToolDescriptions(tools);
  if (typeof toolDescriptions !== "string") return toolDescriptions;

  const fullPrompt = `${prompt}\n\nAvailable tools:\n${toolDescriptions}\n\nUse the tools as needed to answer the question. Format tool calls as: TOOL_CALL: toolName(args)`;
  return aiComplete(fullPrompt, configArg);
}

function buildToolDescriptions(tools: BriefValue[]): string | BriefResult {
  const lines: string[] = [];
  for (const tool of tools) {
    if (!Array.isArray(tool) || tool.length < 2) {
      return { kind: "failed", reason: "each tool must be [name, description, ...params]" };
    }
    const name = briefToString(tool[0]);
    const desc = briefToString(tool[1]);
    const params: string[] = [];
    for (let i = 2; i < tool.length; i++) {
      const param = tool[i];
      if (Array.isArray(param) && param.length >= 2) {
        params.push(`${briefToString(param[0])}: ${briefToString(param[1])}`);
      }
    }
    lines.push(`- ${name}(${params.join(", ")}): ${desc}`);
  }
  return lines.join("\n");
}

// agentic loop - the real power
// runs a full agent loop: prompt -> model calls tools -> handler executes -> feeds back -> repeat
export type ToolExecutor = (toolName: string, toolInput: BriefValue) => Promise<BriefValue>;

export async function aiLoop(
  prompt: BriefValue,
  tools: BriefValue,
  toolExecutor: ToolExecutor,
  configArg?: BriefValue,
): Promise<BriefResult> {
  if (typeof prompt !== "string") {
    return { kind: "failed", reason: "ai.loop prompt must be a string" };
  }
  if (!Array.isArray(tools)) {
    return { kind: "failed", reason: "ai.loop tools must be an array" };
  }

  const toolDescriptions = buildToolDescriptions(tools);
  if (typeof toolDescriptions !== "string") return toolDescriptions;

  const config = parseConfig(configArg ?? null);
  const maxIterations = 10;
  let conversationContext = prompt;

  try {
    for (let i = 0; i < maxIterations; i++) {
      const options = {
        ...buildQueryOptions(config),
        maxTurns: 1, // one turn at a time so we can intercept tool calls
      };

      let result = "";
      let hasToolCalls = false;
      const toolCalls: { name: string; args: string }[] = [];

      for await (const msg of queryFn({ prompt: conversationContext, options })) {
        if (msg.type === "result" && msg.subtype === "success") {
          result = msg.result;
        } else if (msg.type === "result") {
          return { kind: "failed", reason: `agent error: ${msg.subtype}` };
        } else if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "tool_use") {
              hasToolCalls = true;
              const toolBlock = block as any;
              toolCalls.push({ name: toolBlock.name, args: JSON.stringify(toolBlock.input ?? {}) });
            }
          }
        }
      }

      // if no tool calls, we're done
      if (!hasToolCalls || toolCalls.length === 0) {
        return { kind: "ok", value: result };
      }

      // execute tool calls and build context for next turn
      const toolResults: string[] = [];
      for (const tc of toolCalls) {
        const inputPairs: BriefValue[] = [];
        try {
          const parsed = JSON.parse(tc.args);
          if (typeof parsed === "object" && parsed !== null) {
            for (const [k, v] of Object.entries(parsed)) {
              inputPairs.push(k);
              inputPairs.push(typeof v === "string" ? v : JSON.stringify(v));
            }
          }
        } catch {}

        const toolResult = await toolExecutor(tc.name, inputPairs);
        toolResults.push(`Tool ${tc.name} returned: ${briefToString(toolResult)}`);
      }

      // build next prompt with tool results
      conversationContext = `${prompt}\n\nPrevious tool results:\n${toolResults.join("\n")}\n\nContinue based on these results.`;
    }

    return { kind: "failed", reason: "ai.loop exceeded max iterations (10)" };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}
