// brief fs stdlib - fs.read, fs.write

import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import type { BriefValue, BriefResult } from "./core.js";

export async function fsRead(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.read path must be a string" };
  try {
    const content = await nodeFs.readFile(path, "utf-8");
    return { kind: "ok", value: content };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsWrite(path: BriefValue, content: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.write path must be a string" };
  if (typeof content !== "string") return { kind: "failed", reason: "fs.write content must be a string" };
  try {
    await nodeFs.writeFile(path, content, "utf-8");
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsExists(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.exists path must be a string" };
  try {
    await nodeFs.access(path);
    return { kind: "ok", value: true };
  } catch (e: any) {
    if (e.code === "ENOENT") return { kind: "ok", value: false };
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsMkdir(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.mkdir path must be a string" };
  try {
    await nodeFs.mkdir(path, { recursive: true });
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsList(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.list path must be a string" };
  try {
    const entries = await nodeFs.readdir(path);
    return { kind: "ok", value: entries };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsStat(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.stat path must be a string" };
  try {
    const stat = await nodeFs.stat(path);
    return {
      kind: "ok",
      value: [
        "size", stat.size,
        "isFile", stat.isFile(),
        "isDir", stat.isDirectory(),
        "modified", stat.mtime.toISOString(),
        "created", stat.birthtime.toISOString(),
      ],
    };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsAppend(path: BriefValue, content: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.append path must be a string" };
  if (typeof content !== "string") return { kind: "failed", reason: "fs.append content must be a string" };
  try {
    await nodeFs.appendFile(path, content, "utf-8");
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsCopy(src: BriefValue, dst: BriefValue): Promise<BriefResult> {
  if (typeof src !== "string") return { kind: "failed", reason: "fs.copy src must be a string" };
  if (typeof dst !== "string") return { kind: "failed", reason: "fs.copy dst must be a string" };
  try {
    await nodeFs.copyFile(src, dst);
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsMove(src: BriefValue, dst: BriefValue): Promise<BriefResult> {
  if (typeof src !== "string") return { kind: "failed", reason: "fs.move src must be a string" };
  if (typeof dst !== "string") return { kind: "failed", reason: "fs.move dst must be a string" };
  try {
    await nodeFs.rename(src, dst);
    return { kind: "ok", value: null };
  } catch (e: any) {
    if (e.code === "EXDEV") {
      try {
        await nodeFs.copyFile(src, dst);
        await nodeFs.rm(src, { recursive: true, force: true });
        return { kind: "ok", value: null };
      } catch (e2: any) {
        return { kind: "failed", reason: e2.message ?? String(e2) };
      }
    }
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsGlob(pattern: BriefValue): Promise<BriefResult> {
  if (typeof pattern !== "string") return { kind: "failed", reason: "fs.glob pattern must be a string" };
  try {
    const results: string[] = [];
    for await (const entry of (nodeFs as any).glob(pattern)) {
      results.push(nodePath.resolve(entry));
    }
    results.sort();
    return { kind: "ok", value: results };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsDelete(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.delete path must be a string" };
  try {
    await nodeFs.rm(path, { recursive: true, force: true });
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}
