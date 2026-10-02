export type Action = "cooperate" | "rush";
export type Pair = readonly [number, number];
export type Matrix = readonly [Pair, Pair, Pair, Pair];
export interface Round {
  title: string;
  briefing: string;
  matrix: Matrix;
  reserve: Pair;
  outside: Pair;
  fee: number;
  continuation?: number;
}
export interface Plan { contract: boolean; deposit: number; transfer: number; reciprocal: boolean; action: Action }
export interface Mission {
  id: number;
  title: string;
  concept: string;
  introduction: string;
  teaching?: string;
  cash: Pair;
  rounds: readonly Round[];
  contracts: boolean;
  transfers: boolean;
  goal: number;
  cooperation: number;
  depositTarget: number;
  hints: readonly [string, string, string];
  reference: readonly Plan[];
}
export interface Analysis {
  accepted: boolean;
  reason: string;
  matrix: Matrix;
  opponent: Action;
  cooperation: Pair;
  deviation: Pair;
  stable: boolean;
}
export interface Record {
  plan: Plan;
  opponent: Action;
  accepted: boolean;
  reason: string;
  payoff: Pair;
  alternative: number;
  cash: Pair;
  cooperation: Pair;
  deviation: Pair;
  stable: boolean;
}
export interface Session {
  missionId: number;
  step: number;
  cash: Pair;
  total: Pair;
  deposits: number;
  history: readonly Record[];
  status: "playing" | "won" | "lost";
  hinted: boolean;
}
export const ACTIONS: readonly Action[] = ["cooperate", "rush"];
export const actionName = (action: Action): string => action === "cooperate" ? "按约错峰" : "抢先靠港";
export const defaultPlan = (): Plan => ({ contract: false, deposit: 0, transfer: 0, reciprocal: false, action: "cooperate" });
export const createSession = (mission: Mission): Session => ({
  missionId: mission.id, step: 0, cash: mission.cash, total: [0, 0], deposits: 0, history: [], status: "playing", hinted: false,
});
export function validPlan(value: unknown): value is Plan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Plan;
  return typeof plan.contract === "boolean" && typeof plan.reciprocal === "boolean"
    && Number.isInteger(plan.deposit) && plan.deposit >= 0 && plan.deposit <= 12
    && Number.isInteger(plan.transfer) && plan.transfer >= -4 && plan.transfer <= 4
    && ACTIONS.includes(plan.action);
}
export function planError(session: Session, mission: Mission, plan: Plan): string | null {
  if (!validPlan(plan)) return "保证金须为 0～12 的整数，分账须为 −4～4 的整数。";
  if (session.missionId !== mission.id || session.status !== "playing" || !mission.rounds[session.step]) return "当前航段已经结算，请重新尝试或进入下一章。";
  const round = mission.rounds[session.step];
  if (plan.contract && (!mission.contracts || round.continuation !== undefined)) return "当前任务没有港务处合同，请取消合同选项。";
  if (!plan.contract && (plan.deposit !== 0 || plan.transfer !== 0)) return "保证金与分账需要先启用合同。";
  if (plan.transfer !== 0 && !mission.transfers) return "本章尚未开放合作分账。";
  if (plan.reciprocal && round.continuation === undefined) return "这一航段有明确终点，不能使用无限期合作方案。";
  if (plan.contract && session.cash[0] < plan.deposit + round.fee + round.reserve[0]) {
    return `你需要 ${plan.deposit + round.fee + round.reserve[0]} 金币（保证金 ${plan.deposit} + 手续费 ${round.fee} + 运营周转 ${round.reserve[0]}），目前只有 ${session.cash[0]}。降低保证金或重排方案。`;
  }
  return null;
}
export function contractMatrix(round: Round, plan: Plan): Matrix {
  return round.matrix.map((payoff, index) => payoff.map((amount, side) =>
    amount - (plan.contract ? round.fee : 0)
    - (plan.contract && ((side === 0 && index >= 2) || (side === 1 && index % 2 === 1)) ? plan.deposit : 0)
    + (plan.contract && index === 0 ? (side === 0 ? -plan.transfer : plan.transfer) : 0),
  ) as unknown as Pair) as unknown as Matrix;
}
export function analyze(round: Round, cash: Pair, plan: Plan): Analysis {
  const accepted = plan.contract && cash[1] >= plan.deposit + round.fee + round.reserve[1]
    && round.matrix[0][1] + plan.transfer - round.fee >= round.outside[1];
  const reason = !plan.contract ? "双方没有签署港务处合同。"
    : cash[1] < plan.deposit + round.fee + round.reserve[1] ? "岑舟拒签：冻结保证金后，运营周转资金不足。"
    : !accepted ? `岑舟拒签：守约净赚 ${round.matrix[0][1] + plan.transfer - round.fee}，另走航线能赚 ${round.outside[1]}。`
    : "岑舟接受：守约收益不低于替代航线，资金也足够。";
  const matrix = contractMatrix(round, accepted ? plan : defaultPlan());
  const p = plan.reciprocal ? round.continuation ?? 0 : 0;
  const cooperation: Pair = [matrix[0][0] / (1 - p), matrix[0][1] / (1 - p)];
  const deviation: Pair = [
    matrix[2][0] + p * matrix[3][0] / (1 - p),
    matrix[1][1] + p * matrix[3][1] / (1 - p),
  ];
  const repeated = round.continuation !== undefined && plan.reciprocal;
  const stable = repeated
    ? cooperation.every((amount, side) => amount + 1e-9 >= deviation[side])
    : cooperation.every((amount, side) => amount > deviation[side]);
  // The opponent uses public terms, never the player's sealed action.
  const opponent = repeated
    ? stable ? "cooperate" : "rush"
    : matrix[0][1] > matrix[1][1] && matrix[2][1] > matrix[3][1] ? "cooperate" : "rush";
  return { accepted, reason, matrix, opponent, cooperation, deviation, stable };
}
function outcome(analysis: Analysis, round: Round, action: Action): Pair {
  const index = (action === "rush" ? 2 : 0) + (analysis.opponent === "rush" ? 1 : 0);
  if (round.continuation === undefined) return analysis.matrix[index];
  const p = round.continuation;
  if (index === 0) return [analysis.matrix[0][0] / (1 - p), analysis.matrix[0][1] / (1 - p)];
  return [
    analysis.matrix[index][0] + p * analysis.matrix[3][0] / (1 - p),
    analysis.matrix[index][1] + p * analysis.matrix[3][1] / (1 - p),
  ];
}
export function settle(session: Session, mission: Mission, plan: Plan): Session {
  const error = planError(session, mission, plan);
  if (error) throw new Error(error);
  const round = mission.rounds[session.step];
  const analysis = analyze(round, session.cash, plan);
  const payoff = plan.contract && !analysis.accepted ? round.outside : outcome(analysis, round, plan.action);
  const alternative = plan.contract && !analysis.accepted ? payoff[0]
    : outcome(analysis, round, plan.action === "cooperate" ? "rush" : "cooperate")[0];
  // Long-term tasks report expectations; no imaginary earnings enter the cash ledger.
  const cash: Pair = round.continuation === undefined ? [session.cash[0] + payoff[0], session.cash[1] + payoff[1]] : session.cash;
  const record: Record = {
    plan: { ...plan }, opponent: analysis.opponent, accepted: analysis.accepted, reason: analysis.reason,
    payoff, alternative, cash, cooperation: analysis.cooperation, deviation: analysis.deviation, stable: analysis.stable,
  };
  const next: Session = {
    ...session, step: session.step + 1, cash, total: [session.total[0] + payoff[0], session.total[1] + payoff[1]],
    deposits: session.deposits + (analysis.accepted ? plan.deposit : 0), history: [...session.history, record],
  };
  if (next.step === mission.rounds.length || cash.some((amount) => amount < 0)) {
    next.status = next.total[0] + 1e-9 >= mission.goal && cooperationCount(next) >= mission.cooperation
      && next.step === mission.rounds.length ? "won" : "lost";
  }
  return next;
}
export function cooperationCount(session: Session): number {
  return session.history.filter((item) => item.stable && (!item.plan.contract || item.accepted)
    && item.plan.action === "cooperate" && item.opponent === "cooperate").length;
}
export function stars(session: Session, mission: Mission): number {
  if (session.status !== "won") return 0;
  return session.deposits <= mission.depositTarget ? 3 : 2;
}
