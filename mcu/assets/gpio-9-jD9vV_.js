const P={slug:"gpio",title:"GPIO",en:"General-Purpose Input/Output",oneLine:"GPIO 是能被软件定义成输入、输出、复用或模拟的引脚，一切外设信号最终都从这些引脚进出。",category:"peripheral",level:"入门",minutes:25,goals:["说清 `MODER` 里每个引脚占 2 位，00 输入、01 输出、10 复用、11 模拟分别是什么场景","区分推挽与开漏：谁能主动输出高电平、谁只能拉低、为什么 I²C 必须用开漏","按“时钟 → 初值 → 模式 → 上下拉/速度 → 复用 AFR”的顺序正确配置一个引脚","看懂数据手册里 GPIO 的电气表格，知道 5V 容忍、上下拉、驱动电流到底该查哪一栏"],analogy:{title:"GPIO 像每个房间门边的“万能开关面板”",text:"每个孔既能接成开关（输入：你按它，它才变），也能接成灯（输出：你写 1，它才亮）。输出还分两种接法：推挽是两个方向都主动，能推能拉；开漏只有一根往下的线，只能拉低，高电平得靠外面的上拉电阻“拉”回来。面板出厂默认是悬空的——你不去定义它，它就不代表任何意思，读回来的值纯看外面接了什么。"},why:["**一切外设都从这里出门**：UART 的 TX、SPI 的 SCK、TIM 的 PWM 输出，本质都是“某个引脚先被配成复用功能”，再交给外设。","**调试最常见的一类故障**：点不亮、读不到按键、波形不对，八成出在时钟没开、模式配错、开漏没上拉这三件事上。","**电气边界决定电路怎么画**：能不能直连 5V 器件、要不要加三极管、上拉取多大，答案都在数据手册的 GPIO 章节里。","**面试与实测都会问**：推挽与开漏的区别、线与、按键上拉还是下拉，是最常被追问的基础题。"],sections:[{id:"what-is",title:"GPIO 到底是什么",lead:"先把“引脚”和“电平”这两件事分开看，后面所有配置都是在改这两者。",blocks:[{kind:"p",text:"**GPIO（General-Purpose Input/Output，通用输入输出）**：芯片上一组可以被软件定义用途的引脚。它本身不做协议，只做两件事——**读引脚上的电平**（输入）和**把引脚拉到某个电平**（输出）。正因为“通用”，它才既能点灯、读按键，也能临时用软件“模拟”出一段 I²C 时序（俗称软件 I²C）。"},{kind:"p",text:"引脚看到的永远是**电平**，不是数字。以 3.3 V 系统为例：高电平接近 VDD（3.3 V 量级），低电平接近 0 V；但“多高才算高”由数据手册里的输入阈值（VIH / VIL）规定，并不是严格的 3.3 V 与 0 V。所以**逻辑电平以 VDD 为参考**——换到 1.8 V 或 5 V 供电的系统，同一套代码的行为要重新核对。"},{kind:"ul",items:["**输出**：LED、继电器控制、片选 `CS`、蜂鸣器、使能脚——只需“高/低”两种状态。","**输入**：按键、拨码开关、传感器开关量输出、模块的 `READY` / `INT` 脚。","**复用**：引脚交给片上外设（USART / SPI / TIM / I²C 等），这时你不再直接写 ODR，而是让外设驱动它。","**模拟**：引脚直连 ADC / DAC 的模拟通道，数字输入输出电路被断开。"]},{kind:"note",tone:"tip",title:"三条必须先记住的事实",text:"① 复位后引脚默认是**高阻输入**（`MODER = 00`、`PUPDR = 00`），谁都没在驱动它；② 输出电平由 `ODR` 这个“软件想输出的值”决定，而 `IDR` 反映的是引脚**实际**电平，两者可能不一致；③ 只有 `MODER` 配成 10 复用之后，这个引脚才归外设管，此时再写 `ODR` 没有意义。"}]},{id:"four-modes",title:"四种模式与 MODER",lead:"一个引脚干什么，先由 MODER 里属于它的 2 位决定——这是所有 GPIO 配置的第一道岔路。",blocks:[{kind:"p",text:"`GPIOA->MODER` 里**每个引脚占 2 位**：00 = 输入、01 = 通用输出、10 = 复用功能、11 = 模拟。所以 PA5 这 2 位在第 10、11 位（`5 * 2 = 10`），PA0 在第 0、1 位。改模式时的标准写法是“先清零这 2 位，再写入目标编码”，否则会把上一位的残留值带上。"},{kind:"table",caption:"MODER 编码速查（以 STM32F4/G4 的 GPIO 章节为准，各系列编码一致、外设细节可能不同）。",head:["模式","MODER 编码","谁在驱动引脚","典型场景"],rows:[["输入","00","没人驱动，靠外部电路或内部上下拉定电平","读按键、读开关量、外部中断源"],["通用输出","01","输出级（推挽或开漏，由 OTYPER 选）","点灯、片选、继电器、软件模拟时序"],["复用功能","10","片上外设（USART/SPI/TIM…），具体哪个靠 AFR 选","串口、SPI、PWM、硬件 I²C"],["模拟","11","模拟通道，数字输入输出缓冲器断开","ADC 采样、DAC 输出"]]},{kind:"p",text:"选完模式，还有三个寄存器要一起看：**`OTYPER`** 选推挽（0）还是开漏（1）；**`PUPDR`** 每引脚 2 位，00 无上下拉、01 上拉、10 下拉（11 保留）；**`OSPEEDR`** 每引脚 2 位，选输出边沿速度档位（大致分低速/中速/高速/超高速几档，具体编码与命名见参考手册 GPIO 章节，各系列略有差异）。"},{kind:"ul",items:["**施密特触发（Schmitt trigger）**：输入路径上通常带整形电路，把缓慢爬升的边沿整成干净的高低电平，并带一点迟滞来抗抖动；它对“噪声”有帮助，但不能替代按键去抖。","**输入浮空的风险**：`MODER = 00` 且 `PUPDR = 00` 就是浮空输入——引脚像一根天线，电平由漏电和干扰决定，读到的值可能每次都不一样，还会让输入级来回翻转、抬高功耗。**按键不接上下拉是新手最常见的坑**。","**上拉还是下拉，看开关怎么接**：按键一端接地，就配**上拉**（松开为高、按下为低）；按键一端接 VDD，就配**下拉**。逻辑方向反了，程序就会“按下没反应、松开一直触发”。","**模拟模式不等于输入**：11 会断开数字输入缓冲器，ADC 才能准确采样；用成 00 输入去接模拟信号，既读不准模拟量，也可能白白多耗电。"]}]},{id:"pp-vs-od",title:"推挽、开漏与线与",lead:"同样是“写 1”，推挽是芯片主动输出高电平，开漏只是“放手”——这是两套完全不同的电路行为。",blocks:[{kind:"p",text:"输出级的核心是两只 MOS 管：上面一只 **PMOS** 接 VDD，下面一只 **NMOS** 接 GND，中间就是引脚。**推挽（Push-Pull）** 让两只管子成对工作：写 1 时 PMOS 导通把引脚“推”到 VDD，写 0 时 NMOS 导通把引脚“拉”到 GND——能推能拉，驱动强、边沿快。**开漏（Open-Drain）** 里 PMOS 不参与：写 1 只是关掉 NMOS（相当于放手），写 0 才把引脚拉到 GND。所以开漏的“高电平”必须由外部上拉电阻提供。"},{kind:"table",caption:"推挽与开漏对比（驱动能力、上升沿快慢为定性描述，具体数值见数据手册）。",head:["维度","推挽 Push-Pull","开漏 Open-Drain"],rows:[["写 1","PMOS 导通，引脚被推到 VDD，主动输出电流","NMOS 关断，引脚“放手”，电平由上拉网络决定"],["写 0","NMOS 导通，把引脚拉到 GND","NMOS 导通，把引脚拉到 GND（两者相同）"],["高电平来源","芯片内部（VDD）","外部上拉电阻（没有上拉就不确定）"],["能不能并在一起","不能：一个推高、一个拉低会直接对灌，可能损坏","能：多个开漏共线即“线与”，任一方拉低就是低"],["边沿与速度","边沿快、驱动强，适合高速信号","上升沿靠上拉电阻给总线电容充电，较慢"],["典型场景","LED、PWM、SPI、普通输出","I²C、多设备共用中断线、电平转换、线与"]]},{kind:"p",text:"**线与（wired-AND）** 是开漏最有价值的特性：多个设备把输出接在同一根线上，各自只负责“拉低”或“放手”，线上电平 = 所有设备都放手时为高、任意一方拉低就为低。I²C 的 SDA/SCL 就是这么工作的，它还要靠这套机制做时钟同步和多主机仲裁。**代价**是上升沿由“上拉电阻 × 总线电容”这个 RC 决定，上拉越大越省电但越慢，所以 I²C 的上拉阻值要按总线速率和电容来选。"},{kind:"terms",items:[{zh:"推挽",en:"Push-Pull",desc:"上下两管成对工作，写 1 主动输出高、写 0 主动拉低，驱动强但不能并联。"},{zh:"开漏",en:"Open-Drain",desc:"只有下管参与，写 1 等于放手，高电平靠外部上拉；可以多设备共线做线与。"},{zh:"线与",en:"Wired-AND",desc:"多路开漏输出接在同一根线上，任一路拉低则整条线为低，等价于“全部为高才为高”。"},{zh:"灌电流",en:"Sink Current",desc:"外部电流经负载流入引脚、再经 NMOS 入地；GPIO 拉低时点灯最可靠的方式。"}]},{kind:"note",tone:"tip",title:"观察问题：带着这三个问题去玩下面的动画",text:"① 把动画切到**开漏**、把外部上拉关掉，再单步走到“写 1”：万用表为什么给不出一个确定值？② 为什么 I²C 这类多设备共用一根线的总线必须用开漏？③ 配置成输出的那一瞬间（ODR 复位值是 0），引脚为什么会先变低？三个问题都能在步骤详情和结论里找到答案，别只看动画。"},{kind:"lab",labId:"gpio-output",caption:"推挽 vs 开漏：切换模式、开关上拉，单步看 PMOS / NMOS 谁在导通。"}]},{id:"af-and-config",title:"复用功能与配置步骤",lead:"复用模式下引脚归外设管，但“这根脚到底接哪个外设”要你查手册填 AFR，这一步最容易配错。",blocks:[{kind:"p",text:"把 `MODER` 写成 10（复用功能）只是说“这根脚交给片上外设”，还要告诉芯片**交给哪一个**。答案在 `GPIOA->AFR[0]` / `AFR[1]` 里：**每个引脚占 4 位**，取值 0–15 对应 AF0–AF15；引脚 0–7 在 `AFR[0]`，引脚 8–15 在 `AFR[1]`。同一根引脚在不同芯片上可能对应不同外设（甚至同一芯片的不同封装也不同），所以**AF 编号不能背、不能跨型号抄**。"},{kind:"ol",items:["**查表**：打开你自己芯片的数据手册（Datasheet），找到 **Alternate function mapping** 表。","**定位引脚**：在表里找到你板子上实际连出去的那个引脚（比如 PA9），确认当前封装里它存在。","**找外设那一列**：在你需要的那个外设（如 USART1_TX）那一列里，读出对应的 **AF 编号**。","**写进 AFR**：把这 4 位写进 `AFR[引脚/8]` 中 `(引脚 % 8) * 4` 的位置（先清零再写）。","**交叉验证**：和 CubeMX 生成的 `HAL_GPIO_Init` 代码对一眼——两者不一致时，以手册和实际板子为准。"]},{kind:"p",text:"**速度档位（OSPEEDR）不是越快越好**：档位越高，输出边沿越陡，能跑更高频率的信号，但 EMI 和瞬时功耗也更大。点灯、按键这类慢信号用最低档；SPI、高速 PWM 才需要高档。本页举例时只给“低速/中速/高速/超高速”这个量级说法，具体编码与档位数量以你芯片的参考手册为准。"},{kind:"note",tone:"warn",title:"不要编 AF 编号",text:"不同系列、不同封装的 Alternate function mapping 表都不一样，同一个 AF 编号在另一颗芯片上可能是完全不同的外设。本页不给出任何具体引脚的 AF 号——你需要时**以你自己芯片的手册为准**，并在上板前用示波器或 CubeMX 配置交叉确认。"},{kind:"ol",items:["**使能端口时钟**：GPIOA 挂在 AHB1 上，写 `RCC->AHB1ENR` 对应位（或调 `__HAL_RCC_GPIOA_CLK_ENABLE()`）。时钟没开，后面所有寄存器写入都进不了门。","**先写初值**：需要“上电即高”的场合，先写 `ODR` / `BSRR` 把电平定好，再去切模式——否则切到输出的瞬间 ODR 复位值 0 会把引脚拉低。","**选模式**：`MODER` 清零那 2 位后写 00/01/10/11，决定输入、输出、复用还是模拟。","**定电气属性**：输出选 `OTYPER`（推挽/开漏）、`OSPEEDR`（速度）；输入按外部接法定 `PUPDR`（上拉/下拉/不拉）。","**复用补 AFR**：`MODER = 10` 之后，再把外设编号写进对应 `AFR` 的 4 位。","**读写与触发**：输入读 `IDR`；输出用 `BSRR`（原子置位/复位）或 `ODR`；接下来交给中断、DMA 或主循环处理。"]}]},{id:"code",title:"动手写：按键 + LED",lead:"下面这段代码解决的是最典型的组合：一个引脚输出点灯，一个引脚输入读按键。",blocks:[{kind:"code",title:"HAL 实现：PA5 点灯 + PA0 读按键（学习示意，引脚请按你的板子核对）",language:"c",code:`#include "stm32f4xx_hal.h"

/* 硬件假设（示意）：LED 接 PA5，高电平点亮；按键接 PA0，按下接地，松开靠内部上拉回高 */
static void gpio_init(void)
{
    __HAL_RCC_GPIOA_CLK_ENABLE();          /* 1. 先开时钟，不然下面写寄存器全是白写 */

    GPIO_InitTypeDef gpio = {0};

    gpio.Pin   = GPIO_PIN_5;               /* LED：推挽输出，能推能拉 */
    gpio.Mode  = GPIO_MODE_OUTPUT_PP;
    gpio.Pull  = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;      /* 慢信号用最低档，减小边沿噪声 */
    HAL_GPIO_Init(GPIOA, &gpio);

    gpio.Pin  = GPIO_PIN_0;                /* 按键：输入 + 内部上拉 */
    gpio.Mode = GPIO_MODE_INPUT;
    gpio.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(GPIOA, &gpio);
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();                  /* 时钟树配置，见“时钟与复位”页 */
    gpio_init();

    GPIO_PinState last = GPIO_PIN_SET;     /* 上拉 + 没按下 = 高电平 */

    for (;;) {
        GPIO_PinState now = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0);  /* 读 IDR */

        if (now != last) {
            HAL_Delay(20);                 /* 20 ms 简单去抖（示意值，按实际按键调整） */
            now = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0);
            if (now != last) {
                last = now;
                if (now == GPIO_PIN_RESET)                    /* 按下为低 */
                    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);    /* 翻转 LED */
            }
        }
    }
}`,explain:[{item:"__HAL_RCC_GPIOA_CLK_ENABLE()",desc:"写 RCC->AHB1ENR 的对应位，打开 GPIOA 时钟。忘记这一步，初始化函数照样返回，引脚却毫无反应。"},{item:"GPIO_MODE_OUTPUT_PP",desc:"对应 MODER = 01、OTYPER = 0 的组合：推挽输出，写 1 时 PMOS 主动把引脚推到 VDD。"},{item:"GPIO_SPEED_FREQ_LOW",desc:"写 OSPEEDR 的低速档；档位越高边沿越陡，EMI 与瞬时电流也越大。"},{item:"GPIO_MODE_INPUT + GPIO_PULLUP",desc:"MODER = 00、PUPDR = 01；按键另一端接地，所以松开时被上拉成高电平，按下为低。"},{item:"HAL_GPIO_ReadPin",desc:"本质是读 GPIOA->IDR 的那一位，返回 GPIO_PIN_SET / GPIO_PIN_RESET 两个枚举值。"},{item:"HAL_Delay(20) 去抖",desc:"机械按键按下/松开的瞬间会抖十几次，先等 20 ms 再确认一次。量产代码更常用定时器采样或中断 + 定时器。"},{item:"HAL_GPIO_TogglePin",desc:"读 ODR 再取反写回，等价于 `GPIOA->ODR ^= (1U << 5)`；多任务环境下用 BSRR 更安全。"}]},{kind:"tabs-code",title:"同一个任务（PA5 输出 + PA0 读键）的三种写法",note:"三种写法操作的是同一组寄存器，区别只在“谁帮你算地址、清零和移位”。",variants:[{label:"HAL",language:"c",code:`/* 高层封装：可读性最好，代价是多一层函数调用与参数检查 */
__HAL_RCC_GPIOA_CLK_ENABLE();

GPIO_InitTypeDef gpio = {0};
gpio.Pin   = GPIO_PIN_5;
gpio.Mode  = GPIO_MODE_OUTPUT_PP;
gpio.Pull  = GPIO_NOPULL;
gpio.Speed = GPIO_SPEED_FREQ_LOW;
HAL_GPIO_Init(GPIOA, &gpio);

gpio.Pin  = GPIO_PIN_0;
gpio.Mode = GPIO_MODE_INPUT;
gpio.Pull = GPIO_PULLUP;
HAL_GPIO_Init(GPIOA, &gpio);

HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);       /* 写 1：LED 亮 */
GPIO_PinState btn = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0);  /* 读引脚：低=按下 */`,explain:[{item:"GPIO_InitTypeDef",desc:"HAL 用它一次描述 Pin / Mode / Pull / Speed，内部换算成 MODER、OTYPER、OSPEEDR、PUPDR 的位域。"},{item:"HAL_GPIO_Init(GPIOA, &gpio)",desc:"按结构体内容改寄存器；同一端口的多个引脚可以多次调用，或把 Pin 用 `|` 合并成一次。"}]},{label:"LL",language:"c",code:`/* 低层库：几乎内联成寄存器操作，开销最小，仍保留可读的函数名 */
#include "stm32f4xx_ll_bus.h"
#include "stm32f4xx_ll_gpio.h"

LL_AHB1_GRP1_EnableClock(LL_AHB1_GRP1_PERIPH_GPIOA);   /* 打开 GPIOA 时钟 */

LL_GPIO_SetPinMode(GPIOA, LL_GPIO_PIN_5, LL_GPIO_MODE_OUTPUT);
LL_GPIO_SetPinOutputType(GPIOA, LL_GPIO_PIN_5, LL_GPIO_OUTPUT_PUSHPULL);
LL_GPIO_SetPinSpeed(GPIOA, LL_GPIO_PIN_5, LL_GPIO_SPEED_FREQ_LOW);
LL_GPIO_SetPinPull(GPIOA, LL_GPIO_PIN_5, LL_GPIO_PULL_NO);

LL_GPIO_SetPinMode(GPIOA, LL_GPIO_PIN_0, LL_GPIO_MODE_INPUT);
LL_GPIO_SetPinPull(GPIOA, LL_GPIO_PIN_0, LL_GPIO_PULL_UP);

LL_GPIO_SetOutputPin(GPIOA, LL_GPIO_PIN_5);            /* 写 1 */
uint32_t btn = LL_GPIO_ReadInputPin(GPIOA, LL_GPIO_PIN_0);  /* 0 = 低电平 */`,explain:[{item:"LL_AHB1_GRP1_EnableClock",desc:"LL 风格的时钟使能，等价于 `__HAL_RCC_GPIOA_CLK_ENABLE()`，目的都是打开 AHB1 上的 GPIOA 时钟。"},{item:"LL_GPIO_SetPinMode / SetPinPull",desc:"分别改 MODER 与 PUPDR 的 2 位；编号本身不帮你记住，必须自己核对引脚。"},{item:"LL_GPIO_ReadInputPin",desc:"直接读 IDR 并返回对应位的 0/非 0，常用于 `if (btn) ...` 这类判断。"}]},{label:"寄存器",language:"c",code:`/* 裸寄存器：理解原理最直观；量产代码里要自己保证可读性与可移植性 */

/* 1. 打开 GPIOA 时钟（AHB1ENR 位 0，位定义见参考手册 RCC 章节） */
RCC->AHB1ENR |= (1U << 0);

/* 2. 先写初值再切模式：避免“切成输出的瞬间引脚被拉低” */
GPIOA->ODR |= (1U << 5);

/* 3. PA5 = 通用输出：MODER 每引脚 2 位，先清零再写 01 */
GPIOA->MODER &= ~(3U << (5 * 2));
GPIOA->MODER |=  (1U << (5 * 2));

/* 4. 推挽 + 低速：OTYPER 位 5 清 0；OSPEEDR 两位清 0 = 最低档 */
GPIOA->OTYPER  &= ~(1U << 5);
GPIOA->OSPEEDR &= ~(3U << (5 * 2));

/* 5. PA0 = 输入 + 内部上拉：MODER 00，PUPDR 01 */
GPIOA->MODER &= ~(3U << (0 * 2));
GPIOA->PUPDR &= ~(3U << (0 * 2));
GPIOA->PUPDR |=  (1U << (0 * 2));

/* 6. 读写：IDR 只读、反映引脚实际电平；BSRR 高 16 位复位、低 16 位置位 */
uint32_t button = GPIOA->IDR & (1U << 0);   /* 0 = 低电平（按下） */
GPIOA->BSRR = (1U << 5);                    /* 置 1：高电平 */
GPIOA->BSRR = (1U << (5 + 16));             /* 复位：低电平 */`,explain:[{item:"MODER 的 2 位/引脚",desc:"00 输入、01 输出、10 复用、11 模拟；PA5 的偏移是 5*2=10，所以掩码和置位都用 `<< 10`。"},{item:"PUPDR = 01",desc:"内部上拉，等效一个几十 kΩ 量级的电阻接到 VDD（示意值，具体见数据手册）。"},{item:"BSRR",desc:"写低 16 位置位、写高 16 位复位，单条指令完成，不会像“读改写 ODR”那样被中断打断。"},{item:"IDR 与 ODR",desc:"ODR 是软件想输出的值，IDR 是引脚真实电平；开漏没上拉时两者就不一致。"}]}]}]},{id:"electrical",title:"电气特性与边界",lead:"代码写对只是第一步，能不能接这个外设，要回到数据手册的电气表格。",blocks:[{kind:"p",text:"**逻辑电平以 VDD 为参考**：3.3 V 系统里高电平接近 3.3 V、低电平接近 0 V，但判定阈值（VIH / VIL）和输出摆幅由数据手册的 I/O 特性表规定。3.3 V 器件的输出去驱动 5 V 器件时，很可能达不到对方的 VIH——这就是需要电平转换或选 FT 引脚的原因。"},{kind:"kv",items:[{k:"供电参考",v:"VDD = 3.3 V 系统（示意，以你的板子为准）"},{k:"内部上拉/下拉",v:"典型几十 kΩ 量级（示意，见数据手册）"},{k:"单脚驱动电流",v:"有明确上限，mA 量级（见数据手册 I/O 特性）"},{k:"所有 IO 合计电流",v:"另有总限额，多个脚同时拉电流要一起算（见手册）"},{k:"5V 容忍（FT）",v:"只有部分引脚标注 FT，且以手册标注为准"},{k:"输出边沿",v:"由 OSPEEDR 档位与负载共同决定（见手册）"}]},{kind:"note",tone:"danger",title:"关于 5V 容忍，两个最常见的误解",text:"① **FT 指的是输入可以容忍 5 V**，不代表这个引脚能**输出** 5 V 高电平——输出高电平仍然是 VDD，驱动 5 V 器件需要电平转换。② 即使在 FT 引脚上，一旦配成**模拟模式**或某些复用功能，5 V 容忍通常不再保证，而且不同封装的 FT 标注可能不同。**以数据手册引脚定义表里的 I/O 结构那一栏为准**，别按“STM32 都抗 5V”去做电路。"},{kind:"ul",items:["**点 LED 必须串限流电阻**：330 Ω 量级是常见教学取值（示意），实际按 VDD、LED 压降和目标电流算，别直接用引脚硬怼 LED。","**感性负载（继电器、电机、蜂鸣器）不能直连**：要加三极管 / MOS 管 / 驱动芯片，线圈两端加续流二极管，否则关断瞬间的反电动势会打穿引脚甚至复位芯片。","**不要用 GPIO 给模块供电**：引脚是信号脚，不是电源；模块的 VCC 走电源轨，只把使能/通信脚接到 GPIO。","**长线、插座引出的信号要考虑上拉与保护**：悬空的长线等于天线，加串阻、上拉或 RC 滤波，必要时加 TVS。"]},{kind:"compare",cardId:"gpio"},{kind:"p",text:"下一页进入 **中断与 NVIC**：本页的按键是“主循环里反复读 IDR”，CPU 一直在空转等；中断则让按键变化主动打断 CPU。理解了 GPIO 的输入路径和上下拉，才能看懂外部中断为什么要选边沿、为什么浮空输入会误触发。"}]}],mistakes:[{mistake:"忘记使能 GPIO 端口时钟",symptom:"代码编译通过、初始化函数也不报错，但引脚电平纹丝不动；单步调试时能看到寄存器写入“没生效”",fix:"先确认 `RCC->AHB1ENR` 对应位（或调 `__HAL_RCC_GPIOx_CLK_ENABLE()`）。F4 上所有 GPIO 都在 AHB1，时钟没开时写 MODER 等于写进空气。"},{mistake:"复用功能的 AF 编号抄错或漏配 AFR",symptom:"外设初始化返回成功，但引脚上没有任何波形；或者波形出现在完全不相干的另一个引脚上",fix:"按自己芯片数据手册的 Alternate function mapping 表逐脚核对 AF 编号，再用 CubeMX 生成的配置交叉验证；不要跨型号、跨封装照抄。"},{mistake:"开漏输出没有接上拉",symptom:"写 1 后万用表给不出稳定高电平，读回的值随机；示波器上看到缓慢爬升的斜坡甚至一直上不去",fix:"开漏必须靠上拉才能得到高电平：加外部上拉（阻值按速率与总线电容选），验证阶段也可先开内部上拉。I²C 一定要外部上拉。"},{mistake:"按键没有去抖，或上下拉方向配反",symptom:"按一下灯连闪好几次、计数乱跳；或者“松开一直触发、按下没反应”",fix:"先确认按键接法：一端接地就配上拉（按下为低）。再去抖——延时二次确认够用，要求高时用定时器采样或中断 + 定时器。"},{mistake:"用 GPIO 直接驱动大电流负载",symptom:"引脚电压被拉低、芯片发烫；带电机/继电器时一动作就复位或死机",fix:"引脚只做控制信号：加三极管/MOS/驱动芯片，感性负载加续流二极管；电流上限与总限额见数据手册，不要靠“能亮就行”去试。"}],takeaways:["GPIO 配置落在几个固定位置：MODER 选模式（每引脚 2 位：00 输入 / 01 输出 / 10 复用 / 11 模拟）、OTYPER 选推挽或开漏、PUPDR 定上下拉、OSPEEDR 定边沿速度，复用再补 AFR 的 4 位 AF 编号。","推挽能推能拉、驱动强但不能并联；开漏只能拉低、高电平靠上拉，所以能做线与、电平转换和 I²C——写 1 只是“放手”。","电平、上下拉、5V 容忍、驱动电流全是“以数据手册为准”的电气参数：写代码前先查手册，再定电路。"],quizIds:["gpio-q1","gpio-q2","gpio-q3"],keywords:["GPIO","MODER","推挽","开漏","上下拉","复用功能","AFR","5V容忍","STM32 HAL"]};export{P as gpioLesson};
