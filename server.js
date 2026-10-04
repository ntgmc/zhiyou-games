import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const published = process.argv.includes("--dist");
const root = published ? resolve(projectRoot, "dist") : projectRoot;
const port = Number(process.env.PORT || (published ? 4173 : 5173));
const base = (process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) || "").replace(/\/+$/, "");
if (base && (!base.startsWith("/") || base.includes("\\") || /[?#%]/.test(base) || base.split("/").some((part) => part === "." || part === ".."))) {
  throw new Error("--base 必须是站内路径，例如 /zhiyou-games");
}
const headersSource = await readFile(resolve(projectRoot, "deploy/_headers"), "utf8");
const responseHeaders = Object.fromEntries(
  headersSource.split("/static/*")[0].split(/\r?\n/).filter((line) => /^\s+\S+:/.test(line))
    .map((line) => { const colon = line.indexOf(":"); return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]; }),
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
};

const server = createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (base && url.pathname === base) {
      res.writeHead(308, { Location: `${base}/${url.search}` }).end();
      return;
    }
    if (base && !url.pathname.startsWith(`${base}/`)) {
      res.writeHead(404).end("Not found");
      return;
    }
    const pathname = decodeURIComponent(url.pathname.slice(base.length));
    if (/^\/(?:games\/[a-z][a-z0-9-]*|status|versions)$/.test(pathname)) {
      const directory = resolve(root, `.${pathname}`);
      if ((await stat(resolve(directory, "index.html"))).isFile()) {
        res.writeHead(308, { Location: `${base}${pathname}/${url.search}` }).end();
        return;
      }
    }
    const page = /^\/(?:games\/[a-z][a-z0-9-]*|status|versions)\/(?:index\.html)?$/.test(pathname);
    // Preview is intentionally limited to public game files, including in source mode.
    if (pathname.includes("\\") || pathname.split("/").some((part) => part.startsWith(".")) ||
        !(published
          ? ["/", "/index.html", "/404.html"].includes(pathname) || page || /^\/static\/[a-f0-9]{12}\//.test(pathname)
          : ["/", "/index.html"].includes(pathname) || page || /^\/src\/[a-z0-9/-]+\.(js|css)$/.test(pathname) || /^\/assets\//.test(pathname))) {
      res.writeHead(404).end("Not found");
      return;
    }
    const compiled = !published && pathname.startsWith("/src/") && pathname.endsWith(".js");
    const file = resolve(root, compiled ? ".build" : ".", `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const headers = {
      ...responseHeaders,
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": published && pathname.startsWith("/static/") ? "public, max-age=31536000, immutable" : "no-cache",
    };
    if (extname(file) === ".mp3") {
      headers["Accept-Ranges"] = "bytes";
      let start = 0, end = info.size - 1, status = 200;
      if (req.method === "GET" && req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        const first = Number(range?.[1] || 0);
        const last = range?.[2] ? Number(range[2]) : info.size - 1;
        start = range?.[1] ? first : Math.max(0, info.size - last);
        end = range?.[1] ? Math.min(last, info.size - 1) : info.size - 1;
        if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(first) || !Number.isSafeInteger(last)
            || (!range[1] && last === 0) || start >= info.size || end < start) {
          res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}`, "Content-Length": 0 }).end();
          return;
        }
        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
        headers["Content-Length"] = end - start + 1;
      }
      res.writeHead(status, headers);
      if (req.method === "HEAD") res.end();
      else await pipeline(createReadStream(file, status === 206 ? { start, end } : undefined), res);
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { ...headers, "Content-Length": data.byteLength });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (error) {
    if (res.headersSent) res.destroy();
    else res.writeHead(error instanceof URIError ? 400 : 404).end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`知游${published ? "发布版预览" : ""}已启动：http://127.0.0.1:${server.address().port}${base}/`);
  console.log("按 Ctrl+C 停止服务。");
});
server.on("error", (error) => {
  console.error(`无法启动服务：${error.message}`);
  process.exitCode = 1;
});
