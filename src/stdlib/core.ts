// brief core stdlib - print, len, trim, split, join, slice, parseInt, parseFloat, toString

export type BriefValue = string | number | boolean | null | BriefValue[] | BriefResult;
export type BriefResult = { kind: "ok"; value: BriefValue } | { kind: "failed"; reason: string };

export function briefPrint(...args: BriefValue[]): void {
  console.log(...args.map(briefToString));
}

export function briefLen(value: BriefValue): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.length;
  throw new Error(`len() expects string or array, got ${typeof value}`);
}

export function briefTrim(str: BriefValue): string {
  if (typeof str !== "string") throw new Error(`trim() expects string, got ${typeof str}`);
  return str.trim();
}

export function briefSplit(str: BriefValue, delimiter: BriefValue): BriefValue[] {
  if (typeof str !== "string") throw new Error(`split() expects string, got ${typeof str}`);
  if (typeof delimiter !== "string") throw new Error(`split() delimiter must be string`);
  return str.split(delimiter);
}

export function briefJoin(arr: BriefValue, delimiter: BriefValue): string {
  if (!Array.isArray(arr)) throw new Error(`join() expects array, got ${typeof arr}`);
  if (typeof delimiter !== "string") throw new Error(`join() delimiter must be string`);
  return arr.map(briefToString).join(delimiter);
}

export function briefSlice(str: BriefValue, start: BriefValue, end: BriefValue): string {
  if (typeof str !== "string") throw new Error(`slice() expects string, got ${typeof str}`);
  if (typeof start !== "number") throw new Error(`slice() start must be number`);
  if (typeof end !== "number") throw new Error(`slice() end must be number`);
  return str.slice(start, end);
}

export function briefParseInt(str: BriefValue): number {
  if (typeof str !== "string") throw new Error(`parseInt() expects string`);
  const n = parseInt(str, 10);
  if (isNaN(n)) throw new Error(`parseInt() failed to parse '${str}'`);
  return n;
}

export function briefParseFloat(str: BriefValue): number {
  if (typeof str !== "string") throw new Error(`parseFloat() expects string`);
  const n = parseFloat(str);
  if (isNaN(n)) throw new Error(`parseFloat() failed to parse '${str}'`);
  return n;
}

export function briefToString(value: BriefValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(briefToString).join(", ")}]`;
  if (value && typeof value === "object" && "kind" in value) {
    if (value.kind === "ok") return `Ok(${briefToString(value.value)})`;
    return `failed(${value.reason})`;
  }
  return String(value);
}

export const STDLIB_FUNCTIONS: Record<string, (...args: BriefValue[]) => BriefValue> = {
  len: (v) => briefLen(v),
  trim: (v) => briefTrim(v),
  split: (s, d) => briefSplit(s, d),
  join: (a, d) => briefJoin(a, d),
  slice: (s, start, end) => briefSlice(s, start, end),
  parseInt: (s) => briefParseInt(s),
  parseFloat: (s) => briefParseFloat(s),
  toString: (v) => briefToString(v),
};
