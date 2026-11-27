const L={slug:"clock",title:"时钟与复位",en:"Clock & Reset",oneLine:"时钟是芯片的心跳：先选时钟源，经 PLL 倍频，再分频送到各总线与外设；复位则把这一切拉回默认起点。",category:"mcu",level:"进阶",minutes:30,goals:["说清 HSI / HSE / LSI / LSE 四个时钟源的差别与典型用途","能用 VCO = (fin / PLLM) × PLLN、SYSCLK = VCO / PLLP 手算任意 PLL 配置","解释 168 MHz / 42 MHz / 84 MHz 是怎么来的，以及 Flash 等待周期为什么必须跟着改","说出五类复位源，并知道复位后芯片默认跑在什么时钟上"],analogy:{title:"时钟树像一套“自来水系统”",text:"时钟源是水厂：HSI 像自备小水井，随时能用但水质一般；HSE 像外接水库，稳定但要等它注满。PLL 是加压泵，把低压水压成高压；AHB 是主干管，APB1 / APB2 是两条支管，各自有压力上限。每个外设是家里的一只阀门——总闸开了、阀门不开，水照样到不了；阀门开了但水压不对，龙头也出不了水。"},why:["**任何外设配置的第一步都是时钟**：先使能、再选对频率，否则波特率、定时周期、ADC 采样时间全是错的。","**性能与功耗的总开关**：要提高主频先改时钟树，要省电先降频、关掉不用外设的时钟门控。","**“代码没错但跑飞”的常见根因**：Flash 等待周期没跟上、APB 超频、PLL 没锁定，都发生在时钟树里。","**复位与时钟共同决定上电后的第一行代码**：看懂启动流程、排查异常重启，绕不开这两件事。"],sections:[{id:"why-clock",title:"为什么先配时钟",lead:"数字电路是同步电路：没有时钟，寄存器不会动；时钟不对，寄存器写得进去，也不按你想的节奏工作。",blocks:[{kind:"p",text:"**时钟（Clock）**是给数字电路定节拍的周期信号。CPU 每个时钟周期执行指令；外设也把时钟当尺子：定时器数周期得到时间，UART 用总线时钟分频得到波特率，ADC 用时钟决定采样节奏。所以**时钟是“配置外设”的前置条件**，不是可选项。"},{kind:"ul",items:["**外设时钟门控（Clock Gating）**：每个外设的时钟默认是关的，用 `RCC->AHB1ENR` 这类寄存器单独打开。门控不开，外设寄存器写了也不生效——这是新手第一大坑。","**总线频率不同**：CPU、SRAM、DMA 挂在 AHB；大部分外设挂在 APB1 / APB2。三条总线各有上限，F407 常见配置是 AHB 168 MHz、APB1 42 MHz、APB2 84 MHz（以数据手册为准）。","**参数依赖总线时钟**：UART 波特率、定时器周期、ADC 采样时间都是从总线时钟分频算出来的，改了时钟树必须回头重算。","**功耗与时钟正相关**：频率越高越费电；不用外设就关它的时钟，是最直接的省电手段。"]},{kind:"note",tone:"warn",title:"顺序错了就是白干",text:"正确顺序永远是：**配时钟 → 开外设时钟 → 配外设**。先配外设后开时钟，那几步配置很可能根本没写进去；HAL 里表现为“函数返回 OK，引脚却毫无反应”。"}]},{id:"clock-sources",title:"四个时钟源与 PLL 的算法",lead:"F4 有两条内部 RC、两条外部晶振通路；选谁，取决于你要精度还是省事。",blocks:[{kind:"p",text:"**RC 振荡器**做在芯片内部，上电就能用，但精度受温度、电压影响；**晶振（Crystal）**要在外部焊石英晶体，起振慢一点，但频率准、稳定。四个时钟源的名字和定位如下："},{kind:"terms",items:[{zh:"HSI",en:"High-Speed Internal",desc:"内部高速 RC，F4 上典型 16 MHz，复位后的默认系统时钟。精度一般（百分比量级，见数据手册）。"},{zh:"HSE",en:"High-Speed External",desc:"外部高速晶振，F407 支持 4–26 MHz 范围，8 MHz 最常用（示意）。精度取决于晶振（ppm 量级），适合作 PLL 参考。"},{zh:"LSI",en:"Low-Speed Internal",desc:"内部低速 RC，F4 上约 32 kHz 量级，精度较差；独立看门狗 IWDG 和低功耗 RTC 可选用它。"},{zh:"LSE",en:"Low-Speed External",desc:"外部 32.768 kHz 晶振，专门给 RTC 走时；精度高、功耗低，需要外部焊晶体。"}]},{kind:"table",caption:"具体频率范围、精度与起振时间以芯片数据手册为准；下表的频率为 F407 常见值示意。",head:["时钟源","F407 常见频率（示意）","精度与特点","典型用途"],rows:[["HSI","16 MHz","片内 RC，上电即用；精度约百分比量级","复位默认时钟、HSE 起振前的过渡"],["HSE","4–26 MHz（8 MHz 常见）","外部晶振，ppm 量级，需要起振时间","PLL 参考源、USB / 精确串口等场合"],["LSI","约 32 kHz","内部 RC，精度较差","独立看门狗 IWDG、低功耗 RTC"],["LSE","32.768 kHz","外部晶振，精度高","RTC 精确走时"]]},{kind:"p",text:"**PLL（Phase-Locked Loop，锁相环）**负责“倍频”：把低频参考变成高频系统时钟。F4 的 PLL 先对输入做 M 分频，再乘 N，最后按 P 分频得到 SYSCLK、按 Q 分出 48 MHz 给 USB 等外设。PLL 的参考源可以选 HSI 或 HSE（对应 `RCC->PLLCFGR` 的 PLLSRC）——用 HSI 省晶振，但精度和稳定性都差一档。"},{kind:"formula",latex:"f_{\\mathrm{VCO}} = \\frac{f_{\\mathrm{in}}}{\\mathrm{PLLM}} \\times \\mathrm{PLLN}, \\qquad f_{\\mathrm{SYSCLK}} = \\frac{f_{\\mathrm{VCO}}}{\\mathrm{PLLP}}",caption:"PLL 的 M → N → P 三级关系：M 把输入降到 VCO 输入频率，N 倍频到 VCO，P 再分频给系统。"},{kind:"table",caption:"以 HSE 8 MHz 为例的常见 F407 配置示意；168 MHz 是 F407 的 SYSCLK 上限，以数据手册为准。",head:["环节","设定","计算","结果"],rows:[["输入分频 PLLM","M = 8","8 MHz ÷ 8","1 MHz（VCO 输入）"],["倍频 PLLN","N = 336","1 MHz × 336","336 MHz（VCO 输出）"],["系统分频 PLLP","P = 2","336 MHz ÷ 2","168 MHz（SYSCLK）"],["USB 分频 PLLQ","Q = 7","336 MHz ÷ 7","48 MHz（USB 要求）"]]},{kind:"note",tone:"info",title:"参数不是随便填的",text:"PLLM 决定 VCO 输入频率（数据手册会给出推荐区间，常见 1–2 MHz 量级）；PLLP 只能取 2 / 4 / 6 / 8；PLLN、PLLQ 也各有取值范围，VCO 输出还有上限。动手前先查数据手册的 PLL 特性表，别照抄别的型号。"}]},{id:"clock-tree",title:"时钟树：晶振到总线",lead:"用一句话记住链路：源 → PLL → 分频器 → 总线 → 外设门控。",blocks:[{kind:"layers",layers:[{name:"时钟源",question:"原始节拍从哪来？",points:["HSI：16 MHz，复位默认，最省事","HSE：外部 8 MHz（示意），稳定，做 PLL 参考","LSI / LSE：约 32 kHz / 32.768 kHz，给看门狗与 RTC"]},{name:"PLL 倍频",question:"怎么把 8 MHz 变成 168 MHz？",points:["VCO = (fin / PLLM) × PLLN","SYSCLK = VCO / PLLP","PLLQ 另外分出 48 MHz 给 USB 等外设"]},{name:"总线分频",question:"每条总线跑多快？",points:["AHB（HPRE）：CPU、SRAM、DMA 的主干","APB1（PPRE1）上限 42 MHz，APB2（PPRE2）上限 84 MHz（F407）","分频系数不为 1 时，挂在该总线上的定时器时钟会 ×2（见参考手册 RCC 章节）"]},{name:"Flash 与门控",question:"CPU 追得上吗？谁通电？",points:["`FLASH->ACR` 的 LATENCY 按 HCLK 设置等待周期","外设时钟门控（`RCC->AHB1ENR` 等）决定谁通电","改了频率，所有依赖总线时钟的外设参数都要重算"]}]},{kind:"table",caption:"F407 常见 168 MHz 配置示意，实际分频系数与上限以数据手册为准。",head:["节点","常见配置（示意）","由谁决定","要点"],rows:[["SYSCLK","168 MHz","PLLP","F407 的 SYSCLK 上限，以数据手册为准"],["HCLK（AHB）","168 MHz","HPRE = 1","CPU、SRAM、DMA 都挂这里"],["PCLK1（APB1）","42 MHz","PPRE1 = 4","APB1 上限 42 MHz，超了外设会出错"],["PCLK2（APB2）","84 MHz","PPRE2 = 2","APB2 上限 84 MHz"],["USB 时钟","48 MHz","PLLQ = 7","USB OTG / SDIO 等要求 48 MHz"],["Flash 等待周期","5 WS（示意）","`FLASH->ACR` 的 LATENCY","3.3 V、168 MHz 下常见 5 个等待周期，以数据手册为准"]]},{kind:"lab",labId:"clock-tree",caption:"交互要点：切换 HSE / HSI、调 PLLM / PLLN / PLLP，实时看 SYSCLK、AHB、APB1、APB2 与 Flash 等待周期；单步顺序：上电默认 HSI → 使能 HSE → 配 PLL → 切换 SYSCLK → 分频到各总线。"},{kind:"compare",cardId:"clock"},{kind:"note",tone:"info",title:"换成 G474 要注意什么",text:"STM32G474 的时钟树思路相同，但上限与参数不一样：SYSCLK 最高在 170 MHz 量级（以数据手册为准），PLL 多一个 PLLR 输出，分频表也不完全一样。跨系列移植时别直接照抄 PLLM / PLLN，先用 CubeMX 生成一份再对照参考手册。"}]},{id:"configure",title:"配置时钟的六个步骤",lead:"这六步的先后顺序有因果：谁依赖谁，不能随意交换。",blocks:[{kind:"ol",items:["**选源**：要精度、要高速就用 HSE；图省事可先用 HSI，但 HSI 精度差，做 USB / 高波特率串口要谨慎。","**先设 Flash 等待周期**：按目标 HCLK 查数据手册的等待周期表，用 `FLASH->ACR` 的 LATENCY 设好；用 HAL 时这一步就是 `HAL_RCC_ClockConfig()` 的最后一个参数（如 `FLASH_LATENCY_5`）。","**配 PLL 参数**：在 `RCC->PLLCFGR` 填 PLLM / PLLN / PLLP / PLLQ / PLLSRC，确保 VCO 输入与 VCO 输出都在允许范围。","**使能并等待锁定**：打开 HSE、PLL，轮询 `RCC->CR` 的 HSERDY / PLLRDY；没锁定就切时钟，芯片会挂死。","**切换 SYSCLK**：把 `RCC->CFGR` 的 SW 写成 PLL，再轮询 SWS 确认切换真的完成。","**分频到各总线**：设 HPRE / PPRE1 / PPRE2 得到 AHB / APB1 / APB2，最后用 HAL 的频率查询函数核对实际值。"]},{kind:"code",title:"HAL 版 SystemClock_Config：HSE 8 MHz → PLL → 168 MHz → 分频",language:"c",code:`/* CubeMX 生成的 SystemClock_Config() 骨架，按 F407 常见 168 MHz 配置理解 */
void SystemClock_Config(void)
{
    RCC_OscInitTypeDef osc = {0};
    RCC_ClkInitTypeDef clk = {0};

    /* 1) 打开 HSE，PLL 参考源选 HSE；M/N/P/Q 决定倍频与分频 */
    osc.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    osc.HSEState       = RCC_HSE_ON;
    osc.PLL.PLLState   = RCC_PLL_ON;
    osc.PLL.PLLSource  = RCC_PLLSOURCE_HSE;
    osc.PLL.PLLM       = 8;                 /* 8 MHz / 8   = 1 MHz（VCO 输入） */
    osc.PLL.PLLN       = 336;               /* 1 MHz × 336 = 336 MHz（VCO 输出） */
    osc.PLL.PLLP       = RCC_PLLP_DIV2;     /* 336 MHz / 2 = 168 MHz（SYSCLK） */
    osc.PLL.PLLQ       = 7;                 /* 336 MHz / 7 = 48 MHz（USB） */
    if (HAL_RCC_OscConfig(&osc) != HAL_OK) {
        Error_Handler();                    /* HSE 不起振或 PLL 不锁定都会走到这里 */
    }

    /* 2) 选 SYSCLK 源、设 AHB / APB 分频，并同时给出 Flash 等待周期 */
    clk.ClockType      = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK
                       | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    clk.SYSCLKSource   = RCC_SYSCLKSOURCE_PLLCLK;  /* SW = PLL */
    clk.AHBCLKDivider  = RCC_SYSCLK_DIV1;          /* HCLK  = 168 MHz */
    clk.APB1CLKDivider = RCC_HCLK_DIV4;            /* PCLK1 = 42 MHz  */
    clk.APB2CLKDivider = RCC_HCLK_DIV2;            /* PCLK2 = 84 MHz  */
    if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_5) != HAL_OK) {
        Error_Handler();                    /* HAL 会先设等待周期，再切 SW 并等 SWS */
    }
}`,explain:[{item:"osc.PLL.PLLM = 8",desc:"VCO 输入分频：把 8 MHz 降到 1 MHz，落在推荐的 VCO 输入区间（常见 1–2 MHz 量级，以数据手册为准）。"},{item:"osc.PLL.PLLN = 336",desc:"倍频系数：VCO 输出 = 1 MHz × 336 = 336 MHz；注意不要超过手册给出的 VCO 上限。"},{item:"RCC_PLLP_DIV2",desc:"系统时钟分频，P 只能取 2 / 4 / 6 / 8；336 ÷ 2 = 168 MHz。"},{item:"osc.PLL.PLLQ = 7",desc:"给 USB OTG 等外设的 48 MHz：336 ÷ 7 = 48 MHz；不做 USB 时这一项不影响主频。"},{item:"HAL_RCC_ClockConfig(..., FLASH_LATENCY_5)",desc:"一次设好 SW、HPRE、PPRE1、PPRE2，并按参数调整 Flash 等待周期；HAL 内部会轮询 SWS，确认切换完成才返回。"},{item:"Error_Handler()",desc:"CubeMX 生成的工程里的错误处理函数（非 HAL 库函数）：HSE 不起振、PLL 不锁定都会进来，建议在里面点灯或打印原因。"}]},{kind:"note",tone:"warn",title:"提速与降速的顺序相反",text:"升频时要**先抬 Flash 等待周期再切时钟**；降频时要**先切回低频再降低等待周期**。反过来做，CPU 可能在等待周期不够的情况下取指，表现为随机 HardFault 或跑飞。"},{kind:"p",text:"配置完别靠“感觉”验收：用 `HAL_RCC_GetSysClockFreq()`、`HAL_RCC_GetHCLKFreq()`、`HAL_RCC_GetPCLK1Freq()`、`HAL_RCC_GetPCLK2Freq()` 打印实际频率；也可以把时钟输出到 **MCO 引脚**，用示波器或逻辑分析仪直接量（MCO 的引脚与复用见参考手册 RCC 章节）。"}]},{id:"three-ways",title:"同一件事的三种写法",lead:"HAL 帮你管顺序与等待，LL 是函数化的寄存器操作，裸寄存器最透明也最容易写错。",blocks:[{kind:"p",text:"下面三段代码做的是同一件事：**HSE 8 MHz → PLL → 168 MHz → AHB 168 / APB1 42 / APB2 84**。对照着看，能清楚知道 HAL 到底替你做了什么。"},{kind:"tabs-code",title:"168 MHz 时钟配置：HAL / LL / 寄存器",note:"三段都省略了错误处理；真机上必须检查 HSE 起振、PLL 锁定与 HAL 返回值。LL 函数名与参数以所用 LL 头文件版本为准。",variants:[{label:"HAL",language:"c",code:`/* HAL：只描述“要什么”，顺序、等待与 Flash 等待周期交给库 */
RCC_OscInitTypeDef osc = {0};
osc.OscillatorType = RCC_OSCILLATORTYPE_HSE;
osc.HSEState       = RCC_HSE_ON;
osc.PLL.PLLState   = RCC_PLL_ON;
osc.PLL.PLLSource  = RCC_PLLSOURCE_HSE;
osc.PLL.PLLM       = 8;
osc.PLL.PLLN       = 336;
osc.PLL.PLLP       = RCC_PLLP_DIV2;
osc.PLL.PLLQ       = 7;
HAL_RCC_OscConfig(&osc);

RCC_ClkInitTypeDef clk = {0};
clk.ClockType      = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK
                   | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
clk.SYSCLKSource   = RCC_SYSCLKSOURCE_PLLCLK;
clk.AHBCLKDivider  = RCC_SYSCLK_DIV1;
clk.APB1CLKDivider = RCC_HCLK_DIV4;
clk.APB2CLKDivider = RCC_HCLK_DIV2;
HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_5);`,explain:[{item:"RCC_OscInitTypeDef",desc:"把“振荡器 + PLL”两组参数打包，HAL 内部会按正确顺序使能并等待就绪。"},{item:"HAL_RCC_ClockConfig",desc:"负责切 SW、设分频、调 Flash 等待周期，并轮询 SWS 确认。"}]},{label:"LL",language:"c",code:`/* LL：函数化的寄存器操作，顺序与等待由你自己保证 */
LL_RCC_HSE_Enable();
while (LL_RCC_HSE_IsReady() == 0) { }     /* 等 HSE 起振 */

LL_FLASH_SetLatency(LL_FLASH_LATENCY_5);  /* 提速前先设等待周期 */

LL_RCC_PLL_Disable();                     /* 改参数前先关 PLL */
LL_RCC_PLL_ConfigDomain_SYS(LL_RCC_PLLSOURCE_HSE,
                            LL_RCC_PLLM_DIV_8,
                            336,               /* PLLN */
                            LL_RCC_PLLP_DIV_2);
LL_RCC_PLL_Enable();
while (LL_RCC_PLL_IsReady() == 0) { }     /* 等 PLL 锁定 */

LL_RCC_SetAHBPrescaler(LL_RCC_SYSCLK_DIV_1);
LL_RCC_SetAPB1Prescaler(LL_RCC_APB1_DIV_4);
LL_RCC_SetAPB2Prescaler(LL_RCC_APB2_DIV_2);

LL_RCC_SetSysClkSource(LL_RCC_SYS_CLKSOURCE_PLL);
while (LL_RCC_GetSysClkSource() != LL_RCC_SYS_CLKSOURCE_STATUS_PLL) { }`,explain:[{item:"LL_RCC_PLL_ConfigDomain_SYS",desc:"一次性写 PLLM / PLLN / PLLP 与参考源；它只管系统时钟域，PLLQ（USB 48 MHz）的配置接口随系列不同，查 LL 头文件。"},{item:"LL_RCC_SetSysClkSource",desc:"等价于写 RCC->CFGR 的 SW；后面必须再查一次源，确认切换完成。"}]},{label:"寄存器",language:"c",code:`/* 裸寄存器：最透明，也最考验对顺序与等待的理解 */
RCC->CR |= RCC_CR_HSEON;                        /* 1. 开 HSE */
while ((RCC->CR & RCC_CR_HSERDY) == 0U) { }     /*    等它稳定 */

RCC->CR &= ~RCC_CR_PLLON;                       /* 2. 改 PLL 前先关 PLL */
while ((RCC->CR & RCC_CR_PLLRDY) != 0U) { }     /*    确认已关 */

/* 3. HSE(8M)/M(8)=1M，×N(336)=336M，/P(2)=168M；Q(7) 给 USB 48M */
/* PLLP 是 2 位编码：00=/2、01=/4、10=/6、11=/8，这里 P=2 即编码 00 */
RCC->PLLCFGR = (8U   << RCC_PLLCFGR_PLLM_Pos)
             | (336U << RCC_PLLCFGR_PLLN_Pos)
             | RCC_PLLCFGR_PLLSRC_HSE
             | (7U   << RCC_PLLCFGR_PLLQ_Pos);

FLASH->ACR = (FLASH->ACR & ~FLASH_ACR_LATENCY)  /* 4. 先抬等待周期 */
           | FLASH_ACR_LATENCY_5WS;

RCC->CR |= RCC_CR_PLLON;                        /* 5. 开 PLL 并等锁定 */
while ((RCC->CR & RCC_CR_PLLRDY) == 0U) { }

RCC->CFGR = (RCC->CFGR & ~(RCC_CFGR_HPRE | RCC_CFGR_PPRE1 | RCC_CFGR_PPRE2))
          | RCC_CFGR_HPRE_DIV1 | RCC_CFGR_PPRE1_DIV4 | RCC_CFGR_PPRE2_DIV2;

RCC->CFGR = (RCC->CFGR & ~RCC_CFGR_SW) | RCC_CFGR_SW_PLL;   /* 6. 切 SYSCLK */
while ((RCC->CFGR & RCC_CFGR_SWS) != RCC_CFGR_SWS_PLL) { }  /*    等 SWS 确认 */`,explain:[{item:"RCC->CR",desc:"时钟控制寄存器：HSION / HSEON / PLLON 是使能位，HSERDY / PLLRDY 是就绪状态位；这里的位名是 CMSIS 宏，具体位定义见参考手册 RCC 章节。"},{item:"RCC->PLLCFGR",desc:"PLL 配置寄存器：PLLM / PLLN / PLLP / PLLQ / PLLSRC 的位域位置见参考手册 RCC 章节，代码里用 CMSIS 宏拼接更安全。"},{item:"FLASH->ACR",desc:"Flash 访问控制寄存器：LATENCY 决定每次读 Flash 插几个等待周期，168 MHz 下常用 5 WS（示意，以数据手册等待周期表为准）。"},{item:"RCC->CFGR",desc:"时钟配置寄存器：SW / SWS 负责切换与确认 SYSCLK 源，HPRE / PPRE1 / PPRE2 负责 AHB / APB1 / APB2 分频。"}]}]},{kind:"note",tone:"tip",title:"为什么要先关 PLL 再改参数",text:"PLL 正在输出时改 PLLCFGR，输出会瞬间失稳，CPU 可能直接跑飞。正确做法是**关 PLL → 等 PLLRDY 清零 → 改参数 → 重新使能 → 等锁定**；用 HAL 时这一串动作由 `HAL_RCC_OscConfig()` 内部完成。"}]},{id:"reset",title:"复位：把芯片拉回起点",lead:"复位不是断电：它把内核与大部分外设恢复默认，然后让程序从向量表重新开始跑。",blocks:[{kind:"p",text:"**复位（Reset）**会清掉大部分配置寄存器、让 PC 回到复位向量。系统复位通常不清 SRAM（上电复位会清），所以调试时可能看到“上次的变量还在”。五类复位源要能分清，排查“为什么重启”才有方向。"},{kind:"table",caption:"BOR 阈值档位、NRST 电气特性与复位源细节见参考手册 RCC / 复位章节与数据手册。",head:["复位源","触发条件","典型场景","排查提示"],rows:[["上电复位（POR / PDR）","供电从 0 上升进入工作范围","每次上电、插拔电源","看供电是否稳定、滤波电容是否够"],["欠压复位（BOR）","供电跌到阈值以下（档位可配）","电池将尽、电机启动拉低电压","示波器看 VDD 纹波与瞬间跌落"],["看门狗复位","IWDG / WWDG 计数溢出前没喂狗","程序卡死、任务超时、死循环","复位间隔是否固定；重点查喂狗位置"],["软件复位","代码主动执行 `NVIC_SystemReset()`","固件升级、恢复默认值、远程重启","搜代码里有没有主动复位调用"],["NRST 引脚复位","外部把 NRST 拉低后再释放","按键复位、外部复位芯片、干扰","查外部电路、去抖电容与地线干扰"]]},{kind:"kv",items:[{k:"复位后系统时钟",v:"HSI 16 MHz（F4，示意）"},{k:"PLL 状态",v:"关闭，需要重新配置并等锁定"},{k:"Flash 等待周期",v:"0 WS，提速前必须重新设置"},{k:"外设时钟",v:"门控默认关闭，用哪个开哪个"},{k:"GPIO 默认状态",v:"多数为输入浮空（见参考手册 GPIO 章节）"},{k:"复位标志",v:"读 `RCC->CSR` 判断上次复位源"}]},{kind:"note",tone:"warn",title:"复位标志要“先记录再清除”",text:"上一次的复位原因记录在 `RCC->CSR` 的复位标志里（具体标志位见参考手册 RCC 章节）。很多工程在启动时就把标志清掉，之后再也读不到。想知道“为什么重启了”，要在清标志前把原因打印出来或存进备份寄存器；HAL 也提供读写这些标志的宏，名称以所用 HAL 版本为准。"},{kind:"ul",items:["**周期性重启**：优先怀疑看门狗（复位间隔很固定），其次查栈溢出、野指针与中断风暴。","**一上电就重启**：先量供电和 NRST 引脚，排除电源跌落与外部复位电路。","**偶发重启**：把复位标志、复位计数、关键变量打到串口日志里，复现时才有证据。"]}]}],mistakes:[{mistake:"改完 PLL 参数却没切换 SYSCLK 源",symptom:"PLL 已锁定，但主频还是 HSI 的 16 MHz，串口波特率、定时器周期全不对",fix:"检查 `RCC->CFGR` 的 SW 是否写成 PLL，并轮询 SWS 确认；用 HAL 时看是否漏调 `HAL_RCC_ClockConfig()`。"},{mistake:"APB1 / APB2 分频没算，直接超频",symptom:"外设时好时坏、串口乱码、定时器计数不对；严重时总线挂死",fix:"对照数据手册确认 APB1 42 MHz、APB2 84 MHz 上限（F407）；改 SYSCLK 后重算 HPRE / PPRE1 / PPRE2。"},{mistake:"先提速、后设 Flash 等待周期",symptom:"随机 HardFault、跑飞、复位后又能跑一会儿；换编译优化等级就“好了”",fix:"升频前先按目标 HCLK 设好 `FLASH->ACR` 的 LATENCY（168 MHz 常见 5 WS，示意）；降频时顺序相反。"},{mistake:"忘记使能外设时钟就配置寄存器",symptom:"HAL 函数返回 OK，引脚/外设却毫无反应；读寄存器常读到 0",fix:"先查外设挂在哪条总线，用 `__HAL_RCC_GPIOA_CLK_ENABLE()` 这类宏打开门控，再配置外设。"},{mistake:"串口 / 定时器参数按错误的总线频率计算",symptom:"波特率偏差大导致乱码，或定时周期整体偏快/偏慢",fix:"用 `HAL_RCC_GetPCLK1Freq()` / `HAL_RCC_GetPCLK2Freq()` 取实际总线频率再算分频，别手写死一个 MHz 数。"}],takeaways:["时钟链路是：源 → PLL（÷M、×N、÷P）→ AHB / APB 分频 → 外设门控；改动任何一环，都要重算依赖它的外设参数。","PLL 计算靠 VCO = (fin / PLLM) × PLLN、SYSCLK = VCO / PLLP；168 MHz 是 F407 的 SYSCLK 上限（以数据手册为准），提速前先抬 Flash 等待周期。","复位把芯片拉回 HSI 16 MHz 的默认状态；复位源有五类，原因可从 `RCC->CSR` 的复位标志观察（见参考手册 RCC 章节），软件复位用 `NVIC_SystemReset()`。"],quizIds:["clock-q1","clock-q2","clock-q3"],keywords:["时钟树","PLL","HSE","HSI","AHB","APB","Flash等待周期","复位","NRST","RCC"]};export{L as clockLesson};
