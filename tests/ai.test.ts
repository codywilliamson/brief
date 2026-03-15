import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { aiComplete, aiStream, aiConverse, aiToolUse, aiLoop, setClient } from "../src/stdlib/ai.js";
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

describe("ai.converse", () => {
  afterEach(() => setClient(null));

  it("sends multi-turn messages", async () => {
    const mock = createMockClient({
      createResponse: {
        content: [{ type: "text", text: "turn 3 response" }],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const result = await aiConverse([
      "user", "hello",
      "assistant", "hi there",
      "user", "how are you?",
    ]);

    expect(result).toEqual({ kind: "ok", value: "turn 3 response" });
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
      { role: "user", content: "how are you?" },
    ]);
  });

  it("rejects non-array input", async () => {
    const result = await aiConverse("not an array");
    expect(result.kind).toBe("failed");
  });

  it("rejects empty messages", async () => {
    const result = await aiConverse([]);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("at least one message");
  });

  it("rejects invalid role", async () => {
    const result = await aiConverse(["system", "test"]);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("invalid message role");
  });

  it("accepts config", async () => {
    const mock = createMockClient();
    setClient(mock);

    await aiConverse(
      ["user", "test"],
      ["model", "claude-opus-4-20250514", "system", "be brief"],
    );

    const call = mock.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-20250514");
    expect(call.system).toBe("be brief");
  });

  it("works end-to-end in Brief", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");

    const mock = createMockClient({
      createResponse: {
        content: [{ type: "text", text: "multi-turn works" }],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const reg = createToolRegistry();
    reg.register("ai.converse", aiConverse);

    const prints: any[] = [];
    await runBrief({
      source: `allow
  ai.converse

let messages = ["user", "hello", "assistant", "hi", "user", "tell me more"]
let response =
  await ask ai.converse(messages)
  or fail "converse failed"

print(response)`,
      registry: reg,
      printFn: (...a) => prints.push(...a),
    });

    expect(prints).toEqual(["multi-turn works"]);
  });
});

describe("ai.toolUse", () => {
  afterEach(() => setClient(null));

  it("sends tools to API", async () => {
    const mock = createMockClient({
      createResponse: {
        content: [
          { type: "tool_use", name: "getWeather", id: "call_123", input: { city: "SF" } },
        ],
        role: "assistant",
        stop_reason: "tool_use",
      },
    });
    setClient(mock);

    const tools = [
      ["getWeather", "get current weather", ["city", "string", "city name"]],
    ];

    const result = await aiToolUse("what's the weather in SF?", tools);
    expect(result.kind).toBe("ok");

    const blocks = (result as any).value;
    expect(blocks).toHaveLength(1);
    expect(blocks[0][0]).toBe("tool_use");
    expect(blocks[0][1]).toBe("getWeather");
    expect(blocks[0][2]).toBe("call_123");
    expect(blocks[0][3]).toEqual(["city", "SF"]);
  });

  it("sends correct tool schema to API", async () => {
    const mock = createMockClient({
      createResponse: {
        content: [{ type: "text", text: "no tools needed" }],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const tools = [
      ["searchFlights", "search for flights", ["from", "string", "origin"], ["to", "string", "destination"]],
    ];

    await aiToolUse("test", tools);
    const call = mock.messages.create.mock.calls[0][0];
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("searchFlights");
    expect(call.tools[0].description).toBe("search for flights");
    expect(call.tools[0].input_schema.properties).toEqual({
      from: { type: "string", description: "origin" },
      to: { type: "string", description: "destination" },
    });
    expect(call.tools[0].input_schema.required).toEqual(["from", "to"]);
  });

  it("handles text-only response", async () => {
    const mock = createMockClient({
      createResponse: {
        content: [{ type: "text", text: "I can help with that" }],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const result = await aiToolUse("test", [["tool1", "desc"]]);
    expect(result.kind).toBe("ok");
    const blocks = (result as any).value;
    expect(blocks[0]).toEqual(["text", "I can help with that"]);
  });

  it("handles mixed text and tool_use response", async () => {
    const mock = createMockClient({
      createResponse: {
        content: [
          { type: "text", text: "Let me check" },
          { type: "tool_use", name: "lookup", id: "call_456", input: { query: "test" } },
        ],
        role: "assistant",
        stop_reason: "tool_use",
      },
    });
    setClient(mock);

    const result = await aiToolUse("test", [["lookup", "look something up", ["query", "string", "search query"]]]);
    expect(result.kind).toBe("ok");
    const blocks = (result as any).value;
    expect(blocks).toHaveLength(2);
    expect(blocks[0][0]).toBe("text");
    expect(blocks[1][0]).toBe("tool_use");
  });

  it("rejects non-string prompt", async () => {
    const result = await aiToolUse(42, []);
    expect(result.kind).toBe("failed");
  });

  it("rejects non-array tools", async () => {
    const result = await aiToolUse("test", "not array");
    expect(result.kind).toBe("failed");
  });

  it("rejects malformed tool definition", async () => {
    const result = await aiToolUse("test", [["onlyName"]]);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("each tool must be");
  });

  it("handles API error", async () => {
    const mock = createMockClient({ createError: new Error("quota exceeded") });
    setClient(mock);

    const result = await aiToolUse("test", [["tool1", "desc"]]);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("quota exceeded");
  });

  it("works end-to-end in Brief", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");

    const mock = createMockClient({
      createResponse: {
        content: [
          { type: "tool_use", name: "getWeather", id: "call_789", input: { city: "NYC" } },
        ],
        role: "assistant",
        stop_reason: "tool_use",
      },
    });
    setClient(mock);

    const reg = createToolRegistry();
    reg.register("ai.toolUse", aiToolUse);

    const prints: any[] = [];
    await runBrief({
      source: `allow
  ai.toolUse

let tools = [
  ["getWeather", "get weather", ["city", "string", "city name"]]
]

let result =
  await ask ai.toolUse("weather in NYC?", tools)
  or fail "tool use failed"

print(result)`,
      registry: reg,
      printFn: (...a) => prints.push(...a),
    });

    expect(prints).toHaveLength(1);
    const blocks = prints[0] as any[];
    expect(blocks[0][0]).toBe("tool_use");
    expect(blocks[0][1]).toBe("getWeather");
  });
});

describe("ai.loop", () => {
  afterEach(() => setClient(null));

  it("runs tool-use loop until model stops", async () => {
    let callCount = 0;
    const mock = createMockClient();
    // override create to simulate: first call returns tool_use, second returns text
    mock.messages.create = vi.fn(async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          content: [
            { type: "tool_use", name: "lookup", id: "call_1", input: { query: "test" } },
          ],
          role: "assistant",
          stop_reason: "tool_use",
        };
      }
      return {
        content: [{ type: "text", text: "final answer based on lookup" }],
        role: "assistant",
        stop_reason: "end_turn",
      };
    });
    setClient(mock);

    const executor = vi.fn(async (toolName: string, toolInput: any) => {
      return `result for ${toolName}`;
    });

    const tools = [["lookup", "search for info", ["query", "string", "search term"]]];
    const result = await aiLoop("find something", tools, executor);

    expect(result).toEqual({ kind: "ok", value: "final answer based on lookup" });
    expect(executor).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledWith("lookup", ["query", "test"]);
    expect(mock.messages.create).toHaveBeenCalledTimes(2);
  });

  it("returns immediately if no tool calls", async () => {
    const mock = createMockClient({
      createResponse: {
        content: [{ type: "text", text: "no tools needed" }],
        role: "assistant",
        stop_reason: "end_turn",
      },
    });
    setClient(mock);

    const executor = vi.fn();
    const result = await aiLoop("simple question", [["tool1", "desc"]], executor);

    expect(result).toEqual({ kind: "ok", value: "no tools needed" });
    expect(executor).not.toHaveBeenCalled();
  });

  it("handles multiple tool calls in one response", async () => {
    let callCount = 0;
    const mock = createMockClient();
    mock.messages.create = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: [
            { type: "tool_use", name: "getA", id: "c1", input: {} },
            { type: "tool_use", name: "getB", id: "c2", input: {} },
          ],
          role: "assistant",
          stop_reason: "tool_use",
        };
      }
      return {
        content: [{ type: "text", text: "combined result" }],
        role: "assistant",
        stop_reason: "end_turn",
      };
    });
    setClient(mock);

    const calls: string[] = [];
    const executor = vi.fn(async (name: string) => {
      calls.push(name);
      return `result-${name}`;
    });

    const tools = [["getA", "get A"], ["getB", "get B"]];
    const result = await aiLoop("get both", tools, executor);

    expect(result.kind).toBe("ok");
    expect(calls).toEqual(["getA", "getB"]);
  });

  it("works end-to-end in Brief with callback function", async () => {
    const { runBrief } = await import("../src/runtime.js");

    let callCount = 0;
    const mock = createMockClient();
    mock.messages.create = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: [
            { type: "tool_use", name: "greet", id: "c1", input: { name: "world" } },
          ],
          role: "assistant",
          stop_reason: "tool_use",
        };
      }
      return {
        content: [{ type: "text", text: "greeting complete" }],
        role: "assistant",
        stop_reason: "end_turn",
      };
    });
    setClient(mock);

    const prints: any[] = [];
    await runBrief({
      source: `allow
  ai.loop

async fn handleTool(toolName, toolInput) {
  return "handled: " + toolName
}

let tools = [
  ["greet", "greet someone", ["name", "string", "who to greet"]]
]

let result =
  await ask ai.loop("say hi to world", tools, "handleTool")
  or fail "loop failed"

print(result)`,
      printFn: (...a) => prints.push(...a),
    });

    expect(prints).toEqual(["greeting complete"]);
    expect(mock.messages.create).toHaveBeenCalledTimes(2);
  });

  it("rejects non-string prompt", async () => {
    const result = await aiLoop(42, [], async () => "");
    expect(result.kind).toBe("failed");
  });

  it("rejects non-array tools", async () => {
    const result = await aiLoop("test", "bad", async () => "");
    expect(result.kind).toBe("failed");
  });

  it("handles API error", async () => {
    const mock = createMockClient({ createError: new Error("server down") });
    setClient(mock);

    const result = await aiLoop("test", [["t", "d"]], async () => "");
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("server down");
  });
});
