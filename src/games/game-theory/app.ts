import { escapeHtml as h } from "../../shared/html.js";
import { ACTIONS, actionName, analyze, contractMatrix, cooperationCount, createSession, defaultPlan, planError, settle, stars, validPlan } from "./engine.js";
import type { Analysis, Matrix, Plan, Round } from "./engine.js";
import { MANUAL, MISSIONS } from "./missions.js";
import { readSave, recordScore, SAVE_KEY, writeSave } from "./storage.js";
import { advanceGuide, formulaExplanation, freshGuide, guideStep, renderGuide, testGuide } from "./story.js";
import { resultFeedback } from "./results.js";

const app = document.querySelector<HTMLElement>("#app")!;
const dialog = document.querySelector<HTMLDialogElement>("#workshop")!;
const notice = document.querySelector<HTMLElement>("#notice")!;
const testing = new URLSearchParams(location.search).has("test");
const key = testing ? "tidal-harbor-test-v1" : SAVE_KEY;
const desktop = matchMedia("(min-width: 64rem)");
let save = readSave(key);
let error = "";
let storageFailed = false;
const fmt = (amount: number): string => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(amount);
const signed = (amount: number): string => `${amount > 0 ? "+" : ""}${fmt(amount)}`;
const persist = (): void => { storageFailed = !writeSave(key, { ...save, draft: validPlan(save.draft) ? save.draft : defaultPlan() }); };
const guiding = (): boolean => save.mode === "story" && !save.review && guideStep(save.guide, MISSIONS[save.activeId - 1], save.session) !== "dispatch";

