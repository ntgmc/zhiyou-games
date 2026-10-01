import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, lstat, readdir } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "./compile.js";

const root = fileURLToPath(new URL("../", import.meta.url));
export const publishRoot = resolve(root, "dist");
const runtimeFiles = [
  "assets/music/orbit.mp3", "assets/music/code.mp3", "assets/music/storm.mp3", "assets/music/arrival.mp3",
  "assets/favicon.svg", "assets/share-card.png",
];

async function filesIn(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const groups = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesIn(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]));
  return groups.flat().sort();
}

function escapeAttribute(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function publicUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("SITE_URL 必须是没有凭据、查询参数或片段的 http(s) 网址。");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export async function buildSite({ siteUrl = process.env.SITE_URL, quiet = false } = {}) {
  const base = publicUrl(siteUrl);
  await compile();
  // Read and validate everything before touching the previous build.
  const sources = (await filesIn("src")).filter((file) => /\.(ts|css)$/.test(file) && !file.endsWith(".d.ts"));
  const entries = await Promise.all([...runtimeFiles, ...sources].map(async (source) => {
    const file = source.replace(/\.ts$/, ".js");
    return [file, await readFile(resolve(root, source.endsWith(".ts") ? `.build/${file}` : file))];
  }));
  const pageFiles = ["index.html", ...(await filesIn("games")).filter((file) => file.endsWith(".html"))];
  const pages = await Promise.all(pageFiles.map(async (file) => [file, await readFile(resolve(root, file), "utf8")]));
  const [headers, notFoundSource] = await Promise.all([
    readFile(resolve(root, "deploy/_headers"), "utf8"),
    readFile(resolve(root, "deploy/404.html"), "utf8"),
  ]);
  const hash = createHash("sha256");
  for (const [file, content] of pages) hash.update(file).update("\0").update(content);
  for (const [file, content] of entries) hash.update(file).update("\0").update(content);
  const version = hash.digest("hex").slice(0, 12);
  const release = `static/${version}`;
  const builtPages = pages.map(([file, sourceHtml]) => {
    let html = sourceHtml.replace(/(href|src)="(?:\.\/|\.\.\/)+((?:src|assets)\/[^"]+)"/g, (_, attribute, resource) => {
      const path = relative(dirname(file), `${release}/${resource}`).split(sep).join("/");
      return `${attribute}="${path.startsWith(".") ? path : `./${path}`}"`;
    });
    if (base) {
      const pageUrl = new URL(file.replace(/index\.html$/, ""), base).href;
      const image = new URL(`${release}/assets/share-card.png`, base).href;
      html = html.replace("    <title>", `    <link rel="canonical" href="${escapeAttribute(pageUrl)}" />\n`
        + `    <meta property="og:url" content="${escapeAttribute(pageUrl)}" />\n`
        + `    <meta property="og:image" content="${escapeAttribute(image)}" />\n`
        + '    <meta property="og:image:width" content="1200" />\n'
        + '    <meta property="og:image:height" content="630" />\n'
        + `    <meta name="twitter:image" content="${escapeAttribute(image)}" />\n    <title>`);
    }
    return [file, html];
  });
  const notFound = notFoundSource.replace("__SITE_HOME__", escapeAttribute(base?.href || "/"));
  // Only this fixed, direct child may be cleaned. Never follow a substituted dist symlink.
  if (relative(root, publishRoot) !== "dist" || !publishRoot.startsWith(root.endsWith(sep) ? root : root + sep)) {
    throw new Error("发布目录必须位于当前项目的 dist。");
  }
  const existing = await lstat(publishRoot).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new Error("dist 不是普通文件夹，已停止构建。");
  }
  await rm(publishRoot, { recursive: true, force: true });
  await mkdir(publishRoot, { recursive: true });
  for (const [file, content] of entries) {
    const target = resolve(publishRoot, release, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  for (const [file, html] of builtPages) {
    const target = resolve(publishRoot, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  }
  await Promise.all([
    writeFile(resolve(publishRoot, "404.html"), notFound),
    writeFile(resolve(publishRoot, "_headers"), headers),
    writeFile(resolve(publishRoot, ".nojekyll"), ""),
  ]);
  const bytes = entries.reduce((sum, [, content]) => sum + content.byteLength, 0)
    + builtPages.reduce((sum, [, html]) => sum + Buffer.byteLength(html), 0) + Buffer.byteLength(headers + notFound);
  if (!quiet) {
    console.log(`发布包已生成：dist/ · 版本 ${version} · ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
    console.log("只发布 dist 文件夹的内容。音乐已包含，不需要运行 Node 服务。");
    if (!base) console.log("设置 SITE_URL 后重新构建，可加入完整的分享图片网址。");
  }
  return { directory: publishRoot, version, bytes, release };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSite().catch((error) => {
    console.error(`构建失败：${error.message}`);
    process.exitCode = 1;
  });
}
