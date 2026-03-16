// brief core stdlib - print, len, trim, split, join, slice, parseInt, parseFloat, toString, path utils

import * as nodePath from "node:path";

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

export function briefSlice(str: BriefValue, start: BriefValue, end: BriefValue): BriefValue {
  if (typeof str !== "string" && !Array.isArray(str)) throw new Error(`slice() expects string or array, got ${typeof str}`);
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

export function briefAt(arr: BriefValue, index: BriefValue): BriefValue {
  if (!Array.isArray(arr)) throw new Error(`at() expects array, got ${typeof arr}`);
  if (typeof index !== "number") throw new Error(`at() index must be number`);
  if (index < 0 || index >= arr.length) return null;
  return arr[index];
}

export function briefContains(str: BriefValue, search: BriefValue): boolean {
  if (typeof str === "string" && typeof search === "string") return str.includes(search);
  if (Array.isArray(str)) return str.some(v => briefEquals(v, search));
  throw new Error(`contains() expects string or array`);
}

export function briefStartsWith(str: BriefValue, prefix: BriefValue): boolean {
  if (typeof str !== "string" || typeof prefix !== "string") throw new Error(`startsWith() expects strings`);
  return str.startsWith(prefix);
}

export function briefEndsWith(str: BriefValue, suffix: BriefValue): boolean {
  if (typeof str !== "string" || typeof suffix !== "string") throw new Error(`endsWith() expects strings`);
  return str.endsWith(suffix);
}

export function briefReplace(str: BriefValue, search: BriefValue, replacement: BriefValue): string {
  if (typeof str !== "string") throw new Error(`replace() expects string`);
  if (typeof search !== "string") throw new Error(`replace() search must be string`);
  if (typeof replacement !== "string") throw new Error(`replace() replacement must be string`);
  return str.replaceAll(search, replacement);
}

export function briefToUpper(str: BriefValue): string {
  if (typeof str !== "string") throw new Error(`toUpper() expects string`);
  return str.toUpperCase();
}

export function briefToLower(str: BriefValue): string {
  if (typeof str !== "string") throw new Error(`toLower() expects string`);
  return str.toLowerCase();
}

export function briefConcat(...arrays: BriefValue[]): BriefValue[] {
  const result: BriefValue[] = [];
  for (const a of arrays) {
    if (Array.isArray(a)) result.push(...a);
    else result.push(a);
  }
  return result;
}

export function briefPush(arr: BriefValue, ...items: BriefValue[]): BriefValue[] {
  if (!Array.isArray(arr)) throw new Error(`push() expects array`);
  return [...arr, ...items];
}

export function briefRange(start: BriefValue, end: BriefValue): BriefValue[] {
  if (typeof start !== "number" || typeof end !== "number") throw new Error(`range() expects numbers`);
  const result: BriefValue[] = [];
  for (let i = start; i < end; i++) result.push(i);
  return result;
}

export function briefTypeOf(value: BriefValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object" && "kind" in value) return "result";
  return "unknown";
}

export function briefKeys(value: BriefValue): BriefValue[] {
  if (Array.isArray(value)) return value.map((_, i) => i as BriefValue);
  throw new Error(`keys() expects array`);
}

export function briefFlat(arr: BriefValue): BriefValue[] {
  if (!Array.isArray(arr)) throw new Error(`flat() expects array, got ${typeof arr}`);
  const result: BriefValue[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) result.push(...item);
    else result.push(item);
  }
  return result;
}

export function briefReverse(arr: BriefValue): BriefValue[] {
  if (!Array.isArray(arr)) throw new Error(`reverse() expects array, got ${typeof arr}`);
  return [...arr].reverse();
}

export function briefSort(arr: BriefValue): BriefValue[] {
  if (!Array.isArray(arr)) throw new Error(`sort() expects array, got ${typeof arr}`);
  return [...arr].sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  });
}

export function briefUnique(arr: BriefValue): BriefValue[] {
  if (!Array.isArray(arr)) throw new Error(`unique() expects array, got ${typeof arr}`);
  const result: BriefValue[] = [];
  for (const item of arr) {
    if (!result.some(v => briefEquals(v, item))) result.push(item);
  }
  return result;
}

