import { SYMBOLS, roundConditions } from "./engine.js";
import { MISSIONS } from "./missions.js";
import { STORY } from "./story.js";
import { bitStrip, icon, modalFrame, stars } from "./ui.js";
import type { Mission, RoundResult, Session } from "./types.js";

export function resultExplanation(session: Session, mission: Mission, result: RoundResult, historical: boolean): string {
  const failed = result.packets.filter((packet) => !packet.delivered);
  if (result.expired.length) {
    return `有 ${result.expired.length} 条消息到截止轮次仍未交付。${mission.windows ? "回看通信窗预报：之前哪一轮能装下它？整次预算和同步费也需要提前留出。" : "检查所有消息的截止时间与完整发送成本，提前规划剩余轮次。"}`;
  }
  if (failed.length) {
    if (result.protection === "none") return "信道翻转了比特，直接发送无法修复。前缀码只能帮助识别边界，不能提供纠错保证。根据干扰模型选择保护，再检查预算。";
    if (result.protection === "repeat") return "部分三元组中出现多位错误，或保护后的消息仍未正确恢复。重复码只保证纠正每组三位中的一位错误，请检查干扰与分组关系。";
    return "消息未能完整恢复。汉明 (7,4) 只保证纠正每个 7 位码块中的一位错误；检查使用的码本和消息边界。";
  }
  if (session.status === "won" && !historical) return mission.takeaway;
  if (historical) return "这份记录保留了当轮结束时的消息状态。展开比特追踪，可以查看当时使用的码本、保护和解码结果。";
  return "本轮选中的消息全部准确交付。下一轮预算会重置，继续处理队列中尚未完成的请求。";
}

export function storyResult(session: Session, mission: Mission, result: RoundResult): string {
  const won = session.status === "won";
  const lost = session.status === "lost";
  const message = won ? STORY[mission.id].reply : lost ? resultExplanation(session, mission, result, false)
    : `${result.skipped ? "本轮没有发送。" : "本轮通信已完成。"}队列中还有 ${mission.packets.filter((packet) => session.taskStates[packet.id] === "pending").length} 条未完成请求。继续前，查看下一轮容量和干扰条件。`;
  return modalFrame(won ? "任务完成，收到回信。" : lost ? "任务未完成，查看原因。" : "本轮结束。", "INCOMING REPLY", `
    <div class="story-reply"><span class="reply-avatar">${icon(won ? "dish" : "info")}</span><div><span>${won ? mission.destination : "林岚 · 值班长"}</span><p>${message}</p></div></div>
    ${won ? `<div class="story-earned">${stars(session.stars)}<span>本章共发送 ${session.totalBits} bit${mission.independent ? ` · ${session.hintLevel ? "参考提示" : "独立通过"}` : ""}</span></div><div class="story-learned"><span>${mission.independent ? "方案复盘" : "本章笔记"}</span><p>${mission.independent ? mission.takeaway : STORY[mission.id].learning}</p></div>` : ""}
    ${won && mission.id === 8 ? '<p class="modal-intro">基础考核完成。接下来四关会加入分包补位、信道窗口和后续码本成本，需要提前规划多轮发送。</p>' : ""}
    ${won && mission.id === MISSIONS.length ? `<p class="modal-intro">${mission.packets.length} 份请求全部交付，这一班结束了。${session.stars < 3 ? "可以回看各轮成本，再试着达到三星目标。" : "总成本达到三星目标。"}值班记录已经保存，还可以返回其他航段。</p>` : ""}
    <button class="text-button" data-action="detail-result">查看比特与解码记录 ${icon("arrow")}</button>
    <div class="modal-actions">
      <button class="secondary-button" data-action="${lost ? "restart" : "close"}">${lost ? "重新体验本章" : "返回值班席"}</button>
      ${won && mission.id < MISSIONS.length ? `<button class="primary-button" data-action="mission" data-id="${mission.id + 1}">${mission.id === 8 ? "进入进阶航段" : "下一章"} ${icon("arrow")}</button>` : lost ? '<button class="primary-button" data-action="hint">查看提示</button>' : won ? '<button class="primary-button" data-action="story-menu">查看全部航段</button>' : `<button class="primary-button" data-action="close">继续第 ${session.round} 轮 ${icon("arrow")}</button>`}
    </div>`, "story-result-modal");
}

