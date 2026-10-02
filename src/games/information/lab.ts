import { hammingEncode, hammingDecode } from "./engine.js";
import { icon } from "./ui.js";
import { escapeHtml } from "../../shared/html.js";

export interface LabState { data: string; flipped: number[]; corrected: boolean }

export function renderLab(state: LabState, learning: boolean): string {
  const valid = /^[01]{4}$/.test(state.data);
  const encoded = hammingEncode(valid ? state.data : "0000");
  const received = [...encoded].map((bit, i) => state.flipped.includes(i + 1) ? String(1 - Number(bit)) : bit).join("");
  const decoded = hammingDecode(received);
  const correct = decoded.data === state.data;
  const checks: [number, number[]][] = [[1, [1, 3, 5, 7]], [2, [2, 3, 6, 7]], [4, [4, 5, 6, 7]]];
  return `
    ${learning ? `<div class="tree-mentor-note"><span class="mentor-mini">岚</span><p><strong>林岚</strong>${state.flipped.length === 0 ? "点击下面任意一个比特，制造一位错误。" : state.flipped.length > 1 ? "先清除翻转，再试着只改变一位。多位错误超出了这次实验的保证范围。" : state.corrected ? "恢复成功。你可以回到消息中，使用刚学到的保护。" : `校验结果指向位置 ${decoded.syndrome}。点击“运行解码”，看它恢复原始数据。`}</p></div>` : '<p class="modal-intro">输入 4 位数据，然后点击任意一位模拟翻转。位置 1、2、4 是校验位，剩余位置携带原始数据。</p>'}
    <div class="lab-data"><label for="lab-data">原始数据</label><input id="lab-data" class="mono" value="${escapeHtml(state.data)}" maxlength="4" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="lab-data-help"><span id="lab-data-help">${valid ? learning ? "额外加三位，帮助找出错误" : "偶校验 · 自动生成三个校验位" : "请输入恰好 4 位 0 或 1"}</span></div>
    <div class="lab-word">${[...encoded].map((bit, i) => {
      const position = i + 1;
      const parity = [1, 2, 4].includes(position);
      return `<div class="lab-position"><span class="mono">${String(position).padStart(2, "0")}</span><button class="bit-button ${parity ? "parity" : ""} ${state.flipped.includes(position) ? "flipped" : ""}" data-action="lab-flip" data-position="${position}" ${valid ? "" : "disabled"} aria-label="翻转位置 ${position}，当前值 ${received[i]}" aria-pressed="${state.flipped.includes(position)}">${received[i]}</button><small>${parity ? `p${position}` : `d${[3, 5, 6, 7].indexOf(position) + 1}`}</small></div>`;
    }).join("")}</div>
    <div class="lab-legend"><span><i class="legend-square blue"></i>校验位</span><span><i class="legend-square mint"></i>数据位</span><span><i class="legend-square pink"></i>已翻转</span></div>
    ${learning ? '<details class="lab-check-details"><summary>三个校验是怎样计算的？</summary>' : ""}
    <div class="parity-checks">${checks.map(([n, positions], i) => `<div class="${decoded.checks[i] ? "check-failed" : ""}"><span>校验 s${n}</span><code>${positions.map((position) => received[position - 1]).join(" ⊕ ")} = ${decoded.checks[i]}</code><small>位置 ${positions.join(" · ")}</small></div>`).join("")}</div>
    ${!learning || state.flipped.length ? `<div class="syndrome-readout"><span>综合值 · 指向需要修正的位置</span><strong class="mono">${decoded.checks[0]} + 2×${decoded.checks[1]} + 4×${decoded.checks[2]} = <b>${decoded.syndrome}</b></strong><p>${decoded.syndrome ? `解码器将翻转位置 ${decoded.syndrome}。这个定位只在单错假设下有保证。` : "校验全部通过，解码器不修改码字。多位错误也可能绕过校验。"}</p></div>` : ""}
    ${learning ? `</details>${state.flipped.length === 1 ? `<div class="syndrome-readout"><span>根据额外三位的检查结果</span><strong>错误在第 ${decoded.syndrome} 位</strong><p>把这一位改回来，就能恢复原来的数据。</p></div>` : ""}` : ""}
    ${state.corrected ? `<div class="lab-result ${correct ? "" : "bad"}">${icon(correct ? "check" : "info")}<div><strong>恢复数据：<span class="mono">${decoded.data}</span> ${correct ? "· 与原始数据一致" : "· 与原始数据不同"}</strong><p>${state.flipped.length > 1 ? "你制造了多比特错误，已超出汉明 (7,4) 的保证范围。综合值可能指向未出错的位置。" : state.flipped.length ? "一位错误被定位并纠正。数据成功恢复。" : "没有制造错误，原始数据直接恢复。"}</p></div></div>` : ""}
    <div class="modal-actions"><button class="secondary-button" data-action="lab-reset">${icon("reset")}清除翻转</button>${learning && state.corrected && correct && state.flipped.length === 1 ? `<button class="primary-button" data-action="lab-return">回去选择保护 ${icon("arrow")}</button>` : `<button class="primary-button" data-action="lab-correct" ${valid && (!learning || state.flipped.length === 1) ? "" : "disabled"}>运行解码 ${icon("shield")}</button>`}</div>`;
}
