// brief parser - produces AST from tokens

import { Token, TokenType, tokenize } from "./lexer.js";
import type * as AST from "./ast.js";
import type { Node } from "./ast.js";

export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
  ) {
    super(`Parse error at line ${line}, col ${column}: ${message}`);
    this.name = "ParseError";
  }
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    // filter comments, keep newlines for structure
    this.tokens = tokens.filter(t => t.type !== TokenType.Comment);
  }

  parse(): AST.Program {
    this.skipNewlines();
    const allow = this.parseAllowBlock();
    this.skipNewlines();

    const body: Node[] = [];
    const tests: AST.TestBlock[] = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      if (this.check(TokenType.Test)) {
        tests.push(this.parseTestBlock());
      } else {
        body.push(this.parseStatement());
      }
      this.skipNewlines();
    }

    return { kind: "Program", allow, body, tests, line: 1 };
  }

  // --- allow block ---

  private parseAllowBlock(): AST.AllowBlock {
    const tok = this.expect(TokenType.Allow, "expected 'allow' block");
    this.skipNewlines();

    const permissions: string[] = [];
    while (this.check(TokenType.Identifier) && this.isPermissionLine()) {
      const ns = this.advance().value;
      this.expect(TokenType.Dot, "expected '.' in permission");
      const name = this.expect(TokenType.Identifier, "expected permission name").value;
      permissions.push(`${ns}.${name}`);
      this.skipNewlines();
    }

    if (permissions.length === 0) {
      throw this.error("allow block must have at least one permission", tok);
    }

    return { kind: "AllowBlock", permissions, line: tok.line };
  }

  // --- statements ---

  private parseStatement(): Node {
    if (this.check(TokenType.Let)) return this.parseLetDecl();
    if (this.check(TokenType.Async)) return this.parseFnDecl();
    if (this.check(TokenType.Return)) return this.parseReturnStmt();
    if (this.check(TokenType.If)) return this.parseIfStmt();
    if (this.check(TokenType.Unless)) return this.parseUnlessStmt();
    if (this.check(TokenType.Until)) return this.parseUntilStmt();
    if (this.check(TokenType.For)) return this.parseForStmt();
    if (this.check(TokenType.With)) return this.parseWithCtxBlock();
    if (this.check(TokenType.When)) return this.parseWhenExpr();

    const expr = this.parseExpression();

    // check for postfix if
    if (this.check(TokenType.If)) {
      return this.parsePostfixIf(expr);
    }

    return { kind: "ExprStmt", expr, line: expr.line } as AST.ExprStmt;
  }

  private parseLetDecl(): AST.LetDecl {
    const tok = this.advance(); // consume 'let'
    const name = this.expect(TokenType.Identifier, "expected variable name").value;

    let typeAnnotation: string | undefined;
    if (this.match(TokenType.Colon)) {
      typeAnnotation = this.expect(TokenType.Identifier, "expected type name").value;
    }

    this.expect(TokenType.Equal, "expected '=' in let declaration");
    this.skipNewlines();
    const value = this.parseExpression();

    return { kind: "LetDecl", name, typeAnnotation, value, line: tok.line };
  }

  private parseFnDecl(): AST.FnDecl {
    const tok = this.advance(); // consume 'async'
    this.expect(TokenType.Fn, "expected 'fn' after 'async'");
    const name = this.expect(TokenType.Identifier, "expected function name").value;
    this.expect(TokenType.LeftParen, "expected '('");

    const params: string[] = [];
    if (!this.check(TokenType.RightParen)) {
      params.push(this.expect(TokenType.Identifier, "expected parameter name").value);
      while (this.match(TokenType.Comma)) {
        params.push(this.expect(TokenType.Identifier, "expected parameter name").value);
      }
    }
    this.expect(TokenType.RightParen, "expected ')'");

    const body = this.parseBlock();
    return { kind: "FnDecl", name, params, body, line: tok.line };
  }

  private parseReturnStmt(): AST.ReturnStmt {
    const tok = this.advance(); // consume 'return'

    // check if there's a value (not newline/EOF/})
    if (this.check(TokenType.Newline) || this.isAtEnd() || this.check(TokenType.RightBrace)) {
      return { kind: "ReturnStmt", value: null, line: tok.line };
    }

    const value = this.parseExpression();

    // check for postfix if on return
    if (this.check(TokenType.If)) {
      const postfix = this.parsePostfixIf({ kind: "ReturnStmt", value, line: tok.line } as AST.ReturnStmt);
      return postfix as any; // PostfixIf wrapping a ReturnStmt
    }

    return { kind: "ReturnStmt", value, line: tok.line };
  }

  private parseIfStmt(): AST.IfStmt {
    const tok = this.advance(); // consume 'if'
    const condition = this.parseExpression();
    const body = this.parseBlock();

    let elseBody: Node[] | null = null;
    this.skipNewlines();
    if (this.match(TokenType.Else)) {
      if (this.check(TokenType.If)) {
        elseBody = [this.parseIfStmt()];
      } else {
        elseBody = this.parseBlock();
      }
    }

    return { kind: "IfStmt", condition, body, elseBody, line: tok.line };
  }

  private parseUnlessStmt(): AST.UnlessStmt {
    const tok = this.advance(); // consume 'unless'
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return { kind: "UnlessStmt", condition, body, line: tok.line };
  }

  private parseUntilStmt(): AST.UntilStmt {
    const tok = this.advance(); // consume 'until'
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return { kind: "UntilStmt", condition, body, line: tok.line };
  }

  private parseForStmt(): Node {
    const tok = this.advance(); // consume 'for'

    // for await chunk from ...
    if (this.check(TokenType.Await)) {
      this.advance(); // consume 'await'
      const variable = this.expect(TokenType.Identifier, "expected variable name").value;
      this.expect(TokenType.From, "expected 'from'");
      const source = this.parseExpression();
      const body = this.parseBlock();
      return { kind: "ForAwaitStmt", variable, source, body, line: tok.line } as AST.ForAwaitStmt;
    }

    const variable = this.expect(TokenType.Identifier, "expected variable name").value;
    this.expect(TokenType.In, "expected 'in'");
    const iterable = this.parseExpression();
    const body = this.parseBlock();
    return { kind: "ForStmt", variable, iterable, body, line: tok.line } as AST.ForStmt;
  }

  private parseWithCtxBlock(): AST.WithCtxBlock {
    const tok = this.advance(); // consume 'with'
    this.expect(TokenType.Ctx, "expected 'ctx' after 'with'");
    const body = this.parseBlock();
    return { kind: "WithCtxBlock", body, line: tok.line };
  }

  private parseWhenExpr(): AST.WhenExpr {
    const tok = this.advance(); // consume 'when'
    const subject = this.parseExpression();
    this.skipNewlines();
    this.expect(TokenType.LeftBrace, "expected '{' after when subject");
    this.skipNewlines();

    const branches: AST.WhenBranch[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RightBrace)) break;

      let pattern: "ok" | "failed";
      if (this.match(TokenType.Ok)) {
        pattern = "ok";
      } else if (this.match(TokenType.Failed)) {
        pattern = "failed";
      } else {
        throw this.error("expected 'ok' or 'failed' in when branch", this.peek());
      }

      this.expect(TokenType.LeftParen, "expected '('");
      const binding = this.expect(TokenType.Identifier, "expected binding name").value;
      this.expect(TokenType.RightParen, "expected ')'");
      this.expect(TokenType.Arrow, "expected '=>'");

      // parse body - single expression or block
      const body: Node[] = [];
      if (this.check(TokenType.LeftBrace)) {
        body.push(...this.parseBlock().map(n => n));
      } else {
        body.push(this.parseStatement());
      }

      branches.push({ pattern, binding, body });
      this.skipNewlines();
    }

    this.expect(TokenType.RightBrace, "expected '}'");
    return { kind: "WhenExpr", subject, branches, line: tok.line };
  }

  private parsePostfixIf(statement: Node): AST.PostfixIf {
    this.advance(); // consume 'if'
    const condition = this.parseExpression();
    return { kind: "PostfixIf", statement, condition, line: statement.line };
  }

  // --- test blocks ---

  private parseTestBlock(): AST.TestBlock {
    const tok = this.advance(); // consume 'test'
    const description = this.expect(TokenType.String, "expected test description").value;
    this.skipNewlines();
    this.expect(TokenType.LeftBrace, "expected '{'");
    this.skipNewlines();

    const body: Node[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RightBrace)) break;

      if (this.check(TokenType.Mock)) {
        body.push(this.parseMockStmt());
      } else if (this.check(TokenType.Expect)) {
        body.push(this.parseExpectStmt());
      } else {
        body.push(this.parseStatement());
      }
      this.skipNewlines();
    }

    this.expect(TokenType.RightBrace, "expected '}'");
    return { kind: "TestBlock", description, body, line: tok.line };
  }

  private parseMockStmt(): AST.MockStmt {
    const tok = this.advance(); // consume 'mock'

    // tool name: namespace.method
    const ns = this.expect(TokenType.Identifier, "expected tool namespace").value;
    this.expect(TokenType.Dot, "expected '.'");
    const method = this.expect(TokenType.Identifier, "expected tool method").value;
    const tool = `${ns}.${method}`;

    // optional args
    let args: Node[] | null = null;
    if (this.match(TokenType.LeftParen)) {
      args = [];
      if (!this.check(TokenType.RightParen)) {
        args.push(this.parseExpression());
        while (this.match(TokenType.Comma)) {
          args.push(this.parseExpression());
        }
      }
      this.expect(TokenType.RightParen, "expected ')'");
    }

    this.expect(TokenType.Returns, "expected 'returns'");
    const returnValue = this.parseExpression();

    return { kind: "MockStmt", tool, args, returnValue, line: tok.line };
  }

  private parseExpectStmt(): AST.ExpectStmt {
    const tok = this.advance(); // consume 'expect'
    const subject = this.parseExpression();
    this.expect(TokenType.To, "expected 'to'");
    this.expect(TokenType.Be, "expected 'be'");

    let matcher: "be" | "beOk" | "beFailed" = "be";
    let expected: Node | null = null;

    if (this.check(TokenType.Ok)) {
      this.advance();
      matcher = "beOk";
      // optional specific value: Ok("value")
      if (this.match(TokenType.LeftParen)) {
        expected = this.parseExpression();
        this.expect(TokenType.RightParen, "expected ')'");
      }
    } else if (this.check(TokenType.Failed)) {
      this.advance();
      matcher = "beFailed";
      // optional specific message
      if (this.match(TokenType.LeftParen)) {
        expected = this.parseExpression();
        this.expect(TokenType.RightParen, "expected ')'");
      }
    } else {
      expected = this.parseExpression();
    }

    return { kind: "ExpectStmt", subject, matcher, expected, line: tok.line };
  }

  // --- expressions ---

  private parseExpression(): Node {
    return this.parseOr();
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.check(TokenType.PipePipe)) {
      const op = this.advance().value;
      const right = this.parseAnd();
      left = { kind: "BinaryExpr", op, left, right, line: left.line } as AST.BinaryExpr;
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseEquality();
    while (this.check(TokenType.AmpAmp)) {
      const op = this.advance().value;
      const right = this.parseEquality();
      left = { kind: "BinaryExpr", op, left, right, line: left.line } as AST.BinaryExpr;
    }
    return left;
  }

  private parseEquality(): Node {
    let left = this.parseComparison();
    while (this.check(TokenType.EqualEqual) || this.check(TokenType.BangEqual)) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { kind: "BinaryExpr", op, left, right, line: left.line } as AST.BinaryExpr;
    }
    return left;
  }

  private parseComparison(): Node {
    let left = this.parseAddition();
    while (
      this.check(TokenType.Greater) || this.check(TokenType.Less) ||
      this.check(TokenType.GreaterEqual) || this.check(TokenType.LessEqual)
    ) {
      const op = this.advance().value;
      const right = this.parseAddition();
      left = { kind: "BinaryExpr", op, left, right, line: left.line } as AST.BinaryExpr;
    }
    return left;
  }

  private parseAddition(): Node {
    let left = this.parseMultiplication();
    while (this.check(TokenType.Plus) || this.check(TokenType.Minus)) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = { kind: "BinaryExpr", op, left, right, line: left.line } as AST.BinaryExpr;
    }
    return left;
  }

  private parseMultiplication(): Node {
    let left = this.parseUnary();
    while (this.check(TokenType.Star) || this.check(TokenType.Slash) || this.check(TokenType.Percent)) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { kind: "BinaryExpr", op, left, right, line: left.line } as AST.BinaryExpr;
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.check(TokenType.Bang)) {
      const tok = this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", op: "!", operand, line: tok.line } as AST.UnaryExpr;
    }
    if (this.check(TokenType.Minus)) {
      const tok = this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", op: "-", operand, line: tok.line } as AST.UnaryExpr;
    }
    return this.parseAwaitExpr();
  }

  private parseAwaitExpr(): Node {
    if (this.check(TokenType.Await)) {
      const tok = this.advance(); // consume 'await'

      // await all { ... }
      if (this.check(TokenType.All)) {
        this.advance(); // consume 'all'
        this.skipNewlines();
        this.expect(TokenType.LeftBrace, "expected '{'");
        this.skipNewlines();

        const calls: Node[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          this.skipNewlines();
          if (this.check(TokenType.RightBrace)) break;
          calls.push(this.parseExpression());
          this.skipNewlines();
        }
        this.expect(TokenType.RightBrace, "expected '}'");
        return { kind: "AwaitAllExpr", calls, line: tok.line } as AST.AwaitAllExpr;
      }

      // await ask tool.method(args)
      if (this.check(TokenType.Ask)) {
        const askExpr = this.parseAskExpr();
        return this.maybeOrClause(askExpr);
      }

      // await someExpr
      const expr = this.parseCallExpr();
      return this.maybeOrClause(expr);
    }

    return this.parseCallExpr();
  }

  private parseAskExpr(): Node {
    const tok = this.advance(); // consume 'ask'

    // tool name: namespace.method
    const ns = this.expect(TokenType.Identifier, "expected tool namespace").value;
    this.expect(TokenType.Dot, "expected '.'");
    const method = this.expect(TokenType.Identifier, "expected tool method").value;
    const tool = `${ns}.${method}`;

    this.expect(TokenType.LeftParen, "expected '('");
    const args: Node[] = [];
    if (!this.check(TokenType.RightParen)) {
      this.skipNewlines();
      args.push(this.parseExpression());
      while (this.match(TokenType.Comma)) {
        this.skipNewlines();
        args.push(this.parseExpression());
      }
      this.skipNewlines();
    }
    this.expect(TokenType.RightParen, "expected ')'");

    return { kind: "ToolCallExpr", tool, args, line: tok.line } as AST.ToolCallExpr;
  }

  private maybeOrClause(expr: Node): Node {
    this.skipNewlines();
    if (this.check(TokenType.Or)) {
      this.advance(); // consume 'or'
      if (this.check(TokenType.Fail)) {
        this.advance(); // consume 'fail'
        const message = this.parseExpression();
        return { kind: "OrFailExpr", expr, message, line: expr.line } as AST.OrFailExpr;
      }
      if (this.check(TokenType.Return)) {
        this.advance(); // consume 'return'
        const defaultValue = this.parseExpression();
        return { kind: "OrReturnExpr", expr, defaultValue, line: expr.line } as AST.OrReturnExpr;
      }
      throw this.error("expected 'fail' or 'return' after 'or'", this.peek());
    }
    return expr;
  }

  private parseCallExpr(): Node {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check(TokenType.LeftParen)) {
        this.advance(); // consume '('
        const args: Node[] = [];
        if (!this.check(TokenType.RightParen)) {
          this.skipNewlines();
          args.push(this.parseExpression());
          while (this.match(TokenType.Comma)) {
            this.skipNewlines();
            args.push(this.parseExpression());
          }
          this.skipNewlines();
        }
        this.expect(TokenType.RightParen, "expected ')'");
        expr = { kind: "CallExpr", callee: expr, args, line: expr.line } as AST.CallExpr;
      } else if (this.check(TokenType.LeftBracket)) {
        this.advance(); // consume '['
        const index = this.parseExpression();
        this.expect(TokenType.RightBracket, "expected ']'");
        expr = { kind: "IndexExpr", object: expr, index, line: expr.line } as AST.IndexExpr;
      } else if (this.check(TokenType.Dot)) {
        this.advance(); // consume '.'
        const prop = this.expect(TokenType.Identifier, "expected property name").value;
        expr = { kind: "MemberExpr", object: expr, property: prop, line: expr.line } as AST.MemberExpr;
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): Node {
    const tok = this.peek();

    // Ok(value) as expression
    if (this.check(TokenType.Ok)) {
      const okTok = this.advance();
      if (this.match(TokenType.LeftParen)) {
        const value = this.parseExpression();
        this.expect(TokenType.RightParen, "expected ')'");
        return {
          kind: "CallExpr",
          callee: { kind: "IdentExpr", name: "Ok", line: okTok.line } as AST.IdentExpr,
          args: [value],
          line: okTok.line,
        } as AST.CallExpr;
      }
      return { kind: "IdentExpr", name: "ok", line: okTok.line } as AST.IdentExpr;
    }

    // failed(reason) as expression
    if (this.check(TokenType.Failed)) {
      const failedTok = this.advance();
      if (this.match(TokenType.LeftParen)) {
        const reason = this.parseExpression();
        this.expect(TokenType.RightParen, "expected ')'");
        return {
          kind: "CallExpr",
          callee: { kind: "IdentExpr", name: "failed", line: failedTok.line } as AST.IdentExpr,
          args: [reason],
          line: failedTok.line,
        } as AST.CallExpr;
      }
      return { kind: "IdentExpr", name: "failed", line: failedTok.line } as AST.IdentExpr;
    }

    if (this.check(TokenType.Number)) {
      const t = this.advance();
      return { kind: "NumberLit", value: parseFloat(t.value), line: t.line } as AST.NumberLit;
    }

    if (this.check(TokenType.String)) {
      const t = this.advance();
      // check for interpolation
      if (t.value.includes("{") && t.value.includes("}")) {
        return this.parseInterpolatedString(t);
      }
      return { kind: "StringLit", value: t.value, line: t.line } as AST.StringLit;
    }

    if (this.check(TokenType.True)) {
      const t = this.advance();
      return { kind: "BoolLit", value: true, line: t.line } as AST.BoolLit;
    }

    if (this.check(TokenType.False)) {
      const t = this.advance();
      return { kind: "BoolLit", value: false, line: t.line } as AST.BoolLit;
    }

    if (this.check(TokenType.Null)) {
      const t = this.advance();
      return { kind: "NullLit", line: t.line } as AST.NullLit;
    }

    if (this.check(TokenType.Print)) {
      const t = this.advance();
      return { kind: "IdentExpr", name: "print", line: t.line } as AST.IdentExpr;
    }

    if (this.check(TokenType.Identifier)) {
      const t = this.advance();
      return { kind: "IdentExpr", name: t.value, line: t.line } as AST.IdentExpr;
    }

    if (this.check(TokenType.LeftParen)) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RightParen, "expected ')'");
      return expr;
    }

    if (this.check(TokenType.LeftBracket)) {
      return this.parseArrayLit();
    }

    // ask without await (for use in await all blocks etc)
    if (this.check(TokenType.Ask)) {
      return this.parseAskExpr();
    }

    throw this.error(`unexpected token '${tok.value}' (${TokenType[tok.type]})`, tok);
  }

  private parseInterpolatedString(tok: Token): AST.InterpolatedString {
    const parts: (string | Node)[] = [];
    let current = "";
    let i = 0;
    const str = tok.value;

    while (i < str.length) {
      if (str[i] === "{") {
        if (current) {
          parts.push(current);
          current = "";
        }
        i++; // skip {
        let varName = "";
        while (i < str.length && str[i] !== "}") {
          varName += str[i];
          i++;
        }
        i++; // skip }
        parts.push({ kind: "IdentExpr", name: varName, line: tok.line } as AST.IdentExpr);
      } else {
        current += str[i];
        i++;
      }
    }
    if (current) parts.push(current);

    return { kind: "InterpolatedString", parts, line: tok.line };
  }

  private parseArrayLit(): AST.ArrayLit {
    const tok = this.advance(); // consume '['
    const elements: Node[] = [];
    this.skipNewlines();
    if (!this.check(TokenType.RightBracket)) {
      elements.push(this.parseExpression());
      while (this.match(TokenType.Comma)) {
        this.skipNewlines();
        elements.push(this.parseExpression());
      }
    }
    this.skipNewlines();
    this.expect(TokenType.RightBracket, "expected ']'");
    return { kind: "ArrayLit", elements, line: tok.line };
  }

  // --- block parsing ---

  private parseBlock(): Node[] {
    this.skipNewlines();
    this.expect(TokenType.LeftBrace, "expected '{'");
    this.skipNewlines();

    const stmts: Node[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RightBrace)) break;
      stmts.push(this.parseStatement());
      this.skipNewlines();
    }

    this.expect(TokenType.RightBrace, "expected '}'");
    return stmts;
  }

  // --- helpers ---

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private peekNext(): Token | null {
    return this.pos + 1 < this.tokens.length ? this.tokens[this.pos + 1] : null;
  }

  private peekNextNonNewline(): Token | null {
    let i = this.pos + 1;
    while (i < this.tokens.length && this.tokens[i].type === TokenType.Newline) i++;
    return i < this.tokens.length ? this.tokens[i] : null;
  }

  // checks if current position looks like a permission line: ident.ident followed by newline/EOF
  private isPermissionLine(): boolean {
    let i = this.pos;
    if (i >= this.tokens.length || this.tokens[i].type !== TokenType.Identifier) return false;
    i++; // skip namespace
    if (i >= this.tokens.length || this.tokens[i].type !== TokenType.Dot) return false;
    i++; // skip dot
    if (i >= this.tokens.length || this.tokens[i].type !== TokenType.Identifier) return false;
    i++; // skip method
    // must be followed by newline or EOF (not parentheses or other tokens)
    if (i >= this.tokens.length) return true;
    const next = this.tokens[i].type;
    return next === TokenType.Newline || next === TokenType.EOF;
  }

  private check(type: TokenType): boolean {
    return !this.isAtEnd() && this.tokens[this.pos].type === type;
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok;
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    const tok = this.peek();
    throw this.error(`${message}, got '${tok.value}' (${TokenType[tok.type]})`, tok);
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length || this.tokens[this.pos].type === TokenType.EOF;
  }

  private skipNewlines(): void {
    while (!this.isAtEnd() && this.tokens[this.pos].type === TokenType.Newline) {
      this.pos++;
    }
  }

  private error(message: string, token: Token): ParseError {
    return new ParseError(message, token.line, token.column);
  }
}

export function parse(source: string): AST.Program {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parse();
}