export function briefIndexOf(arr: BriefValue, value: BriefValue): number {
  if (!Array.isArray(arr)) throw new Error(`indexOf() expects array, got ${typeof arr}`);
  for (let i = 0; i < arr.length; i++) {
    if (briefEquals(arr[i], value)) return i;
  }
  return -1;
}

export function briefPathJoin(...args: BriefValue[]): string {
  for (const a of args) {
    if (typeof a !== "string") throw new Error("pathJoin() expects strings");
  }
  return nodePath.join(...(args as string[]));
}

export function briefPathDirname(p: BriefValue): string {
  if (typeof p !== "string") throw new Error("pathDirname() expects string");
  return nodePath.dirname(p);
}

export function briefPathBasename(p: BriefValue): string {
  if (typeof p !== "string") throw new Error("pathBasename() expects string");
  return nodePath.basename(p);
}

export function briefPathExtname(p: BriefValue): string {
  if (typeof p !== "string") throw new Error("pathExtname() expects string");
  return nodePath.extname(p);
}

export function briefJsonParse(str: BriefValue): BriefValue {
  if (typeof str !== "string") throw new Error("jsonParse() expects string");
  try {
    const parsed = JSON.parse(str);
    return jsonToBrief(parsed);
  } catch {
    throw new Error("jsonParse() failed to parse input");
  }
}

function jsonToBrief(value: unknown): BriefValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(jsonToBrief);
  if (typeof value === "object") {
    const result: BriefValue[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result.push(k, jsonToBrief(v));
    }
    return result;
  }
  return null;
}

export function briefJsonStringify(value: BriefValue): string {
  return JSON.stringify(briefToJson(value));
}

function isKvArray(arr: BriefValue[]): boolean {
  if (arr.length === 0 || arr.length % 2 !== 0) return false;
  for (let i = 0; i < arr.length; i += 2) {
    if (typeof arr[i] !== "string") return false;
  }
  return true;
}

function briefToJson(value: BriefValue): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (isKvArray(value)) {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < value.length; i += 2) {
        obj[value[i] as string] = briefToJson(value[i + 1]);
      }
      return obj;
    }
    return value.map(briefToJson);
  }
  return null;
}

function briefEquals(a: BriefValue, b: BriefValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  return a === b;
}

export function briefFloor(n: BriefValue): number {
  if (typeof n !== "number") throw new Error("floor() expects number");
  return Math.floor(n);
}

export function briefCeil(n: BriefValue): number {
  if (typeof n !== "number") throw new Error("ceil() expects number");
  return Math.ceil(n);
}

export function briefRound(n: BriefValue): number {
  if (typeof n !== "number") throw new Error("round() expects number");
  return Math.round(n);
}

export function briefAbs(n: BriefValue): number {
  if (typeof n !== "number") throw new Error("abs() expects number");
  return Math.abs(n);
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
  at: (a, i) => briefAt(a, i),
  contains: (s, search) => briefContains(s, search),
  startsWith: (s, p) => briefStartsWith(s, p),
  endsWith: (s, p) => briefEndsWith(s, p),
  replace: (s, search, rep) => briefReplace(s, search, rep),
  toUpper: (s) => briefToUpper(s),
  toLower: (s) => briefToLower(s),
  concat: (...args) => briefConcat(...args),
  push: (arr, ...items) => briefPush(arr, ...items),
  range: (s, e) => briefRange(s, e),
  typeOf: (v) => briefTypeOf(v),
  keys: (v) => briefKeys(v),
  flat: (v) => briefFlat(v),
  reverse: (v) => briefReverse(v),
  sort: (v) => briefSort(v),
  unique: (v) => briefUnique(v),
  indexOf: (a, v) => briefIndexOf(a, v),
  pathJoin: (...args) => briefPathJoin(...args),
  pathDirname: (p) => briefPathDirname(p),
  pathBasename: (p) => briefPathBasename(p),
  pathExtname: (p) => briefPathExtname(p),
  jsonParse: (s) => briefJsonParse(s),
  jsonStringify: (v) => briefJsonStringify(v),
  floor: (n) => briefFloor(n),
  ceil: (n) => briefCeil(n),
  round: (n) => briefRound(n),
  abs: (n) => briefAbs(n),
};
