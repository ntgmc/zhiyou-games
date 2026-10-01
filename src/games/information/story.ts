import type { Chapter, GuidedSession, Mission, Session, StoryStep } from "./types.js";

export const STORY: Record<number, Chapter> = {
  1: {
    location: "弥拉通信站 · 第一次夜班",
    scenes: [
      { speaker: "旁白", role: "22:14 · 交接之后", title: "值班台上的来电灯亮了。", text: "你刚坐下，耳机里就响起一阵沙沙声。远处的导航浮标离线了，一艘小飞船正等着通信站给它指路。", button: "接听呼叫" },
      { speaker: "艾拉", role: "信使号 · 驾驶员", title: "“有人听得见吗？”", text: "“这里是信使号，驾驶员艾拉。进站航线从屏幕上消失了。能把导航指令发给我吗？”", button: "信使号，这里是弥拉" },
      { speaker: "林岚", role: "弥拉通信站 · 值班长", title: "导航消息已经备好了。", text: "“别急，我就在旁边。先选消息，再检查发送长度。我带你发第一条。”", button: "开始发送" },
    ],
    steps: [
      { id: "pick", title: "选中信使号的消息", text: "这张卡片里是要发给艾拉的导航指令。点击卡片，把消息加入本轮发送队列。", action: "packet" },
      { id: "bits", title: "把指令写成 0 和 1", text: "发送前，我们要把每条指令换成二进制码字。点击一种指令，看看它对应哪两位。", action: "demo", button: "看懂了，准备发送" },
      { id: "send", title: "检查发送长度", text: "16 条指令，每条 2 位，一共 32 bit，正好装满本轮的 32 bit。点击发送，把航线交给艾拉。", action: "send" },
    ],
    reply: "“收到了！航线在屏幕上亮起来了。我看见通信站了……谢谢你。”",
    learning: "每条指令对应一个码字。信使号用同一码本，把收到的比特还原成导航指令。",
  },
  2: {
    location: "信使号 · 进入巡航航段",
    scenes: [
      { speaker: "艾拉", role: "信使号 · 驾驶员", title: "“下一段航线也拜托你了。”", text: "“我已经回到航道上了，还需要一份巡航路线。”新的请求刚到，通信站的供能告警也亮了起来。", button: "查看供能告警" },
      { speaker: "林岚", role: "弥拉通信站 · 值班长", title: "这次少了四位空间。", text: "“还是 16 条指令，这轮却只能发 28 bit。看看哪种指令最多，能不能给它换个短码字？”", button: "查看指令频率" },
    ],
    steps: [
      { id: "frequency", title: "“前进”占了一半", text: "16 条指令里有 8 条“前进”。让它只占 1 位，少见的指令用长一些的码字，就能省下空间。", action: "next", button: "构造新码本" },
      { id: "tree", title: "用码树分配码字", text: "打开码树，先合并出现次数最少的两个节点，我会提示你下一步。从根走到指令叶子，沿途的 0 和 1 就是它的码字。", action: "tree" },
      { id: "send", title: "检查码字是否冲突", text: "任何码字都不能是另一个码字的开头，接收端才能逐条读出指令。确认总长度不超过 28 bit，再发送新航线。", action: "send" },
    ],
    reply: "“航线更新完毕。刚才明明说空间不够，你是怎么把它发过来的？”",
    learning: "常见指令用了短码字，总长度降了下来。码字之间没有前缀冲突，接收端仍能分清每条指令。",
  },
  3: {
    location: "织女航道 · 直线巡航",
    scenes: [
      { speaker: "林岚", role: "弥拉通信站 · 值班长", title: "这一段大多是直线。", text: "“信使号进入长直线航段，‘前进’比刚才还多。这轮只有 25 bit，得按新的频率调一调码本。”", button: "查看新消息" },
    ],
    steps: [
      { id: "entropy", title: "这批指令更容易预测", text: "“前进”有 10 条。指令的分布越集中，平均不确定性就越低，我们用信息熵来衡量它。", action: "next", button: "按新频率编码" },
      { id: "optimize", title: "试用哈夫曼工具", text: "码树你已经搭过了。这次让工具按所选消息的频率合并节点，自动生成码本。", action: "auto" },
      { id: "send", title: "新码本省了多少？", text: "查看平均码长和发送长度。信息熵是平均码长的理论下界；码字只能用整数位，两者未必相等。", action: "send" },
    ],
    reply: "“新航线收到了。等我穿过这段航道，请你喝一杯真正的咖啡。”",
    learning: "哈夫曼工具按指令频率缩短平均码长。码字只能取整数长度，平均码长有时会高于信息熵。",
  },
  4: {
    location: "碎石带前哨 · 电磁告警",
    scenes: [
      { speaker: "艾拉", role: "信使号 · 驾驶员", title: "“刚才那条指令，好像不对。”", text: "“我收到的是右转，可前面就是碎石带。”一阵电磁脉冲穿过航道，信号里的一个比特被翻转了。", button: "检查信号" },
      { speaker: "林岚", role: "弥拉通信站 · 值班长", title: "得把翻转的那一位找回来。", text: "“光压缩不够，错了的比特还得修。我们加一些冗余，让接收端能恢复原来的数据。”", button: "试试重复发送" },
    ],
    steps: [
      { id: "repeat-demo", title: "按多数票恢复数据", text: "接收端收到 010。假设这组三位最多错一位，你认为原来的数据是 0 还是 1？", action: "quiz", button: "把多数票用到消息上" },
      { id: "protect", title: "每一位发三遍", text: "选择“三次重复”。原来的 8 位变成 24 位，正好装进本轮预算。", action: "protection", protection: "repeat" },
      { id: "send", title: "重新发送避障指令", text: "接收端会对每组三位取多数票，恢复原始比特。检查预算，再发送这条避障消息。", action: "send" },
    ],
    reply: "“这次指令正确。已经避开碎石带，我继续前进。”",
    learning: "三次重复让每位数据有三份副本，接收端用多数票纠正每组三位中的一个错误。发送长度也变成了三倍。",
  },
  5: {
    location: "卡西尼观测站 · 姿态漂移",
    scenes: [
      { speaker: "观测站", role: "卡西尼 · 自动求援", title: "“请求姿态校准。”", text: "“天线姿态异常。当前每个 7 比特传输块有一位错误。重复发送需要 96 bit，超出可用容量。”", button: "接下校准任务" },
      { speaker: "林岚", role: "弥拉通信站 · 值班长", title: "试试加校验位。", text: "“我们只有 56 bit。汉明码把 4 位数据加上校验，变成 7 位。先试着翻转一位，看看校验结果怎么找出它。”", button: "进入纠错实验" },
    ],
    steps: [
      { id: "lab", title: "翻转一位，观察校验结果", text: "打开实验，点击任意一位，再运行解码。三个校验结果合成的位置编号，会指出出错的那一位。", action: "lab" },
      { id: "protect", title: "给校准消息加汉明保护", text: "选择“汉明 (7,4)”。32 位数据分成 8 块，每块加上校验后占 7 位，共 56 bit。", action: "protection", protection: "hamming" },
      { id: "send", title: "重新对准观测站的天线", text: "本关每个 7 位块只错一位，符合汉明码的纠错保证。现在发送姿态校准指令。", action: "send" },
    ],
    reply: "“校准完成。天线已重新锁定弥拉通信站。”",
    learning: "汉明 (7,4) 可以定位并纠正每块的一位错误。多位错误可能误纠正，超出了它的保证范围。",
  },
  6: {
    location: "欧罗巴救援舰 · 最后进港",
    scenes: [
      { speaker: "救援舰", role: "欧罗巴 · 航行请求", title: "“等你的进港指令。”", text: "“欧罗巴救援舰准备靠港，请发送精确导航。”周期干扰仍在，本轮只有 52 bit。", button: "检查可用空间" },
      { speaker: "林岚", role: "弥拉通信站 · 值班长", title: "这条消息交给你了。", text: "“编码和纠错你都试过了，这次自己选。发送前算好成本，也看看保护够不够。有问题就叫我。”", button: "接下任务" },
    ],
    steps: [
      { id: "optimize", title: "第一步，缩短消息", text: "先根据频率生成哈夫曼码，让常见指令用更短的码字。", action: "auto" },
      { id: "protect", title: "第二步，保护比特", text: "再选择汉明码。压缩后的 28 位分成 7 块，保护后是 49 bit，能装进 52 bit。", action: "protection", protection: "hamming" },
      { id: "send", title: "送出这条安全航线", text: "你已经同时解决了长度和错误。确认完整发送成本后，让救援舰安全靠港。", action: "send" },
    ],
    reply: "“进港完成。救援队已经出舱，所有人安全。”",
    learning: "压缩减少数据长度，腾出的空间可以用来加入纠错校验。",
  },
  7: {
    location: "天琴座舰队 · 请求拥堵",
    scenes: [
      { speaker: "林岚", role: "弥拉通信站 · 值班长", title: "三条请求一起到了。", text: "“救援舰、维修站和探测器都在等指令，每轮只有 35 bit。你排一下发送顺序，别漏看截止时间。保护方式也由你选。”", button: "接管消息队列" },
    ],
    steps: [
      { id: "pick", title: "先照顾最早到期的请求", text: "救援舰必须在第 1 轮收到指令，另外两条可以晚些发送。先只选中救援舰的消息。", action: "packet", packet: "urgent" },
      { id: "protect", title: "紧急，也不能发错", text: "这条消息仍要穿过周期干扰。选择汉明码，再检查它是否装得下。", action: "protection", protection: "hamming" },
      { id: "send", title: "完成这一轮，然后继续值班", text: "救援消息占 28 bit。先把它送出去，下一轮信道空间会恢复到 35 bit。", action: "send" },
    ],
    reply: "“三条消息都收到了。舰队可以继续执行任务。”",
    learning: "排队要看任务期限和优先级；设计码本时要看指令频率。它们回答的是不同的问题。",
  },
  8: {
    location: "边境探索舰队 · 独立值班",
    scenes: [
      { speaker: "林岚", role: "弥拉通信站 · 值班长", title: "接收端还在用旧码本。", text: "“探索舰急需制动，这批指令里‘停止’最多。对方还记着旧码本，更新一次要花 12 bit。要不要换，你算算看。”", button: "开始独立值班" },
    ],
    steps: [
      { id: "sync", title: "旧码本为什么装不下？", text: "旧码本让‘前进’最短，但新消息大多是‘停止’。保护后需要 77 bit，超过 65 bit。看看分布，再调整码本。", action: "next", button: "为紧急消息重新编码" },
      { id: "optimize", title: "把同步成本一起算上", text: "为所选的紧急消息生成哈夫曼码。本轮会先发送 12 bit 的可靠同步帧，让双方使用同一码本。", action: "auto" },
      { id: "send", title: "先完成紧急制动", text: "新数据与保护占 49 bit，加同步共 61 bit。后续消息若沿用这套码本，不会再次支付同步成本。", action: "send" },
    ],
    reply: "“制动指令收到，探索舰已停稳。后续靠港和编队任务也已完成。”",
    learning: "更新码本的收益需要扣除同步成本。消息分布变化时，应结合接下来要发送的消息判断是否值得更新。",
  },
};

