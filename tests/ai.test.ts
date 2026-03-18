import { describe, it, expect, vi, afterEach } from "vitest";
import {
  aiComplete, aiStream, aiConverse, aiToolUse, aiLoop,
  setQueryFn,
} from "../src/stdlib/ai.js";
import type { BriefValue } from "../src/stdlib/core.js";

// mock query function that returns an async iterable of messages
function mockQuery(messages: any[]) {
  return async function* () {
    for (const msg of messages) {
      yield msg;
    }
  };
}

function createMockQueryFn(opts: {
  result?: string;
  error?: string;
  streamDeltas?: string[];
  toolUseBlocks?: any[];
  perCall?: any[][]; // different message sequences per call
} = {}) {
  let callIndex = 0;
  const calls: any[] = [];

  const fn = vi.fn((params: any) => {
    calls.push(params);
    const idx = callIndex++;

    if (opts.perCall && opts.perCall[idx]) {
      return mockQuery(opts.perCall[idx])();
    }

    const messages: any[] = [];

    if (opts.streamDeltas) {
      for (const text of opts.streamDeltas) {
        messages.push({
          type: "stream_event",
          event: { type: "content_block_delta", delta: { type: "text_delta", text } },
        });
      }
    }

    if (opts.toolUseBlocks) {
      messages.push({
        type: "assistant",
        message: { content: opts.toolUseBlocks },
      });
    }

    if (opts.error) {
      messages.push({ type: "result", subtype: opts.error });
    } else {
      messages.push({ type: "result", subtype: "success", result: opts.result ?? "mock response" });
    }

    return mockQuery(messages)();
  }) as any;

  fn._calls = calls;
  return fn;
}

describe("ai.complete", () => {
  afterEach(() => setQueryFn(null));

  it("returns text from completion", async () => {
    const mock = createMockQueryFn({ result: "hello from claude" });
    setQueryFn(mock);

    const result = await aiComplete("say hello");
    expect(result).toEqual({ kind: "ok", value: "hello from claude" });
    expect(mock).toHaveBeenCalledOnce();
  });

  it("passes prompt to query", async () => {
    const mock = createMockQueryFn();
    setQueryFn(mock);

    await aiComplete("test prompt");
    expect(mock._calls[0].prompt).toBe("test prompt");
  });

  it("uses default model", async () => {
    const mock = createMockQueryFn();
    setQueryFn(mock);

    await aiComplete("test");
    expect(mock._calls[0].options.model).toBe("claude-sonnet-4-6");
  });

  it("accepts config with model override", async () => {
    const mock = createMockQueryFn();
    setQueryFn(mock);

    await aiComplete("test", ["model", "claude-opus-4-6"]);
    expect(mock._calls[0].options.model).toBe("claude-opus-4-6");
  });

  it("accepts config with system prompt", async () => {
    const mock = createMockQueryFn();
    setQueryFn(mock);

    await aiComplete("test", ["system", "you are a pirate"]);
    expect(mock._calls[0].options.systemPrompt).toBe("you are a pirate");
  });

  it("returns failed on non-string prompt", async () => {
    const result = await aiComplete(42);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("must be a string");
  });

  it("returns failed on agent error", async () => {
    const mock = createMockQueryFn({ error: "error_max_turns" });
    setQueryFn(mock);

    const result = await aiComplete("test");
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("error_max_turns");
  });

  it("returns failed on thrown error", async () => {
    setQueryFn((() => { throw new Error("connection failed"); }) as any);

    const result = await aiComplete("test");
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("connection failed");
  });

  it("uses bypassPermissions mode", async () => {
    const mock = createMockQueryFn();
    setQueryFn(mock);

    await aiComplete("test");
    expect(mock._calls[0].options.permissionMode).toBe("bypassPermissions");
  });
});

