// brief lexer - tokenizes .br source

export enum TokenType {
  // literals
  Number,
  String,
  True,
  False,
  Null,
  Identifier,

  // keywords
  Allow,
  Let,
  Async,
  Fn,
  Return,
  If,
  Else,
  Unless,
  Until,
  For,
  In,
  With,
  Ctx,
  Await,
  All,
  Ask,
  Or,
  Fail,
  When,
  Ok,
  Failed,
  From,
  Test,
  Mock,
  Expect,
  To,
  Be,
  Returns,
  Print,
  Set,

  // operators
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
  EqualEqual,
  BangEqual,
  Greater,
  Less,
  GreaterEqual,
  LessEqual,
  AmpAmp,
  PipePipe,
  Bang,
  Equal,
  Arrow, // =>
  Dot,

  // delimiters
  LeftParen,
  RightParen,
  LeftBrace,
  RightBrace,
  LeftBracket,
  RightBracket,
  Comma,
  Colon,

  // special
  Newline,
  EOF,
  Comment,
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS: Record<string, TokenType> = {
  allow: TokenType.Allow,
  let: TokenType.Let,
  async: TokenType.Async,
  fn: TokenType.Fn,
  return: TokenType.Return,
  if: TokenType.If,
  else: TokenType.Else,
  unless: TokenType.Unless,
  until: TokenType.Until,
  for: TokenType.For,
  in: TokenType.In,
  with: TokenType.With,
  ctx: TokenType.Ctx,
  await: TokenType.Await,
  all: TokenType.All,
  ask: TokenType.Ask,
  or: TokenType.Or,
  fail: TokenType.Fail,
  when: TokenType.When,
  ok: TokenType.Ok,
  failed: TokenType.Failed,
  from: TokenType.From,
  test: TokenType.Test,
  mock: TokenType.Mock,
  expect: TokenType.Expect,
  to: TokenType.To,
  be: TokenType.Be,
  returns: TokenType.Returns,
  print: TokenType.Print,
  set: TokenType.Set,
  true: TokenType.True,
  false: TokenType.False,
  null: TokenType.Null,
};

export class LexerError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
  ) {
    super(`Lexer error at line ${line}, col ${column}: ${message}`);
    this.name = "LexerError";
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let column = 1;

  function peek(): string {
    return pos < source.length ? source[pos] : "\0";
  }

  function peekNext(): string {
    return pos + 1 < source.length ? source[pos + 1] : "\0";
  }

  function advance(): string {
    const ch = source[pos];
    pos++;
    column++;
    return ch;
  }

  function token(type: TokenType, value: string, startCol: number): Token {
    return { type, value, line, column: startCol };
  }

  function readString(): Token {
    const startCol = column;
    advance(); // skip opening "
    let str = "";
    while (pos < source.length && peek() !== '"') {
      if (peek() === "\n") {
        throw new LexerError("unterminated string", line, startCol);
      }
      str += advance();
    }
    if (pos >= source.length) {
      throw new LexerError("unterminated string", line, startCol);
    }
    advance(); // skip closing "
    return token(TokenType.String, str, startCol);
  }

  function readNumber(): Token {
    const startCol = column;
    let num = "";
    while (pos < source.length && isDigit(peek())) {
      num += advance();
    }
    if (peek() === "." && isDigit(peekNext())) {
      num += advance(); // .
      while (pos < source.length && isDigit(peek())) {
        num += advance();
      }
    }
    return token(TokenType.Number, num, startCol);
  }

  function readIdentifierOrKeyword(): Token {
    const startCol = column;
    let id = "";
    while (pos < source.length && isIdentChar(peek())) {
      id += advance();
    }
    const kwType = KEYWORDS[id];
    if (kwType !== undefined) {
      return token(kwType, id, startCol);
    }
    return token(TokenType.Identifier, id, startCol);
  }

  while (pos < source.length) {
    const ch = peek();

    // skip spaces and tabs
    if (ch === " " || ch === "\t" || ch === "\r") {
      advance();
      continue;
    }

    // newlines
    if (ch === "\n") {
      tokens.push(token(TokenType.Newline, "\\n", column));
      advance();
      line++;
      column = 1;
      continue;
    }

    // comments
    if (ch === "#") {
      const startCol = column;
      let comment = "";
      advance(); // skip #
      while (pos < source.length && peek() !== "\n") {
        comment += advance();
      }
      tokens.push(token(TokenType.Comment, comment.trim(), startCol));
      continue;
    }

    // strings
    if (ch === '"') {
      tokens.push(readString());
      continue;
    }

    // numbers
    if (isDigit(ch)) {
      tokens.push(readNumber());
      continue;
    }

    // identifiers and keywords
    if (isIdentStart(ch)) {
      tokens.push(readIdentifierOrKeyword());
      continue;
    }

    // two-char operators
    if (ch === "=" && peekNext() === "=") {
      const c = column;
      advance(); advance();
      tokens.push(token(TokenType.EqualEqual, "==", c));
      continue;
    }
    if (ch === "!" && peekNext() === "=") {
      const c = column;
      advance(); advance();
      tokens.push(token(TokenType.BangEqual, "!=", c));
      continue;
    }
    if (ch === ">" && peekNext() === "=") {
      const c = column;
      advance(); advance();
      tokens.push(token(TokenType.GreaterEqual, ">=", c));
      continue;
    }
    if (ch === "<" && peekNext() === "=") {
      const c = column;
      advance(); advance();
      tokens.push(token(TokenType.LessEqual, "<=", c));
      continue;
    }
    if (ch === "&" && peekNext() === "&") {
      const c = column;
      advance(); advance();
      tokens.push(token(TokenType.AmpAmp, "&&", c));
      continue;
    }
    if (ch === "|" && peekNext() === "|") {
      const c = column;
      advance(); advance();
      tokens.push(token(TokenType.PipePipe, "||", c));
      continue;
    }
    if (ch === "=" && peekNext() === ">") {
      const c = column;
      advance(); advance();
      tokens.push(token(TokenType.Arrow, "=>", c));
      continue;
    }

    // single-char tokens
    const singleCharMap: Record<string, TokenType> = {
      "+": TokenType.Plus,
      "-": TokenType.Minus,
      "*": TokenType.Star,
      "/": TokenType.Slash,
      "%": TokenType.Percent,
      ">": TokenType.Greater,
      "<": TokenType.Less,
      "!": TokenType.Bang,
      "=": TokenType.Equal,
      ".": TokenType.Dot,
      "(": TokenType.LeftParen,
      ")": TokenType.RightParen,
      "{": TokenType.LeftBrace,
      "}": TokenType.RightBrace,
      "[": TokenType.LeftBracket,
      "]": TokenType.RightBracket,
      ",": TokenType.Comma,
      ":": TokenType.Colon,
    };

    if (ch in singleCharMap) {
      const c = column;
      advance();
      tokens.push(token(singleCharMap[ch], ch, c));
      continue;
    }

    throw new LexerError(`unexpected character '${ch}'`, line, column);
  }

  tokens.push(token(TokenType.EOF, "", column));
  return tokens;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentChar(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}
