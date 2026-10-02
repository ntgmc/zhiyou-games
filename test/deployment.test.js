import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { buildSite, gameContentVersion, publishRoot } from "../scripts/build.js";
import { resolve } from "node:path";

test("game content versions track game changes and shared resources independently of other games", () => {
  const game = { id: "information", title: "深空通信站", chapters: 24 };
  const pages = [["games/information/index.html", "game page"], ["games/network/index.html", "other page"]];
  const entries = [
    ["src/games/information/app.js", "game code"],
    ["src/games/information/game.css", "game style"],
    ["src/games/network/app.js", "other game"],
    ["src/shared/html.js", "shared code"],
    ["assets/music/orbit.mp3", "shared resource"],
    ["src/site/site.css", "site style"],
  ];
  const original = gameContentVersion(game, pages, entries);
  assert.match(original, /^[a-f0-9]{12}$/);
  assert.equal(gameContentVersion(game, pages, entries), original);
  for (const file of ["src/games/information/app.js", "src/games/information/game.css", "src/shared/html.js", "assets/music/orbit.mp3"]) {
    const changed = entries.map(([path, content]) => [path, path === file ? `${content} changed` : content]);
    assert.notEqual(gameContentVersion(game, pages, changed), original, file);
  }
  for (const file of ["src/games/network/app.js", "src/site/site.css"]) {
    const changed = entries.map(([path, content]) => [path, path === file ? `${content} changed` : content]);
    assert.equal(gameContentVersion(game, pages, changed), original, file);
  }
  assert.notEqual(gameContentVersion({ ...game, chapters: 25 }, pages, entries), original);
  assert.notEqual(gameContentVersion(game, [[pages[0][0], "new game page"], pages[1]], entries), original);
  assert.equal(gameContentVersion(game, [pages[0], [pages[1][0], "new other page"]], entries), original);
});

