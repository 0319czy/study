const e={slug:"lowpower",title:"低功耗与看门狗",en:"Low Power Modes & Watchdog",oneLine:"让 MCU 按需睡深睡浅，用一个倒计时的狗保证它睡醒或跑飞后仍能自愈。",category:"peripheral",level:"综合",minutes:30,goals:["能说清 Sleep / Stop / Standby 三档睡眠各关了什么、丢了什么、唤醒后从哪里继续跑","会用 `SCB->SCR` 的 SLEEPDEEP 与 `WFI/WFE` 进入低功耗，并写出 HAL 三个 Enter 函数","知道 Stop 唤醒后为什么必须重配时钟，能列出合法唤醒源","会用“电荷 = 电流 × 时间”估算平均电流与电池寿命，并能区分 IWDG 与 WWDG 的职责"],analogy:{title:"低功耗像打工人的三种休息",text:"Sleep 是趴在工位上打个盹：电脑没关、文件还开着，有人叫你一声立刻接着干活。Stop 是关显示器趴下睡：桌上东西都还在，但灯灭了、空调停了，起来得自己重新开灯（重配时钟）。Standby 是下班锁门回家：第二天再来是拿着工牌重新进门（复位重启），桌上的草稿纸（SRAM）已经被清走了。看门狗则是老板的定时巡查：你必须在规定时间内在工位上签个到，人不在就换人（复位）。"},why:["**电池寿命就是低功耗的直接产物**：传感器节点 99% 的时间在等数据，醒着的那几十毫秒决定不了续航，睡着时的几 µA 才决定。","**干扰与发热**：功耗低意味着电源纹波小、温升低，模拟采样（ADC）的精度也更稳。","**看门狗是量产必需的自愈机制**：现场没人按复位键，程序跑飞只能靠狗把系统拉回来。","**面试高频**：三档模式的差异、Stop 唤醒后为什么要重配时钟、为什么不在中断里喂狗，这三问几乎必考。"],sections:[{id:"power-why",title:"为什么值得为“睡眠”写代码",lead:"先建立量级感：醒着与睡着之间差的是几百倍，不是百分之几。",blocks:[{kind:"p",text:"在电池供电的节点里，MCU 的全部工作可以抽象成一个**占空比**问题：每 1 秒里醒 10 ms 干活、剩下 990 ms 睡觉。平均电流不是“运行电流打个小折”，而是运行电流被摊薄了约一百倍。搞清楚这件事，你就明白为什么值得为几毫秒的唤醒时间、为几 µA 的漏电去较劲。"},{kind:"kv",items:[{k:"运行电流（Run）",v:"全速跑 F407 量级是几十 mA（示意）"},{k:"Sleep 电流",v:"内核停、外设还在跑，通常十几 mA 量级（示意）"},{k:"Stop 电流",v:"时钟全停、SRAM 保持，几百 µA 量级（示意）"},{k:"Standby 电流",v:"只剩备份域，几 µA 量级（示意）"},{k:"唤醒时间",v:"Sleep 几个时钟周期 → Standby 毫秒级"},{k:"保持域",v:"备份域（RTC、备份寄存器）由 VBAT/VDD 供电，睡得再深也在"}]},{kind:"ul",items:["**平均电流而不是峰值电流**决定电池寿命：一个 100 mA 的峰值只要持续 10 ms，对续航几乎无影响。","**唤醒开销属于“醒着”的一部分**：唤醒要花的几百微秒同样是运行电流，次数越多越亏，所以常听到“能一天报一次就别一秒报一次”。","**板级静态电流会兜底**：稳压器静态电流、传感器待机电流、上拉电阻漏电，随便一项都可能比 MCU 的 Stop 电流还大。"]},{kind:"note",tone:"warn",title:"本页所有数字都是“示意量级”",text:"不同型号、不同电压、不同温度、不同外设开启情况差别极大，数据手册里的功耗表还分 Run/Stop/Standby 多种条件。本页出现的电流、时间只用来建立数量级直觉，**具体数值一律以你自己芯片的数据手册为准**。"}]},{id:"three-modes",title:"三档睡眠模式对比",lead:"核心口诀：睡得越深越省电，但唤醒越慢、丢的东西越多、醒来之后越接近“重新开始”。",blocks:[{kind:"p",text:"STM32 的低功耗模式本质是**关掉不同层次的时钟与电源**。Cortex‑M 内核看到的是 SLEEPDEEP 这一位：`SLEEPDEEP=0` 睡成 Sleep（只停内核时钟），`SLEEPDEEP=1` 睡成深睡，再由 `PWR->CR` 里的 PDDS/LPDS 决定是 Stop 还是 Standby。下表是三种模式的关键差异，背下来比背寄存器有用。"},{kind:"table",caption:"三种模式的教学性对比（F407 口径；G474 还多出 Stop 0/1/2 与 Shutdown，细节见 RM0440）。",head:["模式","关了哪些时钟","SRAM / RTC 是否保持","唤醒源","唤醒后从哪里继续","唤醒时间量级"],rows:[["Sleep","只停内核时钟（CPU 不再取指），AHB/APB 外设时钟照常跑","SRAM 保持；RTC 保持（备份域本来就在供电）","任意中断或事件（SysTick、EXTI、USART 接收、DMA 完成都行）","`WFI/WFE` 的下一条指令，现场全在","几个时钟周期到微秒级"],["Stop","1.2 V 域时钟基本全停：HSI/HSE/PLL 关闭、外设时钟关闭、Flash 也停","SRAM 与寄存器保持；RTC 保持（RTC 有自己的时钟域）","EXTI 线（含 RTC 闹钟/唤醒定时器输出的 EXTI）、WKUP 引脚（G474 支持多路）；IWDG 到时只会复位","`WFI` 后的下一条指令继续（SRAM 里的变量都还在）","微秒到几十微秒级（要把 HSI 重新拉起来）"],["Standby","1.2 V 域整体断电，只剩备份域与 WKUP 引脚检测电路","SRAM **丢失**；RTC 与备份寄存器保持（VBAT/VDD 供电）","WKUP 引脚上升沿、RTC 闹钟/唤醒定时器/tamper、NRST 外部复位、IWDG 复位","不存在“继续”：走复位流程，从 `Reset_Handler` → `main()` 重来","毫秒级（含启动代码与时钟配置）"]]},{kind:"note",tone:"tip",title:"怎么选：先问“醒来还要不要原来那份现场”",text:"要现场（变量、外设状态、通信链路）→ Sleep 或 Stop；只要“到点了重新采一次、重新连一次” → Standby。想省到极致又需要保持 RAM，还可以看 L 系列/G4 的“Standby + SRAM 保持”选项，那是厂商给的额外开关，不属于基础三档。"},{kind:"lab",labId:"lowpower-wake",caption:"切换三种模式，看哪些时钟被关掉、哪些模块还活着，以及唤醒源与唤醒时间的差别。"},{kind:"compare",cardId:"lowpower"}]},{id:"enter-sleep",title:"进入睡眠的硬件开关",lead:"真正让 CPU 停下来的只有一条指令：WFI 或 WFE。低功耗寄存器只是“把床铺好”。",blocks:[{kind:"p",text:"**WFI（Wait For Interrupt，等中断）**：执行后 CPU 暂停取指，直到有中断请求（哪怕该中断被 NVIC 屏蔽，只要在 EXTI/外设处挂起就能唤醒，具体看模式与配置）。**WFE（Wait For Event，等事件）**：等的是“事件”，可以由中断、`SEV` 指令或事件寄存器置位产生。两者的差别在于：WFI 一定会进 ISR，WFE 可以在没有中断的情况下被事件唤醒继续执行——所以 Stop 里想“只醒来看看，不一定要处理中断”时常用 WFE。"},{kind:"p",text:"**深度由 SLEEPDEEP 决定**：`SCB->SCR` 的 SLEEPDEEP 置 1 时，WFI/WFE 进入深度睡眠（Stop/Standby，具体哪个由 `PWR->CR` 的 PDDS 决定：PDDS=0 是 Stop，PDDS=1 是 Standby；LPDS 选择 Stop 时稳压器是否切到低功耗）。清 0 则是 Sleep。"},{kind:"ol",items:["**开 PWR 时钟**：低功耗相关的寄存器在 PWR 上，HAL 里用 `__HAL_RCC_PWR_CLK_ENABLE()`；没开时钟，后续写入全部无效。","**选定睡眠深度**：Sleep 清 SLEEPDEEP；Stop/Standby 置 SLEEPDEEP，并用 `PWR->CR` 的 PDDS/LPDS 区分（HAL 函数会替你算）。","**配好唤醒源并使能中断**：EXTI 线要配触发边沿与 `HAL_NVIC_EnableIRQ`；RTC 唤醒定时器要 `HAL_RTCEx_SetWakeUpTimer_IT`；Standby 还要 `HAL_PWR_EnableWakeUpPin` 使能 WKUP 引脚。","**清掉旧的唤醒标志**：`__HAL_PWR_CLEAR_FLAG(PWR_FLAG_WU)` 清 `PWR->CR` 的 CWUF，否则可能“刚睡下就醒”。","**执行 WFI/WFE**：HAL 里就是 `HAL_PWR_EnterSLEEPMode` / `HAL_PWR_EnterSTOPMode` / `HAL_PWR_EnterSTANDBYMode`，函数内部会自己置位 SLEEPDEEP 再执行指令。","**醒来后收尾**：Stop/Sleep 返回后继续跑（Stop 要重配时钟）；Standby 没有返回，直接复位重启。"]},{kind:"tabs-code",title:"“让 CPU 睡下”的三种写法",note:"三种写法最终都落在“置/清 SLEEPDEEP + 执行 WFI”上，区别只是谁帮你算寄存器。",variants:[{label:"HAL",language:"c",code:`/* 浅睡：只停内核时钟，外设照常跑，任意中断都能唤醒 */
HAL_PWR_EnterSLEEPMode(PWR_MAINREGULATOR_ON, PWR_SLEEPENTRY_WFI);

/* 深睡 Stop：HAL 内部会置 SLEEPDEEP、清 PDDS、再执行 WFI */
HAL_PWR_EnterSTOPMode(PWR_MAINREGULATOR_ON, PWR_STOPENTRY_WFI);

/* 最深 Standby：函数不返回，醒来等于复位重启 */
HAL_PWR_EnterSTANDBYMode();`,explain:[{item:"PWR_MAINREGULATOR_ON",desc:"睡眠期间主稳压器保持开启（进 Stop 时可选低功耗稳压器 PWR_LOWPOWERREGULATOR_ON，省一点电但唤醒更慢，见手册）。"},{item:"PWR_SLEEPENTRY_WFI / PWR_STOPENTRY_WFI",desc:"选择用 WFI 还是 WFE 进入；“等中断”最常用，“等事件”适合不想进 ISR 的场合。"},{item:"HAL_PWR_EnterSTANDBYMode()",desc:"内部调用前会清掉唤醒标志并置 SLEEPDEEP+PDDS，所以调用处千万不要写“醒来后”的代码——它不会返回。"}]},{label:"LL",language:"c",code:`/* LL 风格：显式选择睡眠深度，再自己执行 WFI */
LL_LPM_EnableSleep();   /* 清 SLEEPDEEP：下一句 WFI 进入 Sleep */
__WFI();

/* 深睡（Stop/Standby）走 LL_LPM_EnableDeepSleep() */
LL_LPM_EnableDeepSleep();  /* 置 SLEEPDEEP */
__WFI();`,explain:[{item:"LL_LPM_EnableSleep / LL_LPM_EnableDeepSleep",desc:"分别对应清/置 SCB->SCR 的 SLEEPDEEP 位，是 LL 层对“睡多深”的唯一开关。"},{item:"__WFI()",desc:"CMSIS 内联函数，编译成一条 wfi 指令；CPU 从这里停住，醒来后继续执行下一条语句。"}]},{label:"寄存器",language:"c",code:`/* ① Sleep：清 SLEEPDEEP，等中断 */
SCB->SCR &= ~SCB_SCR_SLEEPDEEP_Msk;
__WFI();

/* ② Stop：置 SLEEPDEEP、PDDS=0 选 Stop，可选 LPDS 走低功耗稳压器 */
PWR->CR &= ~PWR_CR_PDDS;   /* PDDS = 0 → 深睡时进 Stop（PDDS=1 则是 Standby） */
PWR->CR |=  PWR_CR_LPDS;   /* 可选：Stop 期间用低功耗稳压器 */
SCB->SCR |= SCB_SCR_SLEEPDEEP_Msk;
__WFI();                    /* 执行到这里开始睡 */`,explain:[{item:"SCB->SCR 的 SLEEPDEEP",desc:"内核寄存器，决定 WFI/WFE 是浅睡还是深睡；它只管“深浅”，不管“Stop 还是 Standby”。"},{item:"PWR->CR 的 PDDS / LPDS",desc:"PDDS 选 Stop 还是 Standby，LPDS 选 Stop 期间用哪个稳压器；字段语义见参考手册 PWR 章节。"},{item:"__WFI()",desc:"一条指令让内核停住；醒来后从它的下一条继续（Standby 除外，那是复位）。"},{item:"G474 的差别",desc:"G4 的电源寄存器是 PWR->CR1/CR2（不是 PWR->CR），模式还细分成 Stop 0/1/2、Standby、Shutdown，名字与位不同，务必查 RM0440。"}]}]}]},{id:"stop-and-wake",title:"Stop 唤醒与重配时钟",lead:"这一段是低功耗最容易翻车的地方：醒来后的第一件事不是干活，是把时钟配回去。",blocks:[{kind:"p",text:"**为什么 Stop 醒来必须重配时钟**：Stop 期间 HSE 与 PLL 全部关停，退出 Stop 时芯片会自动切回**内部 HSI**（F407 上 HSI 是 16 MHz 量级）以保证 CPU 能继续跑。此时 SYSCLK 不再是你精心配的 168 MHz，所有按 PLL 频率计算出来的时序全部错位：UART 波特率偏低导致串口乱码、`HAL_Delay` 变慢几十倍、定时器周期不对、SPI 速率也不对。所以标准动作是——唤醒后立刻调用 `SystemClock_Config()`（CubeMX 生成的那个函数），把 PLL 和总线分频重新配回来。"},{kind:"ul",items:["**EXTI 线**：按键、传感器中断脚、RTC 的唤醒输出都可以经 EXTI 唤醒；配置要点是触发边沿 + `HAL_NVIC_EnableIRQ`，且 Stop 期间不能用“电平敏感”的线（电平一直有效会立刻醒）。","**RTC 闹钟 A/B 与唤醒定时器**：RTC 在备份域，Stop/Standby 都活着，是最常用的“定时醒来”手段；`HAL_RTCEx_SetWakeUpTimer_IT` 设周期，`HAL_RTCEx_DeactivateWakeUpTimer` 收工。","**WKUP 引脚**：Standby 最常用的唤醒方式，要先 `HAL_PWR_EnableWakeUpPin`；F407 只有 1 个 WKUP 引脚（PA0），G474 有多路。","**IWDG**：Stop/Standby 里 IWDG 仍在计数，但它只能产生**复位**，不是“继续执行”的唤醒——别把它当成定时醒来的手段。","**NRST**：任何时候都能把芯片拉回复位状态，Standby 里等同重启。"]},{kind:"p",text:"下面这段代码解决一件事：采一次数据、发出去，然后进 Stop 睡到 RTC 叫醒，醒来把时钟配回去继续下一轮。"},{kind:"code",title:"Stop + RTC 唤醒定时器：一个完整的睡眠周期",language:"c",code:`#include "stm32f4xx_hal.h"

RTC_HandleTypeDef hrtc;   /* CubeMX 已按 LSE/LSI 配好 RTC 时钟源 */

/* 睡一觉，醒来时函数正常返回 */
static void sleep_until_rtc_wakeup(void)
{
    /* 1. 低功耗寄存器在 PWR 上，先开时钟（只开一次放初始化里也行） */
    __HAL_RCC_PWR_CLK_ENABLE();

    /* 2. 清掉上一次残留的唤醒标志，避免“刚睡下就醒” */
    __HAL_PWR_CLEAR_FLAG(PWR_FLAG_WU);

    /* 3. 打开 RTC 唤醒定时器中断：2000 个 tick × (16 / 32.768 kHz) ≈ 1 s（示意） */
    HAL_RTCEx_SetWakeUpTimer_IT(&hrtc, 2000, RTC_WAKEUPCLOCK_RTCCLK_DIV16);

    /* 4. 真正睡下去：HAL 内部置 SLEEPDEEP、清 PDDS，然后执行 WFI。
     *    —— CPU 从这里停住，直到 RTC 唤醒事件把它拉起来 —— */
    HAL_PWR_EnterSTOPMode(PWR_MAINREGULATOR_ON, PWR_STOPENTRY_WFI);

    /* === 下面这一行开始，说明已经醒了 === */

    /* 5. 退出 Stop 后时钟回到 HSI，必须把 PLL/总线分频重新配回去 */
    SystemClock_Config();

    /* 6. 关机唤醒定时器，避免下一轮重复设置时出错 */
    HAL_RTCEx_DeactivateWakeUpTimer(&hrtc);

    /* 7. 外设时钟源已变，串口/定时器等需要重配的在这里重新初始化 */
    MX_USART1_UART_Init();
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();          /* 第一次上电：配到 HSE + PLL */

    MX_GPIO_Init();
    MX_RTC_Init();
    MX_USART1_UART_Init();

    while (1) {
        read_sensor_and_send();    /* 醒着的这几毫秒干活 */
        sleep_until_rtc_wakeup();  /* 剩下 99% 的时间睡在 Stop 里 */
    }
}`,explain:[{item:"__HAL_RCC_PWR_CLK_ENABLE()",desc:"打开 PWR 外设时钟。低功耗模式相关的寄存器都在 PWR 上，不开时钟写入会被忽略——这是“进不去 Stop”最常见的第一个原因。"},{item:"__HAL_PWR_CLEAR_FLAG(PWR_FLAG_WU)",desc:"清 PWR->CR 里的 CWUF 唤醒标志。上一次醒来的标志不清，睡眠条件可能一直被破坏，表现为“根本没睡下去”。"},{item:"HAL_RTCEx_SetWakeUpTimer_IT(&hrtc, 2000, RTC_WAKEUPCLOCK_RTCCLK_DIV16)",desc:"设置 RTC 唤醒定时器：第 2 个参数是计数值，第 3 个参数是时钟分频。实际周期 = 计数值 × 分频后的 RTC 时钟周期，用 LSI 时精度较差，具体换算见 RTC 章节。"},{item:"HAL_PWR_EnterSTOPMode(PWR_MAINREGULATOR_ON, PWR_STOPENTRY_WFI)",desc:"进入 Stop 并等中断唤醒。函数会置 SLEEPDEEP、清 PDDS 再执行 WFI；唤醒后从本函数返回——这是 Stop 与 Standby 最大的区别。"},{item:"SystemClock_Config()",desc:"唤醒后必须调用：HSE 与 PLL 已被关掉，CPU 此时跑在 HSI 上，不重配就会出现串口乱码、延时变慢等“幽灵故障”。"},{item:"重新初始化串口等外设",desc:"Stop 期间外设寄存器虽然保持，但时钟已断且时钟源变了，波特率等参数按旧主频算会偏，稳妥做法是重新初始化一次。"}]},{kind:"note",tone:"warn",title:"调试器会破坏睡眠实验",text:"挂着 SWD 单步时，Stop 往往进不去或一进去调试器就掉线（Standby 更彻底，调试口直接断开）。判断“到底睡没睡”要用**电流表 + 唤醒后的自己上报**，而不是盯着单步。"}]},{id:"power-budget",title:"功耗估算：电荷守恒的算术",lead:"低功耗不需要玄学：把“醒了多久、睡多久、各自多少电流”写下来，就能估算续航。",blocks:[{kind:"p",text:"**先看电荷**：电流是电荷的流动速率，`I × t` 就是这段时间搬运的电荷量；电池标称的 mAh 本身就是“mA × h”的电荷单位。所以平均电流可以按“电荷加权”算：把每个状态贡献的电荷加起来，再除以总时间。"},{kind:"formula",latex:"Q = I \\times t",caption:"电荷 = 电流 × 时间。1 mAh = 3.6 C；电池容量（mAh）除以平均电流（mA）就是大致可用小时数（示意）。"},{kind:"formula",latex:"I_{\\text{avg}} = \\frac{I_{\\text{run}} \\cdot t_{\\text{run}} + I_{\\text{sleep}} \\cdot t_{\\text{sleep}}}{t_{\\text{run}} + t_{\\text{sleep}}}",caption:"一个周期内的平均电流：按时间加权（等价于按电荷加权）。单位保持一致，例如 mA 与 ms。"},{kind:"p",text:"**举例（全部为示意量级，用来练算法）**：某个节点每 1 秒醒 10 ms，醒着时 90 mA；其余 990 ms 在 Stop，约 0.5 mA。代入公式：`(90 × 10 + 0.5 × 990) / 1000 ≈ 1.4 mA`。挂一块 2000 mAh 的电池，2000 / 1.4 ≈ 1400 小时，约 58 天。而如果一直不睡、按 90 mA 跑，只有约 22 小时——这就是“值不值得写睡眠代码”的答案。"},{kind:"table",caption:"示意量级对照，只用于建立直觉；实际数值以数据手册功耗表为准。",head:["场景","电流量级（示意）","2000 mAh 电池能撑多久（示意）"],rows:[["全程 Run（几十 mA）","几十 mA","约 1 天"],["Sleep 占空比 99%","十几 mA","约几天到一周"],["Stop 占空比 99%","约 1–2 mA 平均","约一两千小时（几十天）"],["Standby + 每天醒一次","µA 级平均","可达数年，此时电池自放电与稳压器静态电流成为主导"]]},{kind:"note",tone:"tip",title:"估算时最容易漏的三项",text:"① **唤醒开销**：每次醒来都要把 HSI/PLL 拉起来，几 µs~几十 µs 的高电流不算白不算；② **稳压器静态电流**：LDO 自己也要吃几 µA 到几十 µA，µA 级设计里它常是下限；③ **外围器件**：传感器待机电流、上拉电阻漏电、LED 指示灯，往往比 MCU 的 Stop 电流大。"}]},{id:"watchdog",title:"两种看门狗的区别",lead:"低功耗让系统长时间无人值守，看门狗就是那个“没人管也能自愈”的保险丝。",blocks:[{kind:"p",text:"**看门狗（Watchdog）是一个只会倒数的定时器**：程序必须在它数到 0 之前“喂”一次（重新装载计数值），否则它就复位芯片。它的价值在于**不依赖软件是否正常**：主循环卡死、指针跑飞、任务饿死、硬件外设挂死时，喂狗动作不再发生，复位把系统拉回来。"},{kind:"table",caption:"两者都叫看门狗，但监控的“病”不同；F407 与 G474 的字段名有差异，以各自参考手册为准。",head:["维度","IWDG（独立看门狗）","WWDG（窗口看门狗）"],rows:[["时钟源","LSI（内部低速时钟，约 32 kHz 量级，精度有限）","APB1 时钟（PCLK1）分频而来"],["是否独立","独立于主时钟与内核：HSE/PLL 挂了它照样能复位","依赖 APB1：主时钟异常时它可能一起失效"],["时间窗","只要不超时，随时喂都行","有窗口：喂太晚复位，喂太早（计数还在窗口之上）也复位"],["后果","只能复位","主要是复位；某些型号还能在到期前产生早期唤醒中断（EWI）"],["典型用途","兜底“整个系统还活着吗”","监控“某个任务是否在规定时间窗内完成”"]]},{kind:"p",text:"**IWDG 的键操作**（F407/G474 一致）：向 `IWDG->KR` 写 **0x5555** 解锁，才能改 `IWDG->PR`（预分频）与 `IWDG->RLR`（重装值）；写 **0xCCCC** 启动看门狗（启动后不能软件关闭）；写 **0xAAAA** 喂狗，把计数器重新载入 RLR。改完 PR/RLR 后可以读 `IWDG->SR` 看更新是否完成。HAL 里对应 `HAL_IWDG_Init` 与 `HAL_IWDG_Refresh`，喂狗这一步被封装成 `HAL_IWDG_Refresh(&hiwdg)`。"},{kind:"p",text:"**WWDG 的寄存器**：`WWDG->CR` 里除了 7 位递减计数器 T，还有使能位 WDGA（置位后看门狗开始工作）；`WWDG->CFR` 里配窗口值 W、预分频，以及“早期唤醒中断（EWI）”开关。喂狗（重装 T）必须落在“计数器已经降到窗口值以下、但还没到下限”的区间：太晚超时复位，太早（计数还在窗口之上）同样复位。具体字段与下限值见参考手册 WWDG 章节，HAL 侧对应 `HAL_WWDG_Init` 与 `HAL_WWDG_Refresh`。"},{kind:"formula",latex:"t_{\\text{IWDG}} \\approx \\frac{N_{\\text{pre}} \\times \\text{RLR}}{f_{\\text{LSI}}}",caption:"超时时间 ≈ (预分频系数 × 重装值) / LSI 频率。预分频系数可选 4/8/16/…/256 量级；LSI 频率本身有几十个百分点误差，务必按手册给出的最小/最大值算，并留余量（示意）。"},{kind:"p",text:"**为什么喂狗要放主循环，而不是定时器中断**：定时器中断是硬件按固定周期触发的，它**完全绕过了你的业务代码**。如果主循环因为死等、跑飞、栈溢出、某个任务饿死而停摆，定时器 ISR 依旧准时执行、依旧在喂狗——看门狗被“养得好好的”，永远不复位，系统就那样静静地挂死。看门狗要监控的恰恰是“业务主流程是否还在推进”，所以喂狗点必须放在**能证明主流程跑完一圈**的地方：主循环末尾、或者 RTOS 里“每个任务都上报心跳后由监工统一喂”。"},{kind:"code",title:"IWDG 初始化 + 主循环喂狗（约 2 s 超时，示意）",language:"c",code:`#include "stm32f4xx_hal.h"

IWDG_HandleTypeDef hiwdg;

/* 看门狗初始化：CubeMX 会生成类似的一段，注意超时要用最坏情况算 */
void MX_IWDG_Init(void)
{
    hiwdg.Instance       = IWDG;
    hiwdg.Init.Prescaler = IWDG_PRESCALER_32;  /* LSI/32 ≈ 1 kHz 量级（示意） */
    hiwdg.Init.Reload    = 2000;               /* 2000 个计数 ≈ 2 s（示意） */
    if (HAL_IWDG_Init(&hiwdg) != HAL_OK) {
        Error_Handler();                       /* 初始化失败说明 LSI 没起来 */
    }
    /* HAL_IWDG_Init 内部就是：KR 写 0xCCCC 启动、写 0x5555 解锁后写 PR/RLR */
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_IWDG_Init();      /* 越早启动越好：启动前的死机没人管 */

    while (1) {
        do_business_once();        /* 真正干活的业务；卡在这里就不会喂狗 */

        /* 喂狗点：放在主循环末尾，等价于“这一轮业务确实跑完了” */
        HAL_IWDG_Refresh(&hiwdg);  /* 内部向 IWDG->KR 写 0xAAAA */

        /* 千万不要这样写：
         * 在 HAL_TIM_PeriodElapsedCallback() 里调 HAL_IWDG_Refresh()。
         * 主循环卡死时定时器中断照样在跑、照样喂狗，看门狗形同虚设。 */
    }
}`,explain:[{item:"IWDG_PRESCALER_32",desc:"把 LSI 分频后作为计数时钟。分频越大超时越长；LSI 实际频率有偏差，超时算出来是“大约”。"},{item:"Init.Reload = 2000",desc:"重装值，喂狗时写回计数器。超时 ≈ 分频后周期 × Reload，具体换算见参考手册 IWDG 章节。"},{item:"HAL_IWDG_Init(&hiwdg)",desc:"内部先用 KR 写 0xCCCC 启动看门狗，再用 0x5555 解锁写 PR/RLR，最后写 0xAAAA 喂一次。"},{item:"HAL_IWDG_Refresh(&hiwdg)",desc:"喂狗动作，本质是往 IWDG->KR 写 0xAAAA；必须真的执行到，才说明主流程活着。"},{item:"放在主循环末尾的理由",desc:"主循环跑完一圈才喂一次，任何让主循环停下来的故障（死等、跑飞、任务饿死）都会让喂狗停止，2 s 后自动复位。"},{item:"FreeRTOS 场景",desc:"多个任务时，让每个任务定期上报心跳计数，由一个“监工”任务检查所有心跳都在推进后才喂狗，避免某一个任务挂了却仍被别的任务喂着。"}]},{kind:"lab",labId:"watchdog-feed",caption:"调超时时间、手动喂狗或故意不喂，看计数器如何走向复位，并对比“喂狗放主循环”与“放定时器中断”的结果。"},{kind:"note",tone:"danger",title:"两个必须知道的坑",text:"① **调试断点会触发复位**：停在断点时看门狗还在数，几秒后就复位、调试连接断掉。F4/G4 的 HAL 提供 `__HAL_DBGMCU_FREEZE_IWDG()`，可让内核暂停时冻结看门狗计数，具体宏名以 HAL 头文件为准；② **超时要按最坏情况算**：LSI 频率随温度电压漂移，加上 Flash 擦写、通信重试这类长耗时操作，余量至少要留出一半以上（示意），否则会出现“平时好好的，现场低温就反复复位”。"}]}],mistakes:[{mistake:"Stop 唤醒后没有重新配置时钟",symptom:"睡眠实验“成功”了，但串口发出乱码、`HAL_Delay(1000)` 变成好几秒、定时器周期不对",fix:"Stop 退出后 CPU 跑在 HSI 上，唤醒后第一件事就是调用 `SystemClock_Config()`，再重新初始化依赖主频的外设。"},{mistake:"进 Stop 前没清唤醒标志、或没配好唤醒源中断",symptom:"要么“根本没睡下去”，要么睡下去再也醒不过来（只能按复位）",fix:"先 `__HAL_PWR_CLEAR_FLAG(PWR_FLAG_WU)` 清旧标志；再确认 EXTI/RTC 唤醒定时器的中断已使能、NVIC 已打开、触发边沿不是电平型。"},{mistake:"把喂狗写在定时器中断里",symptom:"主循环早就卡死了，系统却一直不复位，现场表现为“设备彻底没反应但灯还在闪”",fix:"喂狗点必须是主循环末尾或“监工任务”里；定时器 ISR 只能用来上报心跳，不能直接喂狗。"},{mistake:"以为 Standby 醒来后变量还在",symptom:"唤醒重启后读到全局变量是随机值，程序行为莫名其妙",fix:"Standby 会丢 SRAM：需要跨睡眠保存的数据放备份寄存器（RTC 的 BKP 寄存器组，见参考手册 RTC 章节）或写入 Flash/EEPROM，并在启动时判断唤醒来源。"},{mistake:"照抄别人的超时时间，不按 LSI 的误差留余量",symptom:"实验室一切正常，低温或低压环境里设备周期性自己重启",fix:"按手册给出 LSI 的最小频率算最长超时、按最大频率算最短超时，取交集后再留 30%–50% 余量（示意）；关键路径上也可以改喂狗策略而不是硬拉长。"}],takeaways:["睡得越深越省电，代价是唤醒更慢、丢得更多：Sleep 停内核、Stop 停时钟但保 SRAM、Standby 只留备份域且醒来等于复位重启。","让 CPU 睡下的永远是 SLEEPDEEP + WFI/WFE；Stop 醒来时钟回到 HSI，必须重配时钟，唤醒源只认 EXTI / RTC / WKUP / NRST（IWDG 只能复位）。","看门狗监控的是“主流程还活着”：喂狗放主循环而不是定时器 ISR；IWDG 靠 LSI 独立兜底，WWDG 额外约束“必须落在时间窗内”。"],quizIds:["lowpower-q1","lowpower-q2","lowpower-q3"],keywords:["低功耗","Sleep","Stop","Standby","WFI","SLEEPDEEP","唤醒源","RTC 唤醒定时器","IWDG","WWDG"]};export{e as lowpowerLesson};
