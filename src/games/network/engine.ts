export interface Place {
  id: string;
  name: string;
  x: number;
  y: number;
  need?: number;
  reply?: string;
}
export interface Edge {
  id: string;
  from: string;
  to: string;
  capacity: number;
  cost: number;
  curve?: number;
}
export interface Route {
  nodes: string[];
  amount: number;
}
export interface Mission {
  id: number;
  title: string;
  concept: string;
  opening: string;
  places: readonly Place[];
  edges: readonly Edge[];
  source: string;
  supply: number;
  budget: number;
  efficient: number;
  costGoal?: number;
  certificate?: boolean;
  seed?: readonly Route[];
  reference: readonly Route[];
  referenceCut?: readonly string[];
  hints: readonly [string, string, string];
  recap: string;
}
export interface Analysis {
  flow: Record<string, number>;
  delivered: Record<string, number>;
  total: number;
  cost: number;
  errors: string[];
}
export interface Cut {
  capacity: number;
  edges: string[];
}
export interface Result {
  passed: boolean;
  stars: number;
  analysis: Analysis;
  cut: Cut | null;
  failures: string[];
}
export interface Move {
  code: string;
  from: string;
  to: string;
  available: number;
  cost: number;
  reverse: boolean;
}
export const placeName = (mission: Mission, id: string): string => mission.places.find((place) => place.id === id)?.name ?? id;
export const targets = (mission: Mission): readonly Place[] => mission.places.filter((place) => (place.need ?? 0) > 0);
export const cloneRoutes = (routes: readonly Route[]): Route[] => routes.map((route) => ({ nodes: [...route.nodes], amount: route.amount }));

export function routeError(mission: Mission, value: unknown): string | null {
  if (!value || typeof value !== "object") return "未能读取这条路线，请重新选择。";
  const route = value as Route;
  if (!Array.isArray(route.nodes) || route.nodes.length < 2 || route.nodes.length > mission.places.length
    || !route.nodes.every((id) => typeof id === "string" && mission.places.some((place) => place.id === id))
    || new Set(route.nodes).size !== route.nodes.length) return "路线要从总仓选到接收站，途中不能重复经过同一地点。";
  if (!Number.isInteger(route.amount) || route.amount < 1 || route.amount > 100) return "请输入 1 到 100 之间的整数箱数。";
  if (route.nodes[0] !== mission.source || !targets(mission).some((place) => place.id === route.nodes.at(-1))) {
    return "路线必须从总仓出发，到接收站结束。";
  }
  for (let i = 1; i < route.nodes.length; i++) {
    if (targets(mission).some((place) => place.id === route.nodes[i - 1])) return "到达接收站后，这条路线就结束了，不能继续经过其他地点。";
    if (!mission.edges.some((edge) => edge.from === route.nodes[i - 1] && edge.to === route.nodes[i])) return "这两个地点之间没有可用的正向通道，请沿箭头选路。";
  }
  return null;
}

export function analyze(mission: Mission, routes: readonly Route[]): Analysis {
  const analysis: Analysis = {
    flow: Object.fromEntries(mission.edges.map((edge) => [edge.id, 0])),
    delivered: Object.fromEntries(targets(mission).map((place) => [place.id, 0])),
    total: 0, cost: 0, errors: [],
  };
  if (!Array.isArray(routes) || routes.length > 64) {
    analysis.errors.push("未能读取运输计划，或路线超过 64 条。请删去多余路线后重新安排。");
    return analysis;
  }
  for (const route of routes) {
    const error = routeError(mission, route);
    if (error) { analysis.errors.push(error); continue; }
    for (let i = 1; i < route.nodes.length; i++) {
      const edge = mission.edges.find((item) => item.from === route.nodes[i - 1] && item.to === route.nodes[i])!;
      analysis.flow[edge.id] += route.amount;
      analysis.cost += route.amount * edge.cost;
    }
    analysis.delivered[route.nodes.at(-1)!] += route.amount;
    analysis.total += route.amount;
  }
  for (const edge of mission.edges) {
    if (analysis.flow[edge.id] > edge.capacity) {
      analysis.errors.push(`${placeName(mission, edge.from)} → ${placeName(mission, edge.to)}安排了 ${analysis.flow[edge.id]} 箱，容量只有 ${edge.capacity} 箱。`);
    }
  }
  if (analysis.total > mission.supply) analysis.errors.push(`总仓只有 ${mission.supply} 箱，计划却安排了 ${analysis.total} 箱。请减少箱数。`);
  if (analysis.cost > mission.budget) analysis.errors.push(`运输费用 ${analysis.cost} 点，超过 ${mission.budget} 点预算。`);
  return analysis;
}

export function cutFor(mission: Mission, side: readonly string[]): Cut | null {
  if (!Array.isArray(side) || new Set(side).size !== side.length || !side.includes(mission.source)
    || side.some((id) => !mission.places.some((place) => place.id === id))
    || targets(mission).length !== 1 || targets(mission).some((place) => side.includes(place.id))) return null;
  const crossing = mission.edges.filter((edge) => side.includes(edge.from) && !side.includes(edge.to));
  return { capacity: crossing.reduce((sum, edge) => sum + edge.capacity, 0), edges: crossing.map((edge) => edge.id) };
}

