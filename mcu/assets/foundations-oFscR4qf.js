const e={slug:"foundations",title:"MCU 基础",en:"MCU Basics",oneLine:"MCU 是把 CPU、Flash、SRAM 和一堆外设塞进一颗芯片的“微型电脑”，它靠引脚与外界交换电信号。",category:"mcu",level:"入门",minutes:25,goals:["能一句话说清 MCU、MPU、SoC 的区别，不再混用三个词","理解冯诺依曼与哈佛结构对“取指 / 取数”的影响","知道 Cortex‑M 系列与常见厂商产品线的大致定位","能完整说出“写一行代码 → 引脚变电平”要经过哪几步"],analogy:{title:"MCU 像一台“瑞士军刀式”的微型电脑",text:"普通电脑是台式机：CPU、内存、硬盘、显卡各占一块板子；MCU 是把这些塞进一颗指甲盖大小的芯片，还顺手带了定时器、串口、ADC 这些“工具刀”。刀不大，但开瓶、锯木、拧螺丝都够用——这就是它统治小家电、玩具、传感器节点的原因。它甚至不需要操作系统：上电后从 Flash 第一条指令开始跑，跑的就是你写的那段循环。"},why:["**一切外设配置都建立在这套结构上**：时钟给谁、数据走哪条总线、中断怎么进来，都取决于芯片内部怎么连。","**选型与排错的地基**：知道 Flash 存程序、SRAM 存数据，就不会再问“为什么变量一多就 HardFault”。","**看懂启动流程**：程序为什么从 `0x08000000` 开始？`main()` 之前谁干了活？调试时这些都会遇到。","**面试与项目都绕不开**：Cortex‑M 内核、哈佛结构、指令集这些是嵌入式岗位的通用语言。"],sections:[{id:"three-names",title:"先分清三个名字：MCU / MPU / SoC",lead:"这三个词经常被混着用，但它们说的是三件不同的事。",blocks:[{kind:"p",text:'**MCU（Microcontroller Unit，微控制器）**：一颗芯片里集成 CPU 内核、程序存储器（Flash）、数据存储器（SRAM）、总线以及若干外设。特点是**不用外部存储也能独立跑**，面向实时控制、低功耗、低成本。STM32、ATmega328P、ESP32 都属于这一类（ESP32 更接近"MCU + 无线 SoC"）。'},{kind:"p",text:"**MPU（Microprocessor Unit，微处理器）**：只有 CPU（可能带 cache、MMU），必须外接 DDR 与存储才能工作。它跑 Linux 这类通用操作系统，擅长复杂计算与人机界面，但启动慢、功耗高、实时性靠软件调度。"},{kind:"p",text:'**SoC（System on Chip，片上系统）**：强调"把整个系统集成到一颗芯片"，里面可以有 CPU 集群、GPU、NPU、无线基带、DDR 控制器等。ESP32、树莓派用的 BCM 芯片、手机主芯片都是 SoC。**MCU 是 SoC 的一种特例**（集成度低、资源少、以实时控制为目标）。'},{kind:"table",caption:"表中为教学性对比，具体型号差异很大，选型请以数据手册为准。",head:["维度","MCU（如 STM32F407）","MPU（如 i.MX6ULL）","SoC（如 ESP32）"],rows:[["片内存储","片内 Flash + SRAM，可独立运行","通常无片内大容量存储，需外部 DDR/Flash","片内 Flash/SRAM + 无线基带、射频等"],["操作系统","裸机 / FreeRTOS 等 RTOS","Linux / Android 等通用 OS","FreeRTOS / ESP-IDF，也可跑少量 Linux 方案"],["内存管理","一般无 MMU（Cortex‑M 只有可选 MPU）","有 MMU，支持虚拟内存","视型号而定"],["典型场景","电机控制、传感器节点、家电","网关、HMI、边缘计算","Wi‑Fi/BLE 物联网设备"],["启动时间","毫秒级（上电到 main）","秒级（引导 + 内核启动）","百毫秒到秒级（含射频校准/引导）"]]},{kind:"note",tone:"tip",title:"一句话记忆",text:'MCU 是"自带干粮的小电脑"，MPU 是"需要外援的大脑"，SoC 是"把一整套系统装进一颗芯片"。看到"要不要外接 DDR"和"跑不跑 Linux"，基本就能判断是哪一类。'}]},{id:"architecture",title:"芯片里面有什么：冯诺依曼与哈佛",lead:"同一颗芯片里，程序和数据放在哪、走哪条路，决定了性能和调试方式。",blocks:[{kind:"p",text:'**冯诺依曼结构（von Neumann）**：程序和数据共用同一套存储与总线，取指令和取数据要排队。结构简单、灵活，但存在"取指与取数抢总线"的瓶颈。**哈佛结构（Harvard）**：指令总线与数据总线分开（或至少地址空间分开），可以同时取指和取数。**Cortex‑M 采用改进型哈佛结构**：片内通过多条总线（I‑Bus / D‑Bus / S‑Bus）并行访问，对外仍是统一地址空间——所以你写 `*(uint32_t*)0x40020014 = 1` 也能改寄存器。'},{kind:"kv",items:[{k:"Flash（程序区）",v:"放代码与常量，掉电不丢；F407 从 0x08000000 开始映射"},{k:"SRAM（数据区）",v:"放全局变量、栈、堆；掉电即失，容量通常远小于 Flash"},{k:"总线（AHB/APB）",v:'CPU 与外设之间的"高速公路"，不同总线频率不同'},{k:"外设（Peripherals）",v:"GPIO / USART / SPI / ADC… 挂在总线上，用寄存器控制"},{k:"NVIC（中断控制器）",v:"内核的一部分，管理所有中断的使能与优先级"}]},{kind:"code",title:"同一块内存，两种视角：变量与寄存器",language:"c",code:`/* 普通变量：编译器分配到 SRAM（或优化成寄存器/常量） */
static uint32_t counter = 0;

/* 外设寄存器：地址固定在手册里，用 volatile 防止被优化掉 */
#define GPIOA_ODR  (*(volatile uint32_t *)0x40020014UL)

int main(void)
{
    counter++;              /* SRAM 读写，走 D-Bus */
    GPIOA_ODR |= (1U << 5); /* 外设寄存器写，走外设总线 */
    for (;;) { }
}`,explain:[{item:"static uint32_t counter",desc:"静态变量放在 SRAM 的 .data/.bss 段，掉电丢失。"},{item:"volatile",desc:'告诉编译器"这个值可能被硬件改"，禁止把它缓存到 CPU 寄存器里，否则读到的可能是旧值。'},{item:"0x40020014",desc:"STM32F4 的 GPIOA 输出数据寄存器地址（见参考手册存储器映射表）；不同系列地址可能不同。"},{item:"for (;;) { }",desc:'裸机主循环：程序不能"退出"，退出后行为未定义。'}]},{kind:"note",tone:"warn",title:'为什么"变量一多就 HardFault"',text:"SRAM 要同时放全局变量、栈和堆。默认启动文件给的栈只有 1 KB 量级（示意），递归太深、局部数组太大就会踩栈。看到 HardFault 时先看 `_estack` 和 `Stack_Size`，别急着怀疑外设。"}]},{id:"isa",title:"指令集：CISC、RISC 与 Cortex‑M",lead:"指令集决定编译器生成什么机器码，也决定了芯片面向什么场景。",blocks:[{kind:"p",text:"**CISC（复杂指令集）**：单条指令能做较复杂的事，编码长度可变，典型是 x86。**RISC（精简指令集）**：指令少而规整、长度固定、load/store 架构（只有访存指令能碰内存），典型是 ARM、RISC‑V、AVR。RISC 更容易流水线和低功耗，所以几乎统治了 MCU。"},{kind:"p",text:'ARM 公司不生产芯片，只卖**内核授权**：ST 买 Cortex‑M4 内核，加上自己的 Flash、外设和总线，做成 STM32；NXP、GD、Nordic 同理。这也是"不同厂商的 Cortex‑M 芯片寄存器风格不同，但内核行为一致"的原因——**内核是同一套，外设各写各的**。'},{kind:"table",caption:"Cortex‑M 各系列定位（教学性概述，具体能力以 ARM 与厂商文档为准）。",head:["内核","定位","常见型号举例"],rows:[["Cortex‑M0/M0+","最小、最省电，指令集精简","STM32F0、GD32E23x"],["Cortex‑M3","经典主流，性能/成本平衡","STM32F103"],["Cortex‑M4/M4F","带 DSP 指令与单精度 FPU，做电机控制/信号处理","STM32F407、STM32G474"],["Cortex‑M7","高性能，带 cache 与双精度 FPU","STM32H7"],["Cortex‑M23/M33","带 TrustZone 安全扩展","STM32L5、STM32U5"]]},{kind:"ul",items:["**Thumb‑2 指令集**：Cortex‑M 用 16/32 位混合编码，兼顾代码密度与性能；你不需要手写汇编，但调试时看到 `0x0800xxxx` 的机器码要能联想到它。","**FPU 不是默认开的**：Cortex‑M4F 的浮点单元要在启动代码里使能（`__FPU_PRESENT` / `SCB->CPACR`），否则浮点运算走软件模拟，慢一个数量级。","**RISC‑V 是开放指令集**：CH32V、E503 等国产芯片用 RISC‑V 内核，外设寄存器风格往往参考 STM32，迁移成本主要在启动文件、中断入口和工具链。"]},{kind:"compare",cardId:"boot"}]},{id:"vendors",title:"厂商与系列：选型先看四件事",blocks:[{kind:"p",text:'同是 Cortex‑M4，ST、GD、NXP 的差异主要在外设数量、Flash/RAM 大小、封装、工具链和生态。**新手最容易踩的坑是"照着教程买错型号"**：教程用 F103，你买成 F407，引脚和时钟树都不一样。'},{kind:"table",caption:"常见产品线（仅作认识地图，不代表推荐）。",head:["厂商","代表系列","特点"],rows:[["ST（意法半导体）","STM32F0/F1/F4/G0/G4/H7/L4","生态最大，CubeMX + HAL 配套完整，教程最多"],["兆易创新 GD","GD32F1/F3/E23x","与 STM32 高度兼容，成本更低，部分时序需核对"],["乐鑫 Espressif","ESP32 / ESP32-S3 / C3","Wi‑Fi + BLE 一体，ESP‑IDF/Arduino 双生态"],["Nordic","nRF52 / nRF53","BLE 低功耗领域主流，协议栈成熟"],["Microchip","ATmega / ATtiny / PIC","AVR 经典（Arduino Uno 的 ATmega328P）"],["国产 RISC‑V","CH32V、E503 等","开放指令集，工具链与生态仍在成长"]]},{kind:"ul",items:["**要什么外设**：几路 UART？要不要 CAN？要不要 USB？ADC 几位？先列需求再选型。","**存储够不够**：Flash 决定代码和字库，SRAM 决定缓冲区和 RTOS 任务栈；跑 GUI/网络时 RAM 往往先不够。","**封装与引脚**：手焊选 LQFP，空间紧选 QFN；引脚数量决定能接多少外设。","**生态与工具**：有没有现成 HAL/驱动、调试器是否便宜（ST‑Link、DAPLink）、社区资料多不多。"]},{kind:"note",tone:"info",title:"本站的口径",text:"主线固定为 **STM32F407 / STM32G474 + HAL**，因为它的外设结构与文档最适合讲原理；ESP32 / AVR / RISC‑V 只在对照卡里比较差异，不展开成完整教程。"}]},{id:"from-code-to-pin",title:"从一行代码到引脚电平",lead:"这是全站最重要的一条链路：你写的每个外设配置，最终都落在这五步上。",blocks:[{kind:"ol",items:["**使能时钟**：外设挂在哪条总线，就先打开那条总线的时钟门控（如 GPIO 在 AHB1）。没开时钟，后面写寄存器全部无效。",'**配置引脚**：把引脚设成"通用输出"或"复用功能"，选推挽/开漏、上下拉、速度。','**配置外设**：波特率、数据位、采样时间、PWM 频率……这一步决定"协议参数"。',"**启动 / 使能**：置使能位或调用启动函数，外设开始工作。","**触发与处理**：写数据寄存器发送、轮询状态位、或等中断/DMA 回调。"]},{kind:"code",title:"HAL 点灯：五步链路的最小实例（学习示意，需按你的板子核对引脚）",language:"c",code:`#include "stm32f4xx_hal.h"

int main(void)
{
    HAL_Init();                 /* 1. 初始化 HAL、SysTick、NVIC 优先级分组 */
    SystemClock_Config();       /* 2. 配置时钟树（CubeMX 生成，见“时钟与复位”页） */

    __HAL_RCC_GPIOA_CLK_ENABLE();   /* 3. 打开 GPIOA 时钟（AHB1） */

    GPIO_InitTypeDef gpio = {0};    /* 4. 配置 PA5 为推挽输出 */
    gpio.Pin   = GPIO_PIN_5;
    gpio.Mode  = GPIO_MODE_OUTPUT_PP;
    gpio.Pull  = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOA, &gpio);

    while (1) {
        HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);  /* 5. 触发：翻转电平 */
        HAL_Delay(500);                          /* 依赖 SysTick 中断计数 */
    }
}`,explain:[{item:"HAL_Init()",desc:"初始化 HAL 库自身、SysTick 时基（默认 1 ms）和 NVIC 优先级分组（默认 4 位抢占）。"},{item:"__HAL_RCC_GPIOA_CLK_ENABLE()",desc:'写 RCC->AHB1ENR 的对应位，打开 GPIOA 时钟。忘记这一步是最常见的"点不亮"原因。'},{item:"GPIO_MODE_OUTPUT_PP",desc:"推挽输出：上下两个管子成对工作，能推能拉，驱动强（详见 GPIO 页）。"},{item:"HAL_GPIO_TogglePin",desc:"读 ODR 再取反写回，等价于 `GPIOA->ODR ^= (1U << 5)`。"},{item:"HAL_Delay(500)",desc:"本质是等 SysTick 计满 500 次；中断被长时间关闭时，这个延时会被拉长。"}]},{kind:"tabs-code",title:"同一个动作（翻转 PA5）的三种写法",note:'三种写法操作的是同一组寄存器，区别只在"谁帮你算地址和移位"。',variants:[{label:"HAL",language:"c",code:`/* 高层封装：可读性最好，代价是多一层函数调用与参数检查 */
HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);`,explain:[{item:"GPIOA / GPIO_PIN_5",desc:"端口基址与引脚掩码，HAL 内部把它换算成寄存器位。"}]},{label:"LL",language:"c",code:`/* 低层库：直接内联成寄存器操作，几乎无额外开销 */
LL_AHB1_GRP1_EnableClock(LL_AHB1_GRP1_PERIPH_GPIOA);
LL_GPIO_TogglePin(GPIOA, LL_GPIO_PIN_5);`,explain:[{item:"LL_AHB1_GRP1_EnableClock",desc:"LL 风格的时钟使能，等价于 __HAL_RCC_GPIOA_CLK_ENABLE()，目的仍是打开 AHB1 上的 GPIOA 时钟。"}]},{label:"寄存器",language:"c",code:`/* 裸寄存器：理解原理时最直观，量产代码里要自己保证可读性 */
RCC->AHB1ENR |= (1U << 0);        /* 打开 GPIOA 时钟（位 0） */
GPIOA->MODER &= ~(3U << (5 * 2)); /* 先清零 PA5 的 2 位模式域 */
GPIOA->MODER |=  (1U << (5 * 2)); /* 01 = 通用输出 */

GPIOA->ODR ^= (1U << 5);          /* 翻转 PA5；也可用 BSRR 原子置位/复位 */`,explain:[{item:"RCC->AHB1ENR",desc:"AHB1 外设时钟使能寄存器；GPIOA 对应位 0（F4 系列，见参考手册 RCC 章节）。"},{item:"MODER 的 2 位/引脚",desc:"每个引脚占 2 位：00 输入、01 输出、10 复用、11 模拟。所以 PA5 偏移是 5*2=10。"},{item:"BSRR",desc:'写低 16 位置位、写高 16 位复位，是单指令原子操作，多任务/中断里比"读改写 ODR"更安全。'}]}]}]},{id:"boot-and-next",title:"上电之后发生了什么",lead:'理解这 6 步，调试"程序没进 main"时就有方向了。',blocks:[{kind:"ol",items:["**取栈顶**：内核从 `0x08000000` 读第一个字，作为初始 MSP（主栈指针）。","**取复位入口**：从 `0x08000004` 读第二个字，就是 `Reset_Handler` 的地址。","**Reset_Handler 干活**：初始化 `.data`（从 Flash 复制初值到 SRAM）、清零 `.bss`、调用 `SystemInit()` 配时钟。","**C 运行环境**：`__libc_init_array()` 跑构造函数（C++ 全局对象、`__attribute__((constructor))`）。","**进 main()**：`main()` 返回会进入死循环（`_exit`），所以裸机 main 里必须有 `while(1)`。","**中断向量表**：默认在 Flash 起始处；改过 Bootloader 或重定位时要同步改 `SCB->VTOR`。"]},{kind:"code",title:"启动文件里的向量表（简化示意，真实文件由 CubeMX/厂商提供）",language:"c",code:`/* startup_stm32f407xx.s 的等价示意：前两项最关键 */
extern uint32_t _estack;      /* 链接脚本里定义的栈顶地址（SRAM 末尾） */

void Reset_Handler(void);
void NMI_Handler(void);
void HardFault_Handler(void);

__attribute__((section(".isr_vector")))
const void *g_pfnVectors[] = {
    &_estack,          /* 0x08000000：初始 MSP */
    Reset_Handler,     /* 0x08000004：复位入口 */
    NMI_Handler,
    HardFault_Handler,
    /* …其余异常与外设中断入口… */
};`,explain:[{item:"&_estack",desc:'栈是"从高地址往低地址长"的，所以初始栈顶取 SRAM 末尾；链接脚本里的 _estack 由内存布局决定。'},{item:"Reset_Handler",desc:"真正的入口函数：搬 .data、清 .bss、配时钟，最后 `bl main`。"},{item:'section(".isr_vector")',desc:"把数组放到 Flash 最前面，保证 0x08000000 处就是向量表。"}]},{kind:"note",tone:"warn",title:'常见"进不了 main"的三类原因',text:"① 时钟没配好就访问外设（总线挂死）；② 栈顶地址被链接脚本写错，一压栈就 HardFault；③ 用了 Bootloader 但没重定位向量表（`SCB->VTOR`），中断全跑到旧地址。"},{kind:"p",text:'下一页进入 **内核与存储器**：把 Cortex‑M 的寄存器组、栈、Flash/SRAM 分区和链接脚本讲透；之后是 **时钟与复位**，讲清"为什么所有外设配置前先配时钟"。'}]}],mistakes:[{mistake:'把 MCU 说成"小 CPU"',symptom:"面试或写文档时把 Flash/SRAM/外设漏掉，讲不清为什么它能独立运行",fix:"记住定义：MCU = 内核 + 片内程序/数据存储 + 外设 + 总线，能独立跑裸机程序。"},{mistake:"以为外设寄存器随时可写",symptom:"没使能时钟就配 GPIO，代码编译通过但引脚毫无反应",fix:"所有外设操作前先查它在哪条总线、对应哪个时钟使能位；F4 上 GPIO 在 AHB1、USART 多在 APB1/APB2。"},{mistake:"直接用绝对地址访问寄存器却不加 volatile",symptom:"开了优化后循环里读状态位永远读到同一个值，程序卡死",fix:"硬件寄存器必须 `volatile`；更推荐用厂商头文件里的 `GPIOA->ODR` 这类带 volatile 的定义。"},{mistake:"照着别的型号教程抄引脚与时钟",symptom:"PA5 在 F407 能用，换到别的封装/系列后引脚不存在或复用不同",fix:"以自己芯片的数据手册引脚定义 + CubeMX 的引脚图为唯一依据，别跨型号硬搬。"}],takeaways:["MCU = 内核 + 片内 Flash/SRAM + 外设 + 总线，能独立跑裸机程序；MPU 需要外接存储，SoC 强调整系统集成。","Cortex‑M 内核是同一套（改进型哈佛、Thumb‑2、NVIC），差异在外设与时钟树——所以学会一颗，迁移靠查手册。","任何外设配置都走同一条链路：使能时钟 → 配引脚 → 配外设 → 使能 → 触发/处理。"],quizIds:["foundations-q1","foundations-q2","foundations-q3"],keywords:["MCU","MPU","SoC","冯诺依曼","哈佛结构","Cortex-M","指令集","启动流程","STM32","选型"]};export{e as foundationsLesson};