describe("ai.stream", () => {
  afterEach(() => setQueryFn(null));

  it("streams text deltas", async () => {
    const mock = createMockQueryFn({ streamDeltas: ["hello ", "world"], result: "" });
    setQueryFn(mock);

    const stream = await aiStream("test");
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["hello ", "world"]);
  });

  it("handles empty stream", async () => {
    const mock = createMockQueryFn({ result: "" });
    setQueryFn(mock);

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

  it("handles error during stream", async () => {
    setQueryFn((() => { throw new Error("stream failed"); }) as any);

    const stream = await aiStream("test");
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("stream failed");
  });

  it("reports agent errors in stream", async () => {
    const mock = createMockQueryFn({ error: "error_max_turns" });
    setQueryFn(mock);

    const stream = await aiStream("test");
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.some(c => c.includes("error_max_turns"))).toBe(true);
  });
});

describe("ai.converse", () => {
  afterEach(() => setQueryFn(null));

  it("sends multi-turn messages as formatted prompt", async () => {
    const mock = createMockQueryFn({ result: "turn 3 response" });
    setQueryFn(mock);

    const result = await aiConverse([
      "user", "hello",
      "assistant", "hi there",
      "user", "how are you?",
    ]);

    expect(result).toEqual({ kind: "ok", value: "turn 3 response" });
    expect(mock._calls[0].prompt).toContain("user: hello");
    expect(mock._calls[0].prompt).toContain("assistant: hi there");
    expect(mock._calls[0].prompt).toContain("user: how are you?");
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
    const result = await aiConverse(["user", "hello", "system", "test"]);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("invalid message role");
  });

  it("requires the first message to be from the user", async () => {
    const result = await aiConverse(["assistant", "hello", "user", "hi"]);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("first message");
  });

  it("rejects odd-length message arrays", async () => {
    const result = await aiConverse(["user", "hello", "assistant"]);
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("pairs");
  });

  it("accepts config", async () => {
    const mock = createMockQueryFn();
    setQueryFn(mock);

    await aiConverse(["user", "test"], ["model", "claude-opus-4-6"]);
    expect(mock._calls[0].options.model).toBe("claude-opus-4-6");
  });
});

