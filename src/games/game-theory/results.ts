import { cooperationCount } from "./engine.js";
import type { Mission, Session } from "./engine.js";

const fmt = (amount: number): string => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(amount);
const REPLIES = [
  "何芮合上结算单：“两边都抢了早班，各赚 3。下一次试试让约定有实际后果。”",
  "何芮退回保证金：“这次双方按表靠港了，船也不用堵在航道口。”",
  "何芮核完两班的账：“鲜货和机器都按时走了。换了订单，这份合同也跟着换过。”",
  "岑舟签下排班表：“这份合作的收入不比另一条航线少，就按这张表走。”",
  "何芮收好两班结算单：“燃料和冷藏货都走了，下一班签约的钱也没断。”",
  "岑舟把约定写在表上：“以后还能碰面，今天就各留一个时段。”",
  "何芮结清最后一笔保证金：“旧港关了，这两班的合同也都执行完了。”",
  "何芮在四班账上签名：“每班的合同和现金都对上了，这份表能交班。”",
  "岑舟把两份分账单摞好：“第一班你分给我，第二班我分给你。两边都愿意按表走。”",
  "岑舟合上修船账：“今天留下的钱，正好够明天签约。三班都接上了。”",
  "何芮核对担保登记簿：“三班都走完了，登记没超额，收入也够交班。”",
  "岑舟收好三份航线报价：“每条能走多久都算过了，后两条按约错峰。”",
  "何芮对完两本账：“六班的货都走了，两边的签约资金也没断。”",
  "岑舟的船过了第二次潮头。何芮把第八张结算单夹进账簿：“可以交班了。”",
  "接班员逐张核完十张订单：“合同、担保和余额都有记录，我接着看这本账。”",
  "码头熄了早班灯，夜班船也离港了。何芮在十六班记录上签名：“全天的货都走完了，交班吧。”",
];
export function resultFeedback(session: Session, mission: Mission): { reply: string; learning: string; failure: string } {
  const record = session.history.at(-1)!;
  const rejected = record.plan.contract && !record.accepted;
  const both = !rejected && record.plan.action === "cooperate" && record.opponent === "cooperate";
  const repeated = mission.rounds[session.history.length - 1].continuation !== undefined;
  const reply = session.status === "won" ? REPLIES[mission.id - 1]
    : rejected ? "岑舟把合同推回来，船队去了替代航线。这一班没有按港口排班执行。"
    : both ? "两支船队按不同的时段离港。何芮把本班收入记进账簿，继续核对合作条件。"
    : "两支船队的选择已经揭晓。何芮把实际靠港行动和结算单一起放在桌上。";
  let learning = rejected ? `合同没有被接受，保证金和手续费都未支付；本班按替代航线结算，你赚 ${fmt(record.payoff[0])}，岑舟赚 ${fmt(record.payoff[1])}。`
    : repeated ? record.plan.reciprocal
      ? `把以后可能赚的钱一起算，持续合作期望为 ${fmt(record.cooperation[0])}，违约一次为 ${fmt(record.deviation[0])}；实际选择${record.plan.action === "rush" ? "触发了以后双方一直抢先的后果" : record.opponent === "cooperate" ? "维持了长期互惠" : "未能让双方开始合作"}。期望收入不计入可用现金。`
      : `没有公开长期互惠约定，岑舟按当班收益选了抢先；按本次行动及以后双方一直抢先计算，你的整段期望收入为 ${fmt(record.payoff[0])}。期望收入不计入可用现金。`
    : record.plan.contract ? `这份合同让你守约赚 ${fmt(record.cooperation[0])}，单独违约赚 ${fmt(record.deviation[0])}。${record.plan.action === "rush" ? `抢先使你的 ${record.plan.deposit} 金币保证金被没收。` : "你的保证金当班退还，退还不算新增收入。"}${both && !record.stable ? "这次都错峰了，但守约收益还没有满足稳定合作的要求。" : ""}`
    : `保持岑舟本班行动不变，你选${record.plan.action === "rush" ? "抢先" : "错峰"}赚 ${fmt(record.payoff[0])}，改选另一种行动赚 ${fmt(record.alternative)}。只比较自己可改变的行动，才能找到最佳回应。`;
  if (mission.depositLimit !== undefined) learning += `本章累计登记 ${session.deposits}，剩余额度 ${mission.depositLimit - session.deposits}；退还现金不会恢复登记额度。`;
  const gaps: string[] = [];
  if (session.status === "lost") {
    if (session.total[0] < mission.goal) gaps.push(`收入为 ${fmt(session.total[0])}，距离 ${mission.goal} 还差 ${fmt(mission.goal - session.total[0])}`);
    const count = cooperationCount(session);
    if (count < mission.cooperation) gaps.push(`稳定合作 ${count} 班，要求 ${mission.cooperation} 班`);
  }
  return { reply, learning, failure: gaps.length ? `尚未交班：${gaps.join("；")}。展开航运记录，可以逐班检查收入、合同和现金变化。` : "" };
}
