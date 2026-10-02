/** Post-deploy smoke check. No credentials or npm dependencies needed. */
const site = new URL(process.env.SITE_URL || process.argv[2] || "");
if (!["http:", "https:"].includes(site.protocol)) throw new Error("SITE_URL must be an HTTP(S) site.");
if (!site.pathname.endsWith("/")) site.pathname += "/";

async function get(url, method = "GET") {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: { "User-Agent": "Deep-Space-Comms-Smoke-Test" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${method} ${url}: HTTP ${response.status}`);
  return response;
}

async function verify() {
  const html = await (await get(site)).text();
  if (!html.includes("知游")) throw new Error("Homepage is not the expected game directory.");
  const modulePath = html.match(/src="([^"]+\/src\/site\/home\.js)"/)?.[1];
  const cssPath = html.match(/href="([^"]+\/src\/site\/site\.css)"/)?.[1];
  const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  if (!modulePath || !cssPath) throw new Error("Homepage does not contain the built static directory.");
  if (canonical !== site.href) throw new Error(`Unexpected canonical URL: ${canonical || "(missing)"}`);
  const appUrl = new URL(modulePath, site);
  const cssUrl = new URL(cssPath, site);
  const gameUrl = new URL("games/information/", site);
  const gameHtml = await (await get(gameUrl)).text();
  const gameModule = gameHtml.match(/src="([^"]+\/src\/games\/information\/app\.js)"/)?.[1];
  const gameCss = gameHtml.match(/href="([^"]+\/src\/games\/information\/game\.css)"/)?.[1];
  if (!gameModule || !gameCss || !gameHtml.includes(`rel="canonical" href="${gameUrl.href}"`)) {
    throw new Error("The information game page or its canonical URL is missing.");
  }
  const gameAppUrl = new URL(gameModule, gameUrl);
  const harborUrl = new URL("games/game-theory/", site);
  const harborHtml = await (await get(harborUrl)).text();
  const harborModule = harborHtml.match(/src="([^"]+\/src\/games\/game-theory\/app\.js)"/)?.[1];
  const harborCss = harborHtml.match(/href="([^"]+\/src\/games\/game-theory\/game\.css)"/)?.[1];
  const harborTokens = harborHtml.match(/href="([^"]+\/src\/games\/game-theory\/tokens\.css)"/)?.[1];
  if (!harborModule || !harborCss || !harborTokens || !harborHtml.includes(`rel="canonical" href="${harborUrl.href}"`)) {
    throw new Error("The game theory page or its canonical URL is missing.");
  }
  const harborAppUrl = new URL(harborModule, harborUrl);
  const repairUrl = new URL("games/probability/", site);
  const repairHtml = await (await get(repairUrl)).text();
  const repairModule = repairHtml.match(/src="([^"]+\/src\/games\/probability\/app\.js)"/)?.[1];
  const repairCss = repairHtml.match(/href="([^"]+\/src\/games\/probability\/game\.css)"/)?.[1];
  if (!repairModule || !repairCss || !repairHtml.includes(`rel="canonical" href="${repairUrl.href}"`)) {
    throw new Error("The probability game page or its canonical URL is missing.");
  }
  const repairAppUrl = new URL(repairModule, repairUrl);
  const checks = [
    [appUrl, /(?:javascript|ecmascript)/],
    [cssUrl, /text\/css/],
    [gameAppUrl, /(?:javascript|ecmascript)/],
    [new URL(gameCss, gameUrl), /text\/css/],
    [new URL("./audio.js", gameAppUrl), /(?:javascript|ecmascript)/],
    [harborAppUrl, /(?:javascript|ecmascript)/],
    [new URL(harborCss, harborUrl), /text\/css/],
    [new URL(harborTokens, harborUrl), /text\/css/],
    ...["engine", "missions", "storage"].map((name) => [new URL(`./${name}.js`, harborAppUrl), /(?:javascript|ecmascript)/]),
    [repairAppUrl, /(?:javascript|ecmascript)/],
    [new URL(repairCss, repairUrl), /text\/css/],
    ...["engine", "missions", "storage", "story"].map((name) => [new URL(`./${name}.js`, repairAppUrl), /(?:javascript|ecmascript)/]),
    [new URL("../../assets/share-card.png", appUrl), /image\/png/],
    ...["orbit", "code", "storm", "arrival"].map((id) =>
      [new URL(`../../../assets/music/${id}.mp3`, gameAppUrl), /^audio\/(?:mpeg|mp3)(?:;|$)/]),
  ];
  const outcomes = await Promise.allSettled(checks.map(async ([url, mime]) => {
    const response = await get(url, "HEAD");
    const type = response.headers.get("content-type") || "";
    if (!mime.test(type)) throw new Error(`${url}: incorrect content type ${type}`);
    if (url.pathname.endsWith(".mp3") && Number(response.headers.get("content-length")) < 100000) {
      throw new Error(`${url}: music file is unexpectedly small`);
    }
    console.log(`OK ${url.pathname} (${type})`);
  }));
  const failures = outcomes.filter(({ status }) => status === "rejected");
  if (failures.length) throw new Error(failures.map(({ reason }) => reason.message).join("\n"));
  console.log(`Public game verified: ${site.href}`);
}

// A just-published Pages deployment can take a moment to reach the serving edge.
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    await verify();
    break;
  } catch (error) {
    console.error(`Verification attempt ${attempt}/4: ${error.message}`);
    if (attempt === 4) process.exitCode = 1;
    else await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}