export function execute(mission: Mission, routes: readonly Route[], side: readonly string[]): Result {
  const analysis = analyze(mission, routes);
  if (analysis.errors.length) throw new Error(analysis.errors.join(" "));
  const failures = targets(mission).filter((place) => analysis.delivered[place.id] < place.need!).map((place) =>
    `${place.name}收到 ${analysis.delivered[place.id]} 箱，还缺 ${place.need! - analysis.delivered[place.id]} 箱。`);
  if (mission.costGoal !== undefined && analysis.cost > mission.costGoal) failures.push(`本章要求费用不超过 ${mission.costGoal} 点，当前花了 ${analysis.cost} 点。`);
  const cut = cutFor(mission, side);
  if (mission.certificate && (!cut || cut.capacity !== analysis.total)) {
    failures.push(cut ? `本班送达 ${analysis.total} 箱，分界容量是 ${cut.capacity} 箱。两者还不相等，无法证明已经达到最大运输量。请调整路线或分界选择。`
      : "分界要把总仓和接收站分到不同组，请重新选择与总仓同侧的地点。");
  }
  const passed = failures.length === 0;
  return { passed, stars: passed ? analysis.cost <= mission.efficient ? 3 : 2 : 0, analysis, cut, failures };
}

export function moves(mission: Mission, routes: readonly Route[], reverse: boolean): Move[] {
  const { flow } = analyze(mission, routes);
  return mission.edges.flatMap((edge): Move[] => {
    const result: Move[] = [];
    if (edge.capacity > flow[edge.id]) result.push({
      code: edge.id, from: edge.from, to: edge.to, available: edge.capacity - flow[edge.id], cost: edge.cost, reverse: false,
    });
    if (reverse && flow[edge.id] > 0) result.push({
      code: `-${edge.id}`, from: edge.to, to: edge.from, available: flow[edge.id], cost: -edge.cost, reverse: true,
    });
    return result;
  });
}

export function walk(mission: Mission, codes: readonly string[]): string[] | null {
  if (!Array.isArray(codes) || codes.length >= mission.places.length) return null;
  const nodes = [mission.source];
  for (const code of codes) {
    if (typeof code !== "string") return null;
    const edge = mission.edges.find((item) => item.id === code.replace(/^-/, ""));
    if (!edge) return null;
    const from = code.startsWith("-") ? edge.to : edge.from;
    const to = code.startsWith("-") ? edge.from : edge.to;
    if (from !== nodes.at(-1) || nodes.includes(to) || targets(mission).some((place) => place.id === from)) return null;
    nodes.push(to);
  }
  return nodes;
}

export function adjust(mission: Mission, routes: readonly Route[], codes: readonly string[], amount: number): Route[] {
  const analysis = analyze(mission, routes);
  if (analysis.errors.length) throw new Error("原计划已经超出容量、库存或预算。请先修改箱数或删除路线，再改排。");
  const nodes = walk(mission, codes);
  if (!nodes || !targets(mission).some((place) => place.id === nodes.at(-1))
    || !Number.isInteger(amount) || amount < 1 || amount > 100) {
    throw new Error("改排时也要从总仓选到接收站，并填写 1 到 100 之间的整数箱数。");
  }
  const available = moves(mission, routes, true);
  for (const code of codes) {
    const move = available.find((item) => item.code === code);
    if (!move || move.available < amount) throw new Error("这段通道不能增加或撤回这么多箱，请减少调整箱数。");
    analysis.flow[code.replace(/^-/, "")] += code.startsWith("-") ? -amount : amount;
  }
  // Decompose the adjusted flow back into ordinary delivery routes.
  const result: Route[] = [];
  const findPath = (from: string, visited: string[]): string[] | null => {
    if (targets(mission).some((place) => place.id === from)) return visited;
    for (const edge of mission.edges.filter((item) => item.from === from && analysis.flow[item.id] > 0)) {
      if (visited.includes(edge.to)) continue;
      const path = findPath(edge.to, [...visited, edge.to]);
      if (path) return path;
    }
    return null;
  };
  for (let path = findPath(mission.source, [mission.source]); path; path = findPath(mission.source, [mission.source])) {
    const edges = path.slice(1).map((to, i) => mission.edges.find((edge) => edge.from === path![i] && edge.to === to)!);
    const count = Math.min(...edges.map((edge) => analysis.flow[edge.id]));
    result.push({ nodes: path, amount: count });
    for (const edge of edges) analysis.flow[edge.id] -= count;
  }
  if (Object.values(analysis.flow).some((value) => value !== 0)) throw new Error("这次改排让部分箱子绕圈，无法组成完整的送货路线。请换一条调整路径。");
  const errors = analyze(mission, result).errors;
  if (errors.length) throw new Error(errors.join(" "));
  return result;
}
