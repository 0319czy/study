const R={slug:"uart",title:"UART",en:"Universal Asynchronous Receiver/Transmitter",oneLine:"UART 是异步串口：没有时钟线，双方约定波特率，把每个字节拆成起始位、数据位、校验位、停止位一位位发出去。",category:"protocol",level:"入门",minutes:25,goals:["能画出并说出 UART 一帧的组成，解释为什么没有时钟线也能对齐","会用误差公式估算波特率偏差，并说清为什么要在位中间采样、16 倍过采样有什么用","能区分 TTL、RS232、RS485 的电平、距离、差分与共地差异，不再把它们当协议","能用 HAL 写出“初始化 + 中断接收 + 回显”，并在回调里正确重新挂接收"],analogy:{title:"UART 像两个人隔着操场喊数字",text:"没有节拍器，只能事先约好“每秒喊几位”。开口先喊一声“喂”（起始位），对方听到就对齐节奏；每个字念完停半拍（停止位），下一句才接得上。要是两人语速差一点，前面还听得清，到句尾就已经错位——波特率误差就是这么一位一位累积起来的。"},why:["**调试和日志的第一入口**：把 `printf` 重定向到 UART，几乎是每个 MCU 工程的“第一行可见输出”；没有它，很多问题只能靠猜。","**大量模块的默认接口**：GPS、蓝牙、Wi‑Fi、指纹、称重、扫码模块大多用 UART 发 AT 指令或上报数据，会接串口就能先用起来。","**电气层决定“能不能出门”**：芯片引脚是 TTL 电平，板内直连可以；出了板子就要换 RS232/RS485，不懂这一层会乱码甚至烧口。","**中断、环形缓冲、DMA 的最佳练手场**：串口不定长接收把“外设事件 → 缓冲 → 主循环”这条链路讲得最完整。"],sections:[{id:"async-basics",title:"没有时钟线的异步串口",lead:"UART 最反直觉的一点：线上只有数据，没有时钟；时钟是双方各自“心里数”出来的。",blocks:[{kind:"p",text:"**UART（Universal Asynchronous Receiver/Transmitter，通用异步收发器）** 用两根信号线完成全双工点对点通信：一根 TX 发、一根 RX 收，再加一根地线。**异步**的意思是**没有共享的时钟线**——发送方按自己的节奏把每一位推上线，接收方靠“约定的波特率”倒推出每一位有多长，再在每位中间把电平读走。空闲时线保持**高电平**；一帧开始时发送方把线拉低一个位时间，这个下降沿就是接收方的对齐信号。"},{kind:"terms",items:[{zh:"异步串行",en:"Asynchronous Serial",desc:"收发双方没有共享时钟线，靠事先约定的波特率各自计时；UART 是最常见的异步串行接口。"},{zh:"UART / USART",en:"Universal (Synchronous/)Asynchronous Receiver/Transmitter",desc:"UART 只做异步；STM32 里外设叫 USART，多一个同步模式，异步用法与 UART 一致。"},{zh:"波特率",en:"Baud Rate",desc:"每秒传输的符号数；二进制 UART 里一个符号就是一位，所以数值上等于 bit/s。"},{zh:"位时间",en:"Bit Time",desc:"一位在线上持续的时间，等于 1/波特率；115200 波特率下约 8.68 µs（示意）。"},{zh:"帧",en:"Frame",desc:"一次字符传输的完整位序列：起始位 + 数据位 + 可选校验位 + 停止位。"}]},{kind:"p",text:"一帧里每个字段都有明确分工。最常见的 **8N1** 配置是：1 位起始位 + 8 位数据位 + 0 位校验位 + 1 位停止位，一共 **10 位**；数据**低位先发（LSB first）**，这一点和“人写数字从左往右”的直觉相反。"},{kind:"table",caption:"位数为常见配置；STM32F4/G4 的 USART 字长、停止位可选值以参考手册 USART 章节为准。",head:["字段","线上形态","作用","缺了会怎样"],rows:[["起始位","1 个位时间的低电平","把空闲的高电平“打断”，告诉接收方一帧开始，并让它对齐位边界","接收方等不到帧头；或把数据里的 0 误当成起始位（假起始）"],["数据位","5–9 位（通用 UART），低位先发；STM32F4 的 USART 只有 8/9 位字长，常用 8 位数据","真正要传的字节（或一小段信息）","没有内容可传"],["校验位","0 或 1 位，可选奇校验 / 偶校验","让“1 的个数”满足奇偶约定，接收方可检出部分比特错误","少一层廉价检错，只能靠上层 CRC 或协议规则发现错误"],["停止位","1 / 1.5 / 2 个位时间的高电平","标志一帧结束，给接收方留处理时间，并让线路回到空闲","帧边界不清，下一帧的起始位可能被误判"]]},{kind:"note",tone:"tip",title:"波特率不是“字节率”",text:"115200 波特率、8N1 时，一帧 10 位，理论上限约 **11520 字节/秒**（示意计算：115200 ÷ 10）。实际还要扣掉协议头、校验和、握手与处理时间，所以“串口很快”只是相对调试打印而言。"},{kind:"p",text:"接收方只在**起始位的下降沿**对齐一次，之后就不再观察线，而是按自己的位时间数到每位中间去采样。于是所有压力都落到一件事上：**双方的位时间必须足够接近**。这就是下一节要算的误差。"}]},{id:"baud-error",title:"波特率、误差与采样点",lead:"异步的代价：两边的时钟不可能完全一样，误差会一位一位累积。",blocks:[{kind:"p",text:"波特率决定**位时间**：`位时间 = 1 / 波特率`。115200 波特率下一位约 **8.68 µs**，一帧 10 位约 **86.8 µs**（示意）。发送方用 APB 总线时钟分频出这个位时间，接收方用同一个公式还原。问题在于：分频只能取有限精度（STM32 的 `BRR` 用整数 + 小数表示），晶振或内部 RC 本身也有偏差，所以**实际波特率几乎不会精确等于目标值**。"},{kind:"formula",latex:"\\varepsilon = \\frac{f_{\\mathrm{actual}} - f_{\\mathrm{target}}}{f_{\\mathrm{target}}}",caption:"误差 =（实际波特率 − 目标波特率）/ 目标波特率；结果乘 100% 即百分比。分母取目标值，正负号分别表示偏快、偏慢。"},{kind:"p",text:"**误差为什么会累积**：接收方只在起始沿对齐一次，之后靠自己的位时间“数格子”。如果接收方每位实际比发送方短（或长）一点点，那么第 n 个采样点相对理想位置就会偏移约 **n × 误差 × 位时间**。越往后偏得越多，到停止位时偏移最大；当偏移接近**半个位时间**，采样点就会落到相邻位甚至帧边界上——现象是偶发乱码、帧错误、校验错误，而且往往“低速正常、高速就出问题”。"},{kind:"p",text:"举个例子：目标 115200，实际 118400，误差约 **+2.8%**（3200 ÷ 115200，示意）。8N1 一帧 10 位，停止位的采样点在起始沿之后约 9.5 个位时间处，累计偏移约 **0.27 个位时间**——还采得到，但原本“半位”的余量只剩约 0.23 位。若误差到 **5%**，偏移约 0.48 位，几乎踩在边沿上，误码就变成常态。工程上常把总误差控制在 **2–3% 量级**，具体取决于帧长、时钟精度与是否带校验，**以手册和实测为准**。"},{kind:"p",text:"**过采样（Oversampling）** 是接收端的容错手段：接收器不以 1 倍波特率采样，而是用 **16 倍波特率**（常见配置 16×）的采样时钟（115200 × 16 ≈ 1.84 MHz，示意）去“数”每一位。检测到起始沿后复位计数器，在一位的中间位置连续取几个点做判决——多数 STM32 USART 在 16 倍过采样下取第 8、9、10 个采样点做**三取二**判决（具体实现以参考手册为准）。这样单点噪声不至于翻转结果，同时“在中间采样”让前、后沿都留出最大余量。高速率下也可以选 **8 倍过采样**，换取更细的分频与更高上限。"},{kind:"ul",items:["**为什么在中间采样**：位边界附近正在跳变，最容易被振铃、边沿抖动和噪声污染；位中间最稳定。","**16 倍过采样的意义**：时间分辨率变成 1/16 位，接收器能更细地对齐起始沿；`BRR` 里的小数位就是为这个分辨率服务的。","**三取二判决**：连续采样三次按多数取值，能压住单点毛刺；但它**压不住持续的波特率偏差**，偏差只能靠校准时钟或降低速率解决。"]},{kind:"kv",items:[{k:"115200 波特率的位时间",v:"约 8.68 µs（示意）"},{k:"8N1 一帧",v:"10 位，约 86.8 µs（示意）"},{k:"16× 过采样时钟",v:"115200 × 16 ≈ 1.84 MHz（示意）"},{k:"常用误差预算",v:"2–3% 量级，以手册与实测为准"}]},{kind:"lab",labId:"uart-frame",caption:"改数据、波特率与校验位，单步逐位看起始位 → 数据位 → 校验位 → 停止位，并观察采样点从帧头到帧尾的漂移。"},{kind:"note",tone:"warn",title:"“两边都写 115200”不等于实际一致",text:"同样的 115200，一边用外部晶振、一边用未校准的内部 RC，实际频率可能差出千分之几到百分之几（量级，以数据手册为准）；再叠加 `BRR` 的量化误差，高速率下就容易翻车。排查时先量**一个位的实际宽度**，再套上面的误差公式，比盯着“配置是否一致”有效得多。"}]},{id:"parity-flow",title:"校验位、9 位数据与流控",lead:"帧里还能塞三样东西：一位校验、一个第 9 位、两根流控线。",blocks:[{kind:"p",text:"**奇偶校验（Parity）** 是最便宜的检错：发送方硬件根据数据位里“1 的个数”补一位，让总个数满足约定；接收方硬件重新数一遍，不符就置校验错误标志。它**只能发现奇数个比特翻转**（最常见的是 1 位翻转），**不能纠错**；偶数个比特同时翻转会漏检。所以它适合低速、短帧、老设备，不适合当唯一的数据完整性保障——强检错交给上层的 CRC 或协议校验。"},{kind:"table",caption:"校验位由收发双方的 USART 硬件生成/核对；具体错误标志与中断使能见参考手册 USART 章节。",head:["校验方式","规则","能检出","代价与常见场景"],rows:[["无（None）","不附加校验位","只能靠帧格式与上层校验发现错误","8N1 最常见；短距离、调试口、模块 AT 指令"],["奇（Odd）","数据位 + 校验位中“1”的个数为奇数","奇数个比特翻转（含最常见的 1 位翻转）","多 1 位开销；老式低速链路常用"],["偶（Even）","数据位 + 校验位中“1”的个数为偶数","奇数个比特翻转（含最常见的 1 位翻转）","多 1 位开销；与奇校验二选一，双方必须一致"]]},{kind:"p",text:"**9 位数据与多机通信**：把字长设成 9 位、不开校验时，多出来的第 9 位常被当作“地址/数据”标志（置 1 表示地址帧、置 0 表示数据帧），从机只在自己被点名后才接收后续数据（STM32 的多机模式配置见参考手册）。"},{kind:"p",text:"**硬件流控（RTS/CTS）**：接收方缓冲快满时把 RTS 置为无效（常见为高电平），发送方看到 CTS 无效就暂停，等缓冲腾空再继续——它解决的是“软件来不及取数导致溢出”，不是波特率误差。"},{kind:"note",tone:"info",title:"校验位不是“安全网”",text:"奇偶校验的开销只有 1 位，检错能力也只有一个比特量级；真正的数据完整性通常靠上层：定长帧 + 长度字段 + CRC、超时重传、序号去重。把奇偶校验当“万能纠错”是初学者常见的误解。"}]},{id:"electrical-standards",title:"三种串口电平标准",lead:"TTL、RS232、RS485 都是电气层标准：它们规定“引脚上是什么电压、能传多远、要不要共地”，不规定“一帧里哪些字节是命令”。",blocks:[{kind:"p",text:"UART/USART 只规定**位怎么排、什么时候采样**；引脚上到底是 0/3.3 V 还是 ±12 V，是单端还是差分，能拉多长的线，由**电气层标准**决定。芯片引脚直接出来的是 **TTL/CMOS 单端电平**；要变成 RS232 或 RS485，中间必须加**收发器（transceiver）**芯片。所以三者不在同一层：**UART 是外设与帧逻辑，RS232/RS485 是电气层标准，Modbus 才是应用层协议**。"},{kind:"table",caption:"电压、距离均为教学量级；实际受速率、线材、收发器、终端匹配与规范限制，以对应标准与器件手册为准。",head:["标准","电平（量级）","是否差分","共地","典型距离（量级）","常见场景"],rows:[["TTL / CMOS","0 / 3.3 V（或 0 / 5 V）","否，单端","必须共地","板内几十 cm 到 1 m 量级","芯片间、模块与开发板短距离直连"],["RS232","逻辑 1 约 −3～−15 V，逻辑 0 约 +3～+15 V（以标准为准）","否，单端","必须共地","十几米量级（低速）","PC 串口、老式仪器、调试口"],["RS485","差分 A/B 两线，靠两线电压差判 0/1","是，差分","不要求信号地（但共模范围有限，工程上常共地或隔离）","1200 m 量级（低速）","工业总线、多机半双工、长距离抗干扰"]]},{kind:"note",tone:"danger",title:"RS485 不是协议",text:"把 RS485 叫“协议”是最常见的概念错误：它只规定**差分电平、驱动/接收特性、终端匹配**，并不规定一帧里哪些字节是地址、哪些是命令、怎么应答。那些是 **Modbus** 等应用层协议的事。同理 RS232 也不是协议，STM32 里的 **USART 是外设**。混着叫，排错时就会找错层——电平问题去查帧格式，永远查不出来。"},{kind:"p",text:"工程上还要记住 RS485 的两个细节：二线制是**半双工**，收发方向要由 DE/RE 引脚切换（否则会“自己听自己”或总线冲突）；总线两端通常各接一个 **120 Ω 量级**的终端电阻做匹配（以标准与线缆特性为准）。长距离、地电位差大的场合，优先用**隔离收发器**，而不是硬把两地地线绑在一起。"},{kind:"compare",cardId:"uart"}]},{id:"hal-echo",title:"HAL：初始化与中断回显",lead:"这段代码解决三件事：把 USART1 配成 115200 8N1、收到一个字节就进中断、把字节原样发回去。",blocks:[{kind:"p",text:"下面按“上电后从零到能收能发”的顺序走一遍。真正容易漏的不是初始化，而是**中断的两道门**与**回调里的重新挂接收**——这两处决定了你收到的是“一个字节”还是“持续的数据流”。"},{kind:"ol",items:["**开时钟、配引脚**：打开 USART1 与对应 GPIO 的时钟，把 TX/RX 配成复用功能。复用编号（AF）随型号与封装不同，必须查数据手册/复用表，用 CubeMX 生成最稳。","**填初始化结构体**：波特率、字长、停止位、校验、收发模式、硬件流控、过采样。这些字段共同决定 `BRR` 与 `CR1/CR2` 的最终值。","**调用 `HAL_UART_Init`**：HAL 根据总线时钟与过采样算出 `BRR` 并写入，同时配好帧格式、使能收发。","**开 NVIC**：外设侧的接收中断使能位只是第一道门，还要让 NVIC 放行 `USART1_IRQn`，CPU 才会进中断。","**挂第一次接收**：`HAL_UART_Receive_IT(&huart1, &g_rxByte, 1)` 只挂这一次，收满 1 字节后进回调。","**回调里取数、回显、重新挂**：不重新调用 `HAL_UART_Receive_IT`，就只会收到第一个字节。"]},{kind:"code",title:"USART1 初始化 + 中断接收 + 逐字节回显（F4 示例，G4 换对应头文件）",language:"c",code:`#include "stm32f4xx_hal.h"   /* G474 工程换成 stm32g4xx_hal.h */

UART_HandleTypeDef huart1;

/* 接收缓冲必须常驻：HAL 的中断接收会把下一个字节写进这个地址 */
static uint8_t g_rxByte;

/* 1. 初始化：115200 8N1，16 倍过采样，收发都开 */
void MX_USART1_UART_Init(void)
{
    huart1.Instance          = USART1;
    huart1.Init.BaudRate     = 115200;               /* 目标值；实际值由 BRR 分频得到 */
    huart1.Init.WordLength   = UART_WORDLENGTH_8B;   /* 8 位数据（开校验时字长通常按 9 位算） */
    huart1.Init.StopBits     = UART_STOPBITS_1;      /* 1 个停止位 */
    huart1.Init.Parity       = UART_PARITY_NONE;     /* 无校验：8N1 */
    huart1.Init.Mode         = UART_MODE_TX_RX;      /* 收发都使能 */
    huart1.Init.HwFlowCtl    = UART_HWCONTROL_NONE;  /* 不用 RTS/CTS */
    huart1.Init.OverSampling = UART_OVERSAMPLING_16; /* 16 倍过采样，抗噪更好 */
    if (HAL_UART_Init(&huart1) != HAL_OK) {
        Error_Handler();                             /* CubeMX 生成的错误处理 */
    }

    /* 2. 外设中断之外还要开 NVIC，否则 RXNE 置位也进不了 ISR */
    HAL_NVIC_SetPriority(USART1_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(USART1_IRQn);

    /* 3. 挂第一次接收：收满 1 字节后进 HAL_UART_RxCpltCallback */
    if (HAL_UART_Receive_IT(&huart1, &g_rxByte, 1) != HAL_OK) {
        Error_Handler();
    }
}

/* 4. 中断入口：函数名必须与启动文件向量表完全一致 */
void USART1_IRQHandler(void)
{
    HAL_UART_IRQHandler(&huart1);   /* HAL 清标志、判错误，再分派到回调 */
}

/* 5. 接收完成回调：HAL 的弱函数，用户自己实现 */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        uint8_t b = g_rxByte;                        /* 先取走，避免下一字节覆盖 */
        HAL_UART_Receive_IT(&huart1, &g_rxByte, 1);  /* 先重新挂接收，缩小丢字节窗口 */
        HAL_UART_Transmit(&huart1, &b, 1, 10);       /* 回显；10 ms 只是兜底超时 */
    }
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();            /* CubeMX 生成：USART1 的 TX/RX 复用与时钟使能 */
    MX_USART1_UART_Init();

    while (1) {
        /* 回显在中断里完成；主循环可以继续处理别的任务 */
    }
}`,explain:[{item:"Instance = USART1",desc:"选择外设实例。F407 有 USART1/2/3/6 与 UART4/5，具体数量与引脚以型号数据手册为准。"},{item:"Init.BaudRate = 115200",desc:"这里填的是目标值；`HAL_UART_Init` 会结合总线时钟与过采样算出 BRR。实际波特率与目标值的差，就是上一节的误差。"},{item:"Init.WordLength / StopBits / Parity",desc:"三者共同决定帧格式。本例 8 位数据、1 位停止、无校验 = 8N1；开奇偶校验时，STM32 的字长要把校验位也算进去（8 数据 + 1 校验通常配 9 位字长），以 HAL 头文件注释与参考手册为准。"},{item:"Init.Mode = UART_MODE_TX_RX",desc:"收发都使能。只发不收可以改成 `UART_MODE_TX`，能少开一路中断。"},{item:"Init.HwFlowCtl = UART_HWCONTROL_NONE",desc:"不用 RTS/CTS。要用硬件流控时把对应引脚也配成复用，并在双方同时打开，否则会互相等死。"},{item:"Init.OverSampling = UART_OVERSAMPLING_16",desc:"16 倍过采样，接收端时间分辨率更高、抗噪更好；高速率下可评估改 8 倍过采样，代价是容错余量变小。"},{item:"HAL_UART_Init",desc:"一次性完成：写 BRR、配 CR1/CR2 的帧格式、使能收发与 USART。它不会帮你开 NVIC，也不会启动接收。"},{item:"HAL_NVIC_SetPriority / HAL_NVIC_EnableIRQ",desc:"NVIC 是第二道门。只开外设的 RXNEIE 而不开 NVIC，现象是“数据到了、寄存器标志也置了，但回调永远不进”。"},{item:"HAL_UART_Receive_IT(&huart1, &g_rxByte, 1)",desc:"启动一次中断接收，收满 1 字节进回调。它是“一次性”的：接收完成后 HAL 把状态改回 READY，必须再次调用才会继续收。"},{item:"USART1_IRQHandler",desc:"名字与启动文件向量表绑定，写错一个字母就永远不进；函数体里只调 `HAL_UART_IRQHandler`，别自己清标志。"},{item:"HAL_UART_Transmit 放在回调里",desc:"阻塞发送 1 字节在 115200 下约 87 µs（示意），演示够用；量产代码里不要在中断里阻塞，应该环形缓冲 + 主循环发送，或改用 DMA。"}]},{kind:"note",tone:"warn",title:"回调里最容易犯的两个错",text:"① **忘了重新挂接收**：现象是“只能收到第一个字节”，之后再也不进回调；查 `HAL_UART_Receive_IT` 是否在回调末尾再次调用。② **在中断里做长事情**：阻塞发送、`printf`、延时、等标志都会拉长中断，导致后续字节溢出（ORE）。正确姿势是中断里只取数、置标志、重挂接收，重活交给主循环或 DMA。"},{kind:"note",tone:"tip",title:"不定长数据怎么办",text:"`HAL_UART_Receive_IT` 适合定长或逐字节处理。要收“一帧不定长数据”，常用 **DMA + 空闲中断**（如 `HAL_UARTEx_ReceiveToIdle_DMA`）或“环形缓冲 + 主循环解析”：空闲线检测到一段停顿就认为一帧结束，既不用猜长度，也不会因为主循环忙而丢字节。"}]},{id:"brr-three-ways",title:"BRR：三种写法",lead:"HAL、LL、寄存器最终都在回答同一个问题：这个波特率该分频成多少？",blocks:[{kind:"p",text:"`BRR`（Baud Rate Register）里放的不是 115200，而是**分频值**。16 倍过采样时，`USARTDIV = fCK / (16 × 波特率)`；`BRR` 用 Q4 定点存它（整数部分在 `[15:4]`、小数部分在 `[3:0]`），所以寄存器里的**数值**满足 `BRR ≈ USARTDIV × 16 = fCK / 波特率`。8 倍过采样时小数只有 3 位，分频更粗。HAL 在 `HAL_UART_Init` 里替你算，LL 用 `LL_USART_SetBaudRate` 算，寄存器写法则要自己算——三种写法的结果应当一致。"},{kind:"tabs-code",title:"把 USART1 配成 115200 8N1：HAL / LL / 寄存器",note:"三者最终写的是同一组寄存器（BRR 与 CR1/CR2）；LL 的函数名与常量名随系列略有差异，以你工程里的头文件为准。",variants:[{label:"HAL",language:"c",code:`/* 高层封装：只填目标参数，BRR 由 HAL 根据 PCLK 与过采样计算 */
huart1.Instance          = USART1;
huart1.Init.BaudRate     = 115200;
huart1.Init.WordLength   = UART_WORDLENGTH_8B;
huart1.Init.StopBits     = UART_STOPBITS_1;
huart1.Init.Parity       = UART_PARITY_NONE;
huart1.Init.Mode         = UART_MODE_TX_RX;
huart1.Init.HwFlowCtl    = UART_HWCONTROL_NONE;
huart1.Init.OverSampling = UART_OVERSAMPLING_16;

if (HAL_UART_Init(&huart1) != HAL_OK) {
    Error_Handler();
}`,explain:[{item:"BaudRate",desc:"目标波特率；HAL 内部用总线时钟与过采样计算 BRR，并尽量四舍五入到最接近的分频值。"},{item:"OverSampling",desc:"决定 BRR 的小数位数：16 倍用 4 位小数，8 倍用 3 位；它同时影响可达到的最高波特率与容错余量。"}]},{label:"LL",language:"c",code:`/* 低层库：函数直接对应寄存器，几乎无额外开销。
   总线频率仍从 RCC 侧取，这里用 HAL 的查询函数避免展开 RCC 寄存器。 */
uint32_t pclk = HAL_RCC_GetPCLK2Freq();   /* USART1 在 APB2（F4；G4 见 RM0440） */

LL_USART_SetBaudRate(USART1, pclk, LL_USART_OVERSAMPLING_16, 115200);
LL_USART_SetDataWidth(USART1, LL_USART_DATAWIDTH_8B);
LL_USART_SetStopBitsLength(USART1, LL_USART_STOPBITS_1);
LL_USART_SetParity(USART1, LL_USART_PARITY_NONE);
LL_USART_EnableDirectionTx(USART1);
LL_USART_EnableDirectionRx(USART1);
LL_USART_EnableIT_RXNE(USART1);           /* 接收中断使能 */
LL_USART_Enable(USART1);                  /* 最后使能 USART */`,explain:[{item:"LL_USART_SetBaudRate",desc:"内部按过采样模式计算 BRR 并写入，效果与 HAL 的计算一致；换系列时函数名与常量名要重新核对。"},{item:"LL_USART_SetDataWidth / StopBitsLength / Parity",desc:"分别对应 CR1 的字长/校验位与 CR2 的停止位；三项必须与对端完全一致。"},{item:"LL_USART_EnableIT_RXNE + LL_USART_Enable",desc:"先开中断、后使能外设，避免刚使能就来的字节因为中断没开而漏掉。"}]},{label:"寄存器",language:"c",code:`/* 时钟与 GPIO 复用仍由 HAL/LL 完成，这里只演示 BRR 与帧格式位的写法。
   F4 的位名见 CMSIS 头文件；G4 的 CR1 字长位为 M0/M1，以 RM0440 为准。 */
uint32_t pclk = HAL_RCC_GetPCLK2Freq();          /* USART1 挂在 APB2 上（F4） */

/* 16 倍过采样：BRR 的数值 = round(fCK / 波特率) = (fCK + 波特率/2) / 波特率
   （它等于 USARTDIV = fCK/(16×波特率) 的 Q4 定点表示，所以看起来是"分频值×16"） */
uint32_t brr = (uint32_t)(((uint64_t)pclk + 115200U / 2U) / 115200U);
USART1->BRR = brr;                               /* [15:4] 整数，[3:0] 小数 */

USART1->CR1 &= ~(USART_CR1_M | USART_CR1_PCE | USART_CR1_PS);
USART1->CR1 |=  USART_CR1_TE | USART_CR1_RE | USART_CR1_RXNEIE;
USART1->CR2 &= ~USART_CR2_STOP;                  /* 00 = 1 个停止位 */
USART1->CR1 |=  USART_CR1_UE;                    /* 最后使能 USART */`,explain:[{item:"BRR 的计算",desc:"BRR 是 Q4 定点分频值，不是波特率本身：数值 ≈ fCK/波特率，其中高 12 位是整数部分、低 4 位是小数（1/16）部分。"},{item:"USART_CR1_M / PCE / PS",desc:"字长、校验使能、校验选择位。先清再置，避免把复位值或上一次配置残留带进来。"},{item:"USART_CR2_STOP",desc:"停止位长度字段，00 表示 1 位；写之前先清字段，别用“或”直接叠加。"},{item:"USART_CR1_UE",desc:"USART 总使能，建议最后置位：配置未完成就使能，可能按旧参数发出一帧垃圾。"}]}]},{kind:"p",text:"配完不要只看代码“感觉对”。最快的验证是**发一个 0x55**（二进制 01010101，线上是规整方波），用示波器或逻辑分析仪量一个位的宽度，反推实际波特率，再套误差公式；或者直接读回 `USART1->BRR`，用 `fCK / (BRR/16)` 手算实际值。误差偏大时，优先检查时钟源与总线频率，而不是反复改 `BaudRate` 字段。"},{kind:"note",tone:"tip",title:"把这一页收束成三件事",text:"**帧**：起始位、数据位、校验位、停止位；**时间**：波特率约定 + 误差累积 + 位中间采样；**电气层**：TTL / RS232 / RS485 决定电平、距离与是否差分。把这三层分开看，串口问题就不再是“玄学乱码”。"}]}],mistakes:[{mistake:"TX/RX 没交叉，或两块板没共地",symptom:"一边完全没数据、另一边毫无反应；偶尔能收到但全是乱码，手一碰线又变好",fix:"先确认 A 的 TX 接 B 的 RX、A 的 RX 接 B 的 TX，再确认两地共地；用示波器/逻辑分析仪看发送端 TX 有没有波形，没有就先查引脚复用与时钟。"},{mistake:"波特率不一致，或双方时钟源精度不够",symptom:"低速能通、高速必乱；偶发帧错误/校验错误；同一块板换用内部 RC 后开始出错",fix:"套误差公式核算 BRR 量化误差与时钟偏差，把总误差压到 2–3% 量级；优先用外部晶振，发 0x55 量位宽反推实际波特率。"},{mistake:"只调了一次 `HAL_UART_Receive_IT`，回调里没有重新挂",symptom:"只能收到第一个字节，之后回调再也不进；调试器里 `gState` 一直是 READY 而不是 BUSY_RX",fix:"在 `HAL_UART_RxCpltCallback` 末尾再次调用 `HAL_UART_Receive_IT`；要连续收大量数据就改成环形缓冲 + DMA，别靠反复重挂。"},{mistake:"中断函数名与向量表不一致，或忘了开 NVIC",symptom:"数据到了、`USART1->ISR` 的 RXNE 也置位，但回调从不执行；程序像“没收到”一样",fix:"对照启动文件确认 `USART1_IRQHandler` 拼写，确认 `HAL_NVIC_EnableIRQ(USART1_IRQn)` 已调用，且函数体里调用了 `HAL_UART_IRQHandler`。"},{mistake:"把 RS485 当协议，或把 TTL 直接接到 RS232/RS485 上",symptom:"短距离实验正常、线一长就误码；或接上后收发器发热、通信彻底失败",fix:"先分清层：UART 是外设/帧逻辑，RS232/RS485 是电气层标准，Modbus 才是应用层协议；TTL 与 RS485 之间必须加收发器，RS232 还要注意电平极性与共地。"}],takeaways:["UART 是异步串口：没有时钟线，靠双方约定波特率；一帧 = 起始位 + 数据位 + 可选校验位 + 停止位，数据低位先发。","波特率误差会按位累积，采样点必须落在位中间；16 倍过采样与三取二判决是容错手段，总误差通常控制在 2–3% 量级（以手册与实测为准）。","TTL / RS232 / RS485 是电气层标准，不是协议；STM32 的 USART 是外设，Modbus 等才是应用层协议。"],quizIds:["uart-q1","uart-q2","uart-q3"],keywords:["UART","USART","波特率","起始位","停止位","校验位","过采样","RS232","RS485","TTL"]};export{R as uartLesson};