test("publish builds contain only public files, keep subpath imports valid and apply production headers", async () => {
  const build = await buildSite({ siteUrl: "https://example.com/zhiyou-games/", quiet: true });
  const html = await readFile(resolve(publishRoot, "index.html"), "utf8");
  assert.match(html, new RegExp(`\\./static/${build.version}/src/site/home\\.js`));
  assert.match(html, /https:\/\/example\.com\/zhiyou-games\/static\/[a-f0-9]+\/assets\/share-card\.png/);
  assert.deepEqual((await readdir(publishRoot)).sort(), [".nojekyll", "404.html", "_headers", "games", "index.html", "static", "status", "versions"]);
  const packageInfo = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(build.releaseInfo.siteVersion, packageInfo.version);
  assert.equal(build.releaseInfo.contentVersion, build.version);
  assert.ok(Number.isFinite(Date.parse(build.releaseInfo.builtAt)));
  assert.deepEqual(Object.keys(build.releaseInfo.games).sort(), ["game-theory", "information", "network", "probability"]);
  for (const version of Object.values(build.releaseInfo.games)) assert.match(version, /^[a-f0-9]{12}$/);
  for (const name of ["status", "versions"]) {
    const infoHtml = await readFile(resolve(publishRoot, `${name}/index.html`), "utf8");
    assert.match(infoHtml, new RegExp(`\\.\\./${build.release}/src/site/info\\.js`));
    assert.ok(infoHtml.includes(`rel="canonical" href="https://example.com/zhiyou-games/${name}/"`));
    const entities = { "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#39;": "'" };
    const metadata = infoHtml.match(/name="release-info" content="([^"]+)"/)[1]
      .replace(/&(?:quot|amp|lt|gt|#39);/g, (entity) => entities[entity]);
    assert.deepEqual(JSON.parse(metadata), build.releaseInfo, "both pages describe the same build");
  }
  const css = await readFile(resolve(publishRoot, build.release, "src/games/information/game.css"), "utf8");
  assert.doesNotMatch(css, /@import|fonts\.google/);
  const audio = await readFile(resolve(publishRoot, build.release, "src/games/information/audio.js"), "utf8");
  assert.match(audio, /\.\.\/\.\.\/\.\.\/assets\/music\//);
  const gameHtml = await readFile(resolve(publishRoot, "games/information/index.html"), "utf8");
  assert.match(gameHtml, new RegExp(`\\.\\./\\.\\./${build.release}/src/games/information/app\\.js`));
  assert.match(gameHtml, /rel="canonical" href="https:\/\/example\.com\/zhiyou-games\/games\/information\/"/);
  const harborHtml = await readFile(resolve(publishRoot, "games/game-theory/index.html"), "utf8");
  assert.match(harborHtml, new RegExp(`\\.\\./\\.\\./${build.release}/src/games/game-theory/app\\.js`));
  assert.match(harborHtml, new RegExp(`\\.\\./\\.\\./${build.release}/src/games/game-theory/tokens\\.css`));
  assert.match(harborHtml, /rel="canonical" href="https:\/\/example\.com\/zhiyou-games\/games\/game-theory\/"/);
  const repairHtml = await readFile(resolve(publishRoot, "games/probability/index.html"), "utf8");
  assert.match(repairHtml, new RegExp(`\\.\\./\\.\\./${build.release}/src/games/probability/app\\.js`));
  assert.match(repairHtml, /rel="canonical" href="https:\/\/example\.com\/zhiyou-games\/games\/probability\/"/);
  const networkHtml = await readFile(resolve(publishRoot, "games/network/index.html"), "utf8");
  assert.match(networkHtml, new RegExp(`\\.\\./\\.\\./${build.release}/src/games/network/app\\.js`));
  assert.match(networkHtml, /rel="canonical" href="https:\/\/example\.com\/zhiyou-games\/games\/network\/"/);
  for (const file of ["orbit", "code", "storm", "arrival"]) {
    assert.ok((await readFile(resolve(publishRoot, build.release, `assets/music/${file}.mp3`))).length > 100000);
  }
  const repeated = await buildSite({ siteUrl: "https://example.com/zhiyou-games/", quiet: true });
  assert.equal(repeated.version, build.version, "content version is reproducible");
  assert.deepEqual(repeated.releaseInfo.games, build.releaseInfo.games, "game versions are reproducible");
  await assert.rejects(buildSite({ siteUrl: "https://user:secret@example.com" }), /SITE_URL/);
  assert.equal(await readFile(resolve(publishRoot, "index.html"), "utf8"), html, "invalid settings preserve the last build");

  const serverEnvironment = { ...process.env, PORT: "0" };
  delete serverEnvironment.NODE_TEST_CONTEXT;
  const server = spawn(process.execPath, ["server.js", "--dist", "--base=/zhiyou-games"], {
    cwd: resolve(publishRoot, ".."), env: serverEnvironment, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let failures = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { failures += chunk; });
  const ready = new Promise((yes, no) => {
    server.stdout.on("data", () => {
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) yes(url);
    });
    server.on("error", no);
    server.on("exit", () => no(new Error(failures || "Preview exited before startup")));
  });
  let timer;
  try {
    const base = await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Preview startup timeout")), 8000); })]);
    clearTimeout(timer);
    const page = await fetch(`${base}/zhiyou-games/`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/);
    const pageHtml = await page.text();
    const moduleUrl = new URL(pageHtml.match(/src="([^"]+home\.js)"/)[1], `${base}/zhiyou-games/`);
    assert.equal((await fetch(moduleUrl)).status, 200);
    for (const name of ["status", "versions"]) {
      const infoUrl = `${base}/zhiyou-games/${name}/`;
      const infoResponse = await fetch(`${infoUrl}?test=1`);
      assert.equal(infoResponse.status, 200, "information pages support direct links and reloads");
      assert.equal(infoResponse.headers.get("cache-control"), "no-cache");
      const infoHtml = await infoResponse.text();
      for (const path of [...infoHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])) {
        const resource = await fetch(new URL(path, infoUrl));
        assert.equal(resource.status, 200);
        assert.match(resource.headers.get("content-type"), path.endsWith(".css") ? /text\/css/ : /javascript/);
      }
      const infoModule = new URL(infoHtml.match(/src="([^"]+info\.js)"/)[1], infoUrl);
      assert.equal((await fetch(new URL("./catalog.js", infoModule))).status, 200);
      assert.equal((await fetch(new URL("../shared/html.js", infoModule))).status, 200);
      const redirect = await fetch(`${base}/zhiyou-games/${name}?test=1`, { redirect: "manual" });
      assert.equal(redirect.headers.get("location"), `/zhiyou-games/${name}/?test=1`);
      assert.equal((await fetch(`${infoUrl}index.html`)).status, 200);
    }
    const gameUrl = `${base}/zhiyou-games/games/information/`;
    const gamePage = await fetch(gameUrl);
    assert.equal(gamePage.status, 200);
    const gamePageHtml = await gamePage.text();
    const gameModuleUrl = new URL(gamePageHtml.match(/src="([^"]+app\.js)"/)[1], gameUrl);
    assert.equal((await fetch(gameModuleUrl)).status, 200);
    const audioUrl = new URL("./audio.js", gameModuleUrl);
    const audioSource = await (await fetch(audioUrl)).text();
    const musicPrefix = audioSource.match(/new URL\(`([^`]+)\$\{track.file\}/)[1];
    const relativeSong = new URL(`${musicPrefix}orbit.mp3`, audioUrl);
    assert.equal((await fetch(relativeSong, { method: "HEAD" })).status, 200);
    const gameRedirect = await fetch(`${base}/zhiyou-games/games/information?test=1`, { redirect: "manual" });
    assert.equal(gameRedirect.headers.get("location"), "/zhiyou-games/games/information/?test=1");
    const refreshed = await fetch(`${gameUrl}?test=1`);
    assert.equal(refreshed.status, 200, "direct game links and reloads work without SPA rewrites");
    const harborUrl = `${base}/zhiyou-games/games/game-theory/`;
    const harborPage = await fetch(`${harborUrl}?test=1`);
    assert.equal(harborPage.status, 200);
    const harborPageHtml = await harborPage.text();
    for (const path of [...harborPageHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])) {
      assert.equal((await fetch(new URL(path, harborUrl))).status, 200);
    }
    const harborRedirect = await fetch(`${base}/zhiyou-games/games/game-theory?test=1`, { redirect: "manual" });
    assert.equal(harborRedirect.headers.get("location"), "/zhiyou-games/games/game-theory/?test=1");
    const repairUrl = `${base}/zhiyou-games/games/probability/`;
    const repairPage = await fetch(`${repairUrl}?test=1`);
    assert.equal(repairPage.status, 200);
    const repairPageHtml = await repairPage.text();
    for (const path of [...repairPageHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])) {
      assert.equal((await fetch(new URL(path, repairUrl))).status, 200);
    }
    const repairRedirect = await fetch(`${base}/zhiyou-games/games/probability?test=1`, { redirect: "manual" });
    assert.equal(repairRedirect.headers.get("location"), "/zhiyou-games/games/probability/?test=1");
    assert.equal((await fetch(`${repairUrl}?test=1`)).status, 200, "the repair game supports direct reloads");
    const networkUrl = `${base}/zhiyou-games/games/network/`;
    const networkPage = await fetch(`${networkUrl}?test=1`);
    assert.equal(networkPage.status, 200);
    const networkPageHtml = await networkPage.text();
    for (const path of [...networkPageHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])) {
      const resource = await fetch(new URL(path, networkUrl));
      assert.equal(resource.status, 200);
      assert.match(resource.headers.get("content-type"), path.endsWith(".css") ? /text\/css/ : /javascript/);
    }
    const networkModuleUrl = new URL(networkPageHtml.match(/src="([^"]+app\.js)"/)[1], networkUrl);
    for (const name of ["engine", "missions", "story", "storage"]) {
      assert.equal((await fetch(new URL(`./${name}.js`, networkModuleUrl))).status, 200);
    }
    const networkRedirect = await fetch(`${base}/zhiyou-games/games/network?test=1`, { redirect: "manual" });
    assert.equal(networkRedirect.headers.get("location"), "/zhiyou-games/games/network/?test=1");
    const song = await fetch(`${base}/zhiyou-games/${build.release}/assets/music/orbit.mp3`, { method: "HEAD" });
    assert.equal(song.status, 200);
    assert.equal(song.headers.get("content-type"), "audio/mpeg");
    assert.match(song.headers.get("cache-control"), /immutable/);
    assert.ok(Number(song.headers.get("content-length")) > 100000);
    assert.equal((await fetch(`${base}/zhiyou-games/server.js`)).status, 404);
    assert.equal((await fetch(`${base}/zhiyou-games/_headers`)).status, 404);
    assert.equal((await fetch(`${base}/zhiyou-games/.env`)).status, 404);
    assert.equal((await fetch(`${base}/zhiyou-games/src/games/information/app.ts`)).status, 404);
    const redirect = await fetch(`${base}/zhiyou-games?test=1`, { redirect: "manual" });
    assert.equal(redirect.headers.get("location"), "/zhiyou-games/?test=1");
  } finally {
    clearTimeout(timer);
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit").catch(() => {});
      server.kill();
      await exited;
    }
  }
});