const CHALLENGE_STORIES: [number, string, string, string, string, string][] = [
  [9, "双子无人站 · 狭窄上行", "压缩过了，还是发不下。", "无人站要发两个小包。自动编码缩短了数据，加上保护后却仍然超出容量。两个包必须各自发送，你得把每包的成本算清楚。", "检查两个消息包", "“停机确认和姿态修正都收到了，两个请求处理完毕。”"],
  [10, "织女阵列 · 磁暴预报", "磁暴中有一段空隙。", "三条请求同时到了。预报显示，第 2 轮可以避开干扰，其余两轮仍有磁暴。该把哪条消息留给这段空隙？", "查看通信窗预报", "“三条指令已收到，中继阵列恢复运行。”"],
  [11, "猎户航道 · 两封信", "短回执后面，还有一条长航线。", "眼前只有四条停止指令，下一轮会来一份长航线。后续指令的频率已经给出，接收端仍在用旧码本。换之前，先算一算两轮的支出。", "规划两轮发送", "“制动回执收到，长航线也已核对完毕。可以继续航行了。”"],
  [12, "边境网络 · 最后值守", "林岚去修馈线了。", "最后一根馈线断了。林岚摘下耳机去维修，你留在值班席上。接下来有四个通信窗口，要处理六个请求，其中一份是无人站的记忆档案。总预算得够用到最后一轮。", "接管最后一班", "“我回来了。”林岚戴上耳机，看了眼通信记录。“必要请求都送到了。辛苦，换我来。”"],
  [13, "弥拉通信站 · 馈线修复后", "艾拉又打来了。", "林岚把沾着灰的手套放在桌边，刚拿起水杯，耳机里就传来艾拉的声音：“我接到了两艘返航艇。它们的导航台只能逐包确认，能帮我们接通返航线吗？”你翻到队列末尾，后面还有一份编队制动请求。", "接通返航编队", "“两艘艇都跟上了。”艾拉说，“刚才它们一前一后停在航道口，我还以为得在这里等到天亮。”"],
  [14, "双子运输船 · 共用导航台", "“我们只能记住一套码本。”", "外圈运输船的驾驶员念完请求，身后有人接过了话筒：“下一班轮到我们，航线已经列好了。”两艘船轮流使用同一台接收设备，中间只有一条很短的交接回执。林岚把两份频率表并排放到你面前，没替你动码树。", "摊开两份航线", "“交接完成。”第二位驾驶员的声音比刚才松了些，“不用再跟第一艘船借导航台了，我们已经过了窄口。”"],
  [15, "双子无人站群 · 七份待确认", "“这份也不能合包。”", "值班台接连亮起两个站点的请求。你问能不能合在一起发，对面沉默了一会儿，回了一份老设备的说明：每包分别执行，不能拼接。林岚看着第一轮的码字说：“这些站点用了很多年，别按咱们的习惯替它们改。”", "核对接收端码字", "无人站甲先发来关闭确认，乙站晚了几秒：“泊位已锁定。”林岚把两条回执圈在值班记录上，终于把那副手套收进抽屉。"],
  [16, "边境维修编队 · 等人回来", "维修员还在外面。", "馈线能用了，两个阵列却还没有复位。维修员的小艇正在外圈漂着，救援艇得先离站去接人。“返程也需要导航，别只给我留出站的位置。”艇长说。五轮预报铺满了屏幕，两段静区之间隔着一场磁暴。", "排好接人与返程", "“人都接到了，靠港航线也收到。”艇长把话筒递给维修员。对方喘了口气：“林岚，那根馈线固定住了，你不用再爬一趟。”"],
  [17, "猎户返航道 · 导航台关机前", "“大天线马上要关了。”", "猎户导航台的值班员正在收电缆：“宽带上行只剩这一轮，后面照预报的小窗口走。”两份停机回执还没到，穿越航线也在路上。艾拉报完预计抵达时间，补了一句：“我答应的咖啡还在船上，先别下班。”", "查看后续频率", "“猎户段过了。”艾拉把麦克风挪近了一点，“咖啡没洒。接下来听你给我安排靠港。”"],
  [18, "弥拉通信站 · 返航最后一班", "泊位灯亮了，人还没回来。", "窗外的泊位亮起两盏灯，控制台上仍有十份请求。林岚拉了把椅子坐在旁边，把剩下的电量写进值班记录。信使号还在航道尽头，维修艇也等着接驳。“我帮你记回执。”她说，“发送顺序由你定。”", "接下最后的队列", "最后一条靠港回执跳出来时，林岚在值班表上划掉了信使号。门过了一会儿才开，艾拉拎着两只杯子进来：“说好请你喝的。哪位是今晚给我指路的人？”"],
];
for (const [id, location, title, text, button, reply] of CHALLENGE_STORIES) {
  STORY[id] = {
    location,
    scenes: [{ speaker: id === 12 ? "旁白" : "值班频道", role: "独立任务", title, text, button }],
    steps: [{ id: "dispatch", action: "dispatch", title: "安排本轮发送", text: "查看任务条件，选好消息和通信方案再发送。" }],
    reply,
    learning: "",
  };
}

