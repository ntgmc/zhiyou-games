import { escapeHtml as h } from "../../shared/html.js";
import { actionName, analyze, createSession, defaultPlan, planError, settle } from "./engine.js";
import type { Action, Mission, Plan, Session } from "./engine.js";

export interface Guide {
  step: number;
  answer: Action | null;
  deposit: number;
  transfer: number;
  probability: number;
  tested: boolean;
}
export type GuideStep = "arrival" | "compare-cooperate" | "compare-rush" | "deposit" | "transfer" | "cash" | "future" | "ending" | "quota" | "dispatch";
const STEPS: Record<number, readonly GuideStep[]> = {
  1: ["arrival", "compare-cooperate", "compare-rush"],
  2: ["arrival", "deposit"],
  3: ["arrival"],
  4: ["arrival", "transfer"],
  5: ["arrival", "cash"],
  6: ["arrival", "future"],
  7: ["arrival", "ending"],
  8: ["arrival"],
  11: ["arrival", "quota"],
};
const fmt = (amount: number): string => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(amount);
export const freshGuide = (): Guide => ({ step: 0, answer: null, deposit: 0, transfer: 0, probability: 0.75, tested: false });
export const guideLength = (id: number): number => (STEPS[id] ?? ["arrival"]).length;
export function readGuide(value: unknown, id: number, ongoing: boolean): Guide {
  const guide = freshGuide();
  if (!value || typeof value !== "object") return { ...guide, step: ongoing ? guideLength(id) : 0 };
  const data = value as Partial<Guide>;
  guide.step = Number.isInteger(data.step) ? Math.max(0, Math.min(data.step!, guideLength(id))) : 0;
  guide.answer = data.answer === "rush" || data.answer === "cooperate" ? data.answer : null;
  const validDeposit = Number.isInteger(data.deposit) && data.deposit! >= 0 && data.deposit! <= 12;
  const validTransfer = Number.isInteger(data.transfer) && data.transfer! >= -4 && data.transfer! <= 4;
  const validProbability = typeof data.probability === "number" && [0.25, 0.5, 0.75].includes(data.probability);
  if (validDeposit) guide.deposit = data.deposit!;
  if (validTransfer) guide.transfer = data.transfer!;
  if (validProbability) guide.probability = data.probability!;
  guide.tested = data.tested === true && validDeposit && validTransfer && validProbability;
  return guide;
}
export function guideStep(guide: Guide, mission: Mission, session: Session): GuideStep {
  return session.history.length ? "dispatch" : (STEPS[mission.id] ?? ["arrival"])[guide.step] ?? "dispatch";
}
export function canAdvance(guide: Guide, mission: Mission, session: Session): boolean {
  const step = guideStep(guide, mission, session);
  if (step === "arrival") return true;
  if (step === "dispatch") return false;
  if (step === "compare-cooperate" || step === "compare-rush") {
    if (!guide.answer) return false;
    const col = step === "compare-cooperate" ? 0 : 1;
    const row = guide.answer === "cooperate" ? 0 : 1;
    return mission.rounds[0].matrix[row * 2 + col][0] >= mission.rounds[0].matrix[(1 - row) * 2 + col][0];
  }
  return guide.tested;
}
export function advanceGuide(guide: Guide, mission: Mission, session: Session): boolean {
  if (!canAdvance(guide, mission, session)) return false;
  guide.step++;
  guide.answer = null;
  guide.tested = false;
  return true;
}
export function testGuide(guide: Guide, mission: Mission, session: Session): string | null {
  guide.tested = false;
  const step = guideStep(guide, mission, session);
  if (!["deposit", "transfer", "cash", "future", "ending", "quota"].includes(step)) return "这一步先按对话完成比较。";
  if (step === "future" && ![0.25, 0.5, 0.75].includes(guide.probability)) return "请选择 25%、50% 或 75% 的延续概率。";
  const plan: Plan = { ...defaultPlan(), contract: step !== "future" && step !== "ending", deposit: step === "deposit" || step === "cash" || step === "quota" ? guide.deposit : 0,
    transfer: step === "transfer" ? guide.transfer : 0, reciprocal: step === "future" };
  const error = planError(session, mission, plan);
  if (error) return error;
  guide.tested = true;
  return null;
}
export function formulaExplanation(p = 0.75): string {
  return `<p>p 表示一班结束后还能再来一班的概率。${Math.round(p * 100)}% 就是 100 次这样的机会中，平均约 ${Math.round(p * 100)} 次能继续，不保证某次一定有下一班。</p>
    <p>“期望收益”是按这些机会计算的长期平均收入，不是已经到账的钱。R 是双方错峰时你每班赚的金币，T 是你抢先、对方错峰时赚的金币，P 是双方抢先时每班赚的金币。标准表中 R = 6、T = 9、P = 3。</p>
    <details class="formula"><summary>看长期收入怎么算</summary><p>合作的收入依次为 R、pR、p²R……，合计 R / (1 − p)。违约一次先赚 T，之后双方一直抢先，合计 T + pP / (1 − p)。</p>
    <p>代入 p = ${p}：合作 6 / (1 − ${p}) = ${fmt(6 / (1 - p))} 金币；违约 9 + ${p} × 3 / (1 − ${p}) = ${fmt(9 + p * 3 / (1 - p))} 金币。</p>
    <p>这里每班收益与延续概率不变，延续机会相互独立，双方看得见行动，按期望收入比较，不额外折现。双方一直抢先本身也必须是没人愿意单独改变的后续均衡。该公式不适用于任意合作约定。</p></details>`;
}
export function renderGuide(guide: Guide, mission: Mission, session: Session, error: string): string {
  const step = guideStep(guide, mission, session);
  const round = mission.rounds[0];
  const deposit = Number.isFinite(guide.deposit) ? guide.deposit : "";
  const transfer = Number.isFinite(guide.transfer) ? guide.transfer : "";
  let title = "";
  let text = "";
  let task = "";
  if (step === "arrival") {
    title = mission.title;
    text = mission.introduction;
    task = `<p>${mission.id === 1 ? "何芮：每班你可以选“错峰”，为另一支船队留出靠港时段；也可以“抢先”，争取早班。两人的选择一起决定各赚多少，收益就是这班赚到的金币。这种双方选择互相影响的情形，叫“博弈”。先只看岑舟错峰时的两种结果。"
      : mission.id === 3 ? "何芮：同一种行动，两边赚到的金币可能不同，这叫“非对称收益”。这次由你排班，别沿用昨天的数。订单、后续条件和记录都能查，需要帮忙时再打开提示。"
      : mission.id === 8 || mission.id >= 9 && mission.id !== 11 ? "何芮：这次由你排班。订单、后续条件和记录都能查，合同与行动由你决定。需要帮忙时，再打开提示。"
      : "何芮：先在纸上试算眼前的新条件，算完再排正式班次。练习不会动用现金，也不影响星级或独立成绩。"}</p>`;
  } else if (step === "compare-cooperate" || step === "compare-rush") {
    const col = step === "compare-cooperate" ? 0 : 1;
    const best = Math.max(round.matrix[col][0], round.matrix[2 + col][0]);
    title = `岑舟${col === 0 ? "错峰" : "抢先"}，你怎样回应？`;
    text = col === 0 ? "何芮：先固定岑舟的选择，只比较你自己的两种行动。你选哪一种，赚到的金币更多？" : "何芮：再换一个假设。岑舟抢先时，你的两种收入也换了。仍然只选对自己更划算的行动。";
    task = `<div class="guide-options">${(["cooperate", "rush"] as const).map((action, row) => `<button type="button" data-answer="${action}" aria-pressed="${guide.answer === action}">${actionName(action)} · 赚 ${round.matrix[row * 2 + col][0]} 金币</button>`).join("")}</div>
      <p role="status">${!guide.answer ? "选一种行动，看看你的比较结果。" : canAdvance(guide, mission, session)
        ? col === 0 ? `对，${best} 更多。固定对方的行动，选自己收益最高的行动，叫“最佳回应”。`
          : "两次比较中，抢先都更有利。无论对方选什么都严格更好的行动，叫“严格占优策略”。双方各自提交后才一起揭晓，岑舟不会偷看你的选择。"
        : `再比较一下，${best} 金币比另一种结果多。看自己的收入，不把岑舟的收入加进来。`}</p>`;
  } else if (step === "deposit") {
    title = "保证金怎样改变违约收入？";
    text = "何芮：昨天双方都抢先，各赚 3。谁单独改成错峰，反而只赚 1，所以没人愿意单独改。这叫“纳什均衡”，即谁都无法只改自己的行动赚更多，可两边一起错峰本来能各赚 6。试着冻结一笔保证金：守约当班退，抢先没收。港务处能执行这项约定，所以它是“可执行承诺”。";
    task = `<label for="guide-deposit">试算每方保证金<input id="guide-deposit" type="number" min="0" max="12" step="1" value="${deposit}"></label><p>改金额，再点击“试算”。比较对方错峰时，你守约和违约各赚多少。岑舟也按同样的规则算；两种收益相等时，他仍会抢先。</p>`;
  } else if (step === "transfer") {
    title = "他愿意签，签了又愿不愿守约？";
    text = "何芮：替代航线是岑舟不签合同时能去的地方，能赚 8。先让双方错峰时他的净收入至少达到 8，他才愿意签。这叫“参与约束”。签了以后，还要让守约比单独违约划算，这叫“激励约束”。先试分账，看两项检查为何不同。";
    task = `<label for="guide-transfer">双方错峰时的分账<input id="guide-transfer" type="number" min="-4" max="4" step="1" value="${transfer}"></label><p>正数表示你付给岑舟，负数表示他付给你。只有双方错峰才转账。这次试算先不交保证金，只观察分账的影响。</p>`;
  } else if (step === "cash") {
    title = "账上的钱够签两班吗？";
    text = "何芮：可用现金是现在能拿来签约的钱。第一班双方各有 9，要冻结保证金、付 1 手续费，再留 5 运营周转金。周转金是必须留在账上的最低余额，不会扣掉；手续费不会退。第一班净收入还会影响第二班能交多少。先试算一班。";
    task = `<label for="guide-deposit">第一班试交的保证金<input id="guide-deposit" type="number" min="0" max="12" step="1" value="${deposit}"></label><p>签约所需现金 = 保证金 + 手续费 + 运营周转金。第二班手续费 1、周转金 6；先观察试算后双方各剩多少，再自己规划两班。</p>`;
  } else if (step === "future") {
    title = "把以后的收入也算进来";
    text = "何芮：只交手一次叫单次博弈，可能继续交手叫重复博弈。岑舟的长期互惠约定是：先错峰，只要有人抢先，以后双方一直抢先。未来少赚的钱可能让今天的抢先不划算。试试改变再来一班的概率。";
    task = `${formulaExplanation(guide.probability)}<label for="guide-probability">再来一班的概率<select id="guide-probability">${[0.25, 0.5, 0.75].map(p => `<option value="${p}" ${guide.probability === p ? "selected" : ""}>${p * 100}%</option>`).join("")}</select></label>`;
  } else if (step === "ending") {
    title = "最后一班，还能用下一班约束吗？";
    text = "何芮：这是固定两班的有限博弈，双方都知道什么时候结束。先从最后一班往前想，这叫“逆向归纳”。最后一班再也没有下一班，抢先后少赚的未来收入为零。港务处当班能没收保证金，让约定有实际后果，这样的安排叫“可信承诺”。先看看没有合同时，岑舟会怎么选。";
    task = "<p>在标准收益表里，无论你错峰还是抢先，岑舟抢先都赚得更多。这里假设双方完全理性，结束时间与这些条件是“共同知识”：双方都知道，也知道对方知道，如此反复。最后一班的未来惩罚无法支撑合作；港务处当班没收保证金仍然能执行。点击试算，看看没有合同的最后一班。</p>";
  } else if (step === "quota") {
    title = "退回现金，登记额度会退吗？";
    text = "何芮：这一章每方最多累计登记 14。签一份保证金 4 的合同，就登记 4；下一份登记 5，累计便是 9。守约退回的是现金，登记过的额度不恢复。岑舟拒签则不登记、不支付手续费。先试一笔登记，观察剩余容量。";
    task = `<label for="guide-deposit">第一班试登记的保证金<input id="guide-deposit" type="number" min="0" max="12" step="1" value="${deposit}"></label><p>登记额度是全程约束，账户现金是当前约束。练习不会真正占用额度，正式排班仍须你自己安排。</p>`;
  }
  if (guide.tested) {
    if (step === "future") {
      const result = analyze({ ...round, continuation: guide.probability }, session.cash, { ...defaultPlan(), reciprocal: true });
      task += `<p class="experiment-result" role="status">双方持续合作各期望赚 ${fmt(result.cooperation[0])}，违约一次各期望赚 ${fmt(result.deviation[0])}。${result.stable ? "违约不能多赚，长期互惠有合作激励。" : "违约仍能多赚，这个延续概率还不足以维持合作。"}${guide.probability === 0.5 ? "此时两者相等，只是弱激励边界。" : ""}</p>`;
    } else {
      const plan = { ...defaultPlan(), contract: step !== "ending", deposit: step === "deposit" || step === "cash" || step === "quota" ? guide.deposit : 0, transfer: step === "transfer" ? guide.transfer : 0 };
      const result = analyze(round, session.cash, plan);
      const simulated = settle(createSession(mission), mission, plan);
      task += `<div class="experiment-result" role="status"><p>${h(result.reason)}</p><p>合同${result.accepted ? "接受后" : "未执行时"}，面对错峰的对方，你守约赚 ${fmt(result.cooperation[0])}、违约赚 ${fmt(result.deviation[0])}；岑舟守约赚 ${fmt(result.cooperation[1])}、违约赚 ${fmt(result.deviation[1])}。</p>
        <p>按你错峰试算，岑舟会${actionName(result.opponent)}。${step === "quota" ? `该试算${result.accepted ? `登记 ${guide.deposit}` : "没有登记"}，剩余额度 ${mission.depositLimit! - simulated.deposits}。${result.accepted ? "你的保证金当班退还，登记额度仍保持占用。" : "拒签没有占用登记额度。"}下一班须在剩余额度和双方可用现金内申请。` : step === "cash" ? `试算后现金为 ${simulated.cash.join(" / ")}，第二班至少须有“保证金 + 1 + 6”。` : step === "transfer" ? "愿意签约与愿意守约是两回事，正式排班时还要考虑保证金。" : step === "ending" ? "有限终点使下一班惩罚失效，可执行的合同仍能改变当班收益。" : "保证金不增加守约收入，但会减少违约收入。正式排班时，用双方的比较决定金额。"}</p></div>`;
    }
  }
  const experiment = ["deposit", "transfer", "cash", "future", "ending", "quota"].includes(step);
  return `<section class="story-panel" aria-labelledby="guide-title"><p class="chapter-kicker">港务处 · ${guide.step + 1} / ${guideLength(mission.id)}</p><h2 id="guide-title" tabindex="-1">${h(title)}</h2>
    <p>${h(text)}</p><div class="story-task">${task}</div><p class="error" id="guide-error" role="alert">${h(error)}</p>
    ${experiment ? '<button type="button" data-command="guide-test">试算这一步</button>' : ""}
    <button type="button" class="primary" data-command="guide-next" ${canAdvance(guide, mission, session) ? "" : "disabled"}>${guide.step + 1 === guideLength(mission.id) ? "接下订单，自主排班" : "继续看下一步"} →</button>
    <p class="helper">剧情步骤和练习会自动保存。练习不改变正式排班草稿、现金或提示记录。</p></section>`;
}
