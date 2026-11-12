#!/usr/bin/env node
// Serves the static export exactly like GitHub Pages does (directory index
// files, 404.html fallback, optional sub-path), for local checks and e2e tests.
//
//   node scripts/serve.mjs [dir=out] [port=4173] [basePath=""]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const [dir = "out", port = "4173", base = ""] = process.argv.slice(2);
const root = path.resolve(dir);
const basePath = base.replace(/\/$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (basePath) {
    if (rel !== basePath && !rel.startsWith(`${basePath}/`)) return null;
    rel = rel.slice(basePath.length) || "/";
  }
  const file = path.join(root, rel);
  if (!file.startsWith(root)) return null; // no path traversal
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    const index = path.join(file, "index.html");
    return fs.existsSync(index) ? index : null;
  }
  return fs.existsSync(file) ? file : null;
}

http
  .createServer((req, res) => {
    const file = resolveFile(req.url ?? "/");
    if (!file) {
      const notFound = path.join(root, "404.html");
      res.writeHead(404, { "content-type": TYPES[".html"] });
      return res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "Not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(port), () => console.log(`serving ${root} at http://localhost:${port}${basePath}/`));
