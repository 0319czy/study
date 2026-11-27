const _={slug:"dma",title:"DMA",en:"Direct Memory Access",oneLine:'DMA 是芯片里的专职搬运工：CPU 只说清"从哪搬到哪、搬多少"，它就自己干完，只在搬了一半点个卯、全搬完再叫你。',category:"peripheral",level:"进阶",minutes:30,goals:['能算出"逐字节用 CPU 搬 1 KB"大概要消耗多少开销，并说清 DMA 到底省了什么',"会按请求映射表给一个外设挑 stream / 通道，并配好方向、地址自增、数据位宽","分得清单次（Normal）与循环（Circular），会用半传输（HT）与完成（TC）中断做双缓冲","能用 `__HAL_LINKDMA` + `HAL_UART_Transmit_DMA` 写出可用的串口 DMA 收发，并在回调里正确收尾"],analogy:{title:"DMA 像仓库里的专职搬运工",text:'老板（CPU）要发货，最笨的办法是自己跑一趟趟仓库，一件件搬到货车上——搬的时候什么正事都干不了，而且大部分时间花在"等对方把货递过来"（等外设状态）。请了搬运工（DMA）之后，老板只需要递一张单子：从 A 货架搬到 B 货架、一共多少件、几件一组。搬运工自己跑，每搬一组还会在小本子上把剩余数量减一，搬到一半通知你一声"前半车装好了"（HT），全部装完再通知一次"可以发车了"（TC）。老板在整段时间里可以继续谈生意——这就是 DMA 的意义。'},why:['**串口、ADC、SPI 这类"大量小数据"场景，搬运开销往往比处理本身还大**：CPU 忙着读状态位、读数据寄存器、写内存，真正的算法被挤得没有时间。',"**实时性的关键杠杆**：同样一颗 168 MHz 的 M4，用 DMA 之后 CPU 可以把时间花在滤波、协议解析和 UI 刷新上，而不是当搬运工。","**降低响应抖动**：轮询的延迟取决于循环转多快，DMA 只在 HT/TC 两点打断你，延迟可预测，更适合控制和采样。",'**几乎所有"连续"功能都靠它**：ADC 多通道扫描、串口不定长接收、DAC 输出波形、SPI 刷屏、定时器触发采样，背后都是 DMA 在搬。'],sections:[{id:"why-dma",title:"为什么需要 DMA",lead:"先算一笔账：不搬这一 KB，CPU 到底忙在哪。",blocks:[{kind:"p",text:'轮询和中断解决的是"什么时候有数据"，但没解决"把数据从一个地方搬到另一个地方要花多少次读写"。以串口为例：115200 波特率下收 1 KB，光在线上就要 **约 89 ms**（示意计算：1024 字节 × 10 位 ÷ 115200，10 位含起始位与停止位）。如果用轮询，这 89 ms 里 CPU 要反复读状态位、判断、读数据寄存器、写内存——每字节至少三四次外设访问，累计**上千次循环**（示意量级），而且**绝大部分时间是在外设那里等**，不是在算东西。'},{kind:"p",text:'**DMA（Direct Memory Access，直接存储器访问）** 把这条链路改成硬件自治：CPU 只写几个寄存器（源地址、目的地址、数量、方向、位宽），然后一句"开始"，DMA 控制器就在外设与内存之间自己搬。**每搬一个数据项，它不需要取指令、不需要压栈、不需要你写一行代码**；你只在"搬完一半"和"全搬完"时各被打断一次。'},{kind:"table",caption:"三种方式的教学性对比；具体延迟与占用随主频、外设和实现差很多，量级仅供建立直觉。",head:["维度","轮询 polling","中断 interrupt","DMA"],rows:[["谁搬数据","CPU 亲手读、亲手写","CPU 在 ISR 里搬","DMA 控制器搬"],["每字节 CPU 开销","最高：读状态 + 读数据 + 写内存","中等：每字节进一次中断（几十个时钟周期，示意）","接近 0：只在启动与 HT/TC 时参与"],["占用 CPU 时间","整段传输期间都在忙","每字节忙一次，空隙里能干活","整段传输期间几乎自由"],["适合场景","慢速、偶发的状态检查","随机事件、需要逐字节处理的协议","大块连续数据、定速采样、波形输出"]]},{kind:"kv",items:[{k:"串口 115200 收 1 KB",v:"约 89 ms（示意）"},{k:"同样 1 KB 逐字节轮询",v:"上千次循环（示意量级）"},{k:"一次 1 KB 传输的中断次数",v:"HT + TC 共 2 次（示意）"},{k:"CPU 参与阶段",v:"启动前 + 回调里，各几行代码"}]},{kind:"note",tone:"tip",title:"DMA 不吃掉带宽，它吃掉的是 CPU 的参与次数",text:'DMA 不会让总线变快：它和 CPU 抢的是同一条总线、同一片 SRAM，多个 stream 同时搬还会按优先级排队。它省下的是"CPU 亲手搬"这一整段软件开销——搬运这种不需要思考的活，交给硬件比交给软件便宜一个量级。'}]},{id:"stream-channel",title:"流、通道与请求源",lead:"F4 的 DMA 是三层结构：控制器 → 流 → 通道。搞清这三层，映射表就不再是天书。",blocks:[{kind:"p",text:'STM32F407 有**两个 DMA 控制器**（DMA1、DMA2），**每个控制器有 8 个流（stream）**。一个流就像一条独立的搬运通道：有自己的源地址、目的地址、剩余数量与中断标志。麻烦的地方在于——**每个流能听谁的**是芯片里固定接好的：每个流可以选择 8 个**通道（channel）**之一，而通道对应的是具体的请求源（USART1_TX、ADC1、SPI1_RX…）。这张"谁连谁"的表就是参考手册里 DMA 章节的**请求映射表**，CubeMX 选外设时会替你查好。'},{kind:"terms",items:[{zh:"DMA 控制器",en:"DMA Controller",desc:"独立于 CPU 的总线主设备，能自己发起读/写事务；F407 上是 DMA1 与 DMA2 两个。"},{zh:"流",en:"Stream",desc:"F4 里 DMA 的传输单位，每个控制器 8 条；一条流同一时刻只能服务一个请求源。G4 用 DMAMUX + 通道，名字与结构都不一样。"},{zh:"请求源",en:"Request Source",desc:'提出"我要搬一个数据项"的外设，例如 USART1_TX、ADC1、SPI1_RX；能接到哪个流由芯片固定，查请求映射表。'},{zh:"NDTR",en:"Number of Data To Transfer",desc:"还要搬多少个**数据项**；每搬一个减 1，减到 0 表示这段搬完。注意单位是数据项，不是字节。"},{zh:"请求/应答",en:"Request / Acknowledge",desc:'外设说"数据准备好了"，DMA 搬一次并回一个应答，外设才继续产生下一个——DMA 就是这样自动跟住外设节奏的。'}]},{kind:"table",caption:"方向由 CR 里的方向字段决定；三种方向的具体编码见参考手册，这里只讲用途。",head:["方向","谁到谁","典型用途","常见配置"],rows:[["外设 → 内存","串口/SPI 收到的字节、ADC 转换结果、定时器捕获值","接收、采样","外设地址固定（不自增），内存地址自增"],["内存 → 外设","要发出去的字节、DAC 波形表、SPI 显存块","发送、波形输出、刷屏","内存地址自增，外设地址固定"],["内存 → 内存","大块拷贝、清缓冲、准备显示数据","数据整理","两端都自增；F4 上只有 DMA2 支持（见参考手册）"]]},{kind:"note",tone:"warn",title:"G4 不是这套模型，别把 F4 的寄存器名背过去",text:'STM32G4 用 **DMAMUX（DMA 请求复用器）** 先把请求源映射到 DMA 通道，再用"通道（channel）"而不是"流（stream）"来传输，寄存器名与字段完全不同（见 RM0440 的 DMAMUX 与 DMA 章节）。学 F4 的价值在于那套逻辑——**请求源 → 传输单元 → 地址 / 数量 → 中断**——换系列时只需重新查一次映射表。'},{kind:"kv",items:[{k:"数据位宽",v:"8 / 16 / 32 位，两端可不同（需开 FIFO）"},{k:"地址自增",v:"外设寄存器一般不自增，内存缓冲一般自增"},{k:"优先级",v:"同一控制器内多条流抢总线时排序，不是中断优先级"},{k:"循环模式",v:"NDTR 减到 0 后自动重装，连续搬运不停"}]}]},{id:"addr-width",title:"地址自增与数据位宽",lead:"四个旋钮：两端地址各自增不自增、两端各按多宽搬。配错任何一个，数据就错位。",blocks:[{kind:"p",text:'**PAR（外设地址寄存器）** 与 **M0AR（内存地址寄存器）** 各存一个起始地址，**NDTR** 存数量。每搬一个数据项，硬件把"允许自增"的那一侧地址加上一个位宽（8 位加 1、16 位加 2、32 位加 4），NDTR 减 1。所以"外设地址固定 + 内存地址自增"是最常见的一对：外设的数据寄存器就那一个地址，每来一个数据都往同一个地方写；而内存缓冲要一个接一个地排下去。'},{kind:"table",caption:"自增开关的四种组合；位定义（PINC / MINC）见参考手册。",head:["外设自增","内存自增","效果","典型用途"],rows:[["关","开","外设地址不动，内存地址递增","外设 ↔ 内存的绝大多数场景（收、发、采样）"],["开","开","两端都递增","内存 → 内存拷贝"],["关","关","两端都不动","反复读写同一个寄存器，或往同一地址灌同一个值"],["开","关","外设递增、内存不动","少见，多用于把一段数据写进同一位置做校验/覆盖"]]},{kind:"p",text:'**位宽**决定"一个数据项多大"。外设是 8 位数据寄存器、内存却想按 16 位存储，就必须开 **FIFO 模式**让硬件做打包与拆包；**直连模式（FIFO 关闭）要求两端位宽一致**，不一致时数据会错位——这正是"串口收了一半数据""ADC 采样值整体偏移"这类怪现象的常见原因。还要记住：位宽只描述单次搬运的宽度，**不改变字节序**，多字节数据在内存里的排列仍然按小端存放（F4/G4 是小端）。'},{kind:"note",tone:"danger",title:"两个必查的坑：对齐与单位",text:'① **对齐**：32 位传输要求地址按 4 字节对齐，16 位按 2 字节对齐，否则可能触发总线错误或传输出错标志。② **NDTR 的单位是数据项**：配 16 位宽、NDTR = 64，实际搬的是 128 字节。接 CS 片选、算超时时按"字节数"想问题，写寄存器时按"数据项数"填，是最容易出的一处换算错误。'}]},{id:"normal-circular",title:"单次、循环与 HT/TC 中断",lead:'两种模式决定"搬完之后怎么办"，两个中断决定"你什么时候知道进度"。',blocks:[{kind:"p",text:"**单次模式（Normal）**：NDTR 减到 0 时硬件关掉该流的使能位，传输结束。要再传，必须重新设置长度并再次启动。**循环模式（Circular）**：NDTR 减到 0 的瞬间被自动重装成初值，硬件从缓冲开头继续搬，永不停止——这正是连续采样、DAC 输出波形、串口持续接收想要的。"},{kind:"table",caption:"两种模式的教学性对比；NDTR 重装与使能位的行为以参考手册描述为准。",head:["维度","单次 Normal","循环 Circular"],rows:[["NDTR 到 0 之后","硬件关闭该流，传输停止","自动重装初值，继续从缓冲开头搬"],["适合什么","一次性的定长收发：发一帧、采一段","连续采样、不定长串口接收、DAC 波形输出"],["怎么停","等完成回调即可，无需干预","必须主动中止（如 `HAL_DMA_Abort`），否则缓冲一直被写"],["开哪个中断","通常只开 TC（完成）",'通常 HT + TC 都开，做"半边处理"'],["数据什么时候可用","TC 之后整段都可用","HT 之后前半可用、TC 之后后半可用"]]},{kind:"p",text:'**HT（Half Transfer，半传输）** 与 **TC（Transfer Complete，传输完成）** 是 DMA 仅有的两个进度通知：NDTR 减到一半时置 HT 标志，减到 0 时置 TC 标志。中断使能位在 CR 里（HTIE / TCIE），标志与清除方式见参考手册。它们真正的价值是回答一个问题——**"哪一半数据此刻是安全的"**：循环模式下缓冲一直被覆盖，用 HT 处理前半、TC 处理后半，你读的那一半就保证没被正在进行的传输踩到，这就是最简单的**双缓冲**。'},{kind:"lab",labId:"dma-transfer",caption:"改数据量、位宽与单次/循环模式，观察 NDTR 怎么一格格减、HT 与 TC 分别在哪一刻触发，以及整段时间里 CPU 在做什么。"},{kind:"code",title:"循环模式 + HT/TC 双缓冲：128 点缓冲，一半一半地处理",language:"c",code:`#include "stm32f4xx_hal.h"

#define BUF_LEN 128

static uint16_t g_adcBuf[BUF_LEN];        /* 采集缓冲：DMA 与主循环共用，必须是常驻内存 */
static volatile uint32_t g_halfCount = 0; /* 前半搬完的次数 */
static volatile uint32_t g_fullCount = 0; /* 后半搬完的次数 */
static DMA_HandleTypeDef hdma_adc;

/* 半传输回调：此刻 g_adcBuf[0 .. BUF_LEN/2-1] 已就绪，后一半正在被写 */
static void OnHalfCplt(DMA_HandleTypeDef *hdma)
{
    (void)hdma;
    g_halfCount++;      /* 只记事件，滤波/换算放主循环，别在中断里算 */
}

/* 传输完成回调：此刻后半就绪；循环模式下 NDTR 已被重装，从头继续 */
static void OnCplt(DMA_HandleTypeDef *hdma)
{
    (void)hdma;
    g_fullCount++;
}

void ADC_DMA_Start(void)
{
    __HAL_RCC_DMA2_CLK_ENABLE();      /* 1. 不开 DMA 控制器时钟，后面写的寄存器全无效 */

    hdma_adc.Instance                 = DMA2_Stream0;        /* 具体 stream 由请求映射表决定 */
    hdma_adc.Init.Channel             = DMA_CHANNEL_0;       /* 通道号同样查映射表 */
    hdma_adc.Init.Direction           = DMA_PERIPH_TO_MEMORY;/* 2. 方向：外设 → 内存 */
    hdma_adc.Init.PeriphInc           = DMA_PINC_DISABLE;    /*    外设地址固定（DR 就一个） */
    hdma_adc.Init.MemInc              = DMA_MINC_ENABLE;     /*    内存地址自增 */
    hdma_adc.Init.PeriphDataAlignment = DMA_PDATAALIGN_HALFWORD; /* 3. 外设位宽 16 位 */
    hdma_adc.Init.MemDataAlignment    = DMA_MDATAALIGN_HALFWORD;  /*    内存位宽 16 位，一致 */
    hdma_adc.Init.Mode                = DMA_CIRCULAR;        /* 4. 循环：装满自动重来 */
    hdma_adc.Init.Priority            = DMA_PRIORITY_MEDIUM; /*    多流抢总线时的排序 */
    hdma_adc.Init.FIFOMode            = DMA_FIFOMODE_DISABLE;/*    直连模式，两端位宽必须相同 */
    if (HAL_DMA_Init(&hdma_adc) != HAL_OK) { Error_Handler(); }

    hdma_adc.XferHalfCpltCallback = OnHalfCplt;   /* 5. HAL 在 DMA 中断里按标志分别回调 */
    hdma_adc.XferCpltCallback     = OnCplt;

    HAL_NVIC_SetPriority(DMA2_Stream0_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(DMA2_Stream0_IRQn);        /*    不使能 NVIC，回调永远不会来 */

    /* 6. 启动：源 = 外设数据寄存器，目的 = 缓冲首地址，长度 = 数据项个数 */
    if (HAL_DMA_Start_IT(&hdma_adc, (uint32_t)&ADC1->DR,
                         (uint32_t)g_adcBuf, BUF_LEN) != HAL_OK) {
        Error_Handler();
    }
    /* 真实工程里还要用 HAL_ADC_Start_DMA 把 ADC 一侧也挂上，两者缺一不可 */
}

/* 7. 中断入口：名字与向量表一致，里面只调 HAL 的通用处理函数 */
void DMA2_Stream0_IRQHandler(void)
{
    HAL_DMA_IRQHandler(&hdma_adc);   /* 由 HAL 判断是 HT 还是 TC，再调用上面的回调 */
}`,explain:[{item:"Instance = DMA2_Stream0",desc:"一条流就是一条独立搬运通道。哪条流能服务 ADC1 是芯片固定接好的，必须查请求映射表，不能随便挑。"},{item:"Direction / PeriphInc / MemInc",desc:'这两个自增开关决定了"谁在原地、谁往前走"：外设寄存器地址固定，内存缓冲逐个递增，这是收数据的标准组合。'},{item:"PeriphDataAlignment / MemDataAlignment",desc:"ADC 是 12 位结果、放 16 位寄存器里，所以两端都用 HALFWORD；直连模式下两端必须一致，否则数据错位。"},{item:"Mode = DMA_CIRCULAR",desc:"NDTR 到 0 时自动重装，采集永不停；代价是缓冲一直被覆盖，读数据必须配合 HT/TC 判断安全区。"},{item:"XferHalfCpltCallback / XferCpltCallback",desc:"HAL 在 DMA 中断里按 HT/TC 标志分派到这两个回调；必须自己赋值，不赋值就等于通知丢了。"},{item:"HAL_DMA_Start_IT",desc:"写 PAR/M0AR/NDTR、开中断、置使能位，然后立刻返回；它是异步启动，不是阻塞发送。"},{item:"HAL_NVIC_EnableIRQ(DMA2_Stream0_IRQn)",desc:'外设侧中断使能位与 NVIC 使能是两道门，都开了才会进 ISR；只配 DMA 不配 NVIC 是"回调不触发"的头号原因。'},{item:"volatile g_halfCount / g_fullCount",desc:"中断里改、主循环里读，必须 volatile，否则开优化后主循环可能永远读到旧值。"}]},{kind:"note",tone:"warn",title:"循环模式下别用 NDTR 判断进度",text:'你读到的 NDTR 只是一个瞬时值；TC 之后它立刻被重装，永远不会停在 0。想判断"第几块数据可用"，就用 HT/TC 回调维护计数（或用双缓冲标志位），别去猜 NDTR 现在到哪了。'}]},{id:"uart-dma",title:"和串口配合：收发交给 DMA",lead:'串口是 DMA 最典型的搭档：收一个字节、发一个字节都是"外设 ↔ 内存"。',blocks:[{kind:"p",text:"串口的收发天生就是一串 8 位数据项在 UART 数据寄存器与内存缓冲之间流动，正好是 DMA 的活。HAL 把这套协作拆成两步：先用 **`__HAL_LINKDMA`** 把 DMA 句柄挂到 UART 句柄上，之后就能用 **`HAL_UART_Transmit_DMA`** / **`HAL_UART_Receive_DMA`** 一句话启动。"},{kind:"p",text:'`__HAL_LINKDMA(&huart1, hdmatx, hdma_usart1_tx)` 做的是**双向绑定**：让 `huart1.hdmatx` 指向这个 DMA 句柄，同时让 DMA 句柄的 `Parent` 指回 `huart1`。HAL 的 UART 驱动在中断里就是靠这两根指针找到"该回调谁、该清哪个状态"——所以这行不能漏，也不能挂错方向（发送挂 `hdmatx`，接收挂 `hdmarx`）。'},{kind:"ol",items:["**开时钟**：DMA 控制器挂在 AHB1 上，先 `__HAL_RCC_DMA2_CLK_ENABLE()`；时钟没开，后面所有寄存器写入都无声无息地无效。","**查映射表**：USART1 的发送与接收分别接在哪个控制器、哪条流、哪个通道，是芯片固定接好的，照参考手册的请求映射表抄（CubeMX 会自动选）。","**填四个关键参数**：方向（发送是内存 → 外设）、两端自增（内存自增、外设不自增）、两端位宽（串口都是 8 位）、模式（发送用 Normal，接收常用 Circular）。","**初始化并关联**：`HAL_DMA_Init` 之后紧跟 `__HAL_LINKDMA`，把 DMA 挂到 UART 句柄上。","**开中断**：使能该流对应的 NVIC 中断（如 `DMA2_Stream7_IRQn`），优先级按实时性要求给。","**启动与收尾**：`HAL_UART_Transmit_DMA` / `HAL_UART_Receive_DMA` 启动，在 `HAL_UART_TxCpltCallback`（发送）与接收方向的半传输/完成回调里置标志、处理数据。"]},{kind:"code",title:"串口 DMA 发送：从初始化到完成回调的完整流程",language:"c",code:`#include "stm32f4xx_hal.h"
#include <string.h>

UART_HandleTypeDef huart1;
DMA_HandleTypeDef  hdma_usart1_tx;

/* 发送缓冲必须常驻：DMA 在整段传输期间一直在读它，不能是函数里的局部数组 */
static uint8_t g_txBuf[64];
static volatile uint8_t g_txDone = 0;

/* 1. 配置 DMA 这一侧（CubeMX 生成的工程里就是 MX_DMA_Init） */
static void MX_DMA_Init(void)
{
    __HAL_RCC_DMA2_CLK_ENABLE();                  /* DMA 控制器时钟，不开则配置全部无效 */

    hdma_usart1_tx.Instance                 = DMA2_Stream7;   /* 请求映射表决定 */
    hdma_usart1_tx.Init.Channel             = DMA_CHANNEL_4;  /* USART1_TX 固定走通道 4（见参考手册请求映射表） */
    hdma_usart1_tx.Init.Direction           = DMA_MEMORY_TO_PERIPH; /* 内存 → 外设 */
    hdma_usart1_tx.Init.PeriphInc           = DMA_PINC_DISABLE;     /* DR 地址固定 */
    hdma_usart1_tx.Init.MemInc              = DMA_MINC_ENABLE;      /* 缓冲逐个往后走 */
    hdma_usart1_tx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE;  /* 串口 8 位 */
    hdma_usart1_tx.Init.MemDataAlignment    = DMA_MDATAALIGN_BYTE;
    hdma_usart1_tx.Init.Mode                = DMA_NORMAL;    /* 发完就停，不循环 */
    hdma_usart1_tx.Init.Priority            = DMA_PRIORITY_LOW;
    hdma_usart1_tx.Init.FIFOMode            = DMA_FIFOMODE_DISABLE; /* 直连：两端位宽一致 */
    if (HAL_DMA_Init(&hdma_usart1_tx) != HAL_OK) { Error_Handler(); }

    /* 2. 关键一步：把 DMA 句柄挂到 UART 句柄的 hdmatx 上 */
    __HAL_LINKDMA(&huart1, hdmatx, hdma_usart1_tx);

    /* 3. 开该流的 NVIC 中断，HAL 才能在传输结束时回调 */
    HAL_NVIC_SetPriority(DMA2_Stream7_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(DMA2_Stream7_IRQn);
}

/* 4. 启动一次异步发送：函数立刻返回，CPU 回去干别的 */
HAL_StatusTypeDef UART_SendAsync(const uint8_t *data, uint16_t len)
{
    if (len > sizeof(g_txBuf)) {
        return HAL_ERROR;                 /* 缓冲不够，直接拒绝，别指望 HAL 帮你扩 */
    }
    memcpy(g_txBuf, data, len);           /* 拷进常驻缓冲，调用者的数据可以随即释放 */
    return HAL_UART_Transmit_DMA(&huart1, g_txBuf, len);
}

/* 5. DMA 中断入口：名字与向量表一致；HAL 在里面清标志并回调 */
void DMA2_Stream7_IRQHandler(void)
{
    HAL_DMA_IRQHandler(&hdma_usart1_tx);
}

/* 6. 发送完成回调：最后一个字节已经移出，缓冲此刻才能复用 */
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        g_txDone = 1;      /* 只置标志，下一帧的发送决策交给主循环 */
    }
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_USART1_UART_Init();     /* 波特率、字长、停止位等（见串口相关章节） */
    MX_DMA_Init();

    static const uint8_t msg[] = "hello dma\\r\\n";

    while (1) {
        if (g_txDone || huart1.gState == HAL_UART_STATE_READY) {
            g_txDone = 0;
            UART_SendAsync(msg, sizeof(msg) - 1);   /* 发送期间主循环继续干别的 */
        }
        /* ... 主循环里的其他任务照常跑，不再被 1 KB 数据卡住 ... */
    }
}`,explain:[{item:"Instance / Channel",desc:'哪条流、哪个通道能接 USART1_TX 是芯片固定接好的，必须照请求映射表；选错的表现是"启动成功但一个字节都不出去"。'},{item:"Direction = DMA_MEMORY_TO_PERIPH",desc:'发送是"内存 → 外设"；接反了会变成从 DR 往内存搬，现象是发不出去、还可能把缓冲写脏。'},{item:"PeriphInc = DMA_PINC_DISABLE",desc:"USART 的 DR 只有一个地址，每来一个字节都写它；外设端绝不能自增。"},{item:"Mode = DMA_NORMAL",desc:"一次发一帧用单次模式；要让发送自动循环（如固定心跳包）才改 Circular。"},{item:"__HAL_LINKDMA(&huart1, hdmatx, ...)",desc:"把 huart1.hdmatx 指向该 DMA 句柄，并把句柄的 Parent 设回 huart1；少了这句，HAL 的 UART 驱动就不知道发送该走谁。"},{item:"HAL_UART_Transmit_DMA",desc:"异步启动：写 PAR/M0AR/NDTR、开 TCIE、置使能位后立刻返回；期间句柄处于 BUSY_TX，再调用会返回 HAL_BUSY。"},{item:"static uint8_t g_txBuf[64]",desc:"缓冲必须是常驻内存：DMA 在整段传输期间都在读它，传局部数组会在函数返回后读到已失效的栈内容。"},{item:"HAL_UART_TxCpltCallback",desc:"HAL 的弱函数，用户自己实现；HAL 会先等 UART 的 TC 标志，确保最后一个字节真正移出移位寄存器后才回调。"}]},{kind:"note",tone:"danger",title:"三个必须记住的点",text:'① **缓冲要活到传输结束**：把栈上的局部数组交给 DMA，函数一返回那块内存就被复用，现象是偶发乱码或数据错乱，且换个编译选项就"好了"，极难查。② **`HAL_UART_Transmit_DMA` 是异步的**：函数返回只代表"已经开始发"，不代表"发完了"；句柄处于 BUSY_TX 时再次调用会返回 HAL_BUSY。③ **只有完成回调里才能复用缓冲**，别在主循环里一拍脑袋就把新数据写进去。'},{kind:"note",tone:"tip",title:'接收更推荐"循环 + 半边处理"',text:'`HAL_UART_Receive_DMA` 配 Circular 模式，HT 回调处理前半、TC 回调处理后半，天然就是一个双缓冲：处理时另一半正在被写，互不干扰。再配合串口的空闲（IDLE）中断，就能做"不定长帧"接收——空闲即一帧结束，细节不在这里展开。'}]},{id:"three-ways",title:"三种写法与缓存一致性",lead:'同一个"启动一次传输"，HAL、LL、寄存器三层各写一遍，你会发现自己其实只在填四个地方。',blocks:[{kind:"tabs-code",title:"启动同一次 DMA 传输的三种写法",note:'三者最终写的都是 PAR / M0AR / NDTR / CR 这几个寄存器，区别只在"谁替你算地址、谁替你选通道、谁替你清标志"。',variants:[{label:"HAL",language:"c",code:`/* 高层封装：CubeMX 生成的工程就是这样，DMA 与 UART 的关联在 MX_DMA_Init 里已建好 */
__HAL_LINKDMA(&huart1, hdmatx, hdma_usart1_tx);          /* 只做一次 */
HAL_UART_Transmit_DMA(&huart1, (uint8_t *)g_txBuf, len);  /* 一句启动，立即返回 */`,explain:[{item:"__HAL_LINKDMA",desc:"双向绑定 UART 句柄与 DMA 句柄；绑定之后 HAL 才知道发送该用哪条流。"},{item:"HAL_UART_Transmit_DMA",desc:"内部完成：检查句柄状态 → 写 PAR/M0AR/NDTR → 开 TC 中断 → 置使能位，然后返回 HAL_OK。"}]},{label:"LL",language:"c",code:`/* 低层库：把"选通道、设方向、设自增、设位宽、填地址、设长度、开中断、开流"拆成一个个内联函数。
   LL 的函数名与常量名随系列略有差异，以你工程的 stm32f4xx_ll_dma.h 为准。 */
LL_DMA_SetChannelSelection(DMA2, LL_DMA_STREAM_7, LL_DMA_CHANNEL_4);  /* 请求源，查映射表 */
LL_DMA_SetDataTransferDirection(DMA2, LL_DMA_STREAM_7, LL_DMA_DIRECTION_MEMORY_TO_PERIPH);
LL_DMA_SetPeriphIncMode(DMA2, LL_DMA_STREAM_7, LL_DMA_PERIPH_NOINCREMENT);
LL_DMA_SetMemoryIncMode(DMA2, LL_DMA_STREAM_7, LL_DMA_MEMORY_INCREMENT);
LL_DMA_SetPeriphSize(DMA2, LL_DMA_STREAM_7, LL_DMA_PDATAALIGN_BYTE);
LL_DMA_SetMemorySize(DMA2, LL_DMA_STREAM_7, LL_DMA_MDATAALIGN_BYTE);

LL_DMA_ConfigAddresses(DMA2, LL_DMA_STREAM_7,
                       (uint32_t)g_txBuf, (uint32_t)&USART1->DR,
                       LL_DMA_DIRECTION_MEMORY_TO_PERIPH);   /* 一次写 PAR 与 M0AR */
LL_DMA_SetDataLength(DMA2, LL_DMA_STREAM_7, len);            /* 写 NDTR（数据项个数） */
LL_DMA_EnableIT_TC(DMA2, LL_DMA_STREAM_7);                   /* 只开传输完成中断 */
LL_DMA_EnableStream(DMA2, LL_DMA_STREAM_7);                  /* 置使能位，传输立即开始 */`,explain:[{item:"LL_DMA_SetChannelSelection",desc:"选请求源通道，就是请求映射表的落点；选错等于接错线。"},{item:"LL_DMA_ConfigAddresses",desc:'一次写两个地址寄存器；参数顺序与方向强相关，写反会变成"从 DR 往内存搬"。'},{item:"LL_DMA_SetDataLength",desc:"写 NDTR，单位是数据项；LL 同样不会帮你做字节数的换算。"},{item:"LL_DMA_EnableIT_TC + LL_DMA_EnableStream",desc:'先开中断、后开流，避免"已经传完但中断使能还没打开"而漏掉第一次完成。'}]},{label:"寄存器",language:"c",code:`/* 裸寄存器：以 DMA1_Stream0 为例（其余流的寄存器结构完全一样）。
   位位置与方向/通道编码见参考手册 DMA 章节；这里用 CMSIS 提供的位掩码宏，避免手抄位号。 */
RCC->AHB1ENR |= (1U << 21);          /* 开 DMA1 时钟（位号见参考手册 RCC 章节） */

DMA1_Stream0->CR &= ~DMA_SxCR_EN;                    /* 改配置前必须先关使能位 */
while (DMA1_Stream0->CR & DMA_SxCR_EN) { /* 等硬件真正关掉 */ }

DMA1_Stream0->PAR  = (uint32_t)&ADC1->DR;            /* 外设端：固定指向数据寄存器 */
DMA1_Stream0->M0AR = (uint32_t)g_adcBuf;             /* 内存端：缓冲起始地址 */
DMA1_Stream0->NDTR = BUF_LEN;                        /* 数据项个数，不是字节数 */
DMA1_Stream0->FCR  = 0;                              /* 关 FIFO：直连模式，两端位宽须一致 */

/* 方向 00 = 外设 → 内存（编码见手册，所以这里不置方向位） */
DMA1_Stream0->CR = DMA_SxCR_MINC                      /* 内存地址自增 */
                 | DMA_SxCR_CIRC                      /* 循环模式：NDTR 到 0 自动重装 */
                 | DMA_SxCR_HTIE | DMA_SxCR_TCIE      /* 开半传输与传输完成中断 */
                 | DMA_SxCR_CHSEL_0;                  /* 选请求源通道（示例通道号） */

DMA1_Stream0->CR |= DMA_SxCR_EN;                      /* 置使能位，传输开始 */

/* 传完之后：状态标志在状态寄存器里，写 1 到对应的清除位清零（低编号流的清除寄存器） */
DMA1->LIFCR = DMA_LIFCR_CTCIF0 | DMA_LIFCR_CHTIF0;`,explain:[{item:"CR &= ~EN 再改配置",desc:"流处于使能状态时改 PAR/NDTR 等寄存器是无效甚至危险的；必须先关、并等硬件确认关闭。"},{item:"PAR / M0AR",desc:"两端起始地址；哪一端自增由 CR 里的两个自增位决定，与方向无关。"},{item:"NDTR",desc:"剩余数据项数；减到 0 时在单次模式下停止，在循环模式下自动重装。"},{item:"FCR = 0",desc:"关闭 FIFO 走直连模式，两端位宽必须一致；要 8 位外设配 32 位内存，就必须开 FIFO。"},{item:"LIFCR 写 1 清除",desc:"中断标志是写 1 清除；不清理会反复进中断，清理时写掩码宏比读改写更安全。"}]}]},{kind:"p",text:"**缓存一致性只对有数据缓存的内核才是问题**：Cortex‑M7（如 STM32H7）带 D‑cache，DMA 直接写内存时 CPU 可能仍读缓存里的旧值，需要在传输前后做 clean / invalidate；**M4/M4F（F407、G474）没有数据缓存，不涉及这件事**——所以你现在写的代码不用查这一条，但换到 H7 时必须补上。"},{kind:"compare",cardId:"boot"},{kind:"p",text:'把 DMA 和启动流程放在一起看很有意思：启动流程回答"上电后 CPU 从哪儿取第一条指令"，DMA 回答"CPU 之外还有谁能直接动内存"。两者指向同一件事——**总线与存储器是共享资源，谁在用它、按什么规则用，决定了系统的行为**。'},{kind:"p",text:"这一页收束成三层就够用了：**请求源 → 流 / 通道 → 地址与数量**，再配上**方向、自增、位宽、模式**四个旋钮，最后用 **HT/TC 中断**收尾。下一页进入 **定时器/PWM**：它和 DMA 是一对高频搭档（定时器触发 ADC、DMA 搬波形表），正好接着用。"}]}],mistakes:[{mistake:"只配了 DMA 却没使能对应流的 NVIC 中断（或中断函数名写错）",symptom:"数据其实已经搬完了，但 `XferCpltCallback` / `HAL_UART_TxCpltCallback` 永远不执行，主循环一直等标志",fix:"按顺序查：串口/外设自己的中断使能位 → `NVIC->ISER[]` 是否放行 → `DMA2_StreamX_IRQHandler` 名字是否与启动文件向量表完全一致 → 里面有没有调用 `HAL_DMA_IRQHandler`。"},{mistake:"把栈上的局部数组直接交给 DMA 发送",symptom:'偶发乱码、数据错乱或只发出前几个字节；改成 -O0 或加了打印又"看起来正常"，极难复现',fix:"DMA 缓冲必须是 `static` 全局数组或堆上常驻内存，并且要活到 TC 回调之后；发送前先 memcpy 进常驻缓冲再启动。"},{mistake:"位宽配错（外设 8 位、内存 16/32 位）却关着 FIFO",symptom:"串口收一半就不动了、ADC 采样值整体偏移或翻倍、缓冲区数据明显错位",fix:'直连模式要求两端位宽一致；确实要打包/拆包就打开 FIFO 模式，并核对 NDTR 用的是"数据项数"还是"字节数"。'},{mistake:'循环模式启动后以为"传完就停"，直接去改缓冲或再次启动',symptom:"数据永远在变、读到的值半新半旧；再次启动返回 HAL_BUSY；停止后缓冲还一直被动写入",fix:"循环模式只有主动中止（`HAL_DMA_Abort` 等）才会停；读数据用 HT/TC 回调切分安全区，要停就明确写中止流程并把状态复位。"},{mistake:"方向（内存 → 外设 / 外设 → 内存）或通道选错",symptom:"启动返回成功、NDTR 也在减，但外设一个字节都不出（或收到的数据被写进了错误的缓冲）",fix:"照参考手册的请求映射表逐项核对：控制器、流、通道、方向四项必须同时对上；用 CubeMX 生成一版对照是最快的验证方式。"}],takeaways:["DMA 省的不是带宽，而是 CPU 的参与次数：给定源地址、目的地址、数量、方向与位宽之后，搬运由硬件完成，CPU 只在启动、半传输和完成时出手。","任何一次 DMA 传输都是四件事的组合：请求源选对流/通道、方向与两端自增配对、两端位宽一致（不一致就开 FIFO）、模式决定搬完是停还是重来。","串口收发靠 `__HAL_LINKDMA` 把 DMA 挂到 UART 句柄上，再用 `HAL_UART_Transmit_DMA` / `HAL_UART_Receive_DMA` 启动；缓冲必须活到完成回调，循环接收用 HT/TC 做双缓冲。"],quizIds:["dma-q1","dma-q2","dma-q3"],keywords:["DMA","流","通道","请求映射表","地址自增","数据位宽","循环模式","半传输中断","串口DMA"]};export{_ as dmaLesson};