describe("ai.toolUse", () => {
  afterEach(() => setQueryFn(null));

  it("builds tool descriptions into prompt", async () => {
    const mock = createMockQueryFn({
      toolUseBlocks: [
        { type: "text", text: "Checking weather..." },
        { type: "tool_use", id: "call_1", name: "getWeather", input: { city: "San Francisco" } },
      ],
      result: "tool result",
    });
    setQueryFn(mock);

    const tools = [
      ["getWeather", "get current weather", ["city", "string", "city name"]],
    ];

    const result = await aiToolUse("what's the weather?", tools);
    expect(result).toEqual({
      kind: "ok",
      value: [
        ["text", "Checking weather..."],
        ["tool_use", "getWeather", "call_1", ["city", "San Francisco"]],
      ],
    });
    expect(mock._calls[0].prompt).toContain("getWeather");
    expect(mock._calls[0].prompt).toContain("get current weather");
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
});

describe("ai.loop", () => {
  afterEach(() => setQueryFn(null));

  it("returns immediately if no tool calls", async () => {
    const mock = createMockQueryFn({ result: "no tools needed" });
    setQueryFn(mock);

    const executor = vi.fn();
    const result = await aiLoop("simple question", [["tool1", "desc"]], executor);

    expect(result).toEqual({ kind: "ok", value: "no tools needed" });
    expect(executor).not.toHaveBeenCalled();
  });

  it("runs tool-use loop until model stops", async () => {
    const mock = createMockQueryFn({
      perCall: [
        // first call: tool use
        [
          {
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "lookup", input: { query: "test" } }],
            },
          },
          { type: "result", subtype: "success", result: "" },
        ],
        // second call: final answer
        [
          { type: "result", subtype: "success", result: "final answer" },
        ],
      ],
    });
    setQueryFn(mock);

    const executor = vi.fn(async () => "lookup result");
    const result = await aiLoop("find something", [["lookup", "search"]], executor);

    expect(result).toEqual({ kind: "ok", value: "final answer" });
    expect(executor).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledWith("lookup", ["query", "test"]);
    expect(mock._calls[0].prompt).toContain("Available tools:");
    expect(mock._calls[1].prompt).toContain("Previous tool results:");
  });

  it("handles multiple tool calls in one response", async () => {
    const mock = createMockQueryFn({
      perCall: [
        [
          {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "getA", input: {} },
                { type: "tool_use", name: "getB", input: {} },
              ],
            },
          },
          { type: "result", subtype: "success", result: "" },
        ],
        [
          { type: "result", subtype: "success", result: "combined" },
        ],
      ],
    });
    setQueryFn(mock);

    const calls: string[] = [];
    const executor = vi.fn(async (name: string) => {
      calls.push(name);
      return `result-${name}`;
    });

    const result = await aiLoop("get both", [["getA", "a"], ["getB", "b"]], executor);
    expect(result.kind).toBe("ok");
    expect(calls).toEqual(["getA", "getB"]);
  });

  it("preserves non-string tool input values", async () => {
    const mock = createMockQueryFn({
      perCall: [
        [
          {
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "inspect", input: { count: 2, enabled: true, tags: ["a", "b"] } }],
            },
          },
          { type: "result", subtype: "success", result: "" },
        ],
        [
          { type: "result", subtype: "success", result: "done" },
        ],
      ],
    });
    setQueryFn(mock);

    const executor = vi.fn(async () => "ok");
    await aiLoop("inspect", [["inspect", "inspect values"]], executor);

    expect(executor).toHaveBeenCalledWith("inspect", ["count", 2, "enabled", true, "tags", ["a", "b"]]);
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
    setQueryFn((() => { throw new Error("server down"); }) as any);

    const result = await aiLoop("test", [["t", "d"]], async () => "");
    expect(result.kind).toBe("failed");
    expect((result as any).reason).toContain("server down");
  });
});

describe("integration with Brief runtime", () => {
  afterEach(() => setQueryFn(null));

  it("ai.complete end-to-end", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");
    const mock = createMockQueryFn({ result: "AI says hello" });
    setQueryFn(mock);

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

  it("ai.stream end-to-end", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");
    const mock = createMockQueryFn({ streamDeltas: ["chunk1 ", "chunk2"], result: "" });
    setQueryFn(mock);

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

  it("ai.complete with config end-to-end", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");
    const mock = createMockQueryFn({ result: "configured" });
    setQueryFn(mock);

    const reg = createToolRegistry();
    reg.register("ai.complete", aiComplete);

    const prints: any[] = [];
    await runBrief({
      source: `allow
  ai.complete

let config = ["model", "claude-opus-4-6", "system", "be concise"]
let response =
  await ask ai.complete("test", config)
  or fail "failed"

print(response)`,
      registry: reg,
      printFn: (...a) => prints.push(...a),
    });

    expect(prints).toEqual(["configured"]);
    expect(mock._calls[0].options.model).toBe("claude-opus-4-6");
    expect(mock._calls[0].options.systemPrompt).toBe("be concise");
  });

  it("ai.loop with Brief callback end-to-end", async () => {
    const { runBrief } = await import("../src/runtime.js");
    const mock = createMockQueryFn({
      perCall: [
        [
          {
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "greet", input: { name: "world" } }],
            },
          },
          { type: "result", subtype: "success", result: "" },
        ],
        [
          { type: "result", subtype: "success", result: "greeting complete" },
        ],
      ],
    });
    setQueryFn(mock);

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
  });

  it("handles ai failure gracefully", async () => {
    const { runBrief, createToolRegistry } = await import("../src/runtime.js");
    setQueryFn((() => { throw new Error("API key invalid"); }) as any);

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
