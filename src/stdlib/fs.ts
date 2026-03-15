// brief fs stdlib - fs.read, fs.write

import * as nodeFs from "node:fs/promises";
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