export function detailedResult(session: Session, mission: Mission, result: RoundResult, historical = false): string {
  const won = session.status === "won" && !historical;
  const lost = session.status === "lost" && !historical;
  const delivered = result.packets.filter((packet) => packet.delivered).length;
  const errors = result.packets.reduce((sum, packet) => sum + packet.flipPositions.length, 0);
  const corrected = result.packets.reduce((sum, packet) => sum + packet.correctedBlocks, 0);
  const title = historical ? `第 ${result.round} 轮通信记录` : won ? "本章任务已完成" : lost ? "本章任务未完成" : "本轮通信记录";
  const statuses = { pending: "待发送", delivered: "已交付", failed: "解码错误", expired: "已超时" };
  const taskStates = historical && result.taskStates ? result.taskStates : session.taskStates;
  return modalFrame(title, `DEBRIEF / ROUND ${String(result.round).padStart(2, "0")}`, `
    <div class="result-summary ${lost ? "failure" : ""}"><div class="result-emblem">${icon(lost ? "info" : "check")}</div><div><strong>${won ? "必要任务全部完成" : lost ? "请调整方案，再试一次" : `本轮正确交付 ${delivered} / ${result.packets.length} 条消息`}</strong><p>${won ? `总计发送 ${session.totalBits} bit · 三星效率目标 ≤ ${mission.parBits} bit` : `本轮 ${result.totalBits} / ${result.budget ?? roundConditions(mission, result.round).budget} bit · ${errors} 位被干扰翻转`}</p></div>${won ? stars(session.stars, "result-stars") : ""}</div>
    <div class="result-metrics"><div><span>信源数据</span><strong>${result.packets.reduce((sum, packet) => sum + packet.sourceBits.length, 0)}<small> bit</small></strong></div><div><span>实际发送</span><strong>${result.totalBits}<small> bit</small></strong></div><div><span>噪声翻转</span><strong>${errors}<small> 位</small></strong></div><div><span>纠错操作</span><strong>${corrected}<small> 块</small></strong></div></div>
    ${result.syncBits ? `<p class="microcopy">实际发送包含 ${result.syncBits} bit 的可靠码本同步帧，消息包的比特追踪单独列出数据与保护。</p>` : ""}
    <div class="result-explanation">${icon("book")}<p>${resultExplanation(session, mission, result, historical)}</p></div>
    <div class="result-task-list">${mission.packets.map((packet) => `<div><span>${packet.name}${packet.required === false ? " <small>额外任务</small>" : ""}</span><span class="task-state ${taskStates[packet.id]}">${statuses[taskStates[packet.id]]}</span></div>`).join("")}</div>
    <div class="decode-details">
      <div class="small-section-title">信号追踪 <span>点击消息展开比特与解码</span></div>
      ${result.packets.map((packet, index) => `<details ${index === 0 && !packet.delivered ? "open" : ""}><summary><span>${icon(packet.delivered ? "check" : "info")}${packet.name}</span><span class="mono">${packet.sourceBits.length} → ${packet.cost} bit ${icon("chevron")}</span></summary><div class="decode-detail-body">
        <div class="trace-line"><span>编码后的数据</span>${bitStrip(packet.sourceBits)}</div>
        <div class="trace-line"><span>信道发送</span>${bitStrip(packet.transmittedBits)}</div>
        <div class="trace-line"><span>信道接收 <small>红色为翻转位</small></span>${bitStrip(packet.receivedBits, packet.flipPositions)}</div>
        <div class="trace-line"><span>纠错后的数据</span>${bitStrip(packet.decodedBits, [...packet.decodedBits].flatMap((bit, i) => bit !== packet.sourceBits[i] ? [i] : []))}</div>
        <div class="trace-tokens"><span>解码指令</span><p>${packet.receivedTokens.map((id) => `<span class="token ${SYMBOLS.find((symbol) => symbol.id === id)!.color}">${SYMBOLS.find((symbol) => symbol.id === id)!.glyph}</span>`).join("") || "无法解码"}</p></div>
        <div class="microcopy">${packet.padding ? `尾部补了 ${packet.padding} 位 0；解码后已移除。` : "没有补位。"}${packet.delivered ? "逐条核对原始指令，全部一致。" : `与原始序列相比，有 ${packet.tokenErrors} 个位置不同或缺失。`}</div>
        ${packet.blocks.length && result.protection === "hamming" ? `<div class="block-trace">${packet.blocks.slice(0, 12).map((block, i) => `<div><span>块 ${i + 1}</span><code>${block.received}</code><span>综合值 ${block.syndrome}</span><code>→ ${block.data}</code></div>`).join("")}${packet.blocks.length > 12 ? `<p class="microcopy">其余 ${packet.blocks.length - 12} 个码块已完成同样的校验。</p>` : ""}</div>` : ""}
      </div></details>`).join("")}
    </div>
    ${won && session.stars < 3 ? `<p class="star-tip">${icon("spark")}${session.stars === 1 ? "完成额外任务可获得第二星；全部交付且达到效率目标可获得第三星。" : `再试一次，将全部消息总成本控制在 ${mission.parBits} bit 内，可获得第三星。`}</p>` : ""}
    ${won && mission.id === MISSIONS.length ? `<div class="graduation"><strong>最后一班结束，可以交班了。</strong><p>本章必要请求已完成。可以查看各轮成本，或返回其他航段，挑战独立三星。</p></div>` : ""}
    <div class="modal-actions"><button class="secondary-button" data-action="${historical || session.status === "playing" ? "close" : "restart"}">${icon(historical || session.status === "playing" ? "arrow" : "reset")}${historical ? "返回工作台" : session.status === "playing" ? "继续值班" : "用相同干扰重试"}</button>${won && mission.id < MISSIONS.length ? `<button class="primary-button" data-action="mission" data-id="${mission.id + 1}">前往下一航段 ${icon("arrow")}</button>` : won ? '<button class="primary-button" data-action="close">回到任务控制台</button>' : lost ? `<button class="primary-button" data-action="hint">查看策略提示 ${icon("spark")}</button>` : `<button class="primary-button" data-action="close">准备第 ${session.round} 轮 ${icon("arrow")}</button>`}</div>
  `, "result-modal");
}
