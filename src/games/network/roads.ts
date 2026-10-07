import type { Edge, Place, Route } from "./engine.js";

export const place = (id: string, name: string, x: number, y: number, need?: number, reply?: string): Place => ({ id, name, x, y, need, reply });
export const edge = (from: string, to: string, capacity: number, cost = 1, curve?: number): Edge => ({ id: `${from}${to}`, from, to, capacity, cost, ...(curve === undefined ? {} : { curve }) });
export const route = (nodes: string, amount: number): Route => ({ nodes: nodes.split(""), amount });

export function reverseRoadPath(x1: number, y1: number, x2: number, y2: number, bend: number): string {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const offsetX = (y1 - y2) / length * 9;
  const offsetY = (x2 - x1) / length * 9;
  return `M${x2 + offsetX} ${y2 + offsetY} Q${(x1 + x2) / 2 + offsetX} ${(y1 + y2) / 2 + bend + offsetY} ${x1 + offsetX} ${y1 + offsetY}`;
}
