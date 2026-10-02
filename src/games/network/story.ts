import { analyze, cutFor } from "./engine.js";
import type { Mission, Route } from "./engine.js";

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
    case "route": return "许衡：图上的地点能收发物资，图论里叫节点。连接地点的线叫边。箭头说明允许走的方向。点选总仓，再沿箭头到河岸站，把 1 箱加入草案。加入后还没有发出。";
    case "cost": return "许衡：每箱走过一段通道都要付费用，“点”是本班统一的经费单位。路线的费用逐段相加。地图上的远近只是排版；找最便宜的路线，在图论里叫按费用求最短路径。选一条完整路线，把 1 箱加入草案，看看总费用。";
    case "capacity": return "许衡：容量是一条通道在这一班最多能过的箱数。北站的进站通道能过 3 箱，出站的桥只有 2 箱。先试试一口气安排 3 箱会发生什么。中转点不会凭空增减箱子，收到多少、转出多少必须相等，这叫流量守恒。";
    case "flow": return "许衡：通道上实际安排的箱数叫流量。几条路线共用一段路，箱数要加在一起。最大流就是满足每段容量和中转平衡时，网络最多能送到的数量。先自己加两条路线，观察哪些通道共同承担运输。";
    case "residual": return "许衡：普通路线只显示还能增加的通道。切到“调整草案”，你也能选择撤回已有安排。可增加与可撤回的通道合起来叫残量网络。撤回北站到南站的安排，会在调整路径里表现为南站回到北站。它修改尚未发出的调度单，货物没有逆向行驶。用一次包含撤回的调整，增加交付量。";
    case "cut": return "许衡：把地点分成两侧，总仓在一侧，河岸站在另一侧，这个分界叫割。所有从总仓侧跨出的通道容量相加，给出运输量的上限；反方向跨回来的通道不加入上限。上限最小的分界叫最小割。在地图下方勾选“总仓侧的地点”，找一个容量为 5 箱的分界。";
    default: return "";
  }
}
