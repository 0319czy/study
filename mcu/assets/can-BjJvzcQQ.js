const e={slug:"can",title:"CAN / CAN FD",en:"Controller Area Network",oneLine:"CAN 把一堆节点挂在两根差分线上，靠“ID 越小越优先”的逐位仲裁抢总线，抢输了的数据也不丢。",category:"protocol",level:"进阶",minutes:30,goals:["说清 CANH/CANL 的差分电平：显性位为什么是逻辑 0、隐性位为什么是逻辑 1，以及终端电阻为什么要两端各一个","对照帧格式表，从 SOF 到 EOF 逐段说出作用与长度，并讲清“显性覆盖隐性”为什么让仲裁无损、ID 越小优先级越高","把位时间拆成同步段 + 传播段 + 相位缓冲段 1、2，写出位时间与波特率的关系并说明采样点的位置","遇到“发不出去 / 收不到 / 一上总线就报错”时，能按终端电阻、位定时、ID 冲突、过滤器四项排查"],analogy:{title:"CAN 像一场“按优先级抢话”的电话会议",text:"会议室里没有主持人，谁想说话就开口。两个人同时开口时，他们一个字一个字地比：谁说出的字优先级低（ID 大），谁就立刻闭嘴，让另一个人把这句完整讲完。关键点是——闭嘴的人并没有把话弄坏，他记得自己讲到哪，等下一个人说完、会议室安静了，他再从头讲一遍。所以“抢话失败”不等于“数据丢了”。"},why:["**汽车与工业的现场总线标准**：车身控制器、电机驱动器、电池管理、机器人关节，一根两芯线就能挂几十个节点，布线成本远低于点对点。","**多主 + 无损仲裁是它最值钱的机制**：没有主从轮询的开销，紧急消息（ID 小）天然先走，冲突不丢数据、不需要应用层重传。","**差分传输抗干扰**：两根线同进同退，电机、继电器、点火线圈的共模干扰会被差分接收器抵消，这是它能上车的原因。","**它是理解“总线错误处理”的最佳样本**：错误帧、错误计数器、主动/被动/总线关闭这一整套机制，是嵌入式可靠通信的通用思路。"],sections:[{id:"electrical",title:"两根线：差分、显性与隐性",lead:"CAN 的所有“神奇”都建立在一条差分总线的两个状态上。",blocks:[{kind:"p",text:"**CAN（Controller Area Network，控制器局域网）**是一条**多主、广播式**的差分总线：总线上的节点没有地址，谁都能在总线空闲时开口；一帧数据发出去，所有节点都能收到，收不收取决于各自的**过滤器（filter）**。物理上是两根线 `CANH` 与 `CANL`，两端各接一个**120 Ω 量级**的终端电阻，中间可以挂很多节点——标准的线型（总线型）拓扑，不是星形也不是环。"},{kind:"terms",items:[{zh:"显性位",en:"Dominant bit",desc:"逻辑 0。收发器主动把 CANH 拉高、CANL 拉低，两根线之间出现明显差分电压（量级约 1.5–3 V，具体看收发器手册）。总线上只要有一个节点发显性，整条线就是显性。"},{zh:"隐性位",en:"Recessive bit",desc:"逻辑 1。收发器“放手”，终端电阻把两根线拉回同一电位，差分电压接近 0 V（量级）。没有任何节点驱动时，总线就是隐性。"},{zh:"终端电阻",en:"Termination resistor",desc:"总线两端的 120 Ω 量级电阻，用来吸收信号反射、给隐性位提供泄放回路。两端各一个，并联后从线间量到的是 60 Ω 量级。"},{zh:"仲裁",en:"Arbitration",desc:"多个节点同时开口时，用“显性覆盖隐性”的逐位比较决定谁继续发，输的一方立即退出并稍后重发。"}]},{kind:"table",caption:"表中电压为量级示意，真实电平、共模范围、环路延迟以收发器（transceiver）数据手册为准。",head:["总线状态","逻辑值","CANH / CANL","差分电压","谁在驱动"],rows:[["显性（dominant）","0","CANH 抬高、CANL 拉低","明显不为 0（量级 1.5–3 V）","任意一个想发 0 的节点"],["隐性（recessive）","1","两线回到同一电位","接近 0 V","没人驱动，靠终端电阻拉平"],["空闲（idle）","1","两线同电位（与隐性一致）","接近 0 V","没有节点发送，总线靠终端电阻拉平"]]},{kind:"p",text:"**显性覆盖隐性**是后面一切机制的物理基础：多个节点同时驱动时，只要有一个发 0，总线就是 0——相当于“低电平赢”。这条规则在电气层就已经决定了仲裁的结果，不需要软件参与。"},{kind:"kv",items:[{k:"线数与信号",v:"CANH / CANL 两根差分线；两端收发器仍需公共参考地，地电位差大或强干扰场合改用隔离收发器"},{k:"拓扑",v:"线型总线，节点用短支线（stub）挂上去，支线越短越好"},{k:"终端",v:"总线物理两端各一个 120 Ω 量级电阻，中间节点不加"},{k:"速率与长度",v:"经典 CAN 上限 1 Mbit/s；速率越高可用的总线长度越短（1 Mbit/s 量级时几十米量级，示意）"},{k:"节点数",v:"受收发器驱动能力与总线负载限制，常见几十个节点量级"},{k:"典型场景",v:"汽车车身/动力总线、电机与电池管理、工业设备、机器人关节"}]},{kind:"note",tone:"info",title:"为什么差分会比单端抗干扰",text:"干扰通常以“共模”形式同时耦合到两根线上：CANH 和 CANL 一起升高、一起降低。接收器只看两者之差，共模部分被减掉了。这也是 CAN 能和电机、继电器共处一个机柜的原因——但前提是两根线**绞在一起走**，分开走线会让共模干扰变成差模干扰。"}]},{id:"frame-format",title:"帧格式：SOF 到 EOF",lead:"记不住十几段没关系，先记住“谁开头、谁决定优先级、数据在哪、谁校验、谁应答、谁收尾”。",blocks:[{kind:"p",text:"CAN 有数据帧、远程帧、错误帧、过载帧四种帧。日常通信 99% 是**数据帧**，下面这张表就是标准数据帧的骨架；**扩展帧**只是把 11 位 ID 换成 29 位 ID，多插了 SRR / IDE 两个控制位，其余段一一对应。"},{kind:"table",caption:"长度为位（bit）数；扩展帧的仲裁段更长。位定义与边界情况以 ISO 11898-1 原文为准。",head:["段","作用","长度"],rows:[["SOF 帧起始","一个显性位，告诉所有节点“帧开始了”，接收方据此做硬同步、对齐位边界","1 位"],["仲裁段","标准帧：11 位 ID + RTR（数据帧为显性）；扩展帧：11 位基址 + SRR + IDE + 18 位扩展 ID + RTR","标准 12 位 / 扩展 32 位"],["控制段","IDE（标准/扩展）、保留位、DLC（Data Length Code，数据长度码，4 位）","6 位"],["数据段","真正要传的负载，0–8 字节（经典 CAN）；CAN FD 最多 64 字节","0–64 位（经典）/ 最多 512 位（FD）"],["CRC 段","15 位循环冗余校验 + 1 位隐性 CRC 界定符，接收方重算并比对","16 位（经典）"],["ACK 段","ACK 槽：任何正确收到帧的节点在这一位拉低（显性）；ACK 界定符为隐性","2 位"],["EOF 帧结束","7 个连续隐性位，标志帧边界；出现显性即判格式错误","7 位"],["帧间隔 IFS","帧与帧之间至少 3 个隐性位，给节点留出处理时间","3 位"]]},{kind:"ul",items:["**位填充（bit stuffing）**：发送端只要连续出现 5 个同极性位，就强行插入 1 个相反位；接收端按同样规则删掉。目的是保证总线有足够的跳变沿，接收方能持续重同步。","**DLC 只表示长度，不表示内容**：DLC=8 就是 8 字节，负载的含义（温度？转速？命令字？）由应用层约定，CAN 本身不关心。","**ACK 是“有人收到”而不是“目标收到”**：总线上任何节点校验通过都会拉低 ACK 槽，所以 ACK 只证明“至少有一个节点听到了”，不证明你的目标节点处理了它。","**CRC 与 ACK 都由硬件完成**：CPU 只负责往邮箱里塞数据和 ID，剩下的填充、CRC、应答、重发全是 bxCAN 自动做的。"]},{kind:"table",caption:"两种帧的差异集中在“能装多少”和“跑多快”；数值为量级说明，细节以 ISO 11898-1 与芯片手册为准。",head:["维度","经典 CAN","CAN FD"],rows:[["数据长度","0–8 字节（DLC 0–8 直接对应）","最多 64 字节（DLC 9–15 映射到 12/16/20/24/32/48/64 字节）"],["速率","整帧同一个速率，上限 1 Mbit/s","仲裁段仍按经典速率；数据段可用 **BRS** 位切到更高波特率，可达几 Mbit/s 量级"],["CRC","15 位 CRC + 1 位界定符","更长的 CRC（17 位或 21 位，按数据长度选），并带 stuff count 字段"],["位填充","全帧按“连续 5 个同极性插 1 个”动态填充","仲裁段仍用动态填充；CRC 场改用**固定填充位**（每 4 位插 1 位），填充规则不再由数据内容决定"],["帧内标志","—","FDF（帧格式）、BRS（速率切换）、ESI（错误状态指示）等控制位"]]},{kind:"note",tone:"tip",title:"一句话记住 FD 的三处变化",text:"**BRS 让数据段提速**、**DLC 扩展让一帧装到 64 字节**、**CRC 变长且改用固定填充位**（因为数据段速率变了，动态填充算不准）。这三件事合起来，才是 CAN FD“更快更大”的全部秘密。"}]},{id:"arbitration",title:"仲裁：ID 越小，越先说话",lead:"这是 CAN 最漂亮的设计：冲突不丢数据、不需要退避算法、不需要应用层重传。",blocks:[{kind:"p",text:"总线空闲时，多个节点可以同时开始发送。它们都先发 SOF（显性），然后逐位送出仲裁段。每送一位，节点都会**同时回读总线**：如果自己发的是隐性（1），读回来却是显性（0），说明有别人在发 0——自己优先级低，**立刻停止发送、退出仲裁**，转为接收状态；如果发什么就读回什么，就继续往下发。最后只剩一个节点在发，它拿到的总线完全没被破坏。"},{kind:"ol",items:["**同时开口**：节点 A（ID 0x123）与节点 B（ID 0x2A0）在同一时刻检测到总线空闲，都发出 SOF，仲裁开始。","**逐位比较**：两个 ID 从最高位开始一位一位往总线上送，每一位都是“线与”的结果——有 0 就是 0。","**分叉点出现**：某一位 A 发 0、B 发 1，总线呈现 0。A 回读一致，继续；B 发 1 却读回 0，判定自己输了。","**输者退出、胜者继续**：B 立刻停止发送、切到接收；A 不受影响地把这一帧发完（数据段、CRC、EOF 全都正常）。","**输者稍后重发**：总线再次空闲时，B 的这帧还躺在发送邮箱里，由硬件自动重发——数据一位都没丢，这就是**无损仲裁**。"]},{kind:"lab",labId:"can-arbitration",caption:"拖动两个节点的 ID、调整位定时分段，观察“发隐性却读回显性”的那一位发生在哪里。"},{kind:"note",tone:"ok",title:"为什么“ID 数值小”就等于“优先级高”",text:"因为数字小的 ID 在高位上更早出现 0，而 0 是显性、会覆盖别人的 1。0x123（二进制 001 0010 0011）与 0x2A0（010 1010 0000）从最高位比，第 2 位就分出胜负：前者是 0、后者是 1，于是 0x123 赢。**结论：ID 数值越小，优先级越高**，与 ID 的“含义”无关。"},{kind:"p",text:"工程含义很直接：**把最紧急的报文分配最小的 ID**。急停、故障、电机过流这类帧给 0x0xx 量级的小 ID；状态上报、诊断这类慢帧给大 ID。反过来，如果两个节点用同一个 ID 发不同的数据，仲裁不会报错（它们会一直“一致”到数据段才可能分叉），结果就是数据被悄悄覆盖——这是设计错误，不是仲裁能救的。"}]},{id:"bit-timing",title:"位定时：把一个位切成四段",lead:"两个节点必须对“一位有多长、在哪一刻采样”达成一致，否则收到的全是位错误。",blocks:[{kind:"p",text:"CAN 没有时钟线，靠双方各自的位定时（bit timing）对齐。做法是把一个位时间切成若干个**时间份额 TQ（Time Quantum）**，TQ 由 CAN 外设时钟分频得到；再把整个位时间划成四段。接收方在每个位的**采样点（sample point）**读一次总线，采样点之前的部分用来容忍延迟，之后的部分用来容忍偏差。"},{kind:"table",caption:"各段可取的 TQ 数由外设寄存器位宽限制，具体范围见 RM0090 的 bxCAN 位定时章节；表中数值为教学示意。",head:["段","作用","长度"],rows:[["同步段 Sync_Seg","期待总线跳变沿落在这里，各节点用边沿对齐自己的位边界（硬同步）","固定 1 TQ"],["传播段 Prop_Seg","补偿收发器与线缆的传播延迟、比较器延迟，让采样点落在信号真正稳定的位置","1 到多个 TQ，按环路延迟估"],["相位缓冲段 1 Phase_Seg1","采样点之前的余量；重同步时“沿来早了”就临时延长它","可编程 TQ 数"],["相位缓冲段 2 Phase_Seg2","采样点之后的余量；重同步时“沿来晚了”就临时缩短它","可编程 TQ 数"],["采样点 Sample Point","真正读总线的那一瞬间，位置由 Sync + Prop + Phase_Seg1 决定","由前三段决定"],["重同步跳转宽度 SJW","一次重同步最多能挪动多少 TQ，限制调整幅度，避免被干扰带偏","1 到 min(Phase_Seg1, Phase_Seg2)"]]},{kind:"formula",latex:"t_{\\mathrm{bit}} = t_{\\mathrm{Sync\\_Seg}} + t_{\\mathrm{Prop\\_Seg}} + t_{\\mathrm{Phase\\_Seg1}} + t_{\\mathrm{Phase\\_Seg2}}",caption:"位时间就是四段之和。写成 TQ 数就是 t_bit = (1 + Prop_Seg + Phase_Seg1 + Phase_Seg2) × t_Q，其中 t_Q = 1 / f_CAN（f_CAN 是 CAN 外设时钟经预分频后的频率）。"},{kind:"formula",latex:"\\mathrm{Bitrate} = \\frac{1}{t_{\\mathrm{bit}}} = \\frac{f_{\\mathrm{CAN\\_clk}}}{\\mathrm{BRP} \\times \\left(1 + \\mathrm{Prop\\_Seg} + \\mathrm{Phase\\_Seg1} + \\mathrm{Phase\\_Seg2}\\right)},\\qquad \\text{采样点} = \\frac{1 + \\mathrm{Prop\\_Seg} + \\mathrm{Phase\\_Seg1}}{1 + \\mathrm{Prop\\_Seg} + \\mathrm{Phase\\_Seg1} + \\mathrm{Phase\\_Seg2}}",caption:"波特率 = 1 / 位时间。BRP 是预分频系数（寄存器里通常写“分频值 − 1”，见手册）。右边是采样点位置：常见设计落在 **75%–87.5% 量级**（典型范围，示意），具体取值要按规范、收发器延迟和整网约定来算，不能照抄。"},{kind:"ol",items:["**确认 CAN 时钟**：查清 CAN1 挂在哪条总线上、当前频率是多少（F407 上 CAN1 在 APB1），这是所有计算的输入。","**选目标波特率与 TQ 数**：先按整网约定定下波特率，再选一个合适的位时间 TQ 总数（常见 8–25 TQ 量级，示意），除出每个 TQ 的时间。","**算 BRP**：BRP = f_CAN / (波特率 × 位时间总 TQ 数)，取整并核对误差；除不尽就换 TQ 总数重算。","**分配四段**：Prop_Seg 按收发器与线缆延迟估（留余量），Phase_Seg1 / Phase_Seg2 用来凑出想要的采样点。","**定 SJW**：一般取 1 TQ 起步；晶振误差大或总线长时可以适当加大，但不得超过 min(Phase_Seg1, Phase_Seg2)。","**写寄存器并进正常模式**：置 `MCR` 的初始化请求 → 配置 `BTR` → 清初始化请求 → 等 `MSR` 确认，才能真正收发。","**两节点必须一致**：全网的波特率、采样点约定要统一；只改一个节点，它就会用错误帧把整条总线搅乱。"]},{kind:"note",tone:"warn",title:"CAN FD 的位定时要配两套",text:"经典 CAN 只有一套位定时；CAN FD 有**仲裁段（标称速率）**和**数据段（BRS 之后的数据速率）**两套位定时，各自都要满足采样点与容差要求。G474 这类带 FDCAN 的芯片对应的是 `HAL_FDCAN_*` 系列接口，寄存器布局与 F407 的 bxCAN 完全不同——本页的寄存器口径按 bxCAN 写，换芯片务必重查手册。"}]},{id:"errors",title:"错误处理：错误帧与三种状态",lead:"CAN 把“出错”也做成了总线行为：谁出错谁被记账，记多了就自动闭嘴。",blocks:[{kind:"p",text:"CAN 的可靠性不只靠 CRC，还靠**每个节点都在监视总线**。发送方会回读自己发出的每一位，接收方会检查填充规则、CRC、固定格式位。任何一方发现不对，就立刻发一个**错误帧（error frame）**，把当前这帧“作废”，让全网一起丢弃它，然后由发送方重发。"},{kind:"table",head:["错误类型","怎么被发现","典型原因"],rows:[["位错误 Bit Error","发出的位与回读的位不一致（仲裁段除外，那里本来就允许被覆盖）","位定时不一致、总线被强干扰、收发器故障"],["填充错误 Stuff Error","出现连续 6 个同极性位，违反“5 个后必须插 1 个相反位”的规则","波特率不匹配、采样点偏移导致误判"],["CRC 错误 CRC Error","接收方重算的 CRC 与帧里带的不一致","干扰、收发器或线缆问题、两端配置不一致"],["格式错误 Form Error","固定格式位（CRC 界定符、ACK 界定符、EOF）出现了不允许的显性位","严重干扰、节点配置错误"],["ACK 错误 ACK Error","发送方在 ACK 槽没等到任何节点把它拉低","总线上只有自己一个节点、对方波特率不对、链路断开"]]},{kind:"p",text:"每个节点内部有两个**错误计数器**：**TEC（Transmit Error Counter，发送错误计数器）** 与 **REC（Receive Error Counter，接收错误计数器）**。发现错误就加（发送侧加得多，接收侧加得少），成功收发就减。计数器决定节点处在哪个状态——这就是“错误主动 / 错误被动 / 总线关闭”的由来。"},{kind:"table",caption:"阈值 127 / 255 与恢复条件来自 CAN 规范；具体实现（自动恢复、离线后行为）以芯片手册为准。",head:["状态","进入条件","行为"],rows:[["错误主动 Error Active","TEC ≤ 127 且 REC ≤ 127","正常工作；发现错误时发**主动错误帧**（6 个连续显性位），能强行打断当前帧"],["错误被动 Error Passive","TEC 或 REC > 127","仍能收发，但错误帧改为**被动错误帧**（6 个隐性位），不再打断别人的帧，只在自己的帧里报错"],["总线关闭 Bus-Off","TEC > 255","收发器脱离总线，不再发送任何帧；要满足规范的恢复条件（检测到足够多的隐性位序列）或靠硬件自动恢复才能重新加入"]]},{kind:"note",tone:"danger",title:"看到 TEC 一路涨到 255，先查物理层",text:"TEC 快速上涨几乎总是三件事：**终端电阻缺失或不匹配**、**两端波特率/位定时不一致**、**总线上没有第二个节点应答 ACK**。真正的“软件 bug”很少能把 TEC 顶到总线关闭。反过来，如果 REC 一直涨而 TEC 正常，重点查接收侧的采样点、滤波器配置和线缆。"},{kind:"ul",items:["**错误帧不携带 ID**：它是全网广播的“作废信号”，没有地址，所以不会有人“没收到”。","**错误计数器会自己回落**：成功收发会让计数器减，短暂干扰能自愈；只有持续故障才会把节点推向总线关闭。","**总线关闭是保护而不是故障**：一个坏节点如果继续狂发错误帧，会把整条总线拖垮；让它闭嘴，剩下的节点才能继续工作。"]}]},{id:"code",title:"动手写：过滤器 + 发一帧",lead:"HAL 把 bxCAN 的初始化、过滤器、邮箱都包成了结构体，但“先配过滤器再 Start”的顺序不能颠倒。",blocks:[{kind:"p",text:"这段代码解决三件事：**把 CAN1 拉起来并配好位定时** → **加一组过滤器，只收 0x123** → **启动并把一帧 4 字节数据丢进邮箱**。注意过滤器必须在 `HAL_CAN_Start` 之前配好，否则启动瞬间收到的帧会因为没有过滤器而全部被丢弃。"},{kind:"code",title:"HAL：初始化 CAN1 + 配置过滤器 + 发送一帧（学习示意，分频与位定时参数须按你的 PCLK1 重算）",language:"c",code:`#include "stm32f4xx_hal.h"

CAN_HandleTypeDef hcan;
CAN_TxHeaderTypeDef txHeader;
uint8_t txData[4] = {0x11, 0x22, 0x33, 0x44};
uint32_t txMailbox;

static void APP_CAN_Init(void)
{
    /* ---- 1. 位定时与工作模式（数值仅示意，必须按 PCLK1 与目标波特率算） ---- */
    /* CAN1 的时钟与 PB8/PB9 复用引脚由 CubeMX 生成的配置打开，此处略 */
    hcan.Instance = CAN1;
    hcan.Init.Prescaler         = 6;                 /* 预分频 BRP，示意值 */
    hcan.Init.Mode              = CAN_MODE_NORMAL;   /* 正常模式；自测可先用 CAN_MODE_LOOPBACK */
    hcan.Init.SyncJumpWidth     = CAN_SJW_1TQ;       /* 重同步跳转宽度 SJW */
    hcan.Init.TimeSeg1          = CAN_BS1_11TQ;      /* 传播段 + 相位缓冲段 1，示意值 */
    hcan.Init.TimeSeg2          = CAN_BS2_2TQ;       /* 相位缓冲段 2，示意值 */
    hcan.Init.TimeTriggeredMode = DISABLE;           /* 时间触发模式，一般不用 */
    hcan.Init.AutoBusOff        = ENABLE;            /* 总线关闭后由硬件自动恢复 */
    hcan.Init.AutoWakeUp        = DISABLE;           /* 自动唤醒（睡眠模式下才有意义） */
    hcan.Init.AutoRetransmission= ENABLE;            /* 发送失败/仲裁失败后硬件自动重发 */
    hcan.Init.ReceiveFifoLocked = DISABLE;           /* FIFO 满时覆盖旧帧，而不是锁死 */
    hcan.Init.TransmitFifoPriority = DISABLE;        /* 按 ID 优先级排队，而不是按入队顺序 */

    if (HAL_CAN_Init(&hcan) != HAL_OK) {
        Error_Handler();
    }

    /* ---- 2. 过滤器：只让标准 ID 0x123 进 FIFO0 ---- */
    CAN_FilterTypeDef filter = {0};
    filter.FilterBank           = 0;                     /* 用过滤器组 0 */
    filter.FilterMode           = CAN_FILTERMODE_IDMASK;  /* 掩码模式：关心 mask 里为 1 的位 */
    filter.FilterScale          = CAN_FILTERSCALE_32BIT;  /* 32 位尺度 */
    filter.FilterIdHigh         = (uint16_t)(0x123U << 5); /* 标准 ID 左对齐到 16 位高位 */
    filter.FilterIdLow          = 0x0000;
    filter.FilterMaskIdHigh     = (uint16_t)(0x7FFU << 5); /* 掩码 = 11 位 ID 全比较 */
    filter.FilterMaskIdLow      = 0x0000;
    filter.FilterFIFOAssignment = CAN_FILTER_FIFO0;        /* 命中的帧进 FIFO0 */
    filter.FilterActivation     = ENABLE;

    if (HAL_CAN_ConfigFilter(&hcan, &filter) != HAL_OK) {
        Error_Handler();
    }

    /* ---- 3. 启动 CAN，并打开 FIFO0 接收中断 ---- */
    if (HAL_CAN_Start(&hcan) != HAL_OK) {
        Error_Handler();
    }
    if (HAL_CAN_ActivateNotification(&hcan, CAN_IT_RX_FIFO0_MSG_PENDING) != HAL_OK) {
        Error_Handler();
    }
}

/* ---- 4. 发送一帧标准数据帧 ---- */
HAL_StatusTypeDef APP_CAN_Send(uint32_t stdId, const uint8_t *data, uint8_t len)
{
    txHeader.StdId = stdId;                 /* 11 位标准 ID，越小优先级越高 */
    txHeader.ExtId = 0;                     /* 标准帧不用扩展 ID */
    txHeader.IDE   = CAN_ID_STD;            /* 标准帧；扩展帧用 CAN_ID_EXT + ExtId */
    txHeader.RTR   = CAN_RTR_DATA;          /* 数据帧；远程帧用 CAN_RTR_REMOTE */
    txHeader.DLC   = len;                   /* 数据长度，经典 CAN 最大 8 */
    txHeader.TransmitGlobalTime = DISABLE;  /* 不用时间戳 */

    return HAL_CAN_AddTxMessage(&hcan, &txHeader, (uint8_t *)data, &txMailbox);
}

/* ---- 5. 接收回调：从 FIFO0 取出并释放 ---- */
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcanPtr)
{
    CAN_RxHeaderTypeDef rxHeader;
    uint8_t rxData[8];

    if (HAL_CAN_GetRxMessage(hcanPtr, CAN_RX_FIFO0, &rxHeader, rxData) == HAL_OK) {
        /* rxHeader.StdId / rxHeader.DLC / rxData[] 就是这一帧的内容 */
    }
}`,explain:[{item:"Prescaler / TimeSeg1 / TimeSeg2",desc:"三者共同决定位时间与采样点。这里填的是“示意占位”，真实值必须用公式从 PCLK1 和目标波特率反算，并核对采样点位置。"},{item:"Mode = CAN_MODE_NORMAL",desc:"正常收发模式。板上只有自己一个节点时，可用 CAN_MODE_LOOPBACK 自测，避免因为没人应答 ACK 而一直报错。"},{item:"AutoBusOff = ENABLE",desc:"总线关闭后允许硬件自动恢复；设为 DISABLE 时软件必须自己处理恢复流程。"},{item:"AutoRetransmission = ENABLE",desc:"关掉它就等于放弃“仲裁失败自动重发”这个特性，除非你明确要做一次性发送。"},{item:"FilterIdHigh 左移 5 位",desc:"标准帧的 11 位 ID 在 32 位过滤器里占 bit31:21，所以写 `FilterIdHigh` 时要左移 5 位对齐到高半部分；位置写错会一个帧都收不到。"},{item:"FilterMaskIdHigh = 0x7FF << 5",desc:"掩码里为 1 的位必须匹配、为 0 的位不关心。要“全通过”测试硬件通路，就把掩码清零。"},{item:"HAL_CAN_ConfigFilter 在 Start 之前",desc:"过滤器属于接收路径，必须在使能 CAN 之前配好，否则上电瞬间的帧会被丢弃。"},{item:"HAL_CAN_AddTxMessage",desc:"把帧放进一个空闲发送邮箱并立即返回；真正的仲裁与重发由硬件完成，`txMailbox` 告诉你用了哪个邮箱。"},{item:"DLC = len",desc:"经典 CAN 一帧最多 8 字节（DLC 0–8），要发更长只能用 CAN FD 或在上层分包，不能靠“写大 DLC”硬塞。"}]},{kind:"note",tone:"info",title:"过滤器不是“地址筛选”，是硬件匹配",text:"bxCAN 有若干组过滤器（bank），每组可以配成**掩码模式**（关心哪几位）或**列表模式**（精确匹配一串 ID），决定“哪些 ID 进 FIFO0 / FIFO1”。命中过滤器的帧才进 FIFO、才触发中断，其余的在硬件层就被扔掉，不占 CPU。这也是 CAN 能在高负载下仍保持低 CPU 占用的原因。"},{kind:"tabs-code",title:"同一件事（把 CAN1 拉起来）的三种写法",note:"STM32 的 LL 库**没有覆盖 CAN 外设**（LL 只做了 GPIO/RCC/TIM/USART/SPI/I2C 等），所以中间这栏只写得到“时钟与引脚”，bxCAN 本体只能落到寄存器写法——这不是省略，是这套芯片的现实。寄存器名与位定义以 RM0090 的 bxCAN 章节为准。",variants:[{label:"HAL",language:"c",code:`CAN_HandleTypeDef hcan;

hcan.Instance = CAN1;
hcan.Init.Prescaler = 6;
hcan.Init.Mode = CAN_MODE_NORMAL;
hcan.Init.SyncJumpWidth = CAN_SJW_1TQ;
hcan.Init.TimeSeg1 = CAN_BS1_11TQ;
hcan.Init.TimeSeg2 = CAN_BS2_2TQ;
hcan.Init.AutoBusOff = ENABLE;
hcan.Init.AutoRetransmission = ENABLE;
HAL_CAN_Init(&hcan);

CAN_FilterTypeDef f = {0};
f.FilterBank = 0;
f.FilterMode = CAN_FILTERMODE_IDMASK;
f.FilterScale = CAN_FILTERSCALE_32BIT;
f.FilterIdHigh = (uint16_t)(0x123U << 5);
f.FilterMaskIdHigh = (uint16_t)(0x7FFU << 5);
f.FilterFIFOAssignment = CAN_FILTER_FIFO0;
f.FilterActivation = ENABLE;
HAL_CAN_ConfigFilter(&hcan, &f);

HAL_CAN_Start(&hcan);`},{label:"LL（时钟/引脚）",language:"c",code:`/* 时钟与复用引脚：这一段 LL 有现成接口 */
LL_AHB1_GRP1_EnableClock(LL_AHB1_GRP1_PERIPH_GPIOB);
LL_APB1_GRP1_EnableClock(LL_APB1_GRP1_PERIPH_CAN1);

/* PB8 = CAN1_RX，PB9 = CAN1_TX（F407 上复用功能为 AF9） */
LL_GPIO_SetPinMode(GPIOB, LL_GPIO_PIN_8, LL_GPIO_MODE_ALTERNATE);
LL_GPIO_SetPinMode(GPIOB, LL_GPIO_PIN_9, LL_GPIO_MODE_ALTERNATE);
LL_GPIO_SetPinOutputType(GPIOB, LL_GPIO_PIN_9, LL_GPIO_OUTPUT_PUSHPULL);
LL_GPIO_SetPinSpeed(GPIOB, LL_GPIO_PIN_9, LL_GPIO_SPEED_FREQ_VERY_HIGH);
LL_GPIO_SetAFPin_8_15(GPIOB, LL_GPIO_PIN_8, LL_GPIO_AF_9);
LL_GPIO_SetAFPin_8_15(GPIOB, LL_GPIO_PIN_9, LL_GPIO_AF_9);

/* 再往下就是 bxCAN 寄存器了——LL 库没有对应封装 */`,explain:[{item:"LL_AHB1_GRP1_PERIPH_GPIOB",desc:"GPIO 挂在 AHB1，使能时钟后才能写它的寄存器。"},{item:"LL_APB1_GRP1_PERIPH_CAN1",desc:"F407 的 CAN1 挂在 APB1，这个频率也是位定时计算的输入。"},{item:"LL_GPIO_AF_9",desc:"PB8/PB9 在 F407 上的 CAN1 复用号是 AF9，不同封装/系列要查数据手册的复用表。"}]},{label:"寄存器（bxCAN）",language:"c",code:`/* 1. 进入初始化模式（此时才能改 BTR/过滤器） */
CAN1->MCR |= CAN_MCR_INRQ;
while ((CAN1->MSR & CAN_MSR_INAK) == 0U) { }   /* 等 MSR.INAK 置位 */

/* 2. 位定时：BRP 字段写“分频值 − 1”，各段数值为示意 */
CAN1->BTR = ((6U - 1U) << CAN_BTR_BRP_Pos)     /* 预分频 */
          | ((12U - 1U) << CAN_BTR_TS1_Pos)    /* 传播段 + 相位缓冲段 1 */
          | ((3U - 1U)  << CAN_BTR_TS2_Pos)    /* 相位缓冲段 2 */
          | (0U         << CAN_BTR_SJW_Pos);   /* SJW = 1 TQ */

/* 3. 过滤器：组 0 = 32 位、掩码模式、只关心标准 ID 0x123、命中进 FIFO0 */
CAN1->FMR |= CAN_FMR_FINIT;                    /* 过滤器也进入初始化模式 */
CAN1->FM1R &= ~(1U << 0);                      /* 0 = 掩码模式（1 = 标识符列表） */
CAN1->FS1R |= (1U << 0);                       /* 1 = 32 位尺度 */
CAN1->sFilterRegister[0].FR1 = (0x123U << 21); /* 要匹配的标准 ID，左对齐（位布局见手册） */
CAN1->sFilterRegister[0].FR2 = (0x7FFU << 21); /* 掩码：只比较这 11 位，其余不关心 */
CAN1->FFA1R &= ~(1U << 0);                     /* 0 = 进 FIFO0（1 = FIFO1） */
CAN1->FA1R |= (1U << 0);                       /* 激活组 0 */
CAN1->FMR &= ~CAN_FMR_FINIT;                   /* 退出过滤器初始化 */

/* 4. 退出初始化模式 → 进入正常模式，可以收发 */
CAN1->MCR &= ~CAN_MCR_INRQ;
while ((CAN1->MSR & CAN_MSR_INAK) != 0U) { }`,explain:[{item:"CAN_MCR_INRQ / CAN_MSR_INAK",desc:"一个请求、一个确认：写 INRQ 后必须等 INAK 置位，才说明已经停在初始化模式，否则后面的 BTR 写入可能不生效。"},{item:"CAN1->BTR",desc:"BRP/TS1/TS2 三个字段都是“实际值 − 1”的编码，写错 1 就会让波特率整体偏掉。"},{item:"CAN_FMR_FINIT",desc:"过滤器有独立的初始化模式，改 FM1R/FS1R/FA1R 之前必须先置位，改完再清。"},{item:"sFilterRegister[0].FR1 / FR2",desc:"32 位尺度下 FR1 放要匹配的 ID、FR2 放掩码，标准 ID 在 32 位里是左对齐的；具体位布局对照 RM0090 的过滤器章节，这里是简化示意。"}]}]},{kind:"compare",cardId:"can"},{kind:"p",text:"这一页讲的是“总线本身”。回到整站视角：UART / I²C / SPI 解决的是**芯片与外设之间**的短距离通信，CAN 解决的是**多个节点之间**的可靠广播；再往上还有 USB（主机-设备）与以太网（TCP/IP），它们的取舍逻辑完全不同——后续批次会展开。"}]}],mistakes:[{mistake:"终端电阻漏接：一个都没接，或只在板子上接了一个",symptom:"桌面上短距离、低波特率时看着能通，一上长线或提高波特率就大量错误帧，TEC 飞涨直到总线关闭；示波器上看波形有明显振铃/过冲",fix:"断电后用万用表量 CANH 与 CANL 之间的直流电阻：两端各一个 120 Ω 量级电阻时，应量到 60 Ω 量级。量到 120 Ω 说明只接了一个，量到很大说明一个都没接。终端只在总线物理两端加，中间节点不要加。"},{mistake:"两个节点的波特率 / 位定时不一致（BRP、TS1、TS2 算错或抄了别的板子的值）",symptom:"单个节点自测（回环模式）完全正常，一接上总线就满屏位错误、ACK 错误，两个节点谁也发不出去；用逻辑分析仪量到的位宽与对方对不上",fix:"分别算出两边的位时间：BRP = f_CAN / (波特率 × 位总 TQ 数)，再核对采样点位置。确认两边的 CAN 外设时钟频率不同（比如一个 42 MHz、一个 36 MHz）时，不能直接抄同一组参数。用示波器量一位的实际宽度做交叉验证。"},{mistake:"ID 冲突：两个节点用同一个 ID 发不同内容",symptom:"同一 ID 的报文时而来自另一个节点：接收端把两个来源当同一个信号，后到的把先到的覆盖掉；如果两者恰好在同一时刻发送且数据不同，还会在数据段分叉、触发位错误与反复重传，抓包表现为“这个 ID 偶尔整帧消失”",fix:"维护一张全网 ID 分配表（ID、发送节点、周期、含义），抓包按 ID 分组统计来源与周期。仲裁只解决“谁先说”，不解决“谁该用哪个 ID”——同 ID 双发是设计错误，改 ID 或改发送职责。"},{mistake:"过滤器没配好：掩码写错、过滤器组没激活、FIFO 分配错",symptom:"发送正常（TSR 显示成功），但 `HAL_CAN_GetRxMessage` 永远拿不到帧、接收中断不触发；或者反过来，收到一堆不关心的 ID 把 FIFO 冲爆",fix:"先把掩码全部清零做“全通过”测试，确认硬件通路和中断没问题；再逐位收紧掩码。重点查三处：`FA1R` 有没有激活该组、`FFA1R` 的 FIFO 分配、以及标准 ID 在 32 位过滤器里有没有左对齐（`<< 5`）。"},{mistake:"总线上只有自己一个节点，却在正常模式下等待发送成功",symptom:"`HAL_CAN_AddTxMessage` 返回成功，但邮箱一直不空、TEC 持续上涨并报 ACK 错误，最后总线关闭",fix:"CAN 的 ACK 需要至少一个其他节点（或回环）来拉低 ACK 槽。单板调试请把模式改成 `CAN_MODE_LOOPBACK`，或接第二块板/一个 CAN 分析仪。这不是代码 bug，是拓扑缺了应答方。"}],takeaways:["CAN 是差分多主总线：显性（0）覆盖隐性（1），终端电阻两端各一个 120 Ω 量级；总线空闲为隐性。","仲裁逐位比较、ID 数值越小优先级越高，输的一方立即退出且数据不丢，由硬件在总线空闲后自动重发——这就是无损仲裁。","位时间 = 同步段 + 传播段 + 相位缓冲段 1、2，波特率 = 1 / 位时间；出错靠错误帧与 TEC/REC 记账，涨过头就进入错误被动甚至总线关闭。"],quizIds:["can-q1","can-q2","can-q3"],keywords:["CAN","CAN FD","差分总线","显性/隐性","仲裁","位定时","采样点","错误计数器","终端电阻","bxCAN"]};export{e as canLesson};
