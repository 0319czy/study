const I={slug:"interrupt",title:"中断与 NVIC",en:"Interrupt & NVIC",oneLine:"中断是外设在需要你时敲一下 CPU 的门：CPU 立刻放下手上的活去处理，处理完再回来接着干。",category:"peripheral",level:"进阶",minutes:28,goals:['能说清一次中断从"外设置挂起"到"ISR 返回"硬件替你做了哪几件事',"会区分抢占优先级与子优先级，知道 PRIGROUP 在决定什么","能用 HAL 把 EXTI 按键中断从底层寄存器一路配到回调函数","写出短、不阻塞、标志清干净的 ISR，并把耗时处理搬到主循环"],analogy:{title:"中断像公司前台：门铃响了才处理，重要客人可以插队",text:'CPU 就是正在写方案的你，门铃是外设发出的中断请求，前台是 **NVIC**：她记着"哪些门铃允许响"（使能）、"哪个客人更急"（优先级）。普通客人来了，她在便签上排好队，等你写完当前这段；老板来了，她直接敲门打断你（抢占）。你起身前会把笔、本子、手机按固定顺序放进抽屉（压栈 8 个字），回来再一件件拿出来（出栈）继续写——这就是中断现场的保护与恢复。'},why:['**实时性的来源**：轮询把 CPU 时间花在"问有没有事"上，中断只在"真有事"时才花时间，是按键、串口收数、定时采样、电机换相的基础。',"**所有外设都靠它收尾**：UART 收完一个字节、ADC 转换完成、DMA 传完一半，最终都要落到一个 ISR 或 HAL 回调上。",'**排错绕不开 NVIC**：程序"卡死""进不去回调""优先级反转"这类问题，八成是使能、优先级分组或标志没清。',"**进阶内容的前置**：FreeRTOS 的任务切换本质是 PendSV + SysTick 中断，学不会中断就读不懂调度器。"],sections:[{id:"what-is-interrupt",title:"是什么：从轮询到中断",lead:'先想清楚"谁在等谁"，中断的每个细节才有落点。',blocks:[{kind:"p",text:'**轮询（polling）** 是 CPU 主动反复问外设："好了没？好了没？"——问的时候什么正事也干不了。**中断（interrupt）** 反过来：外设真有事情时**主动**向内核发请求，内核暂停当前指令流，跳到一段专门的代码（**ISR，Interrupt Service Routine，中断服务函数**）里处理，处理完回到被打断的地方继续执行。整个过程对主程序是"透明"的：它不知道自己被暂停过。'},{kind:"p",text:'关键区别在**触发方**。轮询是软件驱动，延迟取决于循环转多快；中断是硬件驱动，延迟由"外设 → NVIC → 内核"这条硬件通路决定，通常是若干个时钟周期到几十个周期的量级（示意，具体以外设与主频为准）。这也是为什么按键、编码器、串口这类"随机又要求及时"的事件必须用中断。'},{kind:"table",caption:"表中为教学性对比，具体延迟与占用随实现差异很大，量级仅供建立直觉。",head:["维度","轮询 polling","中断 interrupt"],rows:[["谁触发","CPU 主动去问外设","外设主动请求 CPU"],["响应延迟","取决于循环里其他任务的耗时，最坏情况很长","由硬件通路决定，通常更短且更可预测"],["CPU 占用","没事也要一直问，白白烧时间","没事时零开销，有事才花时间"],["代码结构","简单直观，一个 while 里全搞定",'要拆分"快速响应"与"耗时处理"两段'],["适合场景","状态变化慢、对时序不敏感（如慢速传感器）","随机事件、时序敏感、低功耗待机唤醒"]]},{kind:"note",tone:"info",title:'中断不是"多线程"',text:'Cortex‑M 没有操作系统级的线程概念：ISR 是**抢占**主程序的一次函数调用，跑完就还回去。所以 ISR 里没有"等待"，也不能假设主程序停在了哪一行；它和主程序共享同一片 SRAM，共享变量必须自己保证可见性（后面 `volatile` 那一节）。'},{kind:"terms",items:[{zh:"中断源",en:"Interrupt Source",desc:"能发出中断请求的东西：外设（EXTI、USART、TIM…）或内核异常（SysTick、PendSV…）。"},{zh:"NVIC",en:"Nested Vectored Interrupt Controller",desc:"嵌套向量中断控制器，Cortex‑M 内核的一部分：负责使能、优先级比较、嵌套与向量分发。"},{zh:"EXTI",en:"External Interrupt/Event Controller",desc:"外部中断控制器，把某个引脚的电平跳变变成一条中断线请求。"},{zh:"ISR",en:"Interrupt Service Routine",desc:"中断服务函数，名字必须与启动文件里的向量表条目一致（如 `EXTI0_IRQHandler`）。"},{zh:"抢占",en:"Preemption",desc:"更高抢占优先级的中断可以打断正在执行的 ISR，形成嵌套。"}]}]},{id:"response-flow",title:"核心机制：一次中断的六步",lead:"这条链路上，硬件做了什么、软件该做什么，必须分得清。",blocks:[{kind:"p",text:'从中断请求发生到 ISR 返回，一共六步。前三步是**硬件**完成的，你写代码只需要保证"请求产生得对、使能给对了、标志清干净"。'},{kind:"ol",items:["**外设置挂起**：外设检测到事件（如 EXTI 采到下降沿），把对应的挂起标志置起来，向 NVIC 发出请求。","**NVIC 判定**：查这条中断线是否使能（`NVIC->ISER[]`），再把自己的抢占优先级与当前执行优先级比较——够高就立即响应，不够就先排队。","**压栈保存现场**：内核自动把 8 个寄存器的值压入当前栈，同时把 LR 写成特殊的 **EXC_RETURN** 值。","**取向量**：按异常编号去向量表取入口地址（向量表基址由 `SCB->VTOR` 指定），跳到对应 ISR。","**执行 ISR**：你在里面读状态、清标志、把数据搬走或置个标志就出来。","**异常返回**：ISR 末尾执行 `BX LR`（编译器自动生成），LR 里的 EXC_RETURN 触发硬件出栈，恢复现场回到被打断处。"]},{kind:"p",text:'**压栈的 8 个字**固定是：`xPSR`、`PC`（返回地址）、`LR`、`R12`、`R3`、`R2`、`R1`、`R0`，共 32 字节。栈从高地址向低地址长，所以内存里从低到高看起来是 R0 在最低、`xPSR` 在最高。**为什么偏偏是这 8 个**：R0–R3 与 R12 是传参/临时寄存器（函数调用约定里本来就不保证保留），`PC`/`xPSR`/`LR` 决定"回到哪、以什么状态回"，硬件全包了，所以 ISR 可以写成一个普通的 C 函数。'},{kind:"p",text:'**EXC_RETURN** 是一个"魔法返回值"，例如 `0xFFFFFFF9` 表示返回 Thread 模式、用主栈 MSP；`0xFFFFFFFD` 表示返回 Thread 模式、用进程栈 PSP（具体取值见 ARM 架构手册）。它保证了"进去时谁压的栈，出来时还回谁"——这也是裸机（全用 MSP）与 RTOS（任务用 PSP）能共用同一套中断机制的原因。'},{kind:"note",tone:"warn",title:"尾链（tail-chaining）与迟到（late arrival）",text:'**尾链**：一个 ISR 返回时如果已有一条中断挂起且优先级足够，硬件跳过"出栈 8 字 + 再压栈 8 字"，直接进下一个 ISR，省掉十来个时钟周期（示意）。**迟到**：在压栈阶段（现场还没保存完）更高优先级的请求到了，硬件改为先执行更高优先级那个，返回后再补执行原来的——两个机制都是为了少做无用功，属于硬件行为，你不需要写代码，但看波形时要认得出来。'},{kind:"layers",layers:[{name:"请求层：谁在敲门",question:"这个事件凭什么能变成一条中断请求？",points:["引脚级：`SYSCFG->EXTICR[]` 选端口，`EXTI->IMR` 放开该线，`EXTI->RTSR` / `EXTI->FTSR` 选上升沿或下降沿。","外设级：USART/TIM/ADC 等在自己的控制寄存器里有中断使能位（HAL 的 `HAL_UART_Receive_IT` 之类就是替你打开它）。",'挂起标志：事件发生时被置起来，**不读不写就一直挂着**，这是"反复进中断"的根源。']},{name:"仲裁层：谁先被接待",question:"同时有多个请求，凭什么按这个顺序处理？",points:["使能：`NVIC->ISER[]` 写 1 放行，`NVIC->ICER[]` 写 1 关掉；没使能的中断挂起也不会进 ISR。","优先级：`NVIC->IP[]` 每个中断一个字节，**数值越小优先级越高**。",'分组：`SCB->AIRCR` 的 PRIGROUP 字段决定优先级里"几位管抢占、几位管子优先级"。']},{name:"上下文层：现场怎么保住",question:"被打断的那段代码，回来还能接着跑吗？",points:["硬件压栈 8 个字（xPSR/PC/LR/R12/R3–R0），出栈由 EXC_RETURN 驱动。","栈指针自动切换：Thread 模式用 MSP 或 PSP，Handler 模式固定用 MSP。","中断里再开中断就会**嵌套**，栈也跟着嵌套——栈太小会直接 HardFault。"]},{name:"处理层：软件该干什么",question:"ISR 里到底应该写几行代码？",points:["第一件事：清中断标志（EXTI 是 `EXTI->PR` 写 1 清除，外设一般是读状态寄存器再写清除）。","第二件事：把数据取走（读 DR/读缓冲）或置一个标志，**不做耗时运算**。","耗时工作（滤波、打印、协议解析）交给主循环看标志处理，或用队列把数据递出去。"]}]},{kind:"lab",labId:"nvic-interrupt",caption:'把"中断源 → NVIC 使能 → 抢占/子优先级 → 压栈 → 进 ISR → 尾链返回"逐帧走一遍，并试着调优先级与触发源。'}]},{id:"priority",title:"优先级：抢占与子优先级",lead:'这是本页最容易学错的一节：只有抢占优先级能"打断"。',blocks:[{kind:"p",text:'Cortex‑M 的每个中断都有一个 8 位优先级寄存器，STM32 一般只实现其中高 4 位（也就是 16 个等级，具体实现位数以参考手册为准），**数值越小优先级越高**。真正的坑在于这 4 位不是全都用来决定"能不能打断"：`SCB->AIRCR` 的 **PRIGROUP** 字段把它切成两段——高位那段是**抢占优先级（preemption priority）**，低位那段是**子优先级（subpriority）**。'},{kind:"ul",items:['**抢占优先级**：决定"能不能打断正在执行的 ISR"。更高（数值更小）就可以抢，形成嵌套。',"**子优先级**：只在**多个中断同时挂起**时决定谁先执行；它**永远不会**打断已经在跑的 ISR。","**同级不抢占**：抢占优先级相同的中断，后来的只能等前面的跑完；即便子优先级不同也一样。","**分组是全工程共享的**：PRIGROUP 是全局设置，两个模块各自调一次不同分组，后调的会覆盖前面的理解，优先级表现就会莫名其妙。"]},{kind:"table",caption:"HAL 的分组宏与拆分关系（以 STM32 实现 4 位优先级为例；编码值与具体位定义见参考手册）。",head:["HAL 宏","给抢占的位数","给子优先级的位数","实际效果"],rows:[["NVIC_PRIORITYGROUP_4","4 位","0 位","16 个抢占等级，没有子优先级；HAL_Init 的默认值"],["NVIC_PRIORITYGROUP_3","3 位","1 位","8 个抢占等级，同级内再按子优先级排队"],["NVIC_PRIORITYGROUP_2","2 位","2 位","4 个抢占等级"],["NVIC_PRIORITYGROUP_1","1 位","3 位","只剩 2 个抢占等级，多数中断互不打断"],["NVIC_PRIORITYGROUP_0","0 位","4 位","完全没有抢占：所有中断排队执行"]]},{kind:"note",tone:"tip",title:"记住这一条就够了",text:'**HAL_Init() 默认把分组设成 `NVIC_PRIORITYGROUP_4`（4 位抢占、0 位子优先级）**，这时你填的子优先级参数实际上不起作用。新手用 CubeMX 时若在 NVIC 页里改了分组，务必确认所有模块都按同一套理解写优先级，否则"高优先级居然被打断了"会非常难查。'},{kind:"code",title:"分组 + 两个中断的优先级设置（仅示意，IRQ 名按你的芯片与工程调整）",language:"c",code:`#include "stm32f4xx_hal.h"

#define IRQ_A_IRQn   EXTI0_IRQn    /* 假设是按键，要求及时响应 */
#define IRQ_B_IRQn   EXTI1_IRQn    /* 假设是慢速信号 */

static void NVIC_Config(void)
{
    /* 1. 全工程只设一次分组：4 位抢占、0 位子优先级（HAL_Init 已默认这样） */
    HAL_NVIC_SetPriorityGrouping(NVIC_PRIORITYGROUP_4);

    /* 2. 抢占优先级 5：比大多数中断都急，但低于系统关键中断 */
    HAL_NVIC_SetPriority(IRQ_A_IRQn, 5, 0);

    /* 3. 抢占优先级 8：数值更大 = 更不急，会被 A 打断 */
    HAL_NVIC_SetPriority(IRQ_B_IRQn, 8, 0);

    /* 4. 真正放行：写 NVIC->ISER[]，之前设的优先级才会生效 */
    HAL_NVIC_EnableIRQ(IRQ_A_IRQn);
    HAL_NVIC_EnableIRQ(IRQ_B_IRQn);
}`,explain:[{item:"HAL_NVIC_SetPriorityGrouping(NVIC_PRIORITYGROUP_4)",desc:"写 SCB->AIRCR 的 PRIGROUP 字段，决定几位给抢占、几位给子优先级。它是全局设置，整个工程只能有一种口径。"},{item:"HAL_NVIC_SetPriority(IRQn, 抢占, 子)",desc:"把两个数值按当前分组拼成一个字节写进 NVIC->IP[]；数值越小越优先。分组为 4 时第二个参数无效。"},{item:"HAL_NVIC_EnableIRQ(IRQn)",desc:'置 NVIC->ISER[] 的对应位。只设优先级不使能，中断永远不会进 ISR——这是"回调不触发"的头号原因。'},{item:"为什么 A=5、B=8",desc:"抢占优先级 5 的 ISR 正在跑时，抢占优先级 8 的请求只能排队；反过来 B 在跑时 A 可以立刻打断。"}]},{kind:"p",text:'**编号怎么来的**：Cortex‑M 用"异常编号"统一管理内核异常与外设中断。内核异常占编号 1–15（SysTick 是 15、SVC 是 11、PendSV 是 14），CMSIS 里用负数 IRQn 表示它们（`SysTick_IRQn = -1`、`SVCall_IRQn = -5`、`PendSV_IRQn = -2`）；外设中断从 16 起编号（EXTI0 异常编号 16，即 `EXTI0_IRQn = 0`）。编号见 ARM 架构手册与所用芯片参考手册的中断向量表，不同系列的外设顺序并不相同。'}]},{id:"exti-chain",title:"实战链路：从引脚到回调",lead:"以一个按键接 PA0、按下接 GND、下降沿触发为例，走完整条链路。",blocks:[{kind:"p",text:'外部中断最典型的例子就是按键。它的链路是固定的五段：**引脚电平 → SYSCFG 选端口 → EXTI 选边沿并放开屏蔽 → NVIC 使能并给优先级 → ISR/回调处理**。少任何一段，现象都是"按键没反应"，所以排查时按这个顺序逐段确认最快。'},{kind:"ol",items:['**开时钟**：打开 GPIO 端口时钟，以及 SYSCFG 的时钟——EXTI 的"这个线归哪个端口"选择寄存器在 SYSCFG 里，忘开时钟就会选不中引脚。',"**配引脚**：PA0 设为输入，启用内部上拉（按键另一端接地：松开为高、按下为低）。","**选端口 + 选边沿**：HAL 里用 `GPIO_MODE_IT_FALLING` 一次性完成；底层是写 `SYSCFG->EXTICR[]` 选定 PORTA，再置 `EXTI->IMR` 与 `EXTI->FTSR`。","**配 NVIC**：`HAL_NVIC_SetPriority` 给抢占/子优先级，`HAL_NVIC_EnableIRQ` 写 `NVIC->ISER[]` 放行。","**写 ISR**：函数名必须与启动文件向量表一致（`EXTI0_IRQHandler`），里面调用 `HAL_GPIO_EXTI_IRQHandler`。","**清标志并处理**：HAL 会清 `EXTI->PR` 再回调 `HAL_GPIO_EXTI_Callback`；回调里只置标志，真正动作放主循环。"]},{kind:"code",title:"HAL 版按键中断：初始化 → ISR → 回调 → 主循环消抖",language:"c",code:`#include "stm32f4xx_hal.h"

/* 主循环与 ISR 共享的变量：必须 volatile，否则优化后可能一直读到旧值 */
static volatile uint8_t  g_keyFlag = 0;
static volatile uint32_t g_keyTick = 0;   /* 记录触发时刻，消抖放在主循环做 */

static void KEY_Init(void)
{
    __HAL_RCC_GPIOA_CLK_ENABLE();     /* 引脚所在的端口时钟 */
    __HAL_RCC_SYSCFG_CLK_ENABLE();    /* EXTI 的端口选择寄存器在 SYSCFG 里 */

    GPIO_InitTypeDef gpio = {0};
    gpio.Pin  = GPIO_PIN_0;
    gpio.Mode = GPIO_MODE_IT_FALLING; /* 输入 + 下降沿触发中断，HAL 会配置 EXTI */
    gpio.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(GPIOA, &gpio);

    HAL_NVIC_SetPriority(EXTI0_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(EXTI0_IRQn);   /* 不使能 NVIC，按键再按也不会进中断 */
}

/* 中断服务函数：名字与启动文件向量表里的条目一一对应 */
void EXTI0_IRQHandler(void)
{
    HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_0);  /* 内部清挂起位，再调用下面的回调 */
}

/* 回调是 HAL 的弱函数，用户自己实现；只做"记录事件"这种极短的事 */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
    if (GPIO_Pin == GPIO_PIN_0) {
        g_keyTick = HAL_GetTick();   /* 只取时间戳，不做延时、不打印 */
        g_keyFlag = 1;
    }
}

int main(void)
{
    HAL_Init();                  /* 其中包含 NVIC 优先级分组（默认 4 位抢占） */
    SystemClock_Config();
    KEY_Init();

    while (1) {
        /* 消抖 + 业务处理都放主循环：至少等 20 ms 再确认，避免抖动重复触发 */
        if (g_keyFlag && (HAL_GetTick() - g_keyTick) >= 20U) {
            g_keyFlag = 0;
            HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);  /* 示例动作：翻转一个 LED */
        }
    }
}`,explain:[{item:"__HAL_RCC_SYSCFG_CLK_ENABLE()",desc:"EXTI 的端口选择寄存器（SYSCFG->EXTICR[]）属于 SYSCFG 外设，不开它的时钟就写不进去。"},{item:"GPIO_MODE_IT_FALLING",desc:"HAL 会同时配好引脚模式、EXTI 线映射、屏蔽与下降沿触发位，等价于手写四五个寄存器。"},{item:"GPIO_PULLUP",desc:"按键另一端接 GND 时必须上拉，否则松开时引脚悬空，会收到一堆随机跳变（甚至反复进中断）。"},{item:"EXTI0_IRQHandler",desc:"CMSIS/HAL 约定的函数名，必须和启动文件向量表一致；写错名字编译不报错，但永远不会被调用。"},{item:"HAL_GPIO_EXTI_IRQHandler",desc:"先判断是不是该引脚的挂起，清 EXTI->PR 后再回调；直接自己写回调会漏清标志。"},{item:"volatile g_keyFlag / g_keyTick",desc:"中断里改、主循环里读，编译器可能把它优化进寄存器，volatile 保证每次都真读内存。"},{item:"主循环里的 20 ms 判断",desc:'抖动期的多次跳变都会被 ISR 记录成更晚的时间戳，主循环只认"安静了 20 ms 以上"的那次。'}]},{kind:"tabs-code",title:"使能同一个 EXTI0 中断的三种写法",note:'三者操作的是同一批寄存器，差别只在"谁替你算地址、谁替你清标志"。',variants:[{label:"HAL",language:"c",code:`/* 高层封装：CubeMX 生成的工程基本都这样写 */
HAL_NVIC_SetPriority(EXTI0_IRQn, 5, 0);
HAL_NVIC_EnableIRQ(EXTI0_IRQn);`,explain:[{item:"HAL_NVIC_SetPriority",desc:"按当前分组把抢占/子优先级拼成一个字节写进 NVIC->IP[]。"},{item:"HAL_NVIC_EnableIRQ",desc:"写 NVIC->ISER[] 对应位；命名里的 IRQn 是 CMSIS 的 IRQ 编号，不是异常编号。"}]},{label:"LL",language:"c",code:`/* 低层库：直接操作寄存器级函数，几乎没有额外开销 */
LL_SYSCFG_SetEXTISource(LL_SYSCFG_EXTI_PORTA, LL_SYSCFG_EXTI_LINE0);
LL_EXTI_EnableIT_0_31(LL_EXTI_LINE_0);
LL_EXTI_EnableFallingTrig_0_31(LL_EXTI_LINE_0);

NVIC_SetPriority(EXTI0_IRQn, 5);   /* CMSIS 内核函数，比 HAL 少一层封装 */
NVIC_EnableIRQ(EXTI0_IRQn);`,explain:[{item:"LL_SYSCFG_SetEXTISource",desc:"选 EXTI0 归属哪个端口（这里是 PORTA），对应 SYSCFG->EXTICR[]。"},{item:"LL_EXTI_EnableIT_0_31",desc:"放开 EXTI->IMR 的对应线；不放开就只是内部信号，不会提请求。"},{item:"LL_EXTI_EnableFallingTrig_0_31",desc:"置 EXTI->FTSR 对应位，选定下降沿触发。"},{item:"NVIC_EnableIRQ",desc:"CMSIS 标准接口，内部就是写 NVIC->ISER[]，HAL 与 LL 都复用它。"}]},{label:"寄存器",language:"c",code:`/* 裸寄存器：理解原理时最直观；位位置与编码见参考手册 */
SYSCFG->EXTICR[0] &= ~(0xFU << 0);   /* 先清零 EXTI0 的端口选择域 */
SYSCFG->EXTICR[0] |=  (0x0U << 0);   /* 0 选 PORTA（编码见参考手册） */

EXTI->IMR  |=  (1U << 0);            /* 放开 EXTI0：1 = 不屏蔽 */
EXTI->RTSR &= ~(1U << 0);            /* 关掉上升沿 */
EXTI->FTSR |=  (1U << 0);            /* 打开下降沿 */

NVIC->IP[EXTI0_IRQn] = (5U << 4);    /* 优先级放高 4 位，低 4 位读回为 0 */
NVIC->ISER[EXTI0_IRQn >> 5] = (1U << (EXTI0_IRQn & 0x1FU));  /* 使能该中断 */

/* ISR 里最不能忘的一行：写 1 清除挂起位 */
void EXTI0_IRQHandler(void)
{
    EXTI->PR = (1U << 0);            /* 不清就一直重复进这个中断 */
}`,explain:[{item:"SYSCFG->EXTICR[]",desc:"数组下标对应中断线分组（4 条线一组），每线占 4 位端口选择域；具体偏移与编码见参考手册。"},{item:"EXTI->IMR",desc:"中断屏蔽寄存器：对应位为 1 才允许该线向 NVIC 提请求。"},{item:"EXTI->RTSR / FTSR",desc:"分别选上升沿 / 下降沿触发；两个都置就是双边沿。"},{item:"NVIC->IP[]",desc:"每个中断一个字节存优先级；STM32 实现高 4 位，所以这里左移 4 位。"},{item:"NVIC->ISER[]",desc:"32 位一组，写 1 使能；下标 = 中断号 / 32，位号 = 中断号 % 32。"},{item:"EXTI->PR = 1",desc:'挂起寄存器是"写 1 清除"；若在这里读改写整个寄存器，可能把别的线也顺手清掉。'}]}]},{kind:"note",tone:"danger",title:"两个容易致命的细节",text:'① **同一条 EXTI 线不能跨端口共用**：EXTI0 只能接 PA0 / PB0 / PC0… 中的一个，两个都配会互相抢。② **EXTI->PR 是写 1 清除**，而有些外设的中断标志是"读状态寄存器再写清零"——清错了地方，表现就是"ISR 只进一次"或"进去出不来"。'}]},{id:"isr-rules",title:"ISR 编写规则与前后台分工",lead:'中断写得好不好，就看"ISR 有多短"和"共享数据有多稳"。',blocks:[{kind:"p",text:'ISR 的目标只有一个：**用最短时间结束战斗**。它跑的时候主程序停着，同优先级或更低优先级的中断也进不来，所以任何阻塞、任何长循环都会直接变成系统延迟。常用的架构叫**前后台系统（foreground/background）**：ISR 当"前台"只负责接客，主循环当"后台"慢慢处理。'},{kind:"ul",items:["**必须清中断标志**：不清就反复进同一个 ISR，主循环看起来像卡死；优先用 HAL 提供的 `xxx_IRQHandler`，它已按外设要求清标志。","**不要阻塞**：`HAL_Delay`、等标志位、`printf`、Flash 擦写都不要放 ISR 里。`HAL_Delay` 依赖 SysTick 中断计数，在某些优先级配置下会**死等**。",'**共享变量加 `volatile`**：告诉编译器"这个值可能被别处改"，禁止把它缓存进寄存器或被优化掉。','**32 位以上或多字段数据要防撕裂**：主循环读一半被 ISR 改掉会得到"半新半旧"的值；用临界区（短暂关中断）或双缓冲/队列解决。',"**耗时处理搬走**：ISR 里只置标志或把数据塞进环形队列，主循环 `while(1)` 里轮询处理，复杂算法、协议解析、UI 刷新都归主循环。",'**别在 ISR 里打印/调用不可重入函数**：调试输出最好改成"置个标志、主循环打印"，或用翻转引脚 + 示波器观察。']},{kind:"table",caption:'常见任务该放哪一层：原则是"时间确定的事放 ISR，时间不确定的事放主循环"。',head:["任务","放在 ISR","放在主循环 / 任务"],rows:[["读数据寄存器、清标志","✔ 必须做，否则丢数据或反复中断","—"],["按键消抖（等 20 ms）","只记时间戳","✔ 到点再确认并执行动作"],["UART 逐字节接收","✔ 收进环形缓冲","✔ 解析帧、处理命令"],["ADC 采样值滤波（滑动平均）","—","✔ 数据已在缓冲里，慢慢算"],["Flash 写入 / 打印日志","—","✔ 耗时长且有阻塞风险"]]},{kind:"note",tone:"warn",title:'优先级反转：中断也会"堵车"',text:'如果低优先级 ISR 里做了一件"高优先级 ISR 也要等的事"（比如都抢同一把软件锁或同一个缓冲），高优先级反而会被拖住。Cortex‑M 上没有优先级继承，解决办法是**别在 ISR 里加锁**，用无锁的单生产者单消费者队列，或者干脆只置标志。'},{kind:"compare",cardId:"interrupt"},{kind:"p",text:'把这页的链路记住：**外设置位 → NVIC 比优先级 → 硬件压 8 字栈 → 取向量 → ISR 清标志置标志 → EXC_RETURN 出栈返回**，中间还可能插进尾链与迟到。下一页进入 **DMA**：让数据搬运也变成"外设自己干活、只在中途和结束时打断你一次"。'}]}],mistakes:[{mistake:"ISR 里忘了清中断标志（或清错了寄存器）",symptom:"程序像卡死一样反复进同一个 ISR，主循环几乎不执行；单步调试会发现刚出 ISR 立刻又进去",fix:'确认清的是"触发源对应的挂起位"：EXTI 是写 `EXTI->PR` 的对应位，外设一般要先读状态寄存器再写清除；优先调用 HAL 的 `xxx_IRQHandler`，别自己另写一套。'},{mistake:"在 ISR 里调用 `HAL_Delay()` 做延时/消抖",symptom:'按键偶尔"失灵"、系统整体变卡；若当前 ISR 优先级高于 SysTick，`HAL_Delay` 会直接死等不出来',fix:"ISR 里只记录时间戳并置标志，消抖与延时全部挪到主循环；确需等待就改状态机，别阻塞。"},{mistake:'把子优先级当成"能打断别人"',symptom:"以为给中断设了更小的子优先级就能抢进高优先级 ISR，实测毫无反应；或者两个模块各自设了不同分组，优先级表现前后矛盾",fix:"记住只有**抢占优先级**决定能否打断，子优先级只影响同时挂起时的排队；`SCB->AIRCR` 的 PRIGROUP 全工程只设一次（通常 `NVIC_PRIORITYGROUP_4`）。"},{mistake:"ISR 与主循环共享的变量没加 `volatile`",symptom:'开 -O2 后主循环永远读不到 ISR 更新过的标志，程序"看起来没反应"，改成 -O0 又正常',fix:'跨中断共享的变量一律 `volatile`；多字节数据再用临界区或队列保护，不要依赖编译器"碰巧没优化"。'},{mistake:"只配了 EXTI 却没使能 NVIC（或 ISR 名字写错）",symptom:"引脚边沿确实产生了，EXTI 挂起位也置起来了，但回调永远不执行",fix:"按链路逐段验证：先看 `EXTI->PR` 有没有置起，再看 `NVIC->ISER[]` 是否使能，最后核对 `EXTI0_IRQHandler` 名字与启动文件向量表是否完全一致。"}],takeaways:["中断的完整链路是：外设置挂起 → NVIC 比优先级 → 硬件压 8 字栈 → 取向量 → 执行 ISR → EXC_RETURN 出栈返回，中间还有尾链与迟到两种硬件优化。","PRIGROUP 决定几位给抢占、几位给子优先级；只有抢占优先级能打断正在执行的 ISR，子优先级只管同时挂起时的先后，HAL 默认是 4 位抢占。",'ISR 要短：清标志、取数据、置标志，别阻塞别延时；共享变量加 volatile，耗时处理交给主循环，靠"前台/后台"分工换取实时性。'],quizIds:["interrupt-q1","interrupt-q2","interrupt-q3"],keywords:["中断","NVIC","EXTI","ISR","抢占优先级","子优先级","PRIGROUP","EXC_RETURN","尾链","volatile"]};export{I as interruptLesson};
