import { describe, it, expect } from "vitest";
import { parse, ParseError } from "../src/parser.js";
import type { Node } from "../src/ast.js";

function parseBody(src: string): Node[] {
  return parse(src).body;
}

describe("parser", () => {
  describe("allow block", () => {
    it("parses allow block with permissions", () => {
      const ast = parse("allow\n  fs.read\n  ai.complete");
      expect(ast.allow.kind).toBe("AllowBlock");
      expect(ast.allow.permissions).toEqual(["fs.read", "ai.complete"]);
    });

    it("errors on missing allow block", () => {
      expect(() => parse('let x = 1')).toThrow(ParseError);
    });

    it("errors on empty allow block", () => {
      expect(() => parse("allow\nlet x = 1")).toThrow(ParseError);
    });
  });

  describe("let declarations", () => {
    it("parses let with string value", () => {
      const body = parseBody('allow\n  fs.read\nlet x = "hello"');
      expect(body[0]).toMatchObject({ kind: "LetDecl", name: "x" });
    });

    it("parses let with number", () => {
      const body = parseBody("allow\n  fs.read\nlet x = 42");
      expect(body[0]).toMatchObject({
        kind: "LetDecl", name: "x",
        value: { kind: "NumberLit", value: 42 },
      });
    });

    it("parses let with type annotation", () => {
      const body = parseBody('allow\n  fs.read\nlet x: string = "hi"');
      const decl = body[0] as any;
      expect(decl.typeAnnotation).toBe("string");
    });

    it("parses let with boolean", () => {
      const body = parseBody("allow\n  fs.read\nlet x = true");
      expect(body[0]).toMatchObject({
        kind: "LetDecl", name: "x",
        value: { kind: "BoolLit", value: true },
      });
    });
  });

  describe("function declarations", () => {
    it("parses async fn", () => {
      const body = parseBody("allow\n  fs.read\nasync fn foo(a, b) {\n  return a\n}");
      expect(body[0]).toMatchObject({
        kind: "FnDecl",
        name: "foo",
        params: ["a", "b"],
      });
    });

    it("parses fn with no params", () => {
      const body = parseBody("allow\n  fs.read\nasync fn doStuff() {\n  return null\n}");
      const fn = body[0] as any;
      expect(fn.params).toEqual([]);
    });
  });

  describe("tool calls", () => {
    it("parses await ask tool call", () => {
      const body = parseBody('allow\n  ai.complete\nlet r =\n  await ask ai.complete("prompt")\n  or fail "oops"');
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("OrFailExpr");
      expect(decl.value.expr.kind).toBe("ToolCallExpr");
      expect(decl.value.expr.tool).toBe("ai.complete");
    });

    it("parses or return", () => {
      const body = parseBody('allow\n  fs.read\nlet r =\n  await ask fs.read("f.txt")\n  or return ""');
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("OrReturnExpr");
    });
  });

  describe("if/else", () => {
    it("parses if statement", () => {
      const body = parseBody('allow\n  fs.read\nif true {\n  print("yes")\n}');
      expect(body[0]).toMatchObject({ kind: "IfStmt" });
      const ifStmt = body[0] as any;
      expect(ifStmt.elseBody).toBeNull();
    });

    it("parses if/else", () => {
      const body = parseBody('allow\n  fs.read\nif true {\n  print("a")\n} else {\n  print("b")\n}');
      const ifStmt = body[0] as any;
      expect(ifStmt.elseBody).not.toBeNull();
    });
  });

  describe("unless", () => {
    it("parses unless statement", () => {
      const body = parseBody('allow\n  fs.read\nunless isReady {\n  return failed("not ready")\n}');
      expect(body[0]).toMatchObject({ kind: "UnlessStmt" });
    });
  });

  describe("until", () => {
    it("parses until statement", () => {
      const body = parseBody("allow\n  fs.read\nuntil done {\n  print(1)\n}");
      expect(body[0]).toMatchObject({ kind: "UntilStmt" });
    });
  });

  describe("for loop", () => {
    it("parses for..in", () => {
      const body = parseBody("allow\n  fs.read\nfor item in list {\n  print(item)\n}");
      expect(body[0]).toMatchObject({ kind: "ForStmt", variable: "item" });
    });

    it("parses for await..from", () => {
      const body = parseBody('allow\n  ai.stream\nfor await chunk from ask ai.stream("p") {\n  print(chunk)\n}');
      expect(body[0]).toMatchObject({ kind: "ForAwaitStmt", variable: "chunk" });
    });
  });

  describe("when expression", () => {
    it("parses when with ok/failed branches", () => {
      const body = parseBody("allow\n  fs.read\nwhen result {\n  ok(v) => print(v)\n  failed(e) => print(e)\n}");
      const when = body[0] as any;
      expect(when.kind).toBe("WhenExpr");
      expect(when.branches).toHaveLength(2);
      expect(when.branches[0].pattern).toBe("ok");
      expect(when.branches[1].pattern).toBe("failed");
    });
  });

  describe("postfix if", () => {
    it("parses return with postfix if", () => {
      const body = parseBody('allow\n  fs.read\nreturn failed("empty") if x == ""');
      expect(body[0]).toMatchObject({ kind: "PostfixIf" });
      const pf = body[0] as any;
      expect(pf.statement.kind).toBe("ReturnStmt");
    });
  });

  describe("expressions", () => {
    it("parses binary operators", () => {
      const body = parseBody("allow\n  fs.read\nlet x = 1 + 2 * 3");
      const decl = body[0] as any;
      // should be 1 + (2*3) due to precedence
      expect(decl.value.kind).toBe("BinaryExpr");
      expect(decl.value.op).toBe("+");
      expect(decl.value.right.kind).toBe("BinaryExpr");
      expect(decl.value.right.op).toBe("*");
    });

    it("parses comparison operators", () => {
      const body = parseBody("allow\n  fs.read\nlet x = a == b");
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("BinaryExpr");
      expect(decl.value.op).toBe("==");
    });

    it("parses logical operators", () => {
      const body = parseBody("allow\n  fs.read\nlet x = a && b || c");
      const decl = body[0] as any;
      // || has lower precedence than &&
      expect(decl.value.op).toBe("||");
    });

    it("parses unary not", () => {
      const body = parseBody("allow\n  fs.read\nlet x = !true");
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("UnaryExpr");
      expect(decl.value.op).toBe("!");
    });

    it("parses function calls", () => {
      const body = parseBody('allow\n  fs.read\ntrim("hello ")');
      const stmt = body[0] as any;
      expect(stmt.expr.kind).toBe("CallExpr");
    });

    it("parses member access", () => {
      const body = parseBody("allow\n  fs.read\nlet x = items.length");
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("MemberExpr");
      expect(decl.value.property).toBe("length");
    });

    it("parses method calls", () => {
      const body = parseBody('allow\n  fs.read\nsections.push("a")');
      const stmt = body[0] as any;
      expect(stmt.expr.kind).toBe("CallExpr");
      expect(stmt.expr.callee.kind).toBe("MemberExpr");
    });

    it("parses array literals", () => {
      const body = parseBody("allow\n  fs.read\nlet x = [1, 2, 3]");
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("ArrayLit");
      expect(decl.value.elements).toHaveLength(3);
    });

    it("parses interpolated strings", () => {
      const body = parseBody('allow\n  fs.read\nlet x = "hello {name}"');
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("InterpolatedString");
      expect(decl.value.parts).toHaveLength(2);
    });

    it("parses Ok() and failed() as expressions", () => {
      const body = parseBody('allow\n  fs.read\nreturn Ok("done")');
      const ret = body[0] as any;
      expect(ret.value.kind).toBe("CallExpr");
      expect(ret.value.callee.name).toBe("Ok");
    });

    it("parses null literal", () => {
      const body = parseBody("allow\n  fs.read\nlet x = null");
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("NullLit");
    });
  });

  describe("await all", () => {
    it("parses await all block", () => {
      const body = parseBody('allow\n  fs.read\nlet x = await all {\n  ask fs.read("a.txt")\n  ask fs.read("b.txt")\n}');
      const decl = body[0] as any;
      expect(decl.value.kind).toBe("AwaitAllExpr");
      expect(decl.value.calls).toHaveLength(2);
    });
  });

  describe("test blocks", () => {
    it("parses test block", () => {
      const ast = parse('allow\n  fs.read\ntest "my test" {\n  expect 1 to be 1\n}');
      expect(ast.tests).toHaveLength(1);
      expect(ast.tests[0].description).toBe("my test");
    });

    it("parses mock statement", () => {
      const ast = parse('allow\n  fs.read\ntest "t" {\n  mock fs.read returns Ok("data")\n}');
      const mock = ast.tests[0].body[0] as any;
      expect(mock.kind).toBe("MockStmt");
      expect(mock.tool).toBe("fs.read");
      expect(mock.args).toBeNull();
    });

    it("parses mock with specific args", () => {
      const ast = parse('allow\n  fs.read\ntest "t" {\n  mock fs.read("file.txt") returns Ok("data")\n}');
      const mock = ast.tests[0].body[0] as any;
      expect(mock.args).toHaveLength(1);
    });

    it("parses expect to be ok", () => {
      const ast = parse('allow\n  fs.read\ntest "t" {\n  expect result to be ok\n}');
      const exp = ast.tests[0].body[0] as any;
      expect(exp.kind).toBe("ExpectStmt");
      expect(exp.matcher).toBe("beOk");
    });

    it("parses expect to be failed", () => {
      const ast = parse('allow\n  fs.read\ntest "t" {\n  expect result to be failed("msg")\n}');
      const exp = ast.tests[0].body[0] as any;
      expect(exp.matcher).toBe("beFailed");
      expect(exp.expected).not.toBeNull();
    });

    it("parses expect to be value", () => {
      const ast = parse('allow\n  fs.read\ntest "t" {\n  expect count to be 5\n}');
      const exp = ast.tests[0].body[0] as any;
      expect(exp.matcher).toBe("be");
      expect(exp.expected.value).toBe(5);
    });

    it("errors when non-test statements appear after a test block", () => {
      expect(() => parse('allow\n  fs.read\ntest "t" {\n  expect 1 to be 1\n}\nprint(1)')).toThrow(ParseError);
    });
  });

  describe("complete program", () => {
    it("parses a full program", () => {
      const src = `allow
  fs.read
  fs.write
  ai.complete

let topic =
  await ask fs.read("topic.txt")
  or fail "could not read topic file"

return failed("topic is empty") if trim(topic) == ""

let result =
  await ask ai.complete("summarize: {topic}")
  or fail "ai failed"

await ask fs.write("out.txt", result)
  or fail "write failed"

print("done")

test "reads and writes" {
  mock fs.read("topic.txt") returns Ok("ml")
  mock ai.complete returns Ok("summary")
  mock fs.write returns Ok(null)
  expect 1 to be 1
}`;
      const ast = parse(src);
      expect(ast.allow.permissions).toEqual(["fs.read", "fs.write", "ai.complete"]);
      expect(ast.body.length).toBeGreaterThan(0);
      expect(ast.tests).toHaveLength(1);
    });
  });
});