function matrixTable(matrix: Matrix, showEquilibria = false): string {
  return `<table class="payoffs"><caption>左数：白帆（你） · 右数：岑舟 · 单位：金币</caption>
    <thead><tr><th scope="col">你的行动 ↓<br>岑舟的行动 →</th><th scope="col">错峰</th><th scope="col">抢先</th></tr></thead>
    <tbody>${ACTIONS.map((action, row) => `<tr><th scope="row">${action === "cooperate" ? "错峰" : "抢先"}</th>${[0, 1].map((col) => {
      const index = row * 2 + col;
      const equilibrium = matrix[index][0] >= matrix[(1 - row) * 2 + col][0] && matrix[index][1] >= matrix[row * 2 + 1 - col][1];
      return `<td><strong>${fmt(matrix[index][0])}</strong><span> / ${fmt(matrix[index][1])}</span>${showEquilibria && equilibrium ? "<small>纳什均衡</small>" : ""}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>`;
}
function harbor(action: string, opponent?: string): string {
  const rush = action === "rush";
  return `<div class="harbor-map">
    <svg viewBox="0 0 720 245" role="img" aria-label="港口示意图：白帆与岑舟共用一条航道，错峰可以分别靠泊，抢先可能造成拥堵。">
      <path class="water-line" d="M0 34H720M0 88H720M0 142H720M0 196H720M80 0V245M160 0V245M240 0V245M320 0V245M400 0V245M480 0V245M560 0V245M640 0V245"/>
      <path class="route" d="M32 123H490M490 123L535 63H650M490 123L535 184H650"/>
      <path class="quay" d="M660 0H720V245H660V210H576V165H660V80H576V35H660Z"/>
      <path class="crane" d="M674 36V10H612L650 36M674 162V137H612L650 162"/>
      <text x="586" y="62">早班泊位</text><text x="586" y="192">晚班泊位</text>
      <text x="35" y="220" class="map-note">共同航道 · 收益由双方行动决定</text>
      <g class="ship white-sail" transform="translate(${rush ? 330 : 230} ${rush ? 104 : 48})">
        <path d="M0 0H72L100 20L72 40H0Z"/><path class="cargo" d="M10 9H34V31H10ZM41 9H65V31H41Z"/>
        <text x="0" y="-12">白帆 · 你${opponent ? ` · ${rush ? "抢先" : "错峰"}` : ""}</text>
      </g>
      <g class="ship other-sail" transform="translate(${opponent === "rush" ? 430 : 350} ${opponent === "rush" ? 104 : 164})">
        <path d="M0 0H72L100 20L72 40H0Z"/><path class="cargo" d="M10 9H34V31H10ZM41 9H65V31H41Z"/>
        <text x="0" y="${opponent === "rush" ? 66 : -12}">岑舟${opponent ? ` · ${opponent === "rush" ? "抢先" : "错峰"}` : " · 独立决策"}</text>
      </g>
    </svg>
    <div class="map-key"><span><i></i>白帆运输</span><span><i></i>岑舟船队</span><span>示意图 · 非实时航行</span></div>
  </div>`;
}
function navigation(): string {
  return `<aside class="sidebar"><a class="home-link" href="../../${testing ? "?test=1" : ""}">← 知游目录</a>
    <div class="wordmark"><svg class="anchor-mark" viewBox="0 0 40 48" aria-hidden="true"><circle cx="20" cy="9" r="5"/><path d="M20 14V40M10 23H30M5 30V36Q20 51 35 36V30M5 30L2 35M35 30L38 35"/></svg><div><strong>潮汐港</strong><span>合约与对手</span></div></div>
    <p class="sidebar-intro">你和岑舟共用一条航道，<br>各有一本要算的账。</p>
    <details class="chapter-menu" id="chapters" ${desktop.matches ? "open" : ""}><summary>航运日志 <span>${Object.keys(save.best).length} / ${MISSIONS.length}</span></summary>
      <nav aria-label="游戏章节">${MISSIONS.map((mission) => `<button type="button" data-mission="${mission.id}" class="chapter ${mission.id === save.activeId ? "current" : ""}" ${mission.id === save.activeId ? 'aria-current="step"' : ""}>
        <span class="chapter-number">${String(mission.id).padStart(2, "0")}</span><span>${h(mission.title)}</span><span class="chapter-score" aria-label="${save.best[mission.id] ? `${save.best[mission.id]} 星${save.solo[mission.id] ? "，独立通过" : ""}` : "尚未通过"}">${save.best[mission.id] ? `${"★".repeat(save.best[mission.id])}${save.solo[mission.id] ? " ·" : ""}` : "—"}</span>
      </button>`).join("")}</nav>
      <small>可直接进入任意章。切换后从所选章节第一班开始，当前排班进度不保留，已有成绩保留。</small>
    </details>
    <div class="sidebar-tools"><button type="button" data-open="manual">航运手册 <span aria-hidden="true">↗</span></button>${guiding() ? "" : '<button type="button" data-open="lab">博弈实验台 <span aria-hidden="true">↗</span></button>'}</div>
    <p class="local-note">${storageFailed ? "浏览器未能保存进度。请先保留页面，允许站点存储后再试。" : "浏览器会自动保存行动和草稿。换设备、换网址或清理站点数据后，可能无法继续原有进度。"}${testing ? "<br>当前使用独立测试存档。" : ""}</p></aside>`;
}
function conditions(round: Round): string {
  const mission = MISSIONS[save.activeId - 1];
  return `<details class="conditions" id="conditions"><summary>查看整章条件与后续订单</summary>
    <div class="table-scroll" tabindex="0" role="region" aria-label="整章订单总表，可横向滚动"><table class="order-table"><caption>整章订单 · 每组收益、周转金与替代航线数字均为你 / 岑舟，单位为金币</caption>
      <thead><tr><th scope="col">班次 / 状态</th><th scope="col">双方错峰</th><th scope="col">各自单独抢先</th><th scope="col">双方抢先</th><th scope="col">周转金</th><th scope="col">每方手续费</th><th scope="col">替代航线</th></tr></thead>
      <tbody>${mission.rounds.map((item, index) => `<tr><th scope="row">${index + 1}. ${h(item.title)}<small>${index < save.session.history.length ? "已结算" : index === save.session.step ? "当前待排" : "后续订单"}</small></th><td>${item.matrix[0].join(" / ")}</td><td>${item.matrix[2][0]} / ${item.matrix[1][1]}</td><td>${item.matrix[3].join(" / ")}</td><td>${item.reserve.join(" / ")}</td><td>${item.fee}</td><td>${item.outside.join(" / ")}</td></tr>`).join("")}</tbody></table></div>
    <p class="helper">表中收益尚未扣合同手续费、没收的保证金或合作分账。未来订单可提前查看，但须按班次执行。</p><div class="forecast">
    ${MISSIONS[save.activeId - 1].rounds.map((item, index) => `<section><h3>${index + 1}. ${h(item.title)}</h3><p>${h(item.briefing)}</p>
      <p class="compact">未扣合同费用时，双方错峰赚 ${item.matrix[0].join(" / ")}；各自单方违约赚 ${item.matrix[2][0]} / ${item.matrix[1][1]}；双方抢先赚 ${item.matrix[3].join(" / ")}。<br>须留运营周转金 ${item.reserve.join(" / ")}；手续费每方 ${item.fee}；替代航线收益 ${item.outside.join(" / ")}。各组数字均为你 / 岑舟。</p>
      <details><summary>查看该班原始收益（未扣合同费用）</summary>${matrixTable(item.matrix)}</details>
    </section>`).join("")}</div></details>
    <p class="rule-note">${round.continuation !== undefined
      ? "本章没有固定终点，计算整段合作关系的期望收益，不随机抽取轮数，也不改变可用现金。"
      : "双方各自提交行动，同时揭晓。岑舟作决定时，看不到你尚未揭晓的选择。"}</p>`;
}
function hints(): string {
  const mission = MISSIONS[save.activeId - 1];
  return `<section class="hints"><h3>卡住时再看</h3><p>提示不扣星，使用后会记录“参考提示”。</p>
    ${mission.hints.slice(0, save.hintLevel).map((text, index) => `<p class="hint-line"><b>${["思考方向", "关键约束", "参考方案"][index]}</b>${h(text)}</p>`).join("")}
    ${save.hintLevel < 3 ? `<button type="button" data-command="hint">查看${["思考方向", "关键约束", "参考方案"][save.hintLevel]}</button>` : ""}
  </section>`;
}
function controls(round: Round): string {
  const mission = MISSIONS[save.activeId - 1];
  const plan = save.draft;
  const invalidDeposit = !!error && (!Number.isInteger(plan.deposit) || plan.deposit < 0 || plan.deposit > 12
    || (plan.contract && save.session.cash[0] < plan.deposit + round.fee + round.reserve[0]));
  return `<section class="decision"><h2>你的排班方案</h2>
    <p class="helper">${round.continuation !== undefined ? "本章收入是整段关系的期望值，不是本班到账金币。" : mission.contracts ? `净收入是本班收益扣去手续费、没收的保证金${mission.transfers ? "和付出的分账，再加上收到的分账" : ""}。` : "本章没有合同费用，收益表中的金币就是本班收入。"}</p>
    ${round.continuation !== undefined ? `<label class="check-label"><input type="checkbox" id="reciprocal" ${plan.reciprocal ? "checked" : ""}>公开长期互惠方案</label>
      <p class="helper">先错峰；只要有人抢先，以后双方就一直抢先。只有双方违约都不能赚得更多，岑舟才会接受这个方案。</p>`
      : mission.contracts ? `<label class="check-label"><input type="checkbox" id="contract" ${plan.contract ? "checked" : ""}>签署港务处合同</label>
        <p class="helper">每方支付 ${round.fee} 金币手续费。保证金守约当班退还，抢先则没收。岑舟可以拒签。</p>
        <div class="contract-fields"><label for="deposit">每方保证金<input id="deposit" type="number" min="0" max="12" step="1" value="${Number.isFinite(plan.deposit) ? plan.deposit : ""}" ${!plan.contract ? "disabled" : ""} aria-describedby="deposit-note plan-error" aria-invalid="${invalidDeposit}"></label>
        ${mission.transfers ? `<label for="transfer">合作分账<input id="transfer" type="number" min="-4" max="4" step="1" value="${Number.isFinite(plan.transfer) ? plan.transfer : ""}" ${!plan.contract ? "disabled" : ""} aria-describedby="transfer-note plan-error" aria-invalid="${!Number.isInteger(plan.transfer) || plan.transfer < -4 || plan.transfer > 4}"></label>` : ""}</div>
        <p class="helper" id="deposit-note">冻结保证金、支付手续费后，你须留 ${round.reserve[0]} 金币，岑舟须留 ${round.reserve[1]} 金币运营，周转金不扣除。保证金填 0～12 的整数，勾选合同后可编辑。</p>
        ${plan.contract && validPlan(plan) ? `<p class="cost-preview">签约那一刻每方须有 ${plan.deposit} + ${round.fee} + 周转金；你需 ${plan.deposit + round.fee + round.reserve[0]}，岑舟需 ${plan.deposit + round.fee + round.reserve[1]} 金币。保证金先冻结，手续费才是直接支出。</p>` : ""}
        ${mission.transfers ? '<p class="helper" id="transfer-note">分账填 −4～4 的整数。正数表示你付给岑舟，负数表示他付给你。只有双方都错峰才转账。</p>' : ""}`
      : '<p class="helper">本章没有合同。分别假设对方错峰、抢先，看看你选哪种行动赚得更多。</p>'}
    <fieldset class="actions"><legend>选择你的行动</legend>
      ${ACTIONS.map((action) => `<label class="action-option ${plan.action === action ? "selected" : ""}" for="${action}">
        <input id="${action}" type="radio" name="action" value="${action}" ${plan.action === action ? "checked" : ""}>
        <span>${actionName(action)}<small>${action === "cooperate" ? "为另一支船队留出靠港时段" : "抢占早班；签了合同会没收保证金"}</small></span>
      </label>`).join("")}
    </fieldset>
    <p class="error" id="plan-error" role="alert" tabindex="-1">${h(error)}</p>
    <button type="button" class="primary" data-command="settle">提交并揭晓 <span aria-hidden="true">→</span></button>
    <p class="helper">金额和现金符合要求就能提交。提交前请检查双方收益，也看看现金够不够安排后面的班次。</p>${hints()}</section>`;
}
function review(): string {
  const session = save.session;
  const mission = MISSIONS[save.activeId - 1];
  const record = session.history.at(-1)!;
  const round = mission.rounds[session.history.length - 1];
  const repeated = round.continuation !== undefined;
  const finished = session.status !== "playing";
  const score = stars(session, mission);
  const cooperated = (!record.plan.contract || record.accepted) && record.plan.action === "cooperate" && record.opponent === "cooperate";
  const feedback = resultFeedback(session, mission);
  return `<section class="review"><h2 id="result-title" tabindex="-1">${finished ? session.status === "won" ? "排班完成，收到回信" : "这份排班还需要调整" : cooperated ? "两支船队顺利错峰" : record.plan.contract && !record.accepted ? "合同被拒，改走替代航线" : "本班行动已经揭晓"}</h2>
    <p class="reply">${h(feedback.reply)}</p><p class="learning"><strong>这次的账说明了什么</strong>${h(feedback.learning)}</p>
    ${feedback.failure ? `<p class="error">${h(feedback.failure)}</p>` : ""}
    ${record.plan.contract && !record.accepted ? `<p>${h(record.reason)}</p>` : harbor(record.plan.action, record.opponent)}
    <div class="settlement-values"><div><span>白帆${repeated ? "期望收入" : "本班净收入"}</span><strong>${signed(record.payoff[0])}</strong></div><div><span>岑舟${repeated ? "期望收入" : "本班净收入"}</span><strong>${signed(record.payoff[1])}</strong></div></div>
    <p>你选择${actionName(record.plan.action)}；${record.plan.contract && !record.accepted ? "拒签后不再执行靠港行动，双方取得替代航线收益。" : `岑舟选择${actionName(record.opponent)}。`}</p>
    ${cooperated && !record.stable ? '<p class="error">这班双方都错峰了，但双方收益尚未满足稳定合作条件，不计入稳定合作班次。展开收益复盘，比较守约和违约的收益。</p>' : ""}
    <details class="technical" id="technical"><summary>查看收益复盘，比较另一种行动</summary>
      <p>${h(record.reason)}</p><p>表中的“纳什均衡”指双方都不能只改变自己的行动来提高收益，未必是双方合计收入最高的结果。</p>
      ${matrixTable(analyze(round, session.history.length === 1 ? mission.cash : session.history[session.history.length - 2].cash, record.plan).matrix, true)}
      <p>保持岑舟本班行动不变，你改选另一种行动的${repeated ? "期望" : "本班"}收益是 ${fmt(record.alternative)}，实际为 ${fmt(record.payoff[0])}。${record.plan.contract && !record.accepted ? "合同被拒后，行动不会改变替代航线收益。" : ""}</p>
      <p>${repeated && !record.plan.reciprocal ? "未启用长期互惠，以下只比较当班收益。" : ""}面对守约的对方，白帆：合作 ${fmt(record.cooperation[0])} / 偏离 ${fmt(record.deviation[0])}；岑舟：合作 ${fmt(record.cooperation[1])} / 偏离 ${fmt(record.deviation[1])}。</p>
      ${repeated ? formulaExplanation(round.continuation) : `<p>签约手续费${record.accepted ? `每方扣 ${round.fee}` : "未发生"}；你的保证金${record.accepted ? record.plan.action === "rush" ? ` ${record.plan.deposit} 被没收` : ` ${record.plan.deposit} 当班返还` : "未冻结"}。余额 ${fmt(record.cash[0])} / ${fmt(record.cash[1])}。</p>`}
      <p>单次互动中，只有不管你选什么，错峰都严格更有利，岑舟才会错峰；否则他会抢先，收益相等也一样。可在实验台查看收益表中的均衡。</p>
    </details>
    ${finished ? `<div class="final-score"><strong>${score ? "★".repeat(score) : "未通过"}</strong><span>${session.hinted ? "本次参考提示" : "本次独立尝试"}${score && !session.hinted ? " · 独立通过" : ""}</span></div>
      <p>收入目标 ${mission.goal}，实际 ${fmt(session.total[0])}；稳定合作目标 ${mission.cooperation} 班，实际 ${cooperationCount(session)} 班。累计冻结保证金 ${session.deposits} / 效率目标 ${mission.depositTarget}。</p>
      <div class="result-actions"><button type="button" data-command="restart">重新排班</button>${score && mission.id < MISSIONS.length ? `<button type="button" class="primary" data-mission="${mission.id + 1}">进入下一章 →</button>` : ""}${score && mission.id === MISSIONS.length ? '<button type="button" data-open="lab">继续做实验</button>' : ""}</div>`
      : `<button type="button" class="primary" data-command="next">安排下一班 →</button>`}
  </section>`;
}
function render(): void {
  const detailStates = new Map(Array.from(app.querySelectorAll<HTMLDetailsElement>("details[id]"), (item) => [item.id, item.open]));
  const focusId = (document.activeElement as HTMLElement | null)?.id;
  const mission = MISSIONS[save.activeId - 1];
  const session = save.session;
  const step = Math.min(save.review ? session.history.length - 1 : session.step, mission.rounds.length - 1);
  const round = mission.rounds[step];
  const repeated = round.continuation !== undefined;
  const learning = guiding();
  app.innerHTML = `${navigation()}<div class="main-shell">
    <header class="topbar"><span>白帆运输 · ${learning ? "港口值班" : mission.concept}</span><button type="button" class="quiet" data-command="mode">${save.mode === "story" ? "打开完整调度桌" : "返回剧情模式"}</button><span>${save.session.hinted ? "参考提示" : "独立尝试"} / 本机存档${storageFailed ? "异常" : "已保存"}</span></header>
    <main id="desk"><div class="chapter-heading"><div><p class="chapter-kicker">第 ${mission.id} 章 / ${MISSIONS.length}</p><h1>${h(mission.title)}</h1></div><button type="button" class="quiet" data-command="${save.mode === "story" ? "replay" : "restart"}">${save.mode === "story" ? "重看本章剧情" : "重开本章"}</button></div>
      <p class="helper">重看剧情或重开本章会清空本次排班、草稿和练习，从第一班开始；已有星级与独立成绩保留。切换模式保留当前进度。</p>
      ${learning ? renderGuide(save.guide, mission, session, error) : `<p class="introduction">${h(mission.introduction)}</p>
      <div class="ledger"><div><span>白帆可用现金</span><strong>${fmt(session.cash[0])}<small> 金币</small></strong></div><div><span>岑舟可用现金</span><strong>${fmt(session.cash[1])}<small> 金币</small></strong></div>
        <div><span>${repeated ? "长期期望收益" : "累计净收入"}</span><strong>${fmt(session.total[0])}<small> / ${mission.goal}</small></strong></div>
        <div><span>当前班次</span><strong>${step + 1}<small> / ${mission.rounds.length}</small></strong></div></div>
      ${save.review ? review() : `<div class="workspace"><section class="situation"><h2 id="round-title" tabindex="-1">${h(round.title)}</h2><p>${h(round.briefing)}</p>
        ${mission.teaching && save.mode === "desk" ? `<p class="teaching"><strong>何芮的便签</strong>${h(mission.teaching)}</p>` : ""}
        ${harbor(save.draft.action)}
        <div class="objective"><strong>本章交班条件</strong><p>你的${repeated ? "期望" : "净"}收入至少 ${mission.goal}${repeated ? "" : " 金币"}${mission.cooperation ? `，完成 ${mission.cooperation} 班稳定合作。稳定合作要求双方实际错峰，且谁违约都不能赚得更多；单次互动中，守约须严格更有利` : ""}。达到条件得两星；累计冻结保证金不超过 ${mission.depositTarget} 得三星。</p></div>
        <details class="matrix-detail" id="matrix" ${mission.id <= 2 ? "open" : ""}><summary>${save.draft.contract ? "合同获接受后的净收益表" : "展开双方收益表"}</summary>
          ${matrixTable(contractMatrix(round, validPlan(save.draft) ? save.draft : defaultPlan()))}
          <p class="helper">表中显示当班净收益，退还保证金不算收入。${save.draft.contract ? "若岑舟拒签，双方改取替代航线收益，不按这张表结算。" : "没有合同，不扣保证金或手续费。"}</p>
        </details>${conditions(round)}
      </section>${controls(round)}</div>`}
      <details class="history" id="history"><summary>航运记录 <span>${session.history.length} 班已结算</span></summary>
        ${session.history.length ? session.history.map((item, index) => `<div class="history-row"><strong>${index + 1}. ${h(mission.rounds[index].title)}</strong><span>${item.plan.contract ? `保证金 ${item.plan.deposit} · 分账 ${item.plan.transfer}` : item.plan.reciprocal ? "长期互惠" : "无合同"}</span><span>${item.plan.contract && !item.accepted ? "拒签，替代航线" : `${actionName(item.plan.action)} / ${actionName(item.opponent)}`}</span><b>${signed(item.payoff[0])} / ${signed(item.payoff[1])}</b>
          <span>现金 ${index ? session.history[index - 1].cash.join(" / ") : mission.cash.join(" / ")} → ${item.cash.join(" / ")}</span><span>${item.accepted ? `每方手续费 ${mission.rounds[index].fee}；保证金按行动退还或没收。` : "无签约支出。"}周转金不扣除。</span>
          <span>面对守约的对方，你守约 / 违约 ${fmt(item.cooperation[0])} / ${fmt(item.deviation[0])}；岑舟 ${fmt(item.cooperation[1])} / ${fmt(item.deviation[1])}。</span>
          <details><summary>回看本班原始条件与签约结果</summary><p>${h(mission.rounds[index].briefing)}</p><p>签约前须留周转金 ${mission.rounds[index].reserve.join(" / ")}，每方手续费 ${mission.rounds[index].fee}；替代航线收入 ${mission.rounds[index].outside.join(" / ")}。各组数字为你 / 岑舟，单位为金币。</p>${matrixTable(mission.rounds[index].matrix)}<p>${h(item.reason)}</p></details></div>`).join("") : "<p>还没有靠港记录。提交排班后，这里会保留双方行动、合同与收益。</p>"}
      </details>`}
    </main><footer>潮汐港：合约与对手 <span>当前版本：8 章入门与独立练习 · 本地计算 · 无需注册</span></footer></div>`;
  for (const item of app.querySelectorAll<HTMLDetailsElement>("details[id]")) if (detailStates.has(item.id)) item.open = detailStates.get(item.id)!;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}
desktop.addEventListener("change", (event) => {
  const chapters = app.querySelector<HTMLDetailsElement>("#chapters");
  if (chapters) chapters.open = event.matches;
});
function start(id: number): void {
  const mission = MISSIONS.find((item) => item.id === id);
  if (!mission) return;
  save = { ...save, activeId: id, session: createSession(mission), draft: defaultPlan(), hintLevel: 0, review: false, guide: freshGuide() };
  error = "";
  persist(); render();
  document.querySelector<HTMLElement>("h1")?.scrollIntoView({ block: "start" });
}
function updateInput(event: Event): void {
  const input = event.target;
  if ((input instanceof HTMLInputElement || input instanceof HTMLSelectElement) && input.id.startsWith("guide-")) {
    if (!guiding()) return;
    if (input.id === "guide-deposit") save.guide.deposit = input.value === "" ? NaN : Number(input.value);
    else if (input.id === "guide-transfer") save.guide.transfer = input.value === "" ? NaN : Number(input.value);
    else if (input.id === "guide-probability") save.guide.probability = Number(input.value);
    else return;
    save.guide.tested = false; error = ""; persist(); render(); return;
  }
  if (!(input instanceof HTMLInputElement)) return;
  if (guiding()) return;
  if (input.id === "contract") {
    save.draft.contract = input.checked;
    if (!input.checked) { save.draft.deposit = 0; save.draft.transfer = 0; }
  } else if (input.id === "reciprocal") save.draft.reciprocal = input.checked;
  else if (input.id === "deposit") save.draft.deposit = input.value === "" ? NaN : Number(input.value);
  else if (input.id === "transfer") save.draft.transfer = input.value === "" ? NaN : Number(input.value);
  else if (input.name === "action") save.draft.action = input.value === "rush" ? "rush" : "cooperate";
  else return;
  error = planError(save.session, MISSIONS[save.activeId - 1], save.draft) ?? "";
  persist(); render();
}
const numericFields = ["deposit", "transfer", "guide-deposit", "guide-transfer"];
app.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement && numericFields.includes(event.target.id)) updateInput(event);
});
app.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && numericFields.includes(event.target.id)) return;
  updateInput(event);
});
app.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button) return;
  if (button.dataset.mission) { start(Number(button.dataset.mission)); return; }
  if (button.dataset.open) { openWorkshop(button.dataset.open); return; }
  if (button.dataset.command === "mode") {
    save.mode = save.mode === "story" ? "desk" : "story";
    error = ""; persist(); render(); return;
  }
  if (button.dataset.command === "replay") { save.mode = "story"; start(save.activeId); return; }
  if (button.dataset.command === "restart") { start(save.activeId); return; }
  if (button.dataset.answer || button.dataset.command?.startsWith("guide-")) {
    if (!guiding()) return;
    const mission = MISSIONS[save.activeId - 1];
    if (button.dataset.answer === "cooperate" || button.dataset.answer === "rush") save.guide.answer = button.dataset.answer;
    else if (button.dataset.command === "guide-test") error = testGuide(save.guide, mission, save.session) ?? "";
    else if (button.dataset.command === "guide-next") { advanceGuide(save.guide, mission, save.session); error = ""; }
    persist(); render();
    if (button.dataset.command === "guide-next") document.getElementById("guide-title")?.focus();
    return;
  }
  if (button.dataset.command === "hint") {
    save.hintLevel = Math.min(3, save.hintLevel + 1); save.session.hinted = true;
  } else if (button.dataset.command === "next") {
    save.review = false; save.draft = defaultPlan(); error = "";
  } else if (button.dataset.command === "settle") {
    if (guiding()) return;
    error = planError(save.session, MISSIONS[save.activeId - 1], save.draft) ?? "";
    if (error) { render(); document.getElementById("plan-error")?.focus(); return; }
    save.session = settle(save.session, MISSIONS[save.activeId - 1], save.draft);
    save.review = true; recordScore(save);
  } else return;
  persist(); render();
  if (save.review) document.getElementById("result-title")?.focus();
  else if (button.dataset.command === "next") document.getElementById("round-title")?.focus();
});

