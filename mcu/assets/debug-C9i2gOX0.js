const t={slug:"debug",title:"调试与测量",en:"Debug & Measure",oneLine:"用对工具，把看不见的电平、时序和寄存器变成证据：先测再改，按层排查。",category:"practice",level:"综合",minutes:30,goals:["能说清 SWD 与 JTAG 的线数、用途差异，知道 SWO 是什么、调试器（ST-Link/DAPLink）怎么和 IDE 配合","能写出 printf 重定向 + 环形缓冲的非阻塞日志，并按等级过滤，让日志不再拖慢主循环","会根据被测信号选采样率，用逻辑分析仪解码 UART/I²C/SPI，用示波器看电平、上升沿与纹波","能用断点/单步/观察变量定位逻辑错，并按 LR/PC、栈回溯与故障寄存器名词定位 HardFault"],analogy:{title:"调试像看病：先量体温，再决定要不要开刀",text:"医生不会一进诊室就开刀。先量体温（万用表看供电）、再听心音（示波器看波形）、做心电图看节律（逻辑分析仪看时序）、翻病历看症状怎么演变（串口日志），最后才用内窥镜直接看里面（SWD 断点看寄存器）。每一步都在收集证据，而不是猜。坏的调试习惯正相反：一上来就改代码换引脚，等于病人喊疼就直接开刀——运气好蒙对，运气不好把好地方也切了。"},why:["**调试占掉嵌入式开发一半以上的时间**：工具用错，十分钟的问题能拖成两天；“现象”和“证据”分不清，就只能靠猜。","**现场没法复现、也没法接 IDE**：量产设备出问题时，你手里只有日志和仪器，代码改一行要重新烧一次板子。","**分层排查是通用方法论**：供电→时钟→引脚→外设配置→协议时序→应用逻辑，这套顺序换成 ESP32、AVR、RISC-V 一样成立。","**面试与协作的硬通货**：能讲清“我怎么定位的、证据是什么”，比“我代码写完了”更有说服力。"],sections:[{id:"observability",title:"能观测，才谈得上修",lead:"先把四类工具的分工认清楚，后面才知道该拿哪一个。",blocks:[{kind:"p",text:"调试的本质是**把看不见的东西变成看得见的证据**。MCU 里发生的事分布在四个层次上：电压/电流、时序、帧与协议、软件状态。没有一种工具能同时看穿四层，所以专业调试从来不是“一个神器”，而是**按层换工具**。下面这张分层图就是全书的总纲：先问“我现在怀疑哪一层”，再选工具。"},{kind:"layers",layers:[{name:"电气信号层",question:"电压对不对、波形有没有、信号质量够不够？",points:["万用表量电源轨、参考电压、共地情况与总电流","示波器看幅度、上升沿、过冲与电源纹波","这一层不成立，上面三层的分析全是猜"]},{name:"时序层",question:"边沿、时钟、片选的时间关系对不对？",points:["逻辑分析仪同时抓多路，看相对时序而不是单根线","采样率与阈值电压决定你看到的是不是真的","波特率、SPI 模式、时钟极性都活在这一层"]},{name:"帧与协议层",question:"字节对不对、帧结构对不对？",points:["分析仪的 UART/I²C/SPI 解码器把 0/1 变成字节","逐字段看起始位、地址、数据、校验、停止位","解不出帧时，先怀疑测量设置，再怀疑电路"]},{name:"软件逻辑层",question:"状态和变量是不是我预期的值？",points:["SWD 断点、单步、观察变量（watch）直接读内存","串口日志记录状态流转、错误码与计数器","HardFault 时靠栈帧里的 PC 与故障寄存器名词回推"]}]},{kind:"kv",items:[{k:"SWD / JTAG 调试器",v:"看代码、寄存器、内存、栈——关键能力是“停在某一刻”"},{k:"串口日志",v:"看状态流转与错误计数——关键能力是“连续记录、事后回看”"},{k:"逻辑分析仪",v:"看多路数字信号的时序与协议帧——只判高低，不看幅度"},{k:"示波器 + 万用表",v:"看模拟质量：电平、边沿、纹波、供电是否站得住"}]},{kind:"note",tone:"tip",title:"两条纪律，比任何技巧都重要",text:"① **先证据后结论**：说“我测到 TX 线上每一帧的停止位都被拉长”，不要说“串口好像有问题”。② **一次只改一个变量**：同时改波特率和引脚，问题好了你也不知道是谁起作用。"}]},{id:"swd-jtag",title:"SWD 与 JTAG：两根线也能断点",lead:"调试口是内核留的后门：它不问你的代码在干什么，直接读写内存和寄存器。",blocks:[{kind:"p",text:"**SWD（Serial Wire Debug，串行线调试）** 和 **JTAG（Joint Test Action Group）** 都是 ARM 定义的调试接口，最终都走到内核里的 **DAP（Debug Access Port，调试访问端口）**。通过 DAP，调试器可以暂停 CPU、下断点、单步、读写任意内存与寄存器，也能把固件烧进 Flash。区别只在“到 DAP 这段路”用几根线、能带什么附加功能。"},{kind:"table",caption:"教学性对照：具体引脚数量与跟踪能力以 ARM 内核文档和芯片数据手册为准。",head:["维度","SWD","JTAG"],rows:[["信号线","2 根：SWDIO（双向数据）、SWCLK（时钟），另加 GND 与可选的 VREF/nRESET","4 根：TDI、TDO、TMS、TCK，另加 GND 与可选 TRST"],["引脚占用","少，小封装（几十脚量级）也留得下","多，引脚紧张时常常没有位置"],["能做什么","下载、断点、单步、读写内存与寄存器、读实时变量","同样能做，另外支持边界扫描（测焊接）与多器件菊花链"],["跟踪（Trace）","SWO 单线输出（ITM 数据、时间戳），带宽有限","多条跟踪线（如 ETM 指令跟踪），需要更多引脚"],["多器件","一般一对一","支持一条链上挂多个器件"],["典型场景","Cortex-M 项目的默认选项，占板面积最小","需要边界扫描查焊点、或维护 JTAG 链上的老设备"]]},{kind:"p",text:"**SWO 一句话**：SWO（Serial Wire Output）是 SWD 可选的第 3 根线、单向输出，靠 ITM 把 printf 式的跟踪数据从芯片送到调试器——几乎不占 CPU，也不占用你的 USART。所以“能用 SWO 就别去抢串口”。"},{kind:"terms",items:[{zh:"SWD（串行线调试）",en:"Serial Wire Debug",desc:"ARM 的两线调试接口，用 SWDIO + SWCLK 访问 DAP，进而读写内存、设断点、单步。"},{zh:"JTAG",en:"Joint Test Action Group",desc:"四线标准调试/测试接口，除调试外还支持边界扫描，可用于检查芯片焊点连通性。"},{zh:"SWO",en:"Serial Wire Output",desc:"SWD 的可选单向输出线，输出 ITM 跟踪数据（printf 通道、时间戳），不占串口外设。"},{zh:"DAP",en:"Debug Access Port",desc:"内核里真正干活的调试部件：调试器通过它读写内存/寄存器、控制断点与单步。"},{zh:"ST-Link / DAPLink",en:"Debug Probe",desc:"两种常见调试器：ST-Link 是 ST 官方产品，CubeIDE/Keil 直接支持；DAPLink 是开源的 CMSIS-DAP 实现，支持 CMSIS-DAP 的 IDE 都能用。"}]},{kind:"ul",items:["**接线三件套**：SWDIO、SWCLK、GND 必接；目标板自己供电时还要接 VREF，让调试器检测到目标电压，否则常报“目标未上电”。","**IDE 侧只换“调试服务器”这一层**：CubeIDE 自带 ST-Link GDB Server，Keil MDK 装好 ST-Link 驱动即可，VSCode 常见组合是 Cortex-Debug 扩展 + OpenOCD/pyOCD。SWD 协议本身不随 IDE 变。","**连不上的三招**：① 选 connect under reset（复位期间连接），抓住程序还没把调试口改成 GPIO 的窗口；② 降低 SWCLK 频率，长排线/接触不良时更稳；③ 拉高 BOOT0 进厂商 bootloader 再擦除，可救“调试口被关掉”的板子。"]},{kind:"note",tone:"warn",title:"SWD 引脚一旦被复用，就再也连不上",text:"调试口引脚复位后默认是调试功能，但你的初始化代码完全可以把它们配成普通 GPIO 或别的复用功能。一旦程序跑起来就把调试口改掉，而程序又正好死循环，调试器就再也进不来。同类坑还有：CubeMX 里 SYS → Debug 选了 No Debug（F1 系列上会直接生成关闭 SWJ 的代码），或者把调试引脚让给了 SPI/定时器。记住顺序：**先保证能连上，再谈跑通**。"},{kind:"note",tone:"info",title:"DBGMCU->CR：让外设在“暂停”时听话",text:"断点停下 CPU 时，外设不一定跟着停：某些定时器、看门狗、低功耗相关时钟在调试暂停期间是否继续运行，由 `DBGMCU->CR` 的对应字段决定（只记名字，位号见参考手册 DBGMCU 章节）。典型用法：调试看门狗时冻结 IWDG，否则单步几秒就被复位；调试低功耗时用 `HAL_DBGMCU_EnableDBGSleepMode()`，让芯片睡着时调试器仍能连上。"}]},{id:"log",title:"串口日志：printf 不是银弹",lead:"printf 是最顺手的观测手段，也是最容易把时序搞坏的一个。",blocks:[{kind:"p",text:"`printf` 本身不知道串口长什么样，它最终会调用一个**重定向钩子**把字符交出去：GCC/newlib 走 `_write`，Keil/ARMCC 走 `fputc`，IAR 走 `__write`。所以“printf 重定向”= 在钩子里调用串口发送函数。真正的问题在下一步：**你在钩子里直接调用阻塞发送**，那每一次 printf 都要等一串字节从线上走完——115200 下一行 40 字节就要几毫秒量级，主循环的节拍、通信的时序全被它改了。"},{kind:"p",text:"正确做法是把“打印”拆成两半：**入队**（把格式化好的字符串塞进环形缓冲，纯内存操作，微秒量级）和**出队**（主循环或 DMA 把缓冲搬到串口）。下面这段代码就是在解决这件事：printf 只入队，缓冲满了就丢并计数，发送在主循环里限量进行。"},{kind:"code",title:"printf 重定向 + 简易环形缓冲日志（非阻塞）",language:"c",code:`/* ============================================================
 * 非阻塞日志：printf 只负责“入队”，真正的发送交给主循环
 * 目标：STM32F407 / G474 + HAL，USART1 由初始化代码配成 115200 8N1（示意）
 * ============================================================ */
#include <stdarg.h>
#include <stdio.h>
#include "stm32f4xx_hal.h"

extern UART_HandleTypeDef huart1;              /* 串口句柄（CubeMX 生成） */

#define LOG_BUF_SIZE     2048U                 /* 环形缓冲：2 KB 量级，按 SRAM 余量调整 */
#define LOG_LINE_MAX     96U                   /* 单条日志上限，栈占用可预测 */
#define LOG_DRAIN_CHUNK  64U                   /* 每次只搬 64 字节，主循环不被拖住 */

static uint8_t  s_buf[LOG_BUF_SIZE];
static volatile uint16_t s_head = 0;           /* 只由“写日志的一侧”推进 */
static volatile uint16_t s_tail = 0;           /* 只由“发送的一侧”推进 */
static volatile uint32_t s_dropped = 0;        /* 因缓冲满而丢弃的行数 */

/* ---- 入队：满了就丢，绝不在这里等硬件 ---- */
static void log_push(const char *s, uint16_t n)
{
    for (uint16_t i = 0; i < n; i++) {
        uint16_t next = (uint16_t)((s_head + 1U) % LOG_BUF_SIZE);  /* 牺牲 1 字节区分满/空 */
        if (next == s_tail) {            /* 满：丢掉这一条，宁可少一条也不卡住主循环 */
            s_dropped++;
            return;
        }
        s_buf[s_head] = (uint8_t)s[i];
        s_head = next;
    }
}

/* ---- 日志分级：先在内存里过滤，省带宽也省时间 ---- */
#define LOG_ERROR 0U
#define LOG_WARN  1U
#define LOG_INFO  2U
#define LOG_DEBUG 3U
static uint8_t s_level = LOG_INFO;    /* 现场排障调到 DEBUG，交付版本收回 WARN */

static void log_printf(uint8_t level, const char *tag, const char *fmt, ...)
{
    if (level > s_level) return;      /* 等级不够直接返回，不产生任何 IO */

    char line[LOG_LINE_MAX];
    int  n = snprintf(line, sizeof(line), "[%lu][%s] ",
                      (unsigned long)HAL_GetTick(), tag);

    va_list ap;
    va_start(ap, fmt);
    n += vsnprintf(line + n, sizeof(line) - (size_t)n, fmt, ap);
    va_end(ap);

    if (n >= (int)sizeof(line)) n = (int)sizeof(line) - 1;   /* 超长截断，不留半个字节 */
    log_push(line, (uint16_t)n);
}

/* ---- printf 重定向：GCC/newlib 走 _write，Keil/ARMCC 走 fputc ---- */
int _write(int fd, char *ptr, int len)
{
    (void)fd;
    log_push(ptr, (uint16_t)len);     /* 只入队，不调用任何“等发送完成”的函数 */
    return len;
}

/* ---- 出队：主循环每轮调一次，单次有上限 ---- */
void log_drain(void)
{
    uint8_t  tmp[LOG_DRAIN_CHUNK];
    uint16_t chunk = 0;

    while (s_tail != s_head && chunk < LOG_DRAIN_CHUNK) {
        tmp[chunk++] = s_buf[s_tail];
        s_tail = (uint16_t)((s_tail + 1U) % LOG_BUF_SIZE);
    }
    if (chunk > 0U) {
        HAL_UART_Transmit(&huart1, tmp, chunk, 5U);   /* 5 ms 超时兜底，失败也只丢这一包 */
    }
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_USART1_UART_Init();

    log_printf(LOG_INFO, "BOOT", "start, tick=%lu", (unsigned long)HAL_GetTick());

    for (;;) {
        /* ... 业务代码 ... */
        log_printf(LOG_DEBUG, "APP", "loop tick=%lu", (unsigned long)HAL_GetTick());
        log_drain();                  /* 搬一小块就回来，业务不会被日志拖住 */
    }
}`,explain:[{item:"LOG_BUF_SIZE / s_buf",desc:"静态数组放在 .bss，不掉堆、大小可算。它该多大 = 日志速率 × 最坏发送时延；2 KB 是常见起点，跑起来看 s_dropped 再调。"},{item:"volatile s_head / s_tail",desc:"一个由写侧推进、一个由发送侧推进；不加 volatile，编译器优化后可能一直读旧下标，表现为“日志丢了但没满”。"},{item:"next == s_tail",desc:"环形缓冲用“牺牲一格”换“满/空可区分”。满了就丢新日志，这是非阻塞的代价；用 s_dropped 把这个代价量化出来。"},{item:"s_level 等级过滤",desc:"过滤放在格式化之前，连 vsnprintf 都省了；交付版本把 s_level 定成常量，编译器会直接删掉整段日志代码。"},{item:"line[96] + vsnprintf",desc:"一条日志最长 96 字节，栈峰值可预测；超出就截断，绝不写越界——日志系统自己不能成为 bug 来源。"},{item:"_write / fputc",desc:"printf 的重定向钩子，逻辑只有一句“入队”。GCC 用 _write，Keil 用 fputc，两者不要同时重定向，会链接冲突。"},{item:"log_drain + HAL_UART_Transmit",desc:"真正的发送放在主循环且限长；64 字节在 115200 下要几毫秒量级，想更彻底就改 DMA，把搬运交给硬件。"}]},{kind:"table",caption:"分级不是为了好看，是为了让日志在交付版本里也能一直开着。",head:["等级","什么时候用","该打什么","常用法"],rows:[["ERROR","必须人工处理的故障：初始化失败、通信彻底断开、进 HardFault 前的最后一步","哪一步失败 + 关键参数，不要打大段内存","默认常开，量产也保留"],["WARN","可恢复的异常：重试成功、校验错一次、缓冲将满","次数 + 触发条件，避免刷屏","默认常开"],["INFO","状态迁移：上电、模式切换、连接建立/断开","一行一条，带毫秒 tick 时间戳，便于排序","默认常开"],["DEBUG","外设寄存器值、中间变量、每帧收发数据","只在排障窗口打开，并限制次数","按需打开"],["TRACE","逐字节 / 逐样本级细节","极短时间窗，最好配合仪器一起看","临时打开，不交付"]]},{kind:"ul",items:["**一行一条、带时间戳**：`HAL_GetTick()` 的毫秒级就够判断“是先断还是先超时”，不需要为日志上高精度定时器。","**带序号或计数器**：上位机靠序号连续性判断“丢了几条”，比人眼数靠谱；`s_dropped` 这类计数是最便宜的观测点。","**不要打印大数组**：一次几百字节的 hexdump 会把串口带宽吃光，反而把你要查的时序搞乱。","**中断里只置标志或入队**：ISR 里做阻塞发送等于把中断响应拖到毫秒级，还可能和主循环的发送互相等待。","**日志要能被关掉**：留一个运行期等级开关，出问题时现场调高、恢复后调低，交付版本可以编译期直接裁掉。"]},{kind:"note",tone:"danger",title:"printf 会改变时序，这叫“海森堡 bug”",text:"“加了 printf 就好了，去掉 printf 又坏”——这不是玄学，是你用 printf 的毫秒级阻塞把竞态窗口撑开了。反过来也一样：一个只在满速运行时复现的问题，你一插调试器就消失。遇到这种问题，**换仪器不换代码**：用逻辑分析仪抓时序、用计数器统计次数，而不是加打印。"}]},{id:"measure",title:"逻辑分析仪与示波器：看时序、看电平",lead:"一个只判高低、擅长多路长时序；一个看模拟波形、擅长信号质量。别拿错工具。",blocks:[{kind:"p",text:"**逻辑分析仪**只回答一个问题：某一刻这根线是高还是低。它按阈值电压把每根通道采样成一串 0/1，所以它擅长**多通道、长时间、多帧**的相对时序，再靠解码器把 0/1 变成字节。**示波器**看的是连续模拟电压，所以它擅长**信号质量**：幅度够不够、边沿陡不陡、有没有过冲与振铃、电源纹波多大。"},{kind:"kv",items:[{k:"通道数",v:"看需要抓几路：UART 用 2 路，I²C 用 2 路，SPI 至少 4 路"},{k:"采样率",v:"按被测信号定，至少每比特几个采样点（量级：数百 kSa/s 以上）"},{k:"阈值电压",v:"3.3 V 系统取约一半（1.65 V 量级），以实际电平为准"},{k:"存储深度",v:"决定能连续抓多久；不够就先用触发条件筛出异常帧"},{k:"共地",v:"分析仪 GND 必须和板子共地，否则抓到的全是“鬼影”"},{k:"解码器",v:"UART/I²C/SPI 都有现成的，注意参数与地址位宽"}]},{kind:"ul",items:["**采样率不够的典型症状**：波形看着“少跳变”、解码器报帧错误或未知字节；把采样率翻倍后一切正常——这说明是测量设置问题，不是电路问题。","**换算量级**：115200 bit/s 时每比特约 8.7 µs、一个字节约 87 µs；采样率只有几百 kSa/s 时每比特只剩几个点，波特率稍有偏差就会解错。","**I²C 解码器先确认地址位宽**：显示的地址可能是 7 位地址，也可能是含读写位的 8 位数，对不上先查这个，别急着怀疑从机坏了。","**SPI 要选对模式（CPOL/CPHA 的 0–3）**：模式选错时波形本身是好的，但解出来的数据整体错位。","**抓异常帧要用触发**：让分析仪在“片选拉低后的第一个错误帧”上单次触发，比盲抓几秒再翻屏有效得多。"]},{kind:"p",text:"**示波器**也别只用来“看有没有波形”。它真正的价值是四个具体判断："},{kind:"ul",items:["**看电平**：高电平是否接近 VDD、低电平是否接近 0，离输入阈值还剩多少余量；余量不足时，温度一高、线一长就偶发误判。","**看上升沿**：边沿太缓，常见原因是上拉太弱、线太长电容太大、驱动能力不够；边沿太陡又容易振铃过冲，长线要考虑串阻。","**看纹波**：耦合切到 AC、打开带宽限制（常见做法是限制到 20 MHz 量级）、用短地线探头测；纹波大往往先是电源与去耦问题，而不是“MCU 不稳定”。","**探头设置要对**：10× 探头输入电容小、带宽高，1× 只适合低频小信号；地线夹越长，测出来的“振铃”越可能是测量本身引入的。"]},{kind:"table",caption:"选工具问自己一句：我现在怀疑的是“配置”“时序”“信号质量”还是“系统状态”？",head:["工具","能看到什么","看不到什么","先上它的场景"],rows:[["SWD / JTAG 调试器","寄存器、内存、变量、栈帧、断点与单步","真实时序（CPU 停下后外设可能还在跑）、信号质量","怀疑代码逻辑、变量不对、程序跑飞"],["串口日志","状态流转、错误计数、先后顺序","出事前最后一刻的细节、物理层信息","长时间运行、现场不可复现的问题"],["逻辑分析仪","多路数字信号的相对时序与协议帧","电压幅度与边沿质量（它只判高低）","通信“有时通有时不通”、帧错位"],["示波器 / 万用表","电平、边沿、纹波、供电与共地","协议内容、长时间帧流","怀疑硬件、供电、信号完整性"]]},{kind:"tabs-code",title:"同一个 UART 乱码问题，三种工具各看到什么",note:"三种视角不互相替代：SWD 回答“我配的参数对不对”，分析仪回答“线上时序对不对”，日志回答“系统自己认为发生了什么”。",variants:[{label:"SWD 调试",language:"c",code:`/* SWD 视角：先确认“我配的参数”和“寄存器里的值”是否一致 */
MX_USART1_UART_Init();          /* 或 HAL_UART_Init(&huart1) */

/* 在这两行各打一个断点，在观察变量窗口里看：
 *   huart1.Init.BaudRate / WordLength / StopBits / Parity
 *   huart1.ErrorCode
 * 再看一眼 USART1->BRR 与 USART1->CR1（只记名字，位号见参考手册） */
HAL_UART_Transmit(&huart1, (const uint8_t *)"hi", 2U, 100U);`,explain:[{item:"huart1.Init.*",desc:"断点停在初始化之后，先看句柄里的参数是不是你以为的那一组——CubeMX 改过配置却没重新生成代码，这里立刻露馅。"},{item:"USART1->BRR",desc:"波特率最终写进这个寄存器；读出来和手册公式对不上，说明时钟或分频有问题，别急着换线。"},{item:"USART1->CR1",desc:"数据位、校验、发送使能都在这里；本页只写寄存器名字，位号请查参考手册 USART 章节。"},{item:"huart1.ErrorCode",desc:"HAL 记录的错误码（帧错误/溢出等），比“乱码”两个字信息量大得多。"}]},{label:"逻辑分析仪",language:"text",code:`通道：CH0 -> TX（MCU 发送方向）, CH1 -> RX, CH2 -> 用于对时间轴的 GPIO 翻转
阈值：3.3 V 系统取约 1.65 V 量级，先量供电确认电平再设阈值
采样率：按被测信号定 —— 115200 时每比特约 8.7 µs，先保证每比特 5～10 个点的量级，不够就翻倍
触发：CH0 下降沿（UART 起始位）单次触发，只抓“有问题的那一帧”
解码器：UART，115200 8N1，LSB first，无校验
判读：每比特宽度是否稳定；停止位是否完整；帧与帧的间隔是否被业务代码拉长`,explain:[{item:"阈值与采样率",desc:"这两个设置错了，看到的就不是真实的线，后面所有“波形分析”全部作废，先确认它们。"},{item:"115200 8N1",desc:"解码器参数必须和 USART1->BRR/CR1 配出来的一致，否则必然报帧错误。"},{item:"起始位触发",desc:"只抓异常帧，比连续抓几十秒再翻屏有效得多；配合单次触发还能截图存档。"},{item:"比特宽度",desc:"用标尺看每比特周期是否抖动；抖动大通常是时钟源不准或被高优先级中断抢占。"},{item:"帧间隔被拉长",desc:"说明发送被业务阻塞——常见原因就是你在这个循环里加了阻塞式打印。"}]},{label:"串口日志",language:"c",code:`/* 日志视角：不看波形，看“系统自己认定的事实” */
log_printf(LOG_INFO, "UART", "init ok, baud=%lu",
           (unsigned long)huart1.Init.BaudRate);

HAL_StatusTypeDef st = HAL_UART_Transmit(&huart1, buf, len, 100U);
if (st != HAL_OK) {
    log_printf(LOG_ERROR, "UART", "tx fail st=%d err=0x%lx drop=%lu",
               (int)st, (unsigned long)huart1.ErrorCode,
               (unsigned long)s_dropped);
}

/* 每 1 s 打一次统计：异常是“一开始就坏”还是“跑一会儿才坏”，一眼能分 */
log_printf(LOG_DEBUG, "STAT", "rx=%lu tx=%lu drop=%lu",
           (unsigned long)rx_cnt, (unsigned long)tx_cnt,
           (unsigned long)s_dropped);`,explain:[{item:"log_printf 而不是 printf",desc:"分级 + 环形缓冲，日志本身不会把时序搞坏；直接用阻塞 printf 会把你正在查的问题掩盖掉。"},{item:"huart1.ErrorCode",desc:"把 HAL 的错误码记下来，能区分“没发出去”和“发出去了但对端说错了”。"},{item:"s_dropped",desc:"日志自己丢了多少条，是判断“日志不全”还是“程序根本没走到这里”的关键证据。"},{item:"周期统计",desc:"计数器打出来，异常是渐变还是突变一目了然；这也是现场唯一能带回来的东西。"}]}]}]},{id:"breakpoints-fault",title:"断点、单步与 HardFault 定位",lead:"软件逻辑层用调试器，进了 HardFault 先保现场再看栈。",blocks:[{kind:"p",text:"**断点**让程序停在某一行，**单步**让你一行一行走，**观察变量**（watch / expressions）让你盯着几个值看它们怎么变。三者都是软件逻辑层的显微镜，但都会**改变时序**——这也是它们只用来看“逻辑”，不用来看“通信”的原因。"},{kind:"ul",items:["**硬件断点数量有限**：Cortex-M4 的指令比较器只有几个（4–6 个量级，以内核文档与调试器为准），下太多 IDE 会报“断点无效”。Flash 里的代码只能下硬件断点，软件断点（把指令改成 BKPT）只对 RAM 里的代码有效。","**单步分三种**：step into 进函数、step over 跳过函数、step out 跑完当前函数返回。调库函数时用 step over，别一头扎进 HAL 内部。","**观察变量注意优化等级**：-O2 下变量可能被放进寄存器甚至被优化掉，watch 显示不可用或值不对；排障时用 -O0/-Og 编译，共享变量加 volatile。","**实时变量监视（live watch）**：SWD 可以在 CPU 不停的情况下周期读取变量，适合看“只在运行时才出现”的值；但读取本身有开销，别一次盯几十个。","**断点会掩盖时序问题**：断点一停，从机可能已经超时；通信类问题用仪器抓，不要用断点抓。"]},{kind:"p",text:"**HardFault（硬件故障异常）** 是 Cortex-M 的兜底：任何没被单独处理的故障——非法指令、非法访问、除零且未使能 UsageFault、栈溢出踩进不可写区域——最终都会升级成它。看到它时最忌讳的动作是直接复位，因为复位等于把唯一的证据擦掉。正确的顺序是：**先保现场 → 再用栈回溯找 PC → 最后看故障寄存器名词**。"},{kind:"ol",items:["**先保住现场**：在 HardFault 处理函数里别急着复位，把 R0–R3、R12、LR、PC、xPSR 与 MSP/PSP 存进全局变量，再决定要不要复位。","**看 LR 判断用哪个栈**：进异常时 LR 里是 EXC_RETURN，它的 bit2 指示压栈用的是 MSP 还是 PSP（裸机默认 MSP，跑 RTOS 时任务通常用 PSP）。","**用 `__get_MSP()` 找栈帧**：Cortex-M 进异常时硬件自动压 8 个字（R0–R3、R12、LR、PC、xPSR），帧里的 PC 与 xPSR 就是出错指令地址与状态；`__get_MSP()` 拿到栈顶就能顺着找回来。","**把 PC 对回源码**：用 IDE 反汇编窗口、`addr2line` 或 map 文件，把 PC 变成“函数名 + 行号”；这一步做完，问题通常已经定位一半。","**再看故障寄存器名词**：CFSR（可配置故障状态寄存器，细分 MemManage/BusFault/UsageFault）、HFSR（硬件故障状态寄存器，判断是否由别的故障升级）、MMFAR/BFAR（故障地址寄存器）。它们是**粘滞**的，不清就一直保留，所以读到就要立刻记下来。","**按错误类型反推原因**：非法指令/非法状态 → 函数指针为空，或跳到了数据区（跳转地址最低位要置 1，也就是 Thumb 位）；精确总线错误 + BFAR 有效 → 野指针写到了不存在的地址；不精确总线错误 → 出错地址不可靠，常是缓冲区越界；栈溢出 → 先查大数组与递归深度。"]},{kind:"terms",items:[{zh:"HardFault",en:"HardFault Exception",desc:"Cortex-M 的兜底异常：其他故障没被处理、或故障升级，最终都进这里。"},{zh:"CFSR",en:"Configurable Fault Status Register",desc:"可配置故障状态寄存器，把 MemManage、BusFault、UsageFault 三类故障的状态位集中在一起；读它能知道“哪一类错”。本页只作名词，位号见内核文档。"},{zh:"HFSR",en:"HardFault Status Register",desc:"硬件故障状态寄存器，用来看这次 HardFault 是不是由别的故障“升级”而来（例如取向量失败）。"},{zh:"MMFAR / BFAR",en:"MemManage / BusFault Address Register",desc:"故障地址寄存器：精确故障时给出出错的内存地址，是定位野指针最快的一条线索。"},{zh:"EXC_RETURN",en:"Exception Return value",desc:"异常返回时写进 LR 的特殊值，记录“返回后用什么栈、什么状态”；所以在 handler 里看 LR 就能判断该取 MSP 还是 PSP。"}]},{kind:"note",tone:"warn",title:"只写一个 while(1) 也是一种“不定位”",text:"很多人把 HardFault 处理函数写成 `while(1) {}`，然后靠看门狗复位——这比直接复位好一点，但依然没留下任何证据。最低要求：**把 PC、LR 与 CFSR 存下来**；有条件就存进备份寄存器或 noinit 段，复位后通过串口日志报出来。这样同一问题第二次出现时，你手里就有数据了。"},{kind:"p",text:"HardFault 与“程序根本没跑起来”是两类问题，但排查入口是同一个：**启动流程走到哪一步了**。换芯片或换工具链时，向量表位置、复位后的默认时钟、调试口能不能保住，都会变——下面这张对照卡把这几件事按芯片列在一起，调试器连不上时值得先看一眼。"},{kind:"compare",cardId:"boot"}]},{id:"triage",title:"分层排查清单：从供电到逻辑",lead:"排查的顺序不是“猜”，而是“按层”。每一层只问一个问题、只做一个验证。",blocks:[{kind:"p",text:"初学者最常见的浪费不是不会用仪器，而是**顺序错了**：一上来就怀疑协议、改波特率、换芯片，却从来没量过供电。下面这张清单把问题按层切开，顺序固定：**供电 → 时钟 → 引脚 → 外设配置 → 协议时序 → 应用逻辑**。只有上一层的证据成立，才往下走。"},{kind:"table",caption:"排查清单：先看什么 / 怎么验证。即使换芯片、换协议，这套顺序依然成立。",head:["层","先看什么","怎么验证","常见结论"],rows:[["**供电**","电源轨电压、共地、总电流是否异常","万用表量 VDD 与 GND；示波器 AC 耦合看纹波；串一个表看电流","电压偏低或纹波很大 → 先修电源，别动代码"],["**时钟**","系统时钟源（HSE/PLL）起没起、外设时钟门控开没开","调试器读时钟相关寄存器；用 MCO 把时钟引到引脚，示波器量频率","波特率整体偏、延时变慢 → 时钟配错，不是串口坏了"],["**引脚**","复用功能选对没、方向与上下拉、是否被别的外设占用","查 CubeMX 引脚图 + 读 GPIO 配置寄存器；示波器看静态电平能不能随代码变化","电平不随代码变化 → 引脚模式或复用配错"],["**外设配置**","波特率/数据位/采样时间、DMA 与中断是否使能","读 `USART1->BRR`、`USART1->CR1` 与 `RCC->AHB1ENR` 等，逐项对 CubeMX；先问“外设真使能了吗”","寄存器对但没波形 → 使能或引脚问题"],["**协议时序**","帧格式、片选与时钟相位、从机地址、时序余量","逻辑分析仪解码看帧；示波器看边沿与过冲；换第二块板/第二个从机交叉验证","解码器报帧错误 → 参数或时序不一致"],["**应用逻辑**","状态机、缓冲区、任务调度、共享变量与竞态","SWD 断点 + 观察变量；日志打关键状态；watch 计数器看单调性","波形对、日志对、行为错 → 软件 bug"]]},{kind:"ol",items:["**先复现，再动手**：能稳定复现（哪怕一分钟一次）比“偶发”好查十倍；先记录复现条件——供电、温度、波特率、哪块板、哪个固件版本。","**从最下层开始验证**：不要跳过供电和时钟直接怀疑协议；每一层都要留下一句“我确认过”的证据，哪怕是“电压 3.3 V 且纹波可忽略”。","**在链路中间夹观测点**：MCU → 电平转换 → 连接器 → 从机，每个环节都能成为观测点；把“通不通”变成“哪里断”。","**一次只改一个变量**：改两个参数，问题好了你也不知道是谁起了作用；每次改完记录，保证能回滚。"]},{kind:"note",tone:"ok",title:"一句话版本",text:"**能测的不要猜，能分层的不要整体怀疑，能一次改一个的就不要一次改三个。** 照这张清单走一遍，八成问题在走到“协议时序”之前就结束了。"}]}],mistakes:[{mistake:"只看现象不测信号，靠猜改代码",symptom:"LED 不亮就换引脚、串口乱码就改波特率，改了一圈问题还在，还把本来能跑的部分改坏了",fix:"先测再改：万用表看供电与共地，示波器看波形有没有、幅度够不够，分析仪解码看帧对不对。把“我猜”变成“我测到”，再动手。"},{mistake:"SWD 引脚被复用或调试口被关掉",symptom:"烧过一次自己写的固件后调试器再也连不上；CubeMX 里 SYS → Debug 选了 No Debug，或把 SWDIO/SWCLK 配成普通 GPIO 后同样如此",fix:"SYS → Debug 选 Serial Wire，别拿 SWDIO/SWCLK 当普通 IO。已经锁死时用 connect under reset 抓复位窗口，或拉高 BOOT0 进厂商 bootloader 再擦除。"},{mistake:"printf 阻塞主循环，把时序搞乱",symptom:"加了一行 printf 后通信超时或丢帧，去掉就正常；或者只在“你慢慢看日志”的时候不发疯",fix:"把 printf 变成“入队”（环形缓冲），真正发送放到主循环或 DMA；中断里绝不调用阻塞发送；日志满了就丢并计数，别让日志改行为。"},{mistake:"逻辑分析仪采样率/阈值设置不足",symptom:"解码器报帧错误或未知字节，波形看着“少跳变”；换台电脑或降低速率就正常，于是误判成硬件问题",fix:"采样率按被测信号定：至少每比特几个采样点（115200 下要数百 kSa/s 以上量级），怀疑时先翻倍再抓；同时确认阈值电压与共地。"},{mistake:"HardFault 只复位不定位",symptom:"进 HardFault 就靠看门狗或手动复位恢复，问题每隔几天复现一次，永远查不到根因",fix:"在处理函数里保存 LR/PC/xPSR 与 MSP/PSP，用栈回溯定位出错指令，再看 CFSR/HFSR 与 MMFAR/BFAR 判断故障类型；把 PC 用反汇编或 addr2line 对回源码行。"}],takeaways:["先分层再二分：供电 → 时钟 → 引脚 → 外设配置 → 协议时序 → 应用逻辑，每层都写下“先看什么 / 怎么验证”的证据。","工具各管一层：SWD 看软件与寄存器、逻辑分析仪看时序与帧、示波器看电平与边沿、串口日志看状态流转；日志必须非阻塞。","HardFault 不要只复位：LR 判断栈、`__get_MSP()` 找栈帧、PC 对回源码、故障寄存器名词判断类型，四个动作做完才算定位。"],quizIds:["debug-q1","debug-q2","debug-q3"],keywords:["SWD","JTAG","SWO","ST-Link","DAPLink","printf 重定向","环形缓冲","逻辑分析仪","示波器","HardFault"]};export{t as debugLesson};
