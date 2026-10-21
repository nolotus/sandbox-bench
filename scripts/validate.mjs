// 无依赖的结果校验：results/*.jsonl 结构 + 首行环境记录 + 枚举/类型
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "results";
const REQUIRED = ["ts", "monoMs", "phase", "case", "attempt", "coldHot", "ok"];
const PHASES = new Set(["meta", "W0", "W1", "W2", "W3", "W4", "W5", "W6", "W7"]);
const COLDHOT = new Set(["cold", "hot", "n/a"]);
const RUNTIME = new Set(["container", "vm", "gvisor", "namespace", "unknown"]);
const ENV_REQUIRED = ["provider", "region", "image", "cpus", "memory_mb", "runtime", "kernel", "billingModel", "observedAt"];

const errors = [];
const files = readdirSync(DIR).filter((f) => f.endsWith(".jsonl"));

for (const file of files) {
  const lines = readFileSync(join(DIR, file), "utf8").trim().split("\n").filter(Boolean);
  if (!lines.length) { errors.push(`${file}: empty`); continue; }
  let first = true;
  lines.forEach((raw, i) => {
    const where = `${file}:${i + 1}`;
    let row;
    try { row = JSON.parse(raw); } catch { errors.push(`${where}: invalid JSON`); return; }
    for (const k of REQUIRED) if (!(k in row)) errors.push(`${where}: missing ${k}`);
    if (row.phase && !PHASES.has(row.phase)) errors.push(`${where}: bad phase ${row.phase}`);
    if (row.coldHot && !COLDHOT.has(row.coldHot)) errors.push(`${where}: bad coldHot ${row.coldHot}`);
    if (typeof row.ok !== "boolean") errors.push(`${where}: ok must be boolean`);
    if (typeof row.attempt !== "number") errors.push(`${where}: attempt must be number`);
    for (const f of ["durationMs", "prepareMs", "firstExecMs", "endToEndMs", "peakRssKb", "cpuMs", "ioBytes", "bytes"]) {
      if (row[f] != null && typeof row[f] !== "number") errors.push(`${where}: ${f} must be number|null`);
    }
    if (first) {
      if (row.phase !== "meta" && row.phase !== "W0" && row.phase !== "W5" && row.phase !== "W6") {
        errors.push(`${where}: first line should be a meta/environment record (got phase=${row.phase})`);
      }
      first = false;
    }
  });
}

// 环境记录若存在，校验必填项与 runtime 枚举
for (const file of files) {
  const rows = readFileSync(join(DIR, file), "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
  const envs = rows.filter((r) => r && r.phase === "meta" && r.case === "environment");
  if (!envs.length) errors.push(`${file}: no meta/environment record`);
  for (const env of envs) {
    let parsed = null;
    try { parsed = typeof env.note === "string" ? null : env; } catch { /* noop */ }
    // 环境字段可能写在 note 里（自由文本），这里只对结构化写法做校验
    if (parsed && parsed.runtime && !RUNTIME.has(parsed.runtime)) errors.push(`${file}: bad runtime ${parsed.runtime}`);
    for (const k of ENV_REQUIRED) if (parsed && !(k in parsed) && !(typeof env.note === "string")) errors.push(`${file}: env missing ${k}`);
  }
}

if (errors.length) {
  console.error(`validation failed: ${errors.length} problem(s)`);
  for (const e of errors.slice(0, 40)) console.error(" - " + e);
  process.exit(1);
}
console.log(`ok: ${files.length} file(s) validated`);