let labPlan: Plan = { ...defaultPlan(), contract: true };
let labRepeated = false;
let labProbability = 0.75;
function labResult(): string {
  const round: Round = { ...MISSIONS[0].rounds[0], ...(labRepeated ? { continuation: labProbability } : {}) };
  const analysis: Analysis = analyze(round, [100, 100], labRepeated
    ? { ...defaultPlan(), reciprocal: true } : labPlan);
  return `${matrixTable(analysis.matrix, true)}
    <div class="lab-comparison"><div><h3>白帆的收入比较</h3><p>${labRepeated ? "持续" : "双方"}合作 <strong>${fmt(analysis.cooperation[0])}</strong><br>单独违约${labRepeated ? "一次" : ""} <strong>${fmt(analysis.deviation[0])}</strong></p></div>
    <div><h3>岑舟的收入比较</h3><p>${labRepeated ? "持续" : "双方"}合作 <strong>${fmt(analysis.cooperation[1])}</strong><br>单独违约${labRepeated ? "一次" : ""} <strong>${fmt(analysis.deviation[1])}</strong></p></div></div>
    <p class="lab-verdict">${analysis.stable ? "对双方来说，单独违约都不会赚得更多。" : "至少一方的合作收益还没达到本次实验要求。单次互动须严格高于违约收益，长期互惠允许相等。"}${labRepeated && Math.abs(labProbability - 0.5) < 1e-9 ? " p = 0.5 时，合作与违约收益相等，处于弱激励边界。" : ""}</p>
    ${labRepeated ? formulaExplanation(labProbability) : `<p>${h(analysis.reason)}</p>`}
    <p class="helper">“纳什均衡”表示谁都不能只改自己的行动来赚更多，表中标签只针对单轮。长期互惠要另看上面的长期收入比较。</p>
    <p class="helper">实验台用来试条件，正式关卡仍需自己排班。这里的操作不会改变现金、成绩或提示记录。</p>`;
}
function openWorkshop(mode: string): void {
  dialog.innerHTML = `<div class="dialog-header"><h2 id="workshop-title">${mode === "lab" ? "博弈实验台" : "航运手册"}</h2><button type="button" data-close aria-label="关闭窗口">关闭</button></div>
    ${mode === "lab" ? `<p>这里使用第一章的标准收益表，金币表示一班的收入。保证金守约退还、违约没收；分账只在双方错峰时转账，正数由你付给岑舟，负数相反。试着改条件，看合作和单方违约的收入怎么变。实验中的可用现金均为 100，不代表正式任务。</p>
      <label for="lab-mode">实验类型<select id="lab-mode"><option value="single" ${!labRepeated ? "selected" : ""}>单次互动与合同</option><option value="repeat" ${labRepeated ? "selected" : ""}>随机延续的长期互惠</option></select></label>
      <div class="lab-fields" id="lab-fields">${labControls()}</div><div id="lab-result">${labResult()}</div>`
      : MANUAL.map(([title, text]) => `<section class="manual-entry"><h3>${h(title)}</h3><p>${h(text)}</p></section>`).join("")}`;
  dialog.showModal();
}
function labControls(): string {
  return labRepeated ? `<label for="lab-p">每班结束后，再来一班的概率 p<select id="lab-p">${Array.from({ length: 20 }, (_, index) => index * 0.05).map((p) => `<option value="${p}" ${Math.abs(p - labProbability) < 1e-9 ? "selected" : ""}>${Math.round(p * 100)}%</option>`).join("")}</select></label>`
    : `<label for="lab-deposit">每方保证金<select id="lab-deposit">${Array.from({ length: 13 }, (_, amount) => `<option ${labPlan.deposit === amount ? "selected" : ""}>${amount}</option>`).join("")}</select></label><label for="lab-transfer">合作分账<select id="lab-transfer">${Array.from({ length: 9 }, (_, index) => index - 4).map((amount) => `<option ${labPlan.transfer === amount ? "selected" : ""}>${amount}</option>`).join("")}</select></label>`;
}
dialog.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("[data-close]") || event.target === dialog) dialog.close();
});
dialog.addEventListener("change", (event) => {
  const input = event.target as HTMLSelectElement;
  if (input.id === "lab-mode") {
    labRepeated = input.value === "repeat";
    dialog.querySelector("#lab-fields")!.innerHTML = labControls();
  } else if (input.id === "lab-p") labProbability = Number(input.value);
  else if (input.id === "lab-deposit") labPlan.deposit = Number(input.value);
  else if (input.id === "lab-transfer") labPlan.transfer = Number(input.value);
  dialog.querySelector("#lab-result")!.innerHTML = labResult();
});
persist();
render();
if (storageFailed) notice.textContent = "浏览器未能保存进度。你可以继续玩，但刷新页面可能丢失进度。";