export function prepareStory(session: Session, mission: Mission): GuidedSession {
  if (session.guide?.version === 1) {
    const guide = session.guide;
    guide.intro = Number.isInteger(guide.intro) ? Math.max(0, Math.min(guide.intro, STORY[mission.id].scenes.length)) : 0;
    guide.phase = Number.isInteger(guide.phase) ? Math.max(0, Math.min(guide.phase, STORY[mission.id].steps.length - 1)) : 0;
    guide.demo = guide.demo && ["A", "B", "C", "D"].includes(guide.demo) ? guide.demo : null;
    guide.quiz = guide.quiz && ["0", "1"].includes(guide.quiz) ? guide.quiz : null;
    guide.skipped = guide.skipped === true;
    session.hintLevel = Number.isInteger(session.hintLevel) ? Math.max(0, Math.min(3, session.hintLevel!)) : 0;
    return session as GuidedSession;
  }
  session.guide = {
    version: 1, intro: session.history.length ? STORY[mission.id].scenes.length : 0,
    phase: 0, demo: null, quiz: null, skipped: session.history.length > 0,
  };
  session.hintLevel = 0;
  // The first and scheduling lessons start with an explicit message selection.
  if (!session.history.length && ([1, 7].includes(mission.id) || mission.independent)) session.selectedIds = [];
  return session as GuidedSession;
}

