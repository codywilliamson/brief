import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { aiComplete, aiStream, setClient } from "../src/stdlib/ai.js";
import type { BriefResult } from "../src/stdlib/core.js";

// mock the anthropic client
function createMockClient(opts: {
  createResponse?: any;
  createError?: Error;
  streamEvents?: any[];
} = {}) {
  return {
    messages: {
      create: vi.fn(async (params: any) => {
        if (opts.createError) throw opts.createError;

        if (params.stream) {
          // return an async iterable of events
          const events = opts.streamEvents ?? [];
          return {
            [Symbol.asyncIterator]: async function* () {
              for (const event of events) {
                yield event;
              }
            },
          };
        }

        return opts.createResponse ?? {
          content: [{ type: "text", text: "mock response" }],
          model: params.model,
          role: "assistant",
          stop_reason: "end_turn",
        };
      }),
    },
  } as any;
}

describe("ai.complete", () => {
  afterEach(() => setClient(null));

  it("returns text from completion", async () => {
    const mock = createMockClient({
      createResponse: {
        content: [{ type: "text", text: "hello from claude" }],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const result = await aiComplete("say hello");
    expect(result).toEqual({ kind: "ok", value: "hello from claude" });
    expect(mock.messages.create).toHaveBeenCalledOnce();
  });

  it("passes prompt as user message", async () => {
    const mock = createMockClient();
    setClient(mock);

    await aiComplete("test prompt");
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.messages).toEqual([{ role: "user", content: "test prompt" }]);
  });

  it("uses default model and max_tokens", async () => {
    const mock = createMockClient();
    setClient(mock);

    await aiComplete("test");
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-20250514");
    expect(call.max_tokens).toBe(4096);
  });

  it("accepts config with model override", async () => {
    const mock = createMockClient();
    setClient(mock);

    await aiComplete("test", ["model", "claude-opus-4-20250514"]);
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-20250514");
  });

  it("accepts config with temperature", async () => {
    const mock = createMockClient();
    setClient(mock);

    await aiComplete("test", ["temperature", 0.7]);
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.temperature).toBe(0.7);
  });

  it("accepts config with system prompt", async () => {
    const mock = createMockClient();
    setClient(mock);

    await aiComplete("test", ["system", "you are a pirate"]);
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.system).toBe("you are a pirate");
  });

  it("accepts config with multiple options", async () => {
    const mock = createMockClient();
    setClient(mock);

    await aiComplete("test", [
      "model", "claude-opus-4-20250514",
      "temperature", 0.5,
      "system", "be concise",
      "maxTokens", 1024,
    ]);
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-20250514");
    expect(call.temperature).toBe(0.5);
    expect(call.system).toBe("be concise");
    expect(call.max_tokens).toBe(1024);
  });

  it("concatenates multiple text blocks", async () => {
    const mock = createMockClient({
      createResponse: {
        content: [
          { type: "text", text: "part one " },
          { type: "text", text: "part two" },
        ],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const result = await aiComplete("test");
    expect(result).toEqual({ kind: "ok", value: "part one part two" });
  });

  it("returns failed on non-string prompt", async () => {
    const result = await aiComplete(42);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("must be a string");
  });

  it("returns failed on API error", async () => {
    const mock = createMockClient({
      createError: new Error("rate limited"),
    });
    setClient(mock);

    const result = await aiComplete("test");
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("rate limited");
  });
});

describe("ai.stream", () => {
  afterEach(() => setClient(null));

  it("streams text deltas", async () => {
    const mock = createMockClient({
      streamEvents: [
        { type: "content_block_delta", delta: { type: "text_delta", text: "hello " } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "world" } },
        { type: "message_stop" },
      ],
    });
    setClient(mock);

    const stream = await aiStream("test");
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["hello ", "world"]);
  });

  it("passes stream: true to API", async () => {
    const mock = createMockClient({ streamEvents: [] });
    setClient(mock);

    const stream = await aiStream("test");
    // consume stream to trigger the API call
    for await (const _ of stream) {}

    const call = mock.messages.create.mock.calls[0][0];
    expect(call.stream).toBe(true);
  });

  it("uses config options", async () => {
    const mock = createMockClient({ streamEvents: [] });
    setClient(mock);

    const stream = await aiStream("test", ["model", "claude-opus-4-20250514", "temperature", 0.3]);
    for await (const _ of stream) {}

    const call = mock.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-20250514");
    expect(call.temperature).toBe(0.3);
  });

  it("handles empty stream", async () => {
    const mock = createMockClient({ streamEvents: [] });
    setClient(mock);

    const stream = await aiStream("test");
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([]);
  });

  it("ends stream on non-string prompt", async () => {
    const stream = await aiStream(42);
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([]);
  });

  it("filters non-text-delta events", async () => {
    const mock = createMockClient({
      streamEvents: [
        { type: "message_start", message: {} },
        { type: "content_block_start", content_block: { type: "text" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "only this" } },
        { type: "content_block_stop" },
        { type: "message_delta", delta: {} },
        { type: "message_stop" },
      ],
    });
    setClient(mock);

    const stream = await aiStream("test");
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["only this"]);
  });

  it("handles API error during stream", async () => {
    const mock = createMockClient({
      createError: new Error("connection failed"),
    });
    setClient(mock);

    const stream = await aiStream("test");
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    // should get an error chunk
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("connection failed");
  });
});

