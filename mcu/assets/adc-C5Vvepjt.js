const A={slug:"adc",title:"ADC / DAC",en:"Analog to Digital / Digital to Analog",oneLine:"ADC 把连续变化的电压切成一个个数字刻度，DAC 反过来把数字码还原成电压。",category:"peripheral",level:"入门",minutes:25,goals:["说清“采样 → 保持 → 量化 → 编码”四步，并指出每一步会引入什么误差","用 LSB 公式算出一个码代表多少电压，解释 ±0.5 LSB 量化误差从哪来","遇到“读数偏低 / 跳变 / 通道错位”时，能按参考电压、采样时间、源阻抗、DMA 顺序逐项排查","能用 HAL 配出“两通道扫描 + DMA 循环”的连续采样"],analogy:{title:"ADC 像一把带刻度的尺子",text:"水位在慢慢涨，尺子却只能告诉你“到第几格”——ADC 干的正是这件事：把连续的水位（电压）读成有限的刻度（数字码）。刻度越密（位数越高）读得越细，可尺子本身有厚度、手还会抖（噪声、参考漂移），读数不可能无限精确。量水位时要等水面平静（采样保持），水太急就会量错——这就是采样时间。"},why:["**现实世界是模拟的**：温度、光照、压力、电池电压、电机电流，传感器输出的都是连续电压，进 CPU 之前必须先变成数字。","**闭环控制离不开它**：电机电流环、电源环路、电池管理，都要靠 ADC 把“现在到底是多少”读回来；读错了，整个环就跟着错。","**精度直接决定产品体验**：同样是 12 位，参考电压稳不稳、采样时间够不够，做出来的秤可能差 1 g，也可能差 50 g。","**它是数字世界唯一的“耳朵”**：DAC 是唯一的“嘴”——波形发生、音频输出、模拟量控制都靠它。"],sections:[{id:"what-is",title:"从电压到数字：四步",lead:"ADC 内部只有四步，任何“读数不准”都能顺着这四步往回找。",blocks:[{kind:"p",text:"**ADC（Analog-to-Digital Converter，模数转换器）** 把连续变化的模拟电压切成有限个数字码；**DAC（Digital-to-Analog Converter，数模转换器）** 反过来。MCU 里最常用的是**逐次逼近型（SAR，Successive Approximation Register）**：内部用一个小 DAC 不断“猜”，猜一次逼近一步，猜 n 次就得到 n 位结果。"},{kind:"ol",items:["**采样（Sample）**：在某个时刻把输入电压“抓”进来。抓的时机由触发源决定——软件写 `SWSTART`、定时器 `TRGO`、外部引脚，都可以当节拍。","**保持（Hold）**：采样开关断开，内部采样电容把那一刻的电压记住。转换期间输入怎么变都不影响结果——所以“保持”是 ADC 能测准的前提。","**量化（Quantize）**：把电压归到最近的刻度上。12 位就是 2^12 = 4096 个刻度，归到哪个刻度由 SAR 的 12 次比较决定。","**编码（Encode）**：把刻度号写成二进制，放进数据寄存器 `DR`，CPU 读一次就拿到结果。"]},{kind:"terms",items:[{zh:"ADC",en:"Analog-to-Digital Converter",desc:"模数转换器：把连续电压切成离散数字码。"},{zh:"DAC",en:"Digital-to-Analog Converter",desc:"数模转换器：把数字码还原成电压。"},{zh:"采样保持",en:"Sample and Hold",desc:"瞬间取样，再用电容把电压保持住，转换期间不允许它变。"},{zh:"量化",en:"Quantization",desc:"把连续电压归到最近的离散刻度，必然带来误差。"},{zh:"分辨率",en:"Resolution",desc:"输出的位数 n，决定一共有多少个刻度（2^n）。"},{zh:"VREF+",en:"Reference Voltage",desc:"ADC 这把“尺子”的满量程参考，直接决定 LSB 的大小。"}]},{kind:"p",text:"**为什么这么多传感器都要“过一遍 ADC”**：电位器、热敏电阻、光敏电阻、称重传感器、电流采样电阻，输出的都是电压或电阻分压；只有变成数字，CPU 才能比较、存储、显示和上报。"},{kind:"note",tone:"info",title:"一句话记住整条链路",text:"传感器 → 分压/放大 → RC 抗混叠 → ADC 采样 → 数字滤波 → 使用。链路上任何一环不稳，最后都会算到 ADC 头上；所以怀疑 ADC 之前，先看前面几环。"},{kind:"p",text:"**转换时间**：12 位 SAR 要比较 12 次，所以 F4 的转换时间 = 采样时间 + 12 个 ADC 周期（12 位模式，见 RM0090；G4 见 RM0440）。采样时间越长读数越稳，但采样率越低——这是 ADC 最核心的权衡，后面所有配置都在平衡这件事。"}]},{id:"lsb",title:"分辨率、LSB 与量化误差",lead:"一个数字码到底代表多少电压？答案是 LSB——所有 ADC 计算都从它开始。",blocks:[{kind:"p",text:"**分辨率（Resolution）** 是输出位数 n，刻度总数是 2^n。**LSB（Least Significant Bit，最低有效位）** 是相邻两个码之间的电压差，也就是“尺子上最小一格的宽度”；码值 k 对应的电压约等于 `k × LSB`（忽略失调与增益误差，见手册）。"},{kind:"formula",latex:"\\mathrm{LSB} = \\frac{V_{\\mathrm{REF+}} - V_{\\mathrm{SSA}}}{2^{n}}",caption:"VREF+ 是参考电压（小封装常与 VDDA 相连），VSSA 是模拟地；n 为分辨率位数。参考电压的精度与噪声会直接乘进每个码里——参考不稳，换多少位的 ADC 都白搭。"},{kind:"formula",latex:"\\left|\\varepsilon_{q}\\right| \\le \\frac{1}{2}\\,\\mathrm{LSB}",caption:"量化误差：真实电压落在两个刻度之间，归到最近刻度后最多差半格，所以是 ±0.5 LSB。这是原理性误差，只能靠更高分辨率、更小量程（放大后测量）或多次采样平均来缓解。"},{kind:"p",text:"代入数字：VREF+ = 3.3 V、n = 12 时，LSB = 3.3 V / 4096 ≈ 0.81 mV（示意），量化误差最大约 ±0.4 mV。也就是说，12 位 ADC 在 3.3 V 量程上“看得见”的最小变化是 0.8 mV 量级——想测 1 mV 的变化，光靠它不够，得先放大信号或换更高分辨率。"},{kind:"table",caption:"位数与 LSB 的对应关系（按 VREF+ = 3.3 V 计算，仅作量级示意；实际以你的参考电压与芯片手册为准）。",head:["位数 n","刻度数 2^n","LSB（3.3 V 参考）","典型用途"],rows:[["8","256","约 12.9 mV","按键、粗略电量判断"],["10","1024","约 3.2 mV","一般传感器、电位器"],["12","4096","约 0.81 mV","本站主线（F407 / G474 片内 ADC）"],["16","65536","约 0.05 mV","片内少见，需外部高精度 ADC 或过采样"]]},{kind:"lab",labId:"adc-sampling",caption:"拖动位数、参考电压与输入电压，看台阶变宽/变窄、误差条怎么变；再改采样时间，观察“没采稳”时读数整体偏低。"},{kind:"note",tone:"warn",title:"分辨率 ≠ 精度",text:"12 位只说明“刻度有 4096 格”，不代表每个码都准到 0.8 mV：参考电压的噪声与温漂、INL/DNL、源阻抗、地线干扰都会吃掉有效位（ENOB）。看到“标称 12 位”就以为“精确到 0.8 mV”，是最常见的误解。"},{kind:"note",tone:"tip",title:"关于对齐与差分",text:"F4 的 ADC 结果默认右对齐，`DR` 低 12 位有效（`CR2` 的 `ALIGN` 位可改左对齐，见手册）；G4 的 ADC 还支持差分输入，正负端各自量程减半，细节见 RM0440。"}]},{id:"vref-sampling",title:"参考电压、输入范围与采样时间",lead:"读数准不准，八成取决于这三件事——而且它们大多在芯片外面。",blocks:[{kind:"p",text:"**参考电压从哪来**：F4 的大封装（LQFP100 及以上）有独立的 `VREF+` 引脚，可以外接精密基准；小封装内部把 `VREF+` 与 `VDDA` 连在一起，参考电压就等于供电电压——供电有纹波，读数就跟着抖。G4 同样有 `VREF+` 引脚，具体接法见数据手册引脚定义。"},{kind:"p",text:"**输入范围**：ADC 只能测 `0 ~ VREF+` 之间的电压，任何一路输入都不能超过这个范围。电压超过上限或低于 0 V 时，靠内部保护二极管钳位，电流一大就会损坏引脚或把 VDDA 拉高。要测更高的电压，先分压或加运放衰减，再串限流电阻并加钳位保护。"},{kind:"p",text:"**采样时间与源阻抗**：采样开关合上的瞬间，内部采样电容 `C_ADC` 要通过“源内阻 + 开关电阻”充电；源内阻越大，充到目标电压越慢。采样时间不够，电容还没充满就开始比较，读数会系统性偏低，通道之间还会互相“串味”。"},{kind:"formula",latex:"t_{s} \\ge \\left(R_{AIN} + R_{ADC}\\right) \\cdot C_{ADC} \\cdot \\ln\\!\\left(2^{\\,n+1}\\right)",caption:"示意估算：要在 1/2^(n+1) 个 LSB 以内充满采样电容，采样时间至少这么长。R_AIN 是外部源内阻，R_ADC 是内部开关电阻，C_ADC 是采样电容（量级几 pF，具体值见数据手册 ADC 特性章节）。工程做法：源阻抗高就加运放缓冲、加长采样时间，或在输入端并一个小电容。"},{kind:"kv",items:[{k:"参考电压",v:"VREF+（可外接基准）；小封装常与 VDDA 相连，见数据手册"},{k:"输入范围",v:"0 ~ VREF+；超出靠保护二极管钳位，不能当量程用"},{k:"采样时间档位",v:"F4 为 3/15/28/56/84/112/144/480 个 ADC 周期（RM0090）；G4 档位不同（RM0440）"},{k:"ADC 时钟",v:"由 ADC->CCR 的 ADCPRE 分频（F4 可选 2/4/6/8 分频），上限见数据手册（F4 常见 36 MHz 量级）"},{k:"转换时间",v:"采样时间 + 12 个 ADC 周期（12 位模式，F4）"},{k:"抗混叠",v:"输入前加 RC 低通（R 取 1 kΩ 量级、C 取 nF 量级，示意），先滤掉高于 fs/2 的成分"}]},{kind:"p",text:"**采样定理（Nyquist）**：采样率 fs 必须大于信号最高频率的两倍，否则高频会“折”到低频，变成根本分不清的假信号（混叠）。测电机电流、音频这类快变信号时，模拟前端的 RC 低通和采样率要一起设计，不能只顾软件。"},{kind:"note",tone:"danger",title:"绝不能用 ADC 引脚直接测高压",text:"ADC 输入范围只有 0 ~ VREF+。把 12 V 电池或市电直接接上去，超范围电压会通过内部保护二极管灌电流，轻则读数饱和、重则损坏芯片。正确做法是“分压 + 限流 + 钳位”，高压场景还要加隔离。另外，万用表读的是有效值或平均值，ADC 采的是某一瞬间的电压，两者不能直接对照。"}]},{id:"modes",title:"四种模式与配置步骤",lead:"同样是“采一个电压”，模式不同，代码结构完全不同。",blocks:[{kind:"ul",items:["**单次（Single）**：触发一次只转一个通道，结果进 `DR`，CPU 轮询 `HAL_ADC_PollForConversion` 或等中断后 `HAL_ADC_GetValue`。适合“偶尔测一下”的场景。","**连续（Continuous）**：`CR2` 的 `CONT` 置位后，转换结束立刻自动开始下一轮，CPU 只要及时取走结果。适合持续监控。","**扫描（Scan）**：`CR1` 的 `SCAN` 置位 + 序列长度大于 1，按 `SQR1` 里排好的顺序依次转换多个通道。多个结果都写进同一个 `DR`，必须配合 DMA 或中断逐次取走。","**不连续（Discontinuous）**：把序列拆成小组，每次触发只转一组，组与组之间等下一次触发。用于“多通道但想按需分组采样”的场合（细节见手册 ADC 章节）。"]},{kind:"p",text:"**规则组（Regular）与注入组（Injected）**：规则组是常规序列，结果都进 `DR`；注入组可以“插队”打断正在进行的规则组转换，并有独立的结果寄存器，常用来做紧急或与 PWM 同步的采样（电机、电源里常见）。"},{kind:"table",caption:"规则组与注入组的主要区别（教学性对比，具体行为见 RM0090 / RM0440 的 ADC 章节）。",head:["维度","规则组 Regular","注入组 Injected"],rows:[["触发与顺序","常规序列，按 SQR 顺序转换","独立序列，可打断规则组（像插队）"],["结果存放","都写同一个 DR，多通道要靠 DMA 或中断取走","有独立的结果寄存器"],["典型用途","普通传感器轮询","与 PWM 同步的电流采样、紧急采样"],["学习顺序","先用规则组 + DMA 跑通","等规则组稳定后再学"]]},{kind:"ol",items:["**开时钟**：ADC1 挂 APB2、DMA 挂 AHB1，用 `__HAL_RCC_ADC1_CLK_ENABLE()` 和 `__HAL_RCC_DMA2_CLK_ENABLE()` 打开；漏了时钟，后面全是空写。","**配引脚**：模拟输入脚设为 `GPIO_MODE_ANALOG`，断开数字输入缓冲，减少漏电与干扰。","**配 ADC 基础参数**：分辨率、扫描/连续、触发源、数据对齐；F4 还要用 `ADC->CCR` 的 `ADCPRE` 确定 ADC 时钟，别超过手册上限。","**配序列与采样时间**：每个通道用 Rank 决定在序列里的位置，用 `SMPR1/SMPR2` 决定采样多久；源阻抗高就选更长档。","**配 DMA**：外设地址固定为 `ADC1->DR`、内存地址自增、半字宽、循环模式；`HAL_ADC_Start_DMA` 会把 DMA 句柄挂到 ADC 上。","**校准**：启动前做一次 ADC 自校准（`HAL_ADCEx_Calibration_Start`），补偿内部失调；校准期间不要触发转换。","**启动**：单次用 `HAL_ADC_Start` + 轮询/中断，多通道连续用 `HAL_ADC_Start_DMA`，在回调里处理整块数据。"]},{kind:"p",text:"**DMA 为什么是多通道的标配**：扫描模式下每个通道的结果都写同一个 `DR`，CPU 慢一步就被下一个通道覆盖，读到的顺序全乱。DMA 在每次转换完成（EOC）时自动把 `DR` 搬到数组，数组下标正好对应 Rank 顺序——**顺序错了，数据就张冠李戴**。"},{kind:"note",tone:"tip",title:"采样率上限怎么估",text:"单通道最高采样率约等于 f_ADC / (采样周期数 + 12)（12 位、F4，示意）。ADC 时钟上限见数据手册（F4 常见 36 MHz 量级）；多通道扫描时，这个采样率还要再除以通道数。"}]},{id:"code",title:"动手写：两通道 ADC + DMA",lead:"这段代码解决最典型的场景：PA0、PA1 两路模拟量连续采样，CPU 完全不参与搬运。",blocks:[{kind:"code",title:"HAL 实现：ADC1 扫描 + 连续 + DMA2 循环搬运（学习示意，引脚请按你的板子核对）",language:"c",code:`#include "stm32f4xx_hal.h"

ADC_HandleTypeDef hadc1;
DMA_HandleTypeDef hdma_adc1;

/* 两个通道的结果：DMA 按 SQR 序列（Rank）的顺序写进数组 */
static volatile uint16_t adc_raw[2];

static void adc_dma_init(void)
{
    /* 1. 时钟：ADC1 在 APB2，DMA2 与 GPIOA 在 AHB1 */
    __HAL_RCC_ADC1_CLK_ENABLE();
    __HAL_RCC_DMA2_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /* 2. 模拟输入脚：断开数字缓冲，减小漏电与干扰 */
    GPIO_InitTypeDef gpio = {0};
    gpio.Pin  = GPIO_PIN_0 | GPIO_PIN_1;
    gpio.Mode = GPIO_MODE_ANALOG;
    gpio.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(GPIOA, &gpio);

    /* 3. DMA：外设地址固定为 ADC1->DR，内存地址自增，半字宽，循环模式 */
    hdma_adc1.Instance                 = DMA2_Stream0;
    hdma_adc1.Init.Channel             = DMA_CHANNEL_0;   /* ADC1 的 DMA 请求映射，见手册 DMA 章节 */
    hdma_adc1.Init.Direction           = DMA_PERIPH_TO_MEMORY;
    hdma_adc1.Init.PeriphInc           = DMA_PINC_DISABLE;   /* DR 地址不变 */
    hdma_adc1.Init.MemInc              = DMA_MINC_ENABLE;    /* 数组下标递增 */
    hdma_adc1.Init.PeriphDataAlignment = DMA_PDATAALIGN_HALFWORD;
    hdma_adc1.Init.MemDataAlignment    = DMA_MDATAALIGN_HALFWORD;
    hdma_adc1.Init.Mode                = DMA_CIRCULAR;       /* 到末尾自动回到开头 */
    hdma_adc1.Init.Priority            = DMA_PRIORITY_HIGH;
    HAL_DMA_Init(&hdma_adc1);

    /* 4. 把 DMA 句柄挂到 ADC 句柄上，HAL_ADC_Start_DMA 才知道往哪搬 */
    __HAL_LINKDMA(&hadc1, DMA_Handle, hdma_adc1);

    /* 5. ADC1 基础参数：12 位、扫描、连续、软件触发、右对齐 */
    hadc1.Instance                   = ADC1;
    hadc1.Init.ClockPrescaler        = ADC_CLOCK_SYNC_PCLK_DIV4;  /* ADC 时钟分频，别超手册上限 */
    hadc1.Init.Resolution            = ADC_RESOLUTION_12B;
    hadc1.Init.ScanConvMode          = ENABLE;                    /* 多通道：扫描模式 */
    hadc1.Init.ContinuousConvMode    = ENABLE;                    /* 一轮结束后自动开始下一轮 */
    hadc1.Init.DiscontinuousConvMode = DISABLE;
    hadc1.Init.ExternalTrigConv      = ADC_SOFTWARE_START;        /* 软件触发 */
    hadc1.Init.DataAlign             = ADC_DATAALIGN_RIGHT;
    hadc1.Init.DMAContinuousRequests = ENABLE;                    /* 循环模式下持续发 DMA 请求 */
    HAL_ADC_Init(&hadc1);

    /* 6. 通道配置：Rank 1 = 通道 0（PA0），Rank 2 = 通道 1（PA1） */
    ADC_ChannelConfTypeDef ch = {0};
    ch.Channel      = ADC_CHANNEL_0;
    ch.Rank         = 1;
    ch.SamplingTime = ADC_SAMPLETIME_84CYCLES;   /* 源阻抗高就选更长档，见数据手册 */
    HAL_ADC_ConfigChannel(&hadc1, &ch);

    ch.Channel = ADC_CHANNEL_1;
    ch.Rank    = 2;
    HAL_ADC_ConfigChannel(&hadc1, &ch);

    /* 7. 先校准再启动；搬运长度 = 通道数，循环模式会一直刷新 adc_raw */
    HAL_ADCEx_Calibration_Start(&hadc1);
    HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc_raw, 2);
}

/* 一轮（两个通道都转完）完成时进这里；要生效必须开 DMA 中断，见下方提示 */
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc)
{
    if (hadc->Instance == ADC1) {
        /* adc_raw[0] ↔ PA0，adc_raw[1] ↔ PA1；这里换算成 mV 只是示意：
           严格用 LSB = VREF+/4096，满量程归一常用 4095，两者差不到 0.03% */
        uint32_t mv0 = (uint32_t)((adc_raw[0] * 3300U) / 4095U);
        (void)mv0;
    }
}`,explain:[{item:"__HAL_RCC_ADC1_CLK_ENABLE()",desc:"写 RCC 的 APB2 使能位（具体位见参考手册 RCC 章节）。没开时钟时写 ADC 寄存器不会报错，但外设根本不工作——这是“代码全对却读不到值”的头号原因。"},{item:"GPIO_MODE_ANALOG",desc:"把引脚切成模拟模式，断开数字输入缓冲。配成输入或复用模式会引入额外漏电与干扰，读数会偏。"},{item:"DMA 的 PeriphInc / MemInc",desc:"外设地址（ADC1->DR）固定不动，所以 PeriphInc 关；内存地址要递增才能依次填 adc_raw[0]、adc_raw[1]。这两个方向配反是“数据全一样/全乱”的典型原因。"},{item:"DMA_CIRCULAR",desc:"循环模式：搬完 2 个数据后 NDTR 自动重装，下一轮从头继续写。配合 ContinuousConvMode，ADC 会一直采、DMA 一直刷数组。"},{item:"ScanConvMode / ContinuousConvMode",desc:"扫描让 ADC 按 Rank 顺序转多个通道；连续让一轮结束后自动开始下一轮。两个都开，才是“不间断地轮询两个通道”。"},{item:"ch.Rank",desc:"决定通道在 SQR 序列中的位置，也决定 DMA 搬进数组的下标。Rank 1 先转换，所以先写进 adc_raw[0]。改 Rank 必须同步改数组的对应关系。"},{item:"HAL_ADCEx_Calibration_Start",desc:"启动前做一次自校准，补偿内部失调；校准要求 ADC 已使能且没有正在进行的转换。省掉它，零点可能带一个固定偏差。"},{item:"HAL_ADC_Start_DMA(&hadc1, buf, 2)",desc:"最后一个参数是搬运长度，等于通道数（2）。长度写错会少搬/多搬，数组下标和 Rank 就对不上。"},{item:"HAL_ADC_ConvCpltCallback",desc:"整轮转换（2 个通道）完成时调用，这是 HAL 约定的回调名，不是普通函数；用户代码不要自己调用它，写进 main.c 覆盖弱定义即可。"}]},{kind:"note",tone:"tip",title:"回调真的会进吗？",text:"`HAL_ADC_Start_DMA` 只负责启动。要让 `HAL_ADC_ConvCpltCallback` 生效，还必须在 NVIC 里打开 `DMA2_Stream0_IRQn`，并在 `DMA2_Stream0_IRQHandler` 里调用 `HAL_DMA_IRQHandler(&hdma_adc1)`。漏了这两步，ADC 与 DMA 都在正常干活，回调却永远不触发。"},{kind:"tabs-code",title:"同一件事（两通道扫描采样）的三种写法",note:"三种写法操作的是同一组寄存器，区别只在“谁帮你算位域”。LL 的函数名在不同系列/固件版本略有差异，以你工程里的 stm32f4xx_ll_adc.h 为准。",variants:[{label:"HAL",language:"c",code:`/* 高层封装：单次转换 + 轮询，或直接交给 DMA（省略时钟/引脚初始化） */
HAL_ADC_Start(&hadc1);                       /* 软件触发一次转换 */
HAL_ADC_PollForConversion(&hadc1, 10U);      /* 轮询等 EOC，超时 10 ms（示意） */
uint32_t raw = HAL_ADC_GetValue(&hadc1);     /* 读 DR，同时清 EOC 标志 */

/* 多通道连续：启动 DMA，搬运长度 = 通道数 */
HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc_raw, 2);`,explain:[{item:"HAL_ADC_Start",desc:"只负责“让 ADC 开始一次转换”（软件触发时置 SWSTART）；它不会替你等结果，也不会自动读 DR。"},{item:"HAL_ADC_PollForConversion",desc:"在超时时间内轮询 EOC 标志。超时参数按你的转换时间留余量：采样时间越长，这个值要越大。"},{item:"HAL_ADC_GetValue",desc:"读 DR 低 12 位（右对齐时）。读 DR 会顺带清 EOC，所以连续转换时别漏读，否则标志语义会乱。"},{item:"HAL_ADC_Start_DMA",desc:"把“启动转换”和“启动 DMA 搬运”一起做掉；第三个参数必须与通道数一致，否则数组下标和 Rank 错位。"}]},{label:"LL",language:"c",code:`/* 低层库：函数名可读，展开后就是写 SQR / SMPR / CR2 */
LL_ADC_SetChannelSamplingTime(ADC1, LL_ADC_CHANNEL_0, LL_ADC_SAMPLINGTIME_84CYCLES);
LL_ADC_SetChannelSamplingTime(ADC1, LL_ADC_CHANNEL_1, LL_ADC_SAMPLINGTIME_84CYCLES);

LL_ADC_REG_SetSequencerRanks(ADC1, LL_ADC_REG_RANK_1, LL_ADC_CHANNEL_0);
LL_ADC_REG_SetSequencerRanks(ADC1, LL_ADC_REG_RANK_2, LL_ADC_CHANNEL_1);
LL_ADC_SetSequencersScanMode(ADC1, LL_ADC_SEQ_SCAN_ENABLE);
LL_ADC_REG_SetContinuousMode(ADC1, LL_ADC_REG_CONV_CONTINUOUS);
LL_ADC_REG_SetDMATransfer(ADC1, LL_ADC_REG_DMA_TRANSFER_UNLIMITED);
LL_ADC_Enable(ADC1);

LL_ADC_REG_StartConversionSWStart(ADC1);                 /* 软件触发一次 */
while (!LL_ADC_IsActiveFlag_EOC(ADC1)) { }               /* 等转换结束 */
uint32_t raw = LL_ADC_REG_ReadConversionData12(ADC1);     /* 读 12 位结果 */`,explain:[{item:"LL_ADC_SetChannelSamplingTime",desc:"按通道设采样时间，等价于改 SMPR1/SMPR2 里该通道的 3 位字段；通道 10~18 在 SMPR1，0~9 在 SMPR2。"},{item:"LL_ADC_REG_SetSequencerRanks",desc:"把通道号写进 Rank 位置，等价于改 SQR1/SQR2/SQR3 里的 SQ 字段。序列长度由最大 Rank 决定，不用单独设。"},{item:"LL_ADC_Enable / StartConversionSWStart",desc:"先使能 ADC（ADON），再软件触发（SWSTART）；顺序反了，转换请求会被忽略。"},{item:"LL_ADC_REG_ReadConversionData12",desc:"读 DR 并只取 12 位，避免把对齐位或状态位一起读进来。"}]},{label:"寄存器",language:"c",code:`/* 裸寄存器：同一件事（两通道扫描 + 连续 + DMA）的落点。
   初始化里的时钟、引脚、DMA 配置略；这里只看 ADC 侧的几个寄存器。 */

__HAL_RCC_ADC1_CLK_ENABLE();   /* 时钟：RCC 的 APB2 使能位，见参考手册 RCC 章节 */

/* ADC 时钟分频：ADC->CCR 的 ADCPRE（F4 可选 2/4/6/8 分频，具体编码见手册） */
ADC->CCR = (ADC->CCR & ~ADC_CCR_ADCPRE) | ADC_CCR_ADCPRE_0;

/* 采样时间：通道 0/1 都选 84 个 ADC 周期档（编码见手册 ADC 章节） */
ADC1->SMPR2 |= ADC_SMPR2_SMP0_2 | ADC_SMPR2_SMP1_2;

/* 序列：L 字段 = 转换个数 − 1（这里 2 个）；SQ1 = 通道 0，SQ2 = 通道 1 */
ADC1->SQR1 = ADC_SQR1_L_0 | ADC_SQR1_SQ2_0;

/* 扫描 + 连续 + DMA + 循环请求（DDS），最后打开 ADON（打开后要等稳定时间，见手册） */
ADC1->CR1 |= ADC_CR1_SCAN;
ADC1->CR2 |= ADC_CR2_CONT | ADC_CR2_DMA | ADC_CR2_DDS | ADC_CR2_ADON;

/* 启动与读取：轮询时等 EOC；读 DR 会顺带清标志 */
ADC1->CR2 |= ADC_CR2_SWSTART;
while ((ADC1->SR & ADC_SR_EOC) == 0) { }
uint16_t raw0 = (uint16_t)ADC1->DR;   /* 只有 1 个通道时可直接读；多通道请交给 DMA */`,explain:[{item:"ADC->CCR 的 ADCPRE",desc:"公共寄存器，给 ADC 提供分频后的时钟（F4 可选 2/4/6/8 分频）。分频太小会超过数据手册规定的 ADC 时钟上限。"},{item:"ADC1->SMPR2",desc:"通道 0~9 的采样时间字段；通道 10 以上在 SMPR1。位数编码与周期数的对照表在手册 ADC 章节，84 周期档对应 SMP=100。"},{item:"ADC1->SQR1",desc:"L 字段是“转换个数 − 1”，SQ1~SQ4 是前 4 个转换的通道号。L 写错，序列长度就错，DMA 长度也会对不上。"},{item:"ADC1->CR1 / CR2",desc:"CR1 的 SCAN 开扫描；CR2 的 CONT 连续、DMA 允许 DMA 请求、DDS 决定 DMA 请求是否在每轮后继续；ADON 打开 ADC。"},{item:"ADC1->SR 的 EOC",desc:"转换结束标志。轮询时必须等它；用 DMA 时由硬件自动搬运，CPU 一般不碰 DR，只处理数组。"}]}]},{kind:"p",text:"**噪声与滤波**：ADC 读数天生带噪声，最简单的办法是**均值滤波**——连续采 N 次求平均，白噪声按 √N 下降，N 取 8/16/32 这种 2 的幂时除法还能换成移位；遇到尖峰（电机换向、继电器动作）改用**中值滤波**——取 N 次采样的中间值，直接把离群点丢掉。要求更高时上滑动平均、一阶低通，或者用硬件**过采样**：把 2^k 次采样累加后右移 k 位，等效多出几位分辨率（硬件是否支持、怎么配见对应参考手册的 ADC 章节，软件累加平均同样有效）。"}]},{id:"dac",title:"反方向：DAC 与模拟输出",lead:"ADC 是耳朵，DAC 是嘴：把数字码变成电压，用来驱动、发声、做基准。",blocks:[{kind:"p",text:"**DAC（Digital-to-Analog Converter）** 把数字码还原成电压：F407 有 2 路 12 位 DAC（通道数等细节以数据手册为准），输出范围 0 ~ VREF+，分辨率与 LSB 的算法和 ADC 完全一样。"},{kind:"p",text:"**从写到输出的路径**：软件写 `DAC->DHR12R1`（12 位右对齐数据保持寄存器），硬件在触发事件到来时把它搬到 `DAC->DOR1` 再送输出；没有触发时写入即生效。`DAC->CR` 里的 `EN` 使能通道、`TEN` 选择触发、`BOFF` 控制输出缓冲器（具体位定义见手册）。"},{kind:"kv",items:[{k:"分辨率",v:"12 位（F407 两路；通道数与封装有关，见数据手册）"},{k:"输出范围",v:"0 ~ VREF+，与 ADC 共用参考电压"},{k:"数据寄存器",v:"DAC->DHR12R1（写）→ DAC->DOR1（实际输出）"},{k:"触发与波形",v:"定时器 TRGO 触发更新；WAVE/MAMP 位可选三角波/噪声发生器（见手册）"},{k:"DMA 配合",v:"定时器触发 + DMA 连续送表，可输出正弦/任意波形"},{k:"负载能力",v:"输出缓冲器能力有限，驱动重负载要加运放；输出端常加 RC 平滑台阶"}]},{kind:"code",title:"寄存器版：让 DAC 通道 1 输出半量程电压（初始化细节见手册 DAC 章节）",language:"c",code:`/* 前提：已用 __HAL_RCC_DAC_CLK_ENABLE() 打开 DAC 时钟（APB1） */
DAC->CR |= DAC_CR_EN1;        /* 使能通道 1；BOFF1 决定是否开输出缓冲（见手册） */

DAC->DHR12R1 = 2048;          /* 12 位数据：2048 ≈ 半量程（VREF+/2，示意） */
/* 没有触发（TEN1 = 0）时写入即生效，硬件自动把 DHR12R1 搬到 DOR1 */

/* 三角波：WAVE1 选三角波、MAMP1 定幅度、TSEL1 选定时器触发（位定义见手册） */
DAC->CR |= DAC_CR_WAVE1_1 | DAC_CR_TEN1;`,explain:[{item:"DAC_CR_EN1",desc:"使能 DAC 通道 1。和 ADC 一样，先开时钟、再使能通道，否则写数据寄存器没有输出。"},{item:"DAC->DHR12R1 = 2048",desc:"12 位数据寄存器，写进去的数字码 × LSB 就是输出电压。2048 只是示意“半量程”，实际按 VREF+ 和目标电压算。"},{item:"WAVE1 / TEN1",desc:"WAVE1 选噪声或三角波发生器，MAMP1 定幅度；TEN1 打开触发，由 TSEL1 选的定时器事件驱动更新，才能得到连续波形。"}]},{kind:"compare",cardId:"adc"},{kind:"p",text:"下一页进入 **低功耗**：ADC 和 DAC 都是耗电大户，Stop 模式下模拟外设会被关掉；理解了采样、参考电压与校准，才能看懂“唤醒后为什么要重新配置并重新校准”。"}]}],mistakes:[{mistake:"参考电压或模拟地不干净",symptom:"读数整体跳动、同一电压重复测差好几个码；用手摸板子或旁边电机一转，读数就变",fix:"先查 VDDA/VREF+ 的去耦电容与走线，模拟地与功率地单点连接；有独立 VREF+ 引脚就外接精密基准，别拿开关电源的 3.3 V 当基准。"},{mistake:"采样时间太短，或源阻抗太高",symptom:"读数系统性偏低；换到下一个通道时，前一个通道的电压“残留”影响新通道（串扰）",fix:"按 t_s ≥ (R_AIN + R_ADC)·C_ADC·ln(2^(n+1)) 估算所需采样时间（示意），选更长档；源阻抗高就加运放缓冲或在输入端并小电容，别指望软件滤波救回来。"},{mistake:"多通道扫描不用 DMA，只读一次 DR",symptom:"两个通道读出来几乎一样，或者拿到的总是最后一个通道的值；通道顺序和接线对不上",fix:"扫描模式的结果都写同一个 DR，必须用 DMA（或每次 EOC 中断读一次）；数组下标 = Rank 顺序，搬运长度 = 通道数，三处必须一致。"},{mistake:"输入电压超出 0 ~ VREF+ 范围",symptom:"读数饱和在 4095 或 0；输入接 12 V / 负压时芯片发热、甚至整片损坏",fix:"先分压或运放衰减到量程内，再串限流电阻并加钳位保护；上电前用万用表确认每路输入电压都在范围内。"},{mistake:"跳过校准，或上电就高速连续采样",symptom:"零点有固定偏差（输入接地也读几十个码）；不同板子偏差还不一样",fix:"初始化后、启动转换前调用一次 HAL_ADCEx_Calibration_Start；校准期间不要触发转换，校准完成后再启动 DMA。"}],takeaways:["ADC 的本质是“采样 → 保持 → 量化 → 编码”：LSB = Vref / 2^n 决定一格多宽，量化误差最大 ±0.5 LSB，这是原理性误差，分辨率不等于精度。","读数准不准由“参考电压稳、采样时间够、源阻抗低、地干净”共同决定；多通道扫描必须靠 DMA 按 Rank 顺序搬走结果，否则数据会被覆盖或错位。","DAC 是 ADC 的逆过程：12 位数字码写进 DHR，硬件搬到 DOR 输出；配定时器触发和 DMA 送表就能产生三角波、正弦等模拟波形。"],quizIds:["adc-q1","adc-q2","adc-q3"],keywords:["ADC","DAC","分辨率","LSB","量化误差","参考电压","采样时间","DMA","规则组","注入组"]};export{A as adcLesson};