export function storyStep(session: GuidedSession, mission: Mission): StoryStep {
  if (session.status !== "playing") return { id: "finished", action: "result", title: "本次通信已结束" };
  if (mission.independent || session.guide.skipped || session.round > 1) return {
    id: "dispatch", action: "dispatch",
    title: mission.independent ? `${mission.difficulty} · 第 ${session.round} 轮` : session.round > 1 ? `第 ${session.round} 轮，继续处理请求` : "安排本轮发送",
    text: mission.independent
      ? mission.briefing
      : mission.id === 8 && session.round === 3
      ? "旧航线档案仍以“前进”为主。先选择它，再判断是否值得换回适合它的码本。"
      : session.round > 1
        ? "本轮预算已更新。选好消息，检查截止时间和发送总成本。“调整通信方案”里可以修改编码与保护。"
        : "先选消息，再设置编码和保护。检查预算后发送；需要帮助时，可以重看本章引导。",
  };
  return STORY[mission.id].steps[Math.min(session.guide.phase, STORY[mission.id].steps.length - 1)];
}

export function advanceStory(session: GuidedSession, mission: Mission, action: string) {
  const step = storyStep(session, mission);
  if (mission.independent || session.guide.skipped || session.round > 1 || session.status !== "playing") return false;
  let allowed = false;
  if (step.action === "packet" && action === "packet") {
    allowed = session.selectedIds.length === 1 && session.selectedIds[0] === (step.packet || mission.packets[0].id);
  } else if (step.action === "demo" && action === "next") allowed = Boolean(session.guide.demo);
  else if (step.action === "quiz" && action === "next") allowed = session.guide.quiz === "0";
  else if (step.action === "next" && action === "next") allowed = true;
  else if (step.action === "tree" && action === "tree-apply") allowed = session.coding === "custom";
  else if (step.action === "auto" && ["auto", "tree-apply"].includes(action)) allowed = session.coding === "custom";
  else if (step.action === "lab" && action === "lab-proof") allowed = true;
  else if (step.action === "protection" && action === "protection") allowed = session.protection === step.protection;
  if (!allowed) return false;
  session.guide.phase = Math.min(session.guide.phase + 1, STORY[mission.id].steps.length - 1);
  return true;
}

export function storyCanSend(session: GuidedSession, mission: Mission) {
  return session.guide.intro >= STORY[mission.id].scenes.length &&
    ["send", "dispatch"].includes(storyStep(session, mission).action);
}
