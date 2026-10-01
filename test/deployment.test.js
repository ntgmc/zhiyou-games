import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { buildSite, publishRoot } from "../scripts/build.js";
import { resolve } from "node:path";

test("publish builds contain only public files, keep subpath imports valid and apply production headers", async () => {
  const build = await buildSite({ siteUrl: "https://example.com/zhiyou-games/", quiet: true });
  const html = await readFile(resolve(publishRoot, "index.html"), "utf8");
  assert.match(html, new RegExp(`\\./static/${build.version}/src/site/home\\.js`));
  assert.match(html, /https:\/\/example\.com\/zhiyou-games\/static\/[a-f0-9]+\/assets\/share-card\.png/);
  assert.deepEqual((await readdir(publishRoot)).sort(), [".nojekyll", "404.html", "_headers", "games", "index.html", "static"]);
  const css = await readFile(resolve(publishRoot, build.release, "src/games/information/game.css"), "utf8");
  assert.doesNotMatch(css, /@import|fonts\.google/);
  const audio = await readFile(resolve(publishRoot, build.release, "src/games/information/audio.js"), "utf8");
  assert.match(audio, /\.\.\/\.\.\/\.\.\/assets\/music\//);
  const gameHtml = await readFile(resolve(publishRoot, "games/information/index.html"), "utf8");
  assert.match(gameHtml, new RegExp(`\\.\\./\\.\\./${build.release}/src/games/information/app\\.js`));
  assert.match(gameHtml, /rel="canonical" href="https:\/\/example\.com\/zhiyou-games\/games\/information\/"/);
  for (const file of ["orbit", "code", "storm", "arrival"]) {
    assert.ok((await readFile(resolve(publishRoot, build.release, `assets/music/${file}.mp3`))).length > 100000);
  }
  const repeated = await buildSite({ siteUrl: "https://example.com/zhiyou-games/", quiet: true });
  assert.equal(repeated.version, build.version, "content version is reproducible");
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
