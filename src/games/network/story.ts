import { analyze, cutFor } from "./engine.js";
import type { Mission, Route } from "./engine.js";
import { escapeHtml as h } from "../../shared/html.js";

export type Step = "arrival" | "route" | "cost" | "capacity" | "flow" | "residual" | "cut" | "dispatch";
const STEPS: readonly (readonly Step[])[] = [
  ["arrival", "route"], ["arrival", "cost"], ["arrival", "capacity"], ["arrival", "flow"],
  ["arrival", "residual"], ["arrival", "cut"], ["arrival"], ["arrival"],
];
export interface Guide { step: number; observed: boolean; reversed: boolean }
export const freshGuide = (): Guide => ({ step: 0, observed: false, reversed: false });
export const guideLength = (id: number): number => STEPS[id - 1].length;
export const guideStep = (guide: Guide, id: number): Step => STEPS[id - 1][guide.step] ?? "dispatch";
export function guideReady(guide: Guide, mission: Mission, routes: readonly Route[], side: readonly string[]): boolean {
  const analysis = analyze(mission, routes);
  switch (guideStep(guide, mission.id)) {
    case "arrival": return true;
    case "route": case "cost": return analysis.errors.length === 0 && analysis.total > 0;
    case "capacity": return guide.observed;
    case "flow": return analysis.errors.length === 0 && routes.length >= 2 && analysis.total > 0;
    case "residual": return guide.reversed && analysis.errors.length === 0 && analysis.total > 3;
    case "cut": return cutFor(mission, side)?.capacity === mission.places.find((place) => place.need)?.need;
    default: return false;
  }
}
export function advanceGuide(guide: Guide, mission: Mission, routes: readonly Route[], side: readonly string[]): boolean {
  if (!guideReady(guide, mission, routes, side)) return false;
  guide.step++;
  return true;
}
export function readGuide(value: unknown, id: number): Guide {
  const guide = freshGuide();
  if (!value || typeof value !== "object") return guide;
  const data = value as Guide;
  if (Number.isInteger(data.step) && data.step >= 0 && data.step <= guideLength(id)) guide.step = data.step;
  guide.observed = data.observed === true;
  guide.reversed = data.reversed === true;
  return guide;
}
export function guideText(step: Step): string {
  switch (step) {
    case "route": return "图上的每个地点叫“节点”，连接地点的线叫“边”。物资只能沿箭头方向运送。从总仓开始，依次选北站和河岸站，填 1 箱，再点“加入运输计划”。这一步只记下路线和箱数；最后点“执行本班运输”才会送货。";
    case "cost": return "每箱经过一段通道，都要付这段的费用。“点”是游戏里的经费单位。例如经北站送 1 箱，要花 1 + 2 = 3 点。这里说的“最短路径”就是总费用最低的路线，地图上画得近不代表便宜。先选一条路线，加入 1 箱，看看计划的总费用。";
    case "capacity": return "一条通道在本班最多能运多少箱，叫“容量”。总仓到北站能运 3 箱，北站到河岸站的桥却只能运 2 箱。先试着安排 3 箱，看看哪里超了。箱子经过中转站时，运进几箱就要运出几箱，这叫“流量守恒”。";
    case "flow": return "一条通道上安排的箱数叫“流量”。两条路线用到同一段路，箱数要加起来，合计不能超过容量。在每条通道都不超载、中转站进出箱数相等的条件下，最多能送到多少箱，叫“最大流”。先加两条路线，看看地图上的箱数怎么变。";
    case "residual": return "切到“改排路线”，就能撤回计划中某一段的安排。还能增加运输的通道，加上能撤回安排的通道，合起来叫“残量网络”。例如“撤回北站 → 南站”，会减少这段原定的箱数，腾出容量。图上的反向虚线只表示修改计划，箱子仍按原通道方向运输。选一条包含撤回操作的调整路径，试着增加总送达箱数。";
    case "cut": return "把地点分成两组，总仓在一组，河岸站在另一组，两组之间的分界叫“割”。补给必须穿过分界，所以从总仓这一组通向另一组的通道容量之和，就是运输量的上限。反方向的通道不计入这个和。容量最小的分界叫“最小割”。勾选“与总仓同侧的地点”，找出容量为 5 箱的分界。";
    default: return "";
  }
}

export function renderHints(mission: Mission, level: number, open: boolean): string {
  return `<section class="help" aria-label="本章提示"><button class="text-button" data-command="hint-toggle"
    aria-expanded="${open}" aria-controls="hint-content">${open ? "收起提示" : "查看提示"}</button>
    ${open ? `<div id="hint-content" class="hint-content">
      ${mission.hints.slice(0, level).map((hint, index) => `<div class="hint-step"><span>${["思考方向", "关键条件", "参考方案"][index]}</span><p>${h(hint)}</p></div>`).join("")}
      ${level < 3 ? `<button class="text-button" data-command="hint-next">${level === 1 ? "再看关键条件" : "查看参考方案"}</button>` : ""}
      <p class="muted">查看提示不扣星。本次会记为“参考提示通过”，以前的独立成绩保留。</p></div>` : ""}
    </section>`;
}