describe("ai integration with interpreter", () => {
  afterEach(() => setClient(null));

  it("works end-to-end with Brief runtime", async () => {
    const { runBrief } = await import("../src/runtime.js");
    const { createToolRegistry } = await import("../src/runtime.js");

    const mock = createMockClient({
      createResponse: {
        content: [{ type: "text", text: "AI says hello" }],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const reg = createToolRegistry();
    reg.register("ai.complete", aiComplete);

    const prints: any[] = [];
    await runBrief({
      source: `allow
  ai.complete

let response =
  await ask ai.complete("say hello")
  or fail "ai failed"

print(response)`,
      registry: reg,
      printFn: (...a) => prints.push(...a),
    });

    expect(prints).toEqual(["AI says hello"]);
  });

  it("streaming works end-to-end", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");

    const mock = createMockClient({
      streamEvents: [
        { type: "content_block_delta", delta: { type: "text_delta", text: "chunk1 " } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "chunk2" } },
      ],
    });
    setClient(mock);

    const reg = createToolRegistry();
    reg.registerStream("ai.stream", aiStream);

    const prints: any[] = [];
    await runBrief({
      source: `allow
  ai.stream

for await chunk from ask ai.stream("test") {
  print(chunk)
}`,
      registry: reg,
      printFn: (...a) => prints.push(...a),
    });

    expect(prints).toEqual(["chunk1 ", "chunk2"]);
  });

  it("with config args end-to-end", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");

    const mock = createMockClient({
      createResponse: {
        content: [{ type: "text", text: "configured response" }],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const reg = createToolRegistry();
    reg.register("ai.complete", aiComplete);

    const prints: any[] = [];
    await runBrief({
      source: `allow
  ai.complete

let config = ["model", "claude-opus-4-20250514", "temperature", 0.5]
let response =
  await ask ai.complete("test", config)
  or fail "failed"

print(response)`,
      registry: reg,
      printFn: (...a) => prints.push(...a),
    });

    expect(prints).toEqual(["configured response"]);
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-20250514");
    expect(call.temperature).toBe(0.5);
  });

  it("handles ai failure gracefully", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");

    const mock = createMockClient({
      createError: new Error("API key invalid"),
    });
    setClient(mock);

    const reg = createToolRegistry();
    reg.register("ai.complete", aiComplete);

    await expect(runBrief({
      source: `allow
  ai.complete

let response =
  await ask ai.complete("test")
  or fail "ai broke"`,
      registry: reg,
    })).rejects.toThrow("ai broke");
  });
});
