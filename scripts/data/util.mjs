// Small shared helpers for the data pipeline (no dependencies, Node 20+).
import fs from "node:fs/promises";
import path from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run at most `n` async tasks at once. */
export function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

/** GET JSON with retries and exponential backoff. */
export async function getJson(url, { retries = 4, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < retries) await sleep(500 * 2 ** i);
    }
  }
  throw lastErr;
}

export async function readJsonFile(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export async function writeJsonFile(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

export function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}
