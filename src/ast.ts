// brief AST node types

export type Node =
  | Program
  | AllowBlock
  | LetDecl
  | FnDecl
  | ReturnStmt
  | IfStmt
  | UnlessStmt
  | UntilStmt
  | ForStmt
  | ForAwaitStmt
  | WithCtxBlock
  | WhenExpr
  | AwaitAllExpr
  | ToolCallExpr
  | OrFailExpr
  | OrReturnExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | AssignExpr
  | IdentExpr
  | NumberLit
  | StringLit
  | BoolLit
  | NullLit
  | ArrayLit
  | InterpolatedString
  | PostfixIf
  | TestBlock
  | MockStmt
  | ExpectStmt
  | ExprStmt
  | BlockStmt;

export interface Program {
  kind: "Program";
  allow: AllowBlock;
  body: Node[];
  tests: TestBlock[];
  line: number;
}

export interface AllowBlock {
  kind: "AllowBlock";
  permissions: string[];
  line: number;
}

export interface LetDecl {
  kind: "LetDecl";
  name: string;
  typeAnnotation?: string;
  value: Node;
  line: number;
}

export interface FnDecl {
  kind: "FnDecl";
  name: string;
  params: string[];
  body: Node[];
  line: number;
}

export interface ReturnStmt {
  kind: "ReturnStmt";
  value: Node | null;
  line: number;
}

export interface IfStmt {
  kind: "IfStmt";
  condition: Node;
  body: Node[];
  elseBody: Node[] | null;
  line: number;
}

export interface UnlessStmt {
  kind: "UnlessStmt";
  condition: Node;
  body: Node[];
  line: number;
}

export interface UntilStmt {
  kind: "UntilStmt";
  condition: Node;
  body: Node[];
  line: number;
}

export interface ForStmt {
  kind: "ForStmt";
  variable: string;
  iterable: Node;
  body: Node[];
  line: number;
}

export interface ForAwaitStmt {
  kind: "ForAwaitStmt";
  variable: string;
  source: Node;
  body: Node[];
  line: number;
}

export interface WithCtxBlock {
  kind: "WithCtxBlock";
  body: Node[];
  line: number;
}

export interface WhenExpr {
  kind: "WhenExpr";
  subject: Node;
  branches: WhenBranch[];
  line: number;
}

export interface WhenBranch {
  pattern: "ok" | "failed";
  binding: string;
  body: Node[];
}

export interface AwaitAllExpr {
  kind: "AwaitAllExpr";
  calls: Node[];
  line: number;
}

export interface ToolCallExpr {
  kind: "ToolCallExpr";
  tool: string; // e.g. "ai.complete"
  args: Node[];
  line: number;
}

export interface OrFailExpr {
  kind: "OrFailExpr";
  expr: Node;
  message: Node;
  line: number;
}

export interface OrReturnExpr {
  kind: "OrReturnExpr";
  expr: Node;
  defaultValue: Node;
  line: number;
}

export interface BinaryExpr {
  kind: "BinaryExpr";
  op: string;
  left: Node;
  right: Node;
  line: number;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  op: string;
  operand: Node;
  line: number;
}

export interface CallExpr {
  kind: "CallExpr";
  callee: Node;
  args: Node[];
  line: number;
}

export interface MemberExpr {
  kind: "MemberExpr";
  object: Node;
  property: string;
  line: number;
}

export interface AssignExpr {
  kind: "AssignExpr";
  target: Node;
  value: Node;
  line: number;
}

export interface IdentExpr {
  kind: "IdentExpr";
  name: string;
  line: number;
}

export interface NumberLit {
  kind: "NumberLit";
  value: number;
  line: number;
}

export interface StringLit {
  kind: "StringLit";
  value: string;
  line: number;
}

export interface InterpolatedString {
  kind: "InterpolatedString";
  parts: (string | Node)[];
  line: number;
}

export interface BoolLit {
  kind: "BoolLit";
  value: boolean;
  line: number;
}

export interface NullLit {
  kind: "NullLit";
  line: number;
}

export interface ArrayLit {
  kind: "ArrayLit";
  elements: Node[];
  line: number;
}

export interface PostfixIf {
  kind: "PostfixIf";
  statement: Node;
  condition: Node;
  line: number;
}

export interface TestBlock {
  kind: "TestBlock";
  description: string;
  body: Node[];
  line: number;
}

export interface MockStmt {
  kind: "MockStmt";
  tool: string;
  args: Node[] | null; // null = wildcard mock
  returnValue: Node;
  line: number;
}

export interface ExpectStmt {
  kind: "ExpectStmt";
  subject: Node;
  matcher: "be" | "beOk" | "beFailed";
  expected: Node | null;
  line: number;
}

export interface ExprStmt {
  kind: "ExprStmt";
  expr: Node;
  line: number;
}

export interface BlockStmt {
  kind: "BlockStmt";
  body: Node[];
  line: number;
}
