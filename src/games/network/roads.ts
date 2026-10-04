import type { Edge, Place, Route } from "./engine.js";

export const place = (id: string, name: string, x: number, y: number, need?: number, reply?: string): Place => ({ id, name, x, y, need, reply });
export const edge = (from: string, to: string, capacity: number, cost = 1, curve?: number): Edge => ({ id: `${from}${to}`, from, to, capacity, cost, ...(curve === undefined ? {} : { curve }) });
export const route = (nodes: string, amount: number): Route => ({ nodes: nodes.split(""), amount });
