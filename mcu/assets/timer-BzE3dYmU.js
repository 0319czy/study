const C={slug:"timer",title:"定时器 / PWM",en:"Timer & PWM",oneLine:"定时器就是一台“数时钟周期”的机器：数到设定值就翻输出或触发中断，PWM 则是用它输出占空比可调的方波。",category:"peripheral",level:"入门",minutes:30,goals:["说出时基三要素（时钟源 / PSC / ARR）与更新事件之间的关系","用 f = TIMclk / ((PSC+1)(ARR+1)) 和 CCR/(ARR+1) 手算频率与占空比","解释影子寄存器与预装载（ARPE）为什么能做到“无毛刺改占空比”","区分输出比较、输入捕获与单脉冲，知道各自典型的应用场景"],analogy:{title:"定时器像一台“带打卡机的跑步机”",text:"时钟是跑步机的节拍：每来一个脉冲，计数器就走一格。PSC 是“每几拍才记一次”，ARR 是“走满多少格就吹哨（更新事件）”，CCR 则是“走到第几格时把开关拨一下”。所以频率由“走满一圈要多久”决定，而 PWM 的高电平时间由“开关在第几格被拨动”决定。秒表的读数只是“走了多少格”，它本身并不知道一秒有多长——一切都是你配出来的。"},why:["**几乎所有“时间”都来自定时器**：PWM 调光与电机调速、串口超时、ADC 定时触发、输入捕获测频测距、RTOS 的时基，背后都是 TIM。","**让 CPU 不再死等**：用定时中断或硬件 PWM 代替 `HAL_Delay` 轮询翻转 GPIO，CPU 才能腾出手做别的事。","**硬件 PWM 效率高、抖动小**：软件翻转 GPIO 受中断延迟影响，频率一高就变形；硬件 PWM 由比较器直接驱动引脚，稳定得多。","**调试高频问题就在这几个寄存器里**：频率差一倍、占空比跳变、捕获值乱跳，原因基本都能落到 PSC / ARR / CCR 与预装载上。"],sections:[{id:"timebase",title:"定时器是什么：一台数数机器",lead:"定时器不“知道”秒，它只会数时钟周期；把“数多少个”配好，时间、频率、占空比就都能算出来。",blocks:[{kind:"p",text:"**定时器（Timer）**本质是一个可编程计数器。STM32 的通用定时器（TIM2、TIM3、TIM4…）都围绕同一套时基：**时钟源 → 预分频器（PSC）→ 计数器（CNT）→ 自动重装寄存器（ARR）→ 更新事件（UEV）**。计数器每来一个计数时钟就加一（或减一），数到 ARR 就归零、同时产生一次更新事件；更新事件可以触发中断、刷新预装载寄存器，也可以作为 ADC、DMA 的触发源。"},{kind:"terms",items:[{zh:"计数时钟",en:"TIMclk",desc:"定时器自己的工作时钟，来自 APB1 或 APB2 总线；注意它不一定等于总线时钟（见下面的注意框）。"},{zh:"预分频器",en:"PSC, Prescaler",desc:"把计数时钟先“放慢”：实际分频系数是 PSC+1，写入值 0 表示不分频。寄存器是 16 位。"},{zh:"计数器",en:"CNT, Counter",desc:"真正在跑的计数值；向上模式从 0 数到 ARR，向下模式从 ARR 数到 0，宽度随型号不同。"},{zh:"自动重装寄存器",en:"ARR, Auto-Reload Register",desc:"一圈的“格数”：计数器数到它（向下模式是数到 0）就重装并产生更新事件。一个周期的计数点是 ARR+1 个。"},{zh:"更新事件",en:"UEV, Update Event",desc:"计数器溢出/下溢时产生的事件：可置中断标志、把预装载值搬进影子寄存器、触发 ADC 或 DMA。"},{zh:"捕获/比较寄存器",en:"CCR, Capture/Compare Register",desc:"比较时决定“第几格触发”（PWM 占空比），捕获时用来锁存进入沿那一刻的 CNT 值。"}]},{kind:"kv",items:[{k:"计数频率",v:"TIMclk / (PSC+1)"},{k:"一个周期的计数点",v:"ARR+1 个"},{k:"一次更新事件的间隔",v:"(PSC+1)(ARR+1) / TIMclk"},{k:"输出频率",v:"TIMclk / ((PSC+1)(ARR+1))"},{k:"PWM 占空比",v:"CCR / (ARR+1)（模式 1、高有效）"},{k:"位宽（F407）",v:"TIM2/TIM5 为 32 位，TIM3/TIM4 为 16 位（见参考手册）"}]},{kind:"table",caption:"按能力粗分三类，具体型号是否带死区、编码器接口等以参考手册为准。",head:["类型","典型成员（F407）","能力","常见用途"],rows:[["高级定时器","TIM1、TIM8","带互补输出、死区插入、刹车输入","三相电机、半桥/全桥驱动"],["通用定时器","TIM2、TIM3、TIM4、TIM5","PWM、输出比较、输入捕获、编码器接口","调光、测频、编码器测速、ADC 触发"],["基本定时器","TIM6、TIM7","只有时基与更新事件，无输出通道","简单定时中断、DAC 触发"]]},{kind:"p",text:"更新事件既可以“默默”刷新预装载寄存器，也可以主动通知 CPU：使能 `TIM2->DIER` 的 UIE 后，每次计数到 ARR 都会把 `TIM2->SR` 的 UIF 置位；用 HAL 的 `HAL_TIM_Base_Start_IT()` 启动，中断回调就是 `HAL_TIM_PeriodElapsedCallback()`。这就是“用定时器做周期任务”的最小闭环。"},{kind:"note",tone:"info",title:"时钟没开，后面全是白配",text:"TIM2 挂在 APB1 上，第一步必须用 `__HAL_RCC_TIM2_CLK_ENABLE()` 打开时钟门控；引脚还得切到对应的复用功能。配置顺序永远是“开时钟 → 配时基 → 配通道 → 启动”，任何一步漏掉，示波器上都是一条直线。"}]},{id:"freq-duty",title:"频率与占空比怎么算",lead:"两个公式解决 90% 的配置问题：ARR 决定频率，CCR 决定占空比。",blocks:[{kind:"p",text:"先算**计数频率**：`TIMclk` 经过 PSC 分频后，计数器每经过 `(PSC+1)` 个时钟才加一，所以计数频率 `f_cnt = TIMclk / (PSC+1)`。再算**一个周期**：计数器从 0 数到 ARR 一共数 `ARR+1` 个点（0 也算一个点，这是最容易漏掉的 +1），因此一个周期的时间是 `(ARR+1) / f_cnt`，取倒数就是输出频率。"},{kind:"formula",latex:"f_{\\mathrm{PWM}} = \\frac{f_{\\mathrm{TIMclk}}}{(\\mathrm{PSC}+1)\\,(\\mathrm{ARR}+1)}",caption:"ARR 与 PSC 共同决定频率：改 ARR 会同时改动频率和占空比的分母，所以调频率优先动 PSC、调占空比优先动 CCR。"},{kind:"formula",latex:"D = \\frac{\\mathrm{CCR}}{\\mathrm{ARR}+1}\\,\\times\\,100\\%",caption:"PWM 模式 1、高电平有效时的占空比。ARR 不变时只改 CCR，就只改占空比、不改频率——这就是“调光不调频”的原理。"},{kind:"table",caption:"以 F407 的 APB1 定时器时钟 84 MHz 为例（PCLK1 = 42 MHz 时定时器时钟 ×2，见参考手册 RCC 章节）；数值为示意，实际按你的时钟树与数据手册核对。",head:["目标频率","PSC（分频系数 PSC+1）","ARR（一个周期 ARR+1 点）","计数频率","分辨率（1/点数）"],rows:[["1 kHz（示意）","83（÷84）","999（1000 点）","1 MHz","0.1%"],["20 kHz（示意）","0（÷1）","4199（4200 点）","84 MHz","约 0.024%"],["50 Hz（示意）","839（÷840）","1999（2000 点）","100 kHz","0.05%"]]},{kind:"note",tone:"warn",title:"TIMclk 不是 PCLK1",text:"F4/G4 的规则：APB 预分频系数为 1 时，定时器时钟等于该 APB 时钟；分频系数不为 1 时，**定时器时钟 = 2 × APB 时钟**。例如 F407 的 PCLK1 = 42 MHz 时，TIM2 的计数时钟是 84 MHz。直接用 42 MHz 去算，频率正好差一倍——这是定时器最经典的“算错一倍”问题。"},{kind:"compare",cardId:"clock"}]},{id:"count-shadow",title:"计数模式与影子寄存器",lead:"方向决定波形长什么样；影子寄存器决定“改参数时波形会不会抖”。",blocks:[{kind:"p",text:"**计数模式**由 `TIM2->CR1` 的 DIR（方向）与 CMS（中央对齐模式选择）决定：向上计数从 0 数到 ARR，向下计数从 ARR 数到 0，中央对齐则先向上再向下、来回折返。模式不同，同一个 PSC / ARR 得到的频率和波形都不一样，换模式必须重算。"},{kind:"table",caption:"三种模式的典型差异；中央对齐的更新事件与中断节奏与边沿对齐不同，移植计算时以参考手册时序为准。",head:["计数模式","CNT 怎么走","PWM 波形特点","典型用途"],rows:[["向上计数","0 → ARR → 0，周期 ARR+1 个点","每个周期开头上升沿、中间下降沿（模式 1）","调光、普通 PWM、定时中断"],["向下计数","ARR → 0 → ARR","与向上模式相位相反，下降沿在周期起点","需要反向边沿对齐的场合"],["中央对齐","0 → ARR → 0 → ARR，来回折返","脉冲关于周期中点对称，谐波更柔和","电机控制、需要对称 PWM 的功率级"]]},{kind:"note",tone:"info",title:"为什么电机喜欢中央对齐",text:"中央对齐输出的 PWM 左右对称，一个周期内的高电平被“摊”在中间，相比边沿对齐能降低部分低频谐波与电流纹波（具体效果与开关频率、死区有关）。代价是同样 PSC/ARR 下更新事件的节奏不同，算频率与中断周期时要按手册核对，不能直接套向上模式的公式。"},{kind:"p",text:"**影子寄存器（Shadow Register）**是理解“毛刺”的关键。PSC、ARR、CCR 这类参数寄存器大多带一个“影子副本”：你写进去的值先进预装载寄存器，真正被硬件使用的影子寄存器只在**更新事件**时一次性更新。这样新参数总是在一圈的边界生效，不会落在脉冲中间。"},{kind:"table",caption:"是否需要打开预装载由硬件设计决定；PSC 的缓冲是固定的，ARR/CCR 要软件使能。",head:["寄存器","是否有缓冲","由谁控制","生效时机"],rows:[["PSC","有（固定缓冲）","无需开关","下一次更新事件生效"],["ARR","有，但默认不启用","`TIM2->CR1` 的 ARPE（HAL 里是 AutoReloadPreload）","使能后下一次更新事件生效"],["CCR1","有，但默认不启用","`TIM2->CCMR1` 的 OC1PE（输出比较预装载）","使能后下一次更新事件生效"],["CNT","无","—","写入立即改变当前计数值"]]},{kind:"ul",items:["**开了 ARR 预装载（ARPE）**：运行中改 ARR 调频，新周期在下一次更新事件才切换，不会出现“半个周期长、半个周期短”的异常波形。","**开了 CCR 预装载（OC1PE）**：运行中改占空比，新比较值在下一次更新事件生效，高电平不会被中途截断或拉长。","**不开预装载**：写 CCR 会立即参与比较，如果正好落在当前高电平期间，就可能出现一个宽度异常的脉冲——示波器上看到的就是毛刺，电机/灯会抖。","**PSC 写进去也不是立刻生效**：它同样缓冲在更新事件上；用 HAL 的 `__HAL_TIM_SET_PRESCALER()` 或直接写 `TIM2->PSC` 后，最好等待（或主动产生）一次更新事件再确认新频率。"]},{kind:"note",tone:"tip",title:"一句话记住",text:"**ARR 定频率、CCR 定占空比；要在线改，就先开预装载（ARPE / OCxPE），让新值在更新事件生效。** 看到“改参数有毛刺”，先查这两个使能位，而不是怀疑芯片。"}]},{id:"oc-ic-onepulse",title:"输出比较、输入捕获与单脉冲",lead:"同一个比较器，往外驱动就是 PWM，往里锁存就是测频——方向不同而已。",blocks:[{kind:"p",text:"**输出比较（Output Compare）**：硬件持续比较 CNT 与 CCR，相等时按配置改变输出引脚。PWM 只是输出比较的一种用法：CNT < CCR 时输出一种电平、CNT ≥ CCR 时输出另一种电平，于是占空比 = CCR/(ARR+1)。输出比较还有“匹配时置高 / 置低 / 翻转 / 冻结”等模式，可以用来产生精确的单次跳变或可调相位的方波。"},{kind:"ul",items:["**PWM 模式 1**：CNT < CCR 时有效电平（通常高），适合 LED、电机这类“高电平有效”的负载。","**PWM 模式 2**：与模式 1 相反，CNT < CCR 时输出无效电平，占空比按“低电平占比”理解，接反相驱动时常用。","**匹配翻转（Toggle）**：CNT = CCR 时引脚翻转一次，配上一个周期一次比较，就能得到 50% 占空比的方波；配合更新中断还能做简易 DDS 波形。","**冻结（Frozen）**：比较不改变输出，只产生比较中断，适合“到点提醒 CPU”而不动引脚。"]},{kind:"p",text:"**输入捕获（Input Capture）**：把引脚上的边沿（上升沿/下降沿）当作“事件”，硬件在事件发生的一瞬间把当前 CNT 值锁存进 CCR，再产生捕获中断。两个边沿之间的计数值差，就是这段时间里走过的计数点数——除以计数频率就是时间，取倒数就是频率。测频、测周期、测脉宽、红外解码、超声波回波测距，全是这个思路。"},{kind:"formula",latex:"f_{\\mathrm{in}} = \\frac{f_{\\mathrm{CNT}}}{\\Delta\\mathrm{CNT}} = \\frac{f_{\\mathrm{TIMclk}}/(\\mathrm{PSC}+1)}{\\Delta\\mathrm{CNT}}",caption:"输入捕获测频：数出两次上升沿之间经过了多少个计数点 ΔCNT，再用计数频率反推输入频率。"},{kind:"ol",items:["**配时基**：让一个 ARR 周期足够长，至少覆盖待测信号的最低频率（低频要加大 PSC，否则 CNT 会多次溢出）。","**配通道**：把通道设成输入捕获、选边沿极性（测频常用上升沿）、必要时加输入滤波抑制毛刺。","**开捕获中断**：用 `HAL_TIM_IC_Start_IT()` 启动，中断里读捕获值；连续两次捕获的差值就是周期对应的计数点数。","**处理溢出**：周期比一个 ARR 还长时，要累计更新事件次数再拼出完整时间，否则读到的只是“残差”。"]},{kind:"code",title:"输入捕获测频：记录两次上升沿之间的计数差（简化示意）",language:"c",code:`/* TIM3_CH1 接一路待测方波，用输入捕获测量它的周期（示意代码） */
static uint32_t last_capture = 0;   /* 上一次捕获到的 CNT 值 */
static uint32_t period_ticks = 0;   /* 两次上升沿之间的计数点数 */

/* 1) 配置通道为“上升沿 + 直接映射到 TI1”，并开捕获中断 */
void IC_Start(TIM_HandleTypeDef *htim)
{
    TIM_IC_InitTypeDef ic = {0};
    ic.ICPolarity  = TIM_ICPOLARITY_RISING;   /* 上升沿捕获 */
    ic.ICSelection = TIM_ICSELECTION_DIRECTTI;
    ic.ICPrescaler = TIM_ICPSC_DIV1;          /* 每个边沿都捕获 */
    ic.ICFilter    = 0;                       /* 滤波档位按信号质量调 */

    HAL_TIM_IC_ConfigChannel(htim, &ic, TIM_CHANNEL_1);
    HAL_TIM_IC_Start_IT(htim, TIM_CHANNEL_1); /* 启动捕获并使能中断 */
}

/* 2) 捕获回调：每次上升沿进来一次，用 CNT 差值换算周期 */
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Channel != HAL_TIM_ACTIVE_CHANNEL_1) {
        return;                               /* 只处理 CH1，其它通道交给别人 */
    }

    uint32_t now = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
    uint32_t ticks;

    if (now >= last_capture) {
        ticks = now - last_capture;           /* 没跨更新事件，直接相减 */
    } else {
        /* 跨过一次溢出：补上“从 last_capture 到 ARR”再加“从 0 到 now” */
        ticks = (htim->Instance->ARR + 1U) - last_capture + now;
    }

    last_capture = now;
    period_ticks = ticks;                     /* 真实周期 = ticks / f_CNT */
}`,explain:[{item:"TIM_ICPOLARITY_RISING",desc:"选上升沿捕获；测占空比时通常还要再配一个下降沿通道，分别锁存高电平时间与周期。"},{item:"HAL_TIM_IC_Start_IT",desc:"启动捕获通道并使能捕获中断；纯轮询可用不带 IT 的版本，但高频信号容易漏沿。"},{item:"HAL_TIM_ReadCapturedValue",desc:"读 CCR 里锁存的 CNT 快照，也就是“边沿到来的那一刻计数到了几”。"},{item:"htim->Instance->ARR + 1U",desc:"一个周期的计数点数；跨更新事件的差值要按这个数补齐，否则算出来的是残差。"},{item:"period_ticks",desc:"只是计数点数，要除以计数频率才是时间；周期长于一个 ARR 时还需累计更新事件次数。"}]},{kind:"p",text:"**单脉冲（One-Pulse）**是输出比较的特殊用法：置位 `TIM2->CR1` 的 OPM 位后，定时器在下一个更新事件自动停止计数，只输出一个宽度由 CCR 决定的脉冲。它适合“给一个精确的触发脉冲就收工”的场景，比如驱动某些需要单次使能信号的器件、或作为外部器件的精确定时触发。"},{kind:"note",tone:"warn",title:"捕获最容易错的三件事",text:"① 待测频率太低而 ARR 周期太短，CNT 溢出多次却没累计，读数完全不对；② 输入信号有毛刺，没开滤波导致一次边沿被当成好几次；③ 捕获回调里做了耗时操作，下一次边沿来时前一次还没处理完。先用“已知频率的信号源 + 示波器”验证捕获值，再上真实负载。"}]},{id:"pwm-setup",title:"配置 PWM：六步与代码",lead:"顺序有因果：时钟与引脚不对，后面的寄存器和 HAL 调用全部白费。",blocks:[{kind:"ol",items:["**开时钟**：打开 TIM2 的 APB1 时钟与 GPIOA 的 AHB1 时钟；没开时钟，寄存器写了也不生效。","**配引脚复用**：把 PA0 设成复用推挽，并选到 TIM2_CH1 对应的复用号（F4 上 TIM2 是 AF1，以数据手册引脚表为准）。","**配时基**：按目标频率算好 PSC 与 ARR，选向上计数，并把 ARR 预装载（ARPE）打开，便于运行中调频。","**配输出通道**：选 PWM 模式 1、设初始 CCR（决定初始占空比）、高电平有效，并打开 CCR 预装载（OC1PE）。","**启动**：调用 `HAL_TIM_PWM_Start()`，它同时打开计数器和通道输出；只开计数器不使能通道，引脚不会有波形。","**运行中调参**：调占空比用 `__HAL_TIM_SET_COMPARE()`，调频率用 `__HAL_TIM_SET_AUTORELOAD()`；两个宏只是写 CCR / ARR，预装载已使能时改动在更新事件生效。"]},{kind:"code",title:"HAL：PA0 输出 1 kHz PWM + 呼吸灯（数值均为示意）",language:"c",code:`/* 目标：在 PA0（TIM2_CH1）上输出 1 kHz、占空比可调的 PWM。
 * 时钟假设：TIM2 的计数时钟 = 84 MHz（示意，见参考手册 RCC 章节）。
 * 84 MHz / (83+1) = 1 MHz 计数频率；1000 个点 = 1 kHz。 */
TIM_HandleTypeDef htim2;

void PWM_Init(void)
{
    /* 1) 先开时钟：TIM2 在 APB1，GPIOA 在 AHB1 */
    __HAL_RCC_TIM2_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /* 2) 把 PA0 复用给 TIM2_CH1，推挽输出 */
    GPIO_InitTypeDef gpio = {0};
    gpio.Pin       = GPIO_PIN_0;
    gpio.Mode      = GPIO_MODE_AF_PP;      /* 复用推挽 */
    gpio.Pull      = GPIO_NOPULL;
    gpio.Speed     = GPIO_SPEED_FREQ_LOW;
    gpio.Alternate = GPIO_AF1_TIM2;        /* F4：TIM2 复用号为 AF1（以数据手册为准） */
    HAL_GPIO_Init(GPIOA, &gpio);

    /* 3) 时基：PSC 先分频，ARR 决定一圈多少个点 */
    htim2.Instance               = TIM2;
    htim2.Init.Prescaler         = 83;     /* PSC = 83 → 实际分频 84 */
    htim2.Init.CounterMode       = TIM_COUNTERMODE_UP;
    htim2.Init.Period            = 999;    /* ARR = 999 → 一圈 1000 个点 */
    htim2.Init.ClockDivision     = TIM_CLOCKDIVISION_DIV1;
    htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE; /* 打开 ARPE */
    HAL_TIM_PWM_Init(&htim2);

    /* 4) 通道：PWM 模式 1，初始占空比 50%，高电平有效 */
    TIM_OC_InitTypeDef oc = {0};
    oc.OCMode     = TIM_OCMODE_PWM1;
    oc.Pulse      = 500;                   /* CCR1 = 500 → 500/1000 = 50% */
    oc.OCPolarity = TIM_OCPOLARITY_HIGH;
    oc.OCFastMode = TIM_OCFAST_DISABLE;
    HAL_TIM_PWM_ConfigChannel(&htim2, &oc, TIM_CHANNEL_1);

    /* 5) 启动：打开计数器并把 CH1 接到引脚 */
    HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);
}

/* 6) 呼吸灯：放在主循环里反复调用，缓慢改变 CCR1 */
void PWM_BreathStep(void)
{
    static uint32_t duty = 0;

    /* 只改比较值：频率不变，占空比在 0..999 之间循环变化 */
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, duty);
    duty = (duty + 10U) % 1000U;

    HAL_Delay(5);   /* 示意节奏：数值越小“呼吸”越快，按视觉效果调 */
}`,explain:[{item:"__HAL_RCC_TIM2_CLK_ENABLE()",desc:"打开 TIM2 时钟门控；漏掉这一步，后面所有时基与通道配置都写不进硬件。"},{item:"gpio.Alternate = GPIO_AF1_TIM2",desc:"把引脚连到 TIM2 的复用功能上；F4 上 TIM2 是 AF1，换型号/引脚先查数据手册的复用表。"},{item:"Prescaler = 83",desc:"PSC 寄存器写 83，实际分频是 84；84 MHz / 84 = 1 MHz 计数频率。注意不是写 84。"},{item:"Period = 999",desc:"ARR 写 999，一圈共 1000 个计数点；1 MHz / 1000 = 1 kHz。想改频率就改这个值或 PSC。"},{item:"TIM_AUTORELOAD_PRELOAD_ENABLE",desc:"等价于置 CR1 的 ARPE：运行中改 ARR 时，新周期在更新事件生效，避免波形被截断。"},{item:"oc.Pulse = 500",desc:"写 CCR1 的初始值，决定初始占空比 500/1000 = 50%；之后可以随时用 __HAL_TIM_SET_COMPARE 改。"},{item:"HAL_TIM_PWM_Start",desc:"启动计数器并使能通道输出；只调 HAL_TIM_Base_Start() 时计数器在跑，但引脚不会输出 PWM。"},{item:"__HAL_TIM_SET_COMPARE",desc:"写 CCR1 的宏，只动比较值不动时基；配合 OC1PE 预装载，新占空比在下一个更新事件生效，无毛刺。"}]},{kind:"tabs-code",title:"同一路 PWM 的三种写法：HAL / LL / 寄存器",note:"三段做的是同一件事（PA0 上 TIM2_CH1 输出 1 kHz、50% 的 PWM）；省略了错误处理与时钟树配置。LL 函数名与参数以所用 LL 头文件版本为准，寄存器位定义见参考手册 TIM 章节。",variants:[{label:"HAL",language:"c",code:`/* HAL：只描述“要什么”，顺序与位操作交给库 */
__HAL_RCC_TIM2_CLK_ENABLE();
__HAL_RCC_GPIOA_CLK_ENABLE();

GPIO_InitTypeDef gpio = {0};
gpio.Pin       = GPIO_PIN_0;
gpio.Mode      = GPIO_MODE_AF_PP;
gpio.Pull      = GPIO_NOPULL;
gpio.Speed     = GPIO_SPEED_FREQ_LOW;
gpio.Alternate = GPIO_AF1_TIM2;
HAL_GPIO_Init(GPIOA, &gpio);

htim2.Instance               = TIM2;
htim2.Init.Prescaler         = 83;
htim2.Init.CounterMode       = TIM_COUNTERMODE_UP;
htim2.Init.Period            = 999;
htim2.Init.ClockDivision     = TIM_CLOCKDIVISION_DIV1;
htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE;
HAL_TIM_PWM_Init(&htim2);

TIM_OC_InitTypeDef oc = {0};
oc.OCMode     = TIM_OCMODE_PWM1;
oc.Pulse      = 500;
oc.OCPolarity = TIM_OCPOLARITY_HIGH;
oc.OCFastMode = TIM_OCFAST_DISABLE;
HAL_TIM_PWM_ConfigChannel(&htim2, &oc, TIM_CHANNEL_1);

HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);`,explain:[{item:"HAL_TIM_PWM_Init + ConfigChannel",desc:"前者配时基，后者配输出通道；两步都完成后再 Start，引脚才有 PWM。"},{item:"TIM_OCMODE_PWM1",desc:"CNT < CCR 时输出有效电平；占空比 = CCR/(ARR+1)。"}]},{label:"LL",language:"c",code:`/* LL：函数化的寄存器操作，开销小，但顺序与使能仍由你保证 */
LL_APB1_GRP1_EnableClock(LL_APB1_GRP1_PERIPH_TIM2);
LL_AHB1_GRP1_EnableClock(LL_AHB1_GRP1_PERIPH_GPIOA);

LL_GPIO_SetPinMode(GPIOA, LL_GPIO_PIN_0, LL_GPIO_MODE_ALTERNATE);
LL_GPIO_SetPinOutputType(GPIOA, LL_GPIO_PIN_0, LL_GPIO_OUTPUT_PUSHPULL);
LL_GPIO_SetPinPull(GPIOA, LL_GPIO_PIN_0, LL_GPIO_PULL_NO);
LL_GPIO_SetAFPin_0_7(GPIOA, LL_GPIO_PIN_0, LL_GPIO_AF_1);

LL_TIM_SetPrescaler(TIM2, 83);                  /* PSC = 83 */
LL_TIM_SetAutoReload(TIM2, 999);                /* ARR = 999 */
LL_TIM_EnableARRPreload(TIM2);                  /* ＝ ARPE */
LL_TIM_SetCounterMode(TIM2, LL_TIM_COUNTERMODE_UP);
LL_TIM_SetClockDivision(TIM2, LL_TIM_CLOCKDIVISION_DIV1);

LL_TIM_OC_SetMode(TIM2, LL_TIM_CHANNEL_CH1, LL_TIM_OCMODE_PWM1);
LL_TIM_OC_EnablePreload(TIM2, LL_TIM_CHANNEL_CH1);   /* ＝ OC1PE */
LL_TIM_OC_SetCompareCH1(TIM2, 500);                  /* CCR1 = 500 */
LL_TIM_OC_SetPolarity(TIM2, LL_TIM_CHANNEL_CH1, LL_TIM_OCPOLARITY_HIGH);
LL_TIM_CC_EnableChannel(TIM2, LL_TIM_CHANNEL_CH1);

LL_TIM_EnableCounter(TIM2);                     /* ＝ CEN 置位 */`,explain:[{item:"LL_TIM_OC_EnablePreload",desc:"打开 CCR1 预装载，改占空比时不会在脉冲中间生效。"},{item:"LL_TIM_EnableCounter",desc:"等价于置 CR1 的 CEN；到这一步计数器才真正开始跑。"}]},{label:"寄存器",language:"c",code:`/* 裸寄存器：每一步都对应参考手册 TIM 章节里的一个字段 */
RCC->APB1ENR |= RCC_APB1ENR_TIM2EN;         /* 1. 开 TIM2 时钟 */
RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;        /*    开 GPIOA 时钟 */

GPIOA->MODER &= ~(3U << (0 * 2));           /* 2. PA0 设为复用功能（10） */
GPIOA->MODER |=  (2U << (0 * 2));
GPIOA->AFR[0] = (GPIOA->AFR[0] & ~(0xFU << (0 * 4)))
              | (1U << (0 * 4));             /*    AF1 = TIM2（见数据手册） */

TIM2->PSC  = 83;                            /* 3. 84 MHz / 84  = 1 MHz */
TIM2->ARR  = 999;                           /*    1 MHz / 1000 = 1 kHz */
TIM2->CR1 |= TIM_CR1_ARPE;                  /*    打开 ARR 预装载 */

TIM2->CCR1 = 500;                           /* 4. 500/1000 = 50% 占空比 */
TIM2->CCMR1 &= ~TIM_CCMR1_OC1M;             /* 5. CH1 = PWM 模式 1 */
TIM2->CCMR1 |= (TIM_CCMR1_OC1M_1 | TIM_CCMR1_OC1M_2);
TIM2->CCMR1 |= TIM_CCMR1_OC1PE;             /*    打开 CCR1 预装载 */
TIM2->CCER  |= TIM_CCER_CC1E;               /*    使能 CH1 输出（CC1P=0 为高有效） */

TIM2->CR1 |= TIM_CR1_CEN;                   /* 6. 启动计数器 */`,explain:[{item:"RCC->APB1ENR",desc:"APB1 外设时钟使能寄存器；TIM2EN 对应 TIM2 的时钟门控（具体位定义见参考手册 RCC 章节）。"},{item:"TIM2->PSC / TIM2->ARR",desc:"预分频与自动重装；写入的是“寄存器值”，实际分频与周期都要 +1。"},{item:"TIM_CR1_ARPE",desc:"ARR 预装载使能位；开了它，运行中改 ARR 才不会出现半个周期的怪波形。"},{item:"OC1M 的 110",desc:"PWM 模式 1 的编码（这里用 CMSIS 的 OC1M_1 | OC1M_2 拼出，不写绝对位号），CNT < CCR 时输出有效电平。"},{item:"TIM_CCMR1_OC1PE",desc:"CCR1 预装载使能；运行中改 CCR1 时新值在更新事件生效，避免毛刺。"},{item:"TIM_CCER_CC1E",desc:"通道 1 输出使能；不开它，计数器在跑但引脚不输出。"}]}]},{kind:"lab",labId:"timer-pwm",caption:"交互要点：调 PSC / ARR / CCR，实时看频率与占空比怎么变；单步观察 CNT 与 CCR 比较的时刻，理解“占空比就是高电平占一圈的比例”。"},{kind:"note",tone:"tip",title:"频率与分辨率是一对矛盾",text:"同一个计数时钟下，频率越高，一个周期里的计数点越少，占空比能调的档位也越少。84 MHz 下做 20 kHz，一圈约 4200 个点，分辨率约 0.024%（示意）；而做 1 Hz 时一圈要 8400 万个点，16 位定时器（ARR 最大 65535）根本装不下，只能加大 PSC。选参数前先问：要频率精度，还是要占空比精度？"}]},{id:"debug",title:"上板调试与验收",lead:"别靠“感觉调对了”：先量频率，再量占空比，最后看边沿。",blocks:[{kind:"kv",items:[{k:"第一步量什么",v:"频率：周期是否等于 (PSC+1)(ARR+1)/TIMclk"},{k:"第二步量什么",v:"占空比：高电平宽度 / 周期，是否等于 CCR/(ARR+1)"},{k:"边沿要看什么",v:"上升/下降沿是否干净，有没有过冲与振铃"},{k:"改参数时看什么",v:"波形是否整体切换，出现“窄脉冲”说明预装载没开"},{k:"频率差一倍",v:"优先怀疑 TIMclk 算成了 PCLK1（分频≠1 时定时器时钟 ×2）"},{k:"引脚一直是低",v:"查时钟门控、复用号、CC1E 与 HAL_TIM_PWM_Start 是否都做到"}]},{kind:"table",caption:"示波器/逻辑分析仪上的典型现象与排查顺序，先在“配置链路”上找原因，再怀疑硬件。",head:["现象","最常见原因","怎么查"],rows:[["完全没波形","TIM 时钟没开、引脚没配复用、没调 Start","读 `TIM2->CR1` 的 CEN 与 `TIM2->CCER` 的 CC1E；用万用表/示波器看引脚是否被拉低"],["频率是预期的一半/两倍","TIMclk 取了 PCLK1（差 2 倍），或 PSC / ARR 记错一档","用 `HAL_RCC_GetPCLK1Freq()` 取实际总线频率，按手册判断是否 ×2，再手算一遍"],["占空比不准、调不到 100%","CCR 按“百分比”写进了 16 位寄存器，或 ARR 与 CCR 的量纲不一致","确认 CCR 是“计数点数”不是百分数；100% 需要 CCR ≥ ARR+1"],["改参数瞬间出现窄脉冲","ARR/CCR 预装载没开，或改了 PSC 却没等更新事件","打开 ARPE 与 OCxPE；改 PSC 后主动等一次更新事件"],["电机/LED 抖动、发热","PWM 频率落在人耳/机械共振区，或驱动级跟不上边沿","先把频率挪到 20 kHz 量级以上试（示意），再看驱动电路与地线"]]},{kind:"ul",items:["**示波器探头要接地**：探头地夹接板上 GND，别只夹信号；长地线会引入振铃，让你误判“PWM 有毛刺”。","**先测空载，再带负载**：LED、电机、MOS 栅极都会改变边沿形状；空载正常、带载变形时，问题在驱动级而不是定时器配置。","**用已知信号交叉验证**：拿信号发生器或另一路已知 PWM 去喂输入捕获，先确认“测量链路”没问题，再测真实信号。","**别在中断里做重活**：更新中断与捕获中断都应短小，耗时操作放到主循环；否则频率一高就丢事件。"]},{kind:"note",tone:"warn",title:"定时器还是很多外设的“节拍源”",text:"同一个 TIM 还能给 ADC 提供规则/注入触发、给 DMA 发请求、接编码器做测速。这些用法共用时基与更新事件：改了 PSC/ARR，触发频率也跟着变。做“定时器触发 ADC + DMA 搬运”时，先把 PWM/时基调稳，再接触发链路，出问题才容易定位。"},{kind:"p",text:"到这里，定时器的主线就完整了：**时钟 → PSC → CNT → ARR/更新事件** 构成时基，**CCR 比较**负责输出，**捕获**负责测量。ADC 与 DMA 两页会把定时器串起来：用更新事件触发采样、让数据自己流进内存，CPU 只处理结果。"}]}],mistakes:[{mistake:"忘记开 TIM2 时钟或没配引脚复用",symptom:"HAL 函数全部返回 OK，示波器上却是一条直线；读 CNT 一直是 0",fix:"按“开 TIM 时钟 → 开 GPIO 时钟 → 配复用号 → 配时基/通道 → Start”的顺序逐项核对，先确认 `TIM2->CR1` 的 CEN 已置位。"},{mistake:"用 PCLK1 直接当定时器时钟算频率",symptom:"实际频率正好是设计值的一半（或两倍），怎么调 ARR 都对不上",fix:"F4/G4 在 APB 预分频不为 1 时，定时器时钟 = 2 × APB 时钟；先看时钟树，再用示波器反推实际 TIMclk。"},{mistake:"PSC / ARR 忘了 +1，把寄存器值当分频系数",symptom:"频率整体偏高一档，占空比也差一点点，且越小的值偏差越明显",fix:"记住实际分频 = PSC+1、一个周期 = ARR+1 个计数点；手算完用示波器量一次周期验证。"},{mistake:"运行中直接改 CCR/ARR 却没开预装载",symptom:"调光/调速时偶尔出现一个特别窄或特别宽的脉冲，电机抖动、LED 闪烁",fix:"打开 ARPE 与 OCxPE（HAL 的 AutoReloadPreload 与 PWM 通道配置），让新值在更新事件生效；改 PSC 同样要等更新事件。"},{mistake:"输入捕获不处理计数器溢出",symptom:"低频信号测出来频率乱跳，或总是偏大/偏小一个固定量",fix:"让 ARR 周期覆盖最低待测频率；周期更长时累计更新事件次数再拼时间，并检查捕获中断有没有丢。"}],takeaways:["时基三要素是时钟源、PSC、ARR 与更新事件：f = TIMclk / ((PSC+1)(ARR+1))，占空比 = CCR/(ARR+1)，两个 +1 都不能漏。","ARR 定频率、CCR 定占空比；在线改参数要先开预装载（ARPE / OC1PE），让新值在更新事件生效，才能做到无毛刺。","输出比较负责“往外驱动”（PWM），输入捕获负责“往里测量”（测频测周期），单脉冲则是只发一次精确脉冲的特殊用法。"],quizIds:["timer-q1","timer-q2","timer-q3"],keywords:["定时器","PWM","预分频","自动重装","占空比","影子寄存器","预装载","输入捕获","输出比较","单脉冲"]};export{C as timerLesson};
