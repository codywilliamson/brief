import { describe, it, expect } from "vitest";
import { tokenize, TokenType, LexerError } from "../src/lexer.js";

function types(source: string): TokenType[] {
  return tokenize(source).filter(t => t.type !== TokenType.Newline && t.type !== TokenType.EOF).map(t => t.type);
}

function values(source: string): string[] {
  return tokenize(source).filter(t => t.type !== TokenType.Newline && t.type !== TokenType.EOF).map(t => t.value);
}

describe("lexer", () => {
  it("tokenizes numbers", () => {
    expect(types("42")).toEqual([TokenType.Number]);
    expect(types("3.14")).toEqual([TokenType.Number]);
    expect(values("42 3.14")).toEqual(["42", "3.14"]);
  });

  it("tokenizes strings", () => {
    expect(types('"hello"')).toEqual([TokenType.String]);
    expect(values('"hello world"')).toEqual(["hello world"]);
  });

  it("tokenizes interpolated strings as raw", () => {
    // lexer treats them as raw strings, parser handles interpolation
    expect(values('"hello {name}"')).toEqual(["hello {name}"]);
  });

  it("errors on unterminated string", () => {
    expect(() => tokenize('"hello')).toThrow(LexerError);
  });

  it("tokenizes booleans and null", () => {
    expect(types("true false null")).toEqual([
      TokenType.True, TokenType.False, TokenType.Null,
    ]);
  });

  it("tokenizes identifiers", () => {
    expect(types("myVar")).toEqual([TokenType.Identifier]);
    expect(values("camelCase")).toEqual(["camelCase"]);
  });

  it("tokenizes keywords", () => {
    expect(types("allow let async fn return")).toEqual([
      TokenType.Allow, TokenType.Let, TokenType.Async, TokenType.Fn, TokenType.Return,
    ]);
    expect(types("if else unless until for in")).toEqual([
      TokenType.If, TokenType.Else, TokenType.Unless, TokenType.Until, TokenType.For, TokenType.In,
    ]);
    expect(types("with ctx await all ask or fail")).toEqual([
      TokenType.With, TokenType.Ctx, TokenType.Await, TokenType.All,
      TokenType.Ask, TokenType.Or, TokenType.Fail,
    ]);
    expect(types("when ok failed from")).toEqual([
      TokenType.When, TokenType.Ok, TokenType.Failed, TokenType.From,
    ]);
    expect(types("test mock expect to be returns")).toEqual([
      TokenType.Test, TokenType.Mock, TokenType.Expect, TokenType.To, TokenType.Be, TokenType.Returns,
    ]);
  });

  it("tokenizes operators", () => {
    expect(types("== != > < >= <=")).toEqual([
      TokenType.EqualEqual, TokenType.BangEqual,
      TokenType.Greater, TokenType.Less,
      TokenType.GreaterEqual, TokenType.LessEqual,
    ]);
    expect(types("&& || !")).toEqual([
      TokenType.AmpAmp, TokenType.PipePipe, TokenType.Bang,
    ]);
    expect(types("+ - * / %")).toEqual([
      TokenType.Plus, TokenType.Minus, TokenType.Star, TokenType.Slash, TokenType.Percent,
    ]);
    expect(types("=>")).toEqual([TokenType.Arrow]);
  });

  it("tokenizes delimiters", () => {
    expect(types("( ) { } [ ] , :")).toEqual([
      TokenType.LeftParen, TokenType.RightParen,
      TokenType.LeftBrace, TokenType.RightBrace,
      TokenType.LeftBracket, TokenType.RightBracket,
      TokenType.Comma, TokenType.Colon,
    ]);
  });

  it("tokenizes dot", () => {
    expect(types("fs.read")).toEqual([
      TokenType.Identifier, TokenType.Dot, TokenType.Identifier,
    ]);
  });

  it("tokenizes comments", () => {
    const tokens = tokenize("# this is a comment");
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[0].value).toBe("this is a comment");
  });

  it("handles newlines", () => {
    const tokens = tokenize("a\nb");
    const toks = tokens.filter(t => t.type !== TokenType.EOF);
    expect(toks.map(t => t.type)).toEqual([
      TokenType.Identifier, TokenType.Newline, TokenType.Identifier,
    ]);
  });

  it("tracks line numbers", () => {
    const tokens = tokenize("a\nb\nc");
    const ids = tokens.filter(t => t.type === TokenType.Identifier);
    expect(ids[0].line).toBe(1);
    expect(ids[1].line).toBe(2);
    expect(ids[2].line).toBe(3);
  });

  it("tokenizes allow block", () => {
    const src = `allow\n  fs.read\n  ai.complete`;
    expect(types(src)).toEqual([
      TokenType.Allow,
      TokenType.Identifier, TokenType.Dot, TokenType.Identifier,
      TokenType.Identifier, TokenType.Dot, TokenType.Identifier,
    ]);
  });

  it("tokenizes let declaration", () => {
    expect(types('let name = "hello"')).toEqual([
      TokenType.Let, TokenType.Identifier, TokenType.Equal, TokenType.String,
    ]);
  });

  it("tokenizes function declaration", () => {
    expect(types("async fn foo(a, b) {")).toEqual([
      TokenType.Async, TokenType.Fn, TokenType.Identifier,
      TokenType.LeftParen, TokenType.Identifier, TokenType.Comma, TokenType.Identifier, TokenType.RightParen,
      TokenType.LeftBrace,
    ]);
  });

  it("tokenizes tool call", () => {
    const src = 'await ask ai.complete("prompt")';
    expect(types(src)).toEqual([
      TokenType.Await, TokenType.Ask,
      TokenType.Identifier, TokenType.Dot, TokenType.Identifier,
      TokenType.LeftParen, TokenType.String, TokenType.RightParen,
    ]);
  });

  it("tokenizes or fail", () => {
    expect(types('or fail "msg"')).toEqual([
      TokenType.Or, TokenType.Fail, TokenType.String,
    ]);
  });

  it("tokenizes assignment with =", () => {
    expect(types("= 42")).toEqual([TokenType.Equal, TokenType.Number]);
  });

  it("rejects unexpected characters", () => {
    expect(() => tokenize("@")).toThrow(LexerError);
    expect(() => tokenize("~")).toThrow(LexerError);
  });

  it("tokenizes complete example snippet", () => {
    const src = `allow
  fs.read
  ai.complete

let topic = "ml"

if true {
  print("hi")
}`;
    const tokens = tokenize(src);
    // should not throw and should have EOF
    expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
  });

  it("tokenizes type annotation", () => {
    expect(types("let x: string = \"hi\"")).toEqual([
      TokenType.Let, TokenType.Identifier, TokenType.Colon,
      TokenType.Identifier, TokenType.Equal, TokenType.String,
    ]);
  });

  it("tokenizes when/ok/failed", () => {
    const src = `when result {
  ok(value) => print(value)
  failed(err) => print(err)
}`;
    const toks = types(src);
    expect(toks).toContain(TokenType.When);
    expect(toks).toContain(TokenType.Ok);
    expect(toks).toContain(TokenType.Failed);
    expect(toks).toContain(TokenType.Arrow);
  });

  it("tokenizes print keyword", () => {
    expect(types("print")).toEqual([TokenType.Print]);
  });
});
