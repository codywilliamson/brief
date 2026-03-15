// brief result type - Ok/failed

export type Result<T> =
  | { kind: "ok"; value: T }
  | { kind: "failed"; reason: string };

export function Ok<T>(value: T): Result<T> {
  return { kind: "ok", value };
}

export function failed(reason: string): Result<never> {
  return { kind: "failed", reason };
}

export function isOk<T>(r: Result<T>): r is { kind: "ok"; value: T } {
  return r.kind === "ok";
}

export function isFailed<T>(r: Result<T>): r is { kind: "failed"; reason: string } {
  return r.kind === "failed";
}

export function unwrapOrFail<T>(r: Result<T>, message: string): T {
  if (isOk(r)) return r.value;
  throw new BriefRuntimeError(message);
}

export function unwrapOrReturn<T>(r: Result<T>, defaultValue: T): T {
  if (isOk(r)) return r.value;
  return defaultValue;
}

export class BriefRuntimeError extends Error {
  constructor(
    message: string,
    public line?: number,
    public sourceLine?: string,
  ) {
    super(message);
    this.name = "BriefRuntimeError";
  }

  format(): string {
    let msg = `Brief runtime error: ${this.message}`;
    if (this.line !== undefined && this.sourceLine !== undefined) {
      msg += `\n  at line ${this.line}: ${this.sourceLine}`;
    }
    return msg;
  }
}

export class BriefPermissionError extends BriefRuntimeError {
  constructor(
    public permission: string,
    line?: number,
    sourceLine?: string,
  ) {
    super(`'${permission}' not declared in allow block`, line, sourceLine);
    this.name = "BriefPermissionError";
  }

  format(): string {
    let msg = `Brief permission error: ${this.message}`;
    if (this.line !== undefined && this.sourceLine !== undefined) {
      msg += `\n  at line ${this.line}: ${this.sourceLine}`;
    }
    return msg;
  }
}
