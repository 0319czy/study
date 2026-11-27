const t={slug:"core",title:"内核与存储器",en:"CPU Core & Memory",oneLine:"内核只有 16 个寄存器，你的每个变量、每次函数调用都落在它们和 Flash/SRAM 的几段地址上。",category:"mcu",level:"进阶",minutes:30,goals:["能说出 R0–R12、SP、LR、PC、xPSR 各自负责什么，以及哪些是“被调用者保存”","讲清 MSP / PSP 双栈为什么存在，以及中断压栈时硬件到底存了哪些字","能把一段 C 变量对应到 .text / .data / .bss / 堆 / 栈，并看懂链接脚本的 MEMORY 片段","能解释 Bootloader 跳到 APP 时必须改 SCB->VTOR 的原因与步骤"],analogy:{title:"内核像厨师，存储器像一间有编号的厨房",text:"厨师（CPU 内核）手上只有 16 个位置放东西：R0–R12 是案板上的小碟子，装正在切的菜；SP 是“叠好的盘子堆”的顶面标记，谁要用盘子就往下挪一格；LR 记着“等会儿回到哪道工序”；PC 指着“现在正在做哪一步”。Flash 是写满菜谱和存货的冷冻库（断电也在），SRAM 是案板（一关火就清空）。菜谱里说“取一勺盐”这种有初始量的原料，得在上岗前从冷冻库搬到案板——这就是启动代码搬 .data；而“拿个干净碗”这种全空的容器，不用从冷库搬，现场洗一下就行——这就是清 .bss。"},why:["**HardFault 的绝大多数根因都在这一页**：栈溢出、栈顶地址写错、向量表没重定位，都是“内存没摆对”，而不是外设配错。","**会算内存，才配谈优化**：同一句 `static uint8_t buf[1024]`，加不加初值、加不加 `const`，占的是 Flash 还是 SRAM 完全不同。","**Bootloader / OTA 的地基**：不做向量表重定位，APP 里的中断永远回不到 APP，现象诡异且难查。","**看懂 .map 文件与链接报错**：`region RAM overflowed` 这类报错只有理解了 MEMORY 与段分配才读得懂。"],sections:[{id:"registers",title:"内核只有 16 个寄存器",lead:"C 语言看起来很自由，编译器最终只在这 16 个位置和栈之间搬数据。",blocks:[{kind:"p",text:"Cortex‑M4 属于 **ARMv7‑M** 架构。程序员可见的寄存器一共 16 个：**R0–R12** 是通用寄存器，**R13 / R14 / R15** 有固定用途（分别是 SP 栈指针、LR 链接寄存器、PC 程序计数器），另外还有一个状态寄存器 **xPSR**（Program Status Register，程序状态寄存器，内部按用途分成 APSR / IPSR / EPSR 三个视图）。"},{kind:"table",caption:"寄存器角色速查。汇编细节以 ARMv7‑M 架构参考手册为准，这里只讲工程上会踩到的部分。",head:["寄存器","角色","工程上最容易踩的坑"],rows:[["R0–R3","传参前四个、返回值、临时数据；进入异常时由硬件自动压栈保存","在中断里可以随便改（硬件已保存），但不要指望它们在函数调用后还保留"],["R4–R11","通用寄存器，按 AAPCS 约定由“被调用者保存”（callee‑saved）","手写汇编里用了 R4–R11 却不恢复，返回后调用者的数据就被悄悄改了"],["R12","临时寄存器（IP），函数调用间不保证保留","把它当长期存储用，优化一开就出错"],["R13 / SP","栈指针，永远指向“最后一个已压入的单元”","手动改 SP 指向非法地址，下一次压栈直接 HardFault"],["R14 / LR","函数返回地址；进入异常时被写成特殊的 EXC_RETURN 标记","函数里再调一个函数前不备份 LR，返回地址被覆盖，函数“跑飞”"],["R15 / PC","当前指令地址","用函数指针跳转时忽略末位 Thumb 位，跳过去立刻 HardFault"],["xPSR","APSR 条件标志 + IPSR 当前异常号 + EPSR Thumb 状态","IPSR 是判断“我现在在哪个中断里”最可靠的依据，比自定义标志变量可靠"]]},{kind:"note",tone:"info",title:"为什么函数指针都要 +1（或写 0x0800xxxx 的奇数）",text:"Cortex‑M 只执行 Thumb 指令，**地址最低位为 1 表示“这是 Thumb 代码”**。所以向量表里存的 `Reset_Handler` 地址、你写的函数指针，末位通常是 1；调试器显示函数地址时往往把这一位隐去，看起来是偶数——这只是显示习惯，不代表地址真的变了。写 Bootloader 跳转、注册回调时，别自己去做“对齐”把这一位清掉。"},{kind:"note",tone:"warn",title:"不要手改 PC / SP",text:"除了 Bootloader 跳转这种必须接管 CPU 的场合，任何业务代码都不该直接写 PC 或 SP。需要“跳转”就用函数调用，需要“换栈”就让 RTOS 去做。乱改这两个寄存器造成的崩溃，现象往往和真正的原因完全无关。"}]},{id:"stack-msp-psp",title:"栈：MSP、PSP 与压栈内容",lead:"栈不是“一块内存”，而是一条约定：SP 从高地址往低地址长。",blocks:[{kind:"p",text:"Cortex‑M 的栈是**满递减（full‑descending）**：压栈时先把 SP 减 4 再写入，出栈时先读再 SP 加 4。所以 SP 永远指向“最后一个已压入的单元”，初始栈顶取 SRAM 的**末尾**（高地址），栈向下生长；堆（malloc 用的区域）向上生长。两边相向而行，中间那个空隙就是你的安全余量——相撞就是溢出。"},{kind:"terms",items:[{zh:"MSP",en:"Main Stack Pointer",desc:"主栈指针。复位后 CPU 默认用它；所有异常/中断（Handler 模式）里硬件强制用 MSP。裸机程序通常只有它。"},{zh:"PSP",en:"Process Stack Pointer",desc:"进程栈指针。只在 Thread 模式下可用，需要软件把 SP 切过去。RTOS 用它给每个任务分配独立栈，做上下文切换。"},{zh:"Handler / Thread 模式",en:"Handler mode / Thread mode",desc:"Thread 模式跑普通代码，Handler 模式跑异常和中断。从 Thread 进 Handler 由硬件完成，退出时靠 LR 里的 EXC_RETURN 标记自动还原。"},{zh:"EXC_RETURN",en:"Exception Return value",desc:"异常返回时 LR 里保存的特殊标记（形如 0xFFFFFFF9），它告诉硬件“回哪个模式、用哪个栈指针、要不要恢复浮点上下文”。"}]},{kind:"p",text:"**双栈的意义**：中断永远在 MSP 上跑，任务代码跑在各自的 PSP 上。这样一个任务把栈踩爆，不会顺手把中断栈也踩坏——RTOS 靠这个特性把“任务栈溢出”这件事从“整机随机崩溃”降级成“某个任务挂掉”。裸机工程里通常只初始化 MSP，PSP 根本没被用过。"},{kind:"ul",items:["**进入异常时硬件自动压 8 个字**：R0–R3、R12、LR、PC、xPSR，共 32 字节，并保证 8 字节对齐（不对齐时补一个填充字）。这就是“C 函数不用写任何代码也中断安全”的原因。","**开了 FPU 又多一截**：如果异常发生时浮点上下文是活跃的，硬件会再压入 S0–S15、FPSCR 与一个保留字，共 18 个字；加上基础帧 8 个字，一共 26 个字（104 字节，见 ARMv7‑M 架构参考手册）。所以在中断频繁的系统里，MSP 余量要按最坏情况算。","**xPSR 里的 IPSR 记着异常号**：想知道“现在在哪个中断里”，读 IPSR 比自定义标志变量可靠，因为它由硬件维护。","**AAPCS 要求 8 字节对齐**：函数入口处 SP 必须 8 字节对齐，所以编译器可能在你的栈上塞填充。算栈用量时别只数局部变量。"]},{kind:"code",title:"读一下两个栈指针，给栈做一次粗检",language:"c",code:`#include "stm32f4xx_hal.h"

int main(void)
{
    HAL_Init();                     /* 初始化 HAL、SysTick 时基与 NVIC 优先级分组 */

    uint32_t msp = __get_MSP();     /* CMSIS 内建函数：读 R13 当前值（主栈） */
    uint32_t psp = __get_PSP();     /* 同一寄存器的另一个银行：进程栈 */

    /* 粗检：复位后栈指针必须落在 SRAM 区间内，否则一压栈就 HardFault。
       0x20000000 是 F407 的 SRAM 起始地址（见参考手册存储器映射章节）。 */
    if (msp < 0x20000000UL) {
        /* 这里适合打断点或点亮故障灯，而不是带着坏栈继续跑 */
        for (;;) { }
    }

    (void)psp;                      /* 裸机工程里 PSP 通常还没被设置过，值是上电残留 */

    for (;;) { }
}`,explain:[{item:"__get_MSP() / __get_PSP()",desc:"CMSIS 提供的内建函数，直接读 R13 的两个银行。注意它们只能“读”，改栈指针要用对应的设置函数。"},{item:"0x20000000",desc:"STM32F407 的 SRAM 起始地址（示意，G474 同样是 0x20000000 起）。栈指针低于它，说明已经掉进别的地址空间。"},{item:"psp 在裸机里没意义",desc:"复位后 Thread 模式默认用 MSP，PSP 只是寄存器存在。要切到 PSP 得先设 CONTROL 里的选择位（见参考手册内核章节），那是 RTOS 的活。"},{item:"HAL_Init()",desc:"它会建立 1 ms 的 SysTick 时基，SysTick 中断本身就在 MSP 上跑——所以 msp 的测试代码必须放在它之后才有意义。"}]},{kind:"note",tone:"danger",title:"栈溢出的典型表现与查法",text:"厂商启动文件里 `Stack_Size` 常见默认值是 0x400（1 KB 量级，示意，务必看自己的启动文件）。递归、大局部数组、`printf`/`sprintf` 系列（栈开销很大）都可能把它踩穿。**溢出的方向是往下**，也就是先踩到 .bss 里的变量，所以症状往往是“某个毫不相关的全局变量莫名变了”“加一行打印就好了”。查法：看 .map 文件确认 `_estack` 与 .bss 的相对位置；在栈区预先填 `0xA5A5A5A5` 这样的水印，跑一段时间后看最深处的水印被冲到哪；实在不行就把 `Stack_Size` 调大、把大数组改 `static`。"}]},{id:"memory-map",title:"Flash 与 SRAM：地址地图与五个段",lead:"“程序下载进去了”和“程序在跑了”，说的是两个不同的地址区间。",blocks:[{kind:"p",text:"STM32F407 把片内 **Flash 映射在 0x08000000**，**SRAM 映射在 0x20000000**，外设寄存器在 0x40000000 一带，内核私有外设（NVIC、SysTick、SCB）在 0xE0000000 一带。上电时 Flash 还会被别名到 0x00000000（由 BOOT 引脚/选项字节决定启动映射，见参考手册），所以内核复位时从 0x00000000 取到的第一个字，其实就是 0x08000000 处那个栈顶值。"},{kind:"table",caption:"F407 常见型号的地址与容量（示意见量级，具体型号以数据手册为准）。",head:["区域","起始地址","放什么","掉电"],rows:[["Flash","0x08000000","向量表、.text 代码、.rodata 常量、.data 初值镜像","保留"],["SRAM1","0x20000000",".data / .bss / 堆 / 栈（128 KB 或 112 KB，按型号）","丢失"],["SRAM2","0x2001C000","第二段 SRAM（16 KB 或 32 KB，示意），可单独给 DMA 缓冲","丢失"],["CCM SRAM","0x10000000","64 KB 量级（F407）的高速私有 RAM，只给 CPU 用","丢失"]]},{kind:"p",text:"**五个段决定了你的变量到底住哪**。注意 `.data` 是“双份”的：初值必须跟着固件一起烧进 Flash（否则断电就没了），运行时再由启动代码复制到 SRAM 变成活数据。所以同一个 `.data` 变量既占 Flash 又占 SRAM，而 `.bss` 只占 SRAM。"},{kind:"table",head:["段","内容","放哪","占固件体积吗"],rows:[[".isr_vector","中断向量表（初始 MSP + 所有异常/中断入口）","Flash 最前面","占（很小）"],[".text","编译出来的机器码","Flash","占"],[".rodata","字符串字面量、const 常量表","Flash","占"],[".data","有非零初值的全局/静态变量","运行时在 SRAM，初值在 Flash","占（初值镜像）"],[".bss","未初始化或初值为 0 的全局/静态变量","SRAM","不占（只记长度，启动清零）"],["heap","malloc / new 申请的区域","SRAM","不占"],["stack","函数栈帧、局部变量、异常压栈","SRAM 顶部向下","不占"]]},{kind:"ul",items:["**加 `const` 就往 Flash 挪**：`const` 的全局表（字库、波形表、字符串）通常落在 .rodata，直接省下等量 SRAM。代价是只能读。","**不初始化的大数组最省事**：全局大 buffer 不写初值 → .bss，固件体积不变，但 SRAM 照占。写个 `= {0}` 和完全不写，在 C 里对全局变量是同一回事（都进 .bss）。","**局部大数组是最贵的写法**：局部变量在栈上，`uint8_t buf[2048]` 写在函数里就是一口气吃掉 2 KB 栈；写成 `static` 就搬到 .bss，栈立刻轻松。","**CCM 不是普通 SRAM**：它挂在 CPU 的 D‑bus 上，DMA 访问不到。把 UART/ADC 的缓冲放进去，DMA 收不到数据、还可能不报错——典型静默失败。"]},{kind:"note",tone:"warn",title:"VMA 与 LMA：同一个段的两个地址",text:"链接脚本里 `.data` 的 **VMA**（运行地址，Virtual Memory Address）在 SRAM，**LMA**（装载地址，Load Memory Address）在 Flash。烧写工具按 LMA 把初值写进 Flash；启动代码再按 VMA 把它们搬到 SRAM。看懂这两个词，`.data` 为什么“双份”、启动文件为什么要搬它，就全通了。"}]},{id:"linker-startup",title:"链接脚本与启动搬运",lead:"链接脚本决定段放哪，启动代码负责把 .data 搬过去、把 .bss 清零。",blocks:[{kind:"p",text:"链接脚本（STM32 上通常是 `.ld` 文件，IAR 用 `.icf`、Keil 用分散加载 `.sct`）只回答两个问题：**存储器从哪到哪**（MEMORY 命令），**每个段放哪里**（SECTIONS 命令）。容量写错是最隐蔽的错误：LENGTH 写成比实际 SRAM 大，编译器不会报错，上板一用到大数组就 HardFault。"},{kind:"tabs-code",title:"同一个全局变量，三种视角",note:"C 代码里你只写了一个变量；编译器决定它进哪个段；链接脚本决定这个段最终落在哪个地址。",variants:[{label:"C 变量",language:"c",code:`/* 视角一：源码里看起来没什么区别的三个变量 */
static uint32_t g_magic = 0x12345678U;  /* 有非零初值 -> .data（双份） */
static uint8_t  g_buf[256];             /* 无初值     -> .bss（只占 SRAM） */
const char      g_name[] = "mcu";       /* 只读       -> .rodata（只在 Flash） */

void touch(void)
{
    g_buf[0] = (uint8_t)g_magic;        /* 运行时的读写都发生在 SRAM 里 */
}`,explain:[{item:"有初值 → .data",desc:"初值必须随固件烧进 Flash，运行前再复制到 SRAM，所以两边都占。"},{item:"无初值 → .bss",desc:"C 标准保证全局/静态变量初值为 0，这个“0”不需要存进 Flash，启动时清零即可。"},{item:"const → .rodata",desc:"只读数据放 Flash，省 SRAM；但只能读，不能运行时修改。"}]},{label:"寄存器视角",language:"asm",code:`; 视角二：运行时 CPU 眼里只有地址和寄存器（示意，实际地址以 map 文件为准）
    LDR  R0, =g_magic     ; R0 拿到 0x20000004 这样的 SRAM 地址
    LDR  R1, [R0]         ; 从 SRAM 读当前值，走 D-Bus
    STR  R1, [R0]         ; 写回同样走 SRAM，掉电即失

; 此刻：R13(SP) 指向栈顶，R15(PC) 指向正在执行的指令
; 同一个 g_magic，在 Flash 里还有一份“初值镜像”，由启动代码搬到上面这个地址`,explain:[{item:"LDR R0, =g_magic",desc:"伪指令，汇编器把变量的绝对地址填进来。地址由链接器最终确定，所以必须先链接才知道。"},{item:"LDR / STR",desc:"ARM 是 load/store 架构：只有这类访存指令能碰内存，其余指令只操作寄存器。"},{item:"R13 / R15",desc:"看 PC 能判断“现在在执行哪条指令”，看 SP 能判断“栈还剩多少”——调试器里这两个值最值钱。"}]},{label:"链接脚本",language:"ld",code:`/* 视角三：链接脚本决定上面那个地址到底是多少（示意，容量按自己的型号改） */
MEMORY
{
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 1024K   /* 示意容量 */
  RAM   (xrw) : ORIGIN = 0x20000000, LENGTH = 128K    /* 示意容量 */
}

_estack = ORIGIN(RAM) + LENGTH(RAM);   /* 栈顶 = SRAM 末尾，向量表第一个字就用它 */

SECTIONS
{
  .isr_vector : { KEEP(*(.isr_vector)) } >FLASH   /* 向量表必须在 Flash 最前面 */
  .text       : { *(.text*)   *(.rodata*) } >FLASH
  .data       : { *(.data*) }  >RAM AT> FLASH     /* 活数据在 RAM，初值镜像在 FLASH */
  .bss        : { *(.bss*) *(COMMON) } >RAM       /* 只分配 SRAM，不占固件体积 */
}`,explain:[{item:"MEMORY",desc:"声明芯片有哪些存储器、从哪开始、多长。LENGTH 必须小于等于数据手册里的真实容量。"},{item:"_estack",desc:"栈顶符号。启动文件里向量表的第一项就是它，所以它的值决定“一上电 SP 指向哪”。"},{item:">RAM AT> FLASH",desc:"这一行就是 .data 双份的根源：运行时地址（VMA）在 RAM，装载地址（LMA）在 FLASH。"},{item:"KEEP(*(.isr_vector))",desc:"防止向量表被“没有引用的段”优化掉。向量表没了，中断全部失效。"}]}]},{kind:"p",text:"链接脚本给好了地址，还差一个干活的：`Reset_Handler`。下面这段是启动文件里汇编逻辑的 **C 等价写法**，看懂它就懂了“为什么 main 之前要搬内存”。"},{kind:"code",title:"启动代码在 main 之前做的事（C 等价示意）",language:"c",code:`/* 这些符号由链接脚本提供，不由任何 C 变量定义 */
extern uint32_t _sidata;   /* .data 初值在 Flash 里的起始地址（LMA） */
extern uint32_t _sdata;    /* .data 在 SRAM 里的起始地址（VMA） */
extern uint32_t _edata;    /* .data 在 SRAM 里的结束地址 */
extern uint32_t _sbss;     /* .bss 起始地址 */
extern uint32_t _ebss;     /* .bss 结束地址 */

void SystemInit(void);     /* 配时钟、使能 FPU 等，厂商提供 */
void Reset_Handler(void)
{
    uint32_t *src = &_sidata;
    uint32_t *dst = &_sdata;

    /* 1. 搬 .data：把 Flash 里的初值复制到 SRAM */
    while (dst < &_edata) {
        *dst++ = *src++;
    }

    /* 2. 清 .bss：全置 0。注意 .bss 不占 Flash 镜像，全靠这一步 */
    for (dst = &_sbss; dst < &_ebss; dst++) {
        *dst = 0U;
    }

    /* 3. 初始化时钟/FPU 等，调用 C 库初始化（跑构造函数），最后才进 main */
    SystemInit();
    /* __libc_init_array(); */
    main();

    /* 4. main 不应该返回；万一是，停在死循环里等看门狗 */
    for (;;) { }
}`,explain:[{item:"_sidata / _sdata / _edata",desc:"链接脚本导出的符号，不是变量。取地址得到“段边界”，所以要用 & 取址而不是读值。"},{item:"搬 .data 的循环",desc:"源在 Flash（LMA）、目标在 SRAM（VMA）。这就是“有初值的全局变量”必须在启动时付出的一次内存复制。"},{item:"清 .bss 的循环",desc:"为什么不清 .data？因为 .data 的初值是有意义的（如 0x12345678），清零会把配置常量全抹掉。"},{item:"SystemInit() 在 main 之前",desc:"它往往还要负责向量表偏移、FPU 使能等。时钟没配好就进 main，后面所有外设配置都会失效。"}]},{kind:"ol",items:["**取初始 MSP**：内核从 0x00000000（Flash 的别名地址）读第一个字，写进 SP。所以链接脚本的 `_estack` 必须合法。","**取复位入口**：读第二个字作为 `Reset_Handler` 地址，把它装进 PC — 这一步由硬件完成，没有软件参与。","**搬 .data**：按 LMA→VMA 复制初值，有初值的全局/静态变量从这一刻起才有正确内容。","**清 .bss**：把未初始化的全局/静态变量区整体清零，保证 C 标准承诺的“初值为 0”。","**调 SystemInit()**：配置时钟树、使能 FPU、设置向量表偏移（视工程配置），为 C 代码准备运行环境。","**跑构造函数再进 main()**：`__libc_init_array()` 执行 C++ 全局对象构造与 `__attribute__((constructor))` 函数，之后才轮到你的 `main()`。"]}]},{id:"bootloader-vtor",title:"Bootloader 与向量表重定位",lead:"硬件复位永远从 0x08000000 取向量表，所以“把 CPU 交给 APP”必须靠软件完成。",blocks:[{kind:"p",text:"带 Bootloader 的固件分成两块：Bootloader 占 0x08000000 起的区域，APP 从某个偏移开始（例如 0x08008000，**示意，按你的 Flash 分区规划定**）。复位后硬件只会去 0x08000000 取 MSP 和复位入口，所以 APP 想跑起来，Bootloader 必须手动做三件事：**关掉自己的中断与外设**、**把向量表指针 `SCB->VTOR` 指向 APP 的向量表**、**把 MSP 换成 APP 的初始栈顶并跳到 APP 的 Reset_Handler**。"},{kind:"ol",items:["**校验 APP 是否有效**：读 APP 起始地址的头两个字，检查是否像一个合法栈顶（落在 SRAM 区间）与合法入口（落在 Flash 区间），或用 CRC 校验。不合法就留在 Bootloader，别跳进一片空白。","**关闭自己开的中断与外设**：先关全局中断，再把 SysTick 和用过的外设停掉。否则跳过去以后旧中断还在触发，而它们的向量已经指向 APP 的表，立刻跑飞。","**重定位向量表**：写 `SCB->VTOR = APP_ADDR`。从此所有异常/中断都从 APP 的向量表取入口。","**切换栈指针并跳转**：把 MSP 设为 APP 向量表的第一个字，再把 PC 跳到第二个字。这一步要用 CMSIS 的栈指针设置函数 + 函数指针调用（写法见 core_cm4.h），因为它绕过了正常的函数返回机制。","**APP 自己也要设一次**：这样 APP 单独烧写（不经 Bootloader）时同样能跑。CubeMX 工程通常在 `system_stm32f4xx.c` 里用 `VTOR` 宏配置，改分区时记得一起改。"]},{kind:"code",title:"Bootloader 跳转到 APP（学习示意，分区地址与容量按自己的规划核对）",language:"c",code:`#include "stm32f4xx_hal.h"

#define APP_ADDR   0x08008000UL   /* APP 起始地址：示意，必须与 APP 的链接脚本一致 */
#define SRAM_START 0x20000000UL   /* F407 SRAM 起始，用于粗检栈顶是否合法 */

typedef void (*app_entry_t)(void);

/* 返回值：0 = 已跳转（不会返回），-1 = APP 无效，留在 Bootloader */
int boot_jump_to_app(void)
{
    /* 1. 向量表前两个字：初始 MSP 与 Reset_Handler 入口 */
    uint32_t app_msp   = *(volatile uint32_t *)(APP_ADDR);
    uint32_t app_entry = *(volatile uint32_t *)(APP_ADDR + 4U);

    /* 2. 粗检：栈顶应落在 SRAM 里，入口应落在 Flash 里 */
    if (app_msp < SRAM_START || app_msp > 0x20030000UL /* 示意上限 */) {
        return -1;                       /* 栈顶不像话，直接放弃 */
    }
    if (app_entry < 0x08000000UL) {
        return -1;                       /* 入口不在 Flash 区，可能是空白芯片 */
    }

    /* 3. 关掉 Bootloader 自己开的东西：先关全局中断，再停 HAL 时基 */
    __disable_irq();                     /* CMSIS：置 PRIMASK，屏蔽所有可屏蔽中断 */
    HAL_SuspendTick();                   /* 停掉 1 ms SysTick，别让它跳过去以后还在计数 */

    /* 4. 关键一步：向量表重定位。之后所有异常都从 APP 的表里取入口 */
    SCB->VTOR = APP_ADDR;

    /* 5. 把 MSP 换成 APP 的初始栈顶，再把 PC 跳到 APP 的入口。
          这两步需要直接操作栈指针，写法见 CMSIS 的 core_cm4.h
          （用 __set_MSP 与函数指针调用；不要自己去做地址对齐，Thumb 位必须保留）。 */
    (void)app_msp;
    (void)app_entry;

    /* 6. 真正跳转：app_entry_t 调用，不返回 */
    ((app_entry_t)app_entry)();

    return -1;                           /* 理论上到不了这里 */
}`,explain:[{item:"APP_ADDR",desc:"APP 的起始地址，必须与 APP 的链接脚本 MEMORY 里 ORIGIN 完全一致。两边差一个字节，中断就全错。"},{item:"app_msp / app_entry 的读法",desc:"用 volatile 指针读，防止编译器把这两次读优化掉；地址是常量，取值前必须确保 Flash 已被烧写。"},{item:"__disable_irq()",desc:"置 PRIMASK 屏蔽可屏蔽中断。注意它是“关中断”，不是关外设；跳转前还应该把外设时钟/DMA 停干净。"},{item:"SCB->VTOR",desc:"Cortex‑M 的系统控制块寄存器，存放向量表基址。写它之后，中断入口立刻换到 APP 的表。"},{item:"((app_entry_t)app_entry)()",desc:"把地址当函数指针调用，本质是加载 PC。函数最末位是 Thumb 位，保留它，不要 & ~1 去“对齐”。"}]},{kind:"note",tone:"danger",title:"忘了改 VTOR 的典型症状",text:"程序能跑到 APP 的 `main()`（因为跳转是手工做的），但**一开中断就炸**：有的中断跑到 Bootloader 的旧入口，有的直接进 HardFault，现象看起来像“外设坏了”。调试器里读一下 `SCB->VTOR` 是否等于 APP 起始地址，五秒钟就能排除一类大问题。"},{kind:"compare",cardId:"boot"}]},{id:"debug-memory",title:"内存类问题怎么查",lead:"内存 bug 的特点是“平时正常、偶尔炸”，所以要按固定顺序排除，而不是乱改代码。",blocks:[{kind:"ol",items:["**先看炸在哪条指令**：HardFault 时用调试器读 SP 附近的 8 个字，对照 R0–R3 / R12 / LR / PC / xPSR 还原出错现场。硬件已经自动压栈，这 8 个字就是事故快照。","**再问“栈还是堆”**：PC/LR 落在 `printf`、`memcpy`、浮点库这些吃栈大户里，十有八九是栈不够或被踩；落在 `malloc` 里就查堆。","**对着 .map 文件看实际布局**：确认 `.data` / `.bss` / 栈 / 堆的真实地址与剩余空间。链接成功不代表放得下，要看余量。","**动手验证假设**：怀疑栈就加大 `Stack_Size`、把大局部数组改 `static`；怀疑堆就关掉 malloc 改成静态分配；改完能稳定复现/消失，才算找到根因。"]},{kind:"table",caption:"现象对照表。表中地址与容量为示意见量级，以自己芯片的数据手册为准。",head:["现象","最可能的原因","怎么验证"],rows:[["一上电就 HardFault，连 main 都没进","链接脚本 LENGTH 超过真实 SRAM、`_estack` 写错、时钟没配就访问外设","看 .map 里的 `_estack` 是否等于 SRAM 末尾；对照数据手册容量"],["能进 main，一开中断就跑飞","向量表没重定位（`SCB->VTOR` 未设）或 APP 偏移与链接脚本不一致","跳转后读 `SCB->VTOR`，看是否等于 APP 起始地址"],["某个全局变量莫名被改，加一行打印就好了","栈溢出往下踩到 .bss；或数组越界","栈区涂 `0xA5A5A5A5` 看水印；把大局部数组改 static 观察"],["DMA 收到的数据全是 0 或乱码","缓冲区放在 CCM，DMA 访问不到","把缓冲移到 SRAM1/SRAM2，重新编译再试"],["`.data` 里的大数组把 Flash 撑爆","给了初值的全局大数组进 .bss/.data 时选错，或字库没加 const","看 .map 各段大小；把只读数据加 `const` 挪到 .rodata"]]},{kind:"note",tone:"tip",title:"一条实用习惯",text:"每次换型号、换链接脚本、改 Flash 分区，都先打开 `.map` 文件看三行：Flash 用了多少、RAM 用了多少、`_estack` 在哪。这三个数字对上，后面 90% 的内存类玄学问题根本不会出现。"}]}],mistakes:[{mistake:"把大数组定义在函数里当局部变量",symptom:"函数一进就 HardFault，或调用几次后其它全局变量被改；仿真器里 SP 掉出 SRAM 区间",fix:"局部变量在栈上，`Stack_Size` 默认只有 1 KB 量级（示意）。大缓冲区改 `static` 或全局，让它进 .bss。"},{mistake:"链接脚本 LENGTH 写成比实际 SRAM 大",symptom:"链接不报错，上板后一用到大数组就进 HardFault，换块板子现象还不一样",fix:"对照数据手册把 MEMORY 的 LENGTH 改成真实容量，并留出余量；每次改型号都重新核对一遍。"},{mistake:"Bootloader 跳 APP 时只跳转、不改 SCB->VTOR",symptom:"APP 的 main 能跑，一旦开中断就跑到莫名其妙的地方或直接 HardFault",fix:"跳转前写 `SCB->VTOR = APP_ADDR`；APP 自己也配一次，保证单独烧写时同样能跑。"},{mistake:"把 DMA 缓冲区放在 CCM SRAM 里",symptom:"DMA 传输“完成”了但数据全是 0 或旧值，没有任何报错",fix:"CCM 只连 CPU 的 D‑bus，DMA 访问不到；把缓冲改到 SRAM1/SRAM2 区。"},{mistake:"以为变量声明了就在 SRAM 里，还占片 Flash",symptom:"固件体积莫名超限，或 SRAM 不够用却找不到是谁占的",fix:"对照 .map 分清 .text/.rodata（Flash）、.data（双份）、.bss（只占 SRAM）；只读表加 `const` 挪进 Flash。"}],takeaways:["内核只有 16 个寄存器：R0–R12 干通用活，SP/LR/PC 各有专职，xPSR 里的 IPSR 是判断当前中断号的可靠依据；栈是满递减，从 SRAM 末尾往下长。","中断永远在 MSP 上跑，任务跑在 PSP 上——双栈让任务栈溢出不会连累中断；进异常时硬件自动压 8 个字，这让 C 函数天然中断安全。",".data 初值在 Flash、活数据在 SRAM（双份），.bss 不占固件体积但要启动清零；Bootloader 跳 APP 必须写 SCB->VTOR 并切换 MSP，否则一开中断就炸。"],quizIds:["core-q1","core-q2","core-q3"],keywords:["寄存器组","MSP","PSP","栈溢出","Flash","SRAM",".data",".bss","链接脚本","SCB->VTOR"]};export{t as coreLesson};
