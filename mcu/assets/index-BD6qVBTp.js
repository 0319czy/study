const _=[{slug:"spi-screen",title:"SPI 驱动屏幕",oneLine:"用 SPI 加几根控制线点亮 TFT 屏：先发命令、再开窗口、最后把整块像素交给 DMA。",level:"进阶",hardware:["STM32F407 开发板","常见 SPI TFT 模块（ST7735 类驱动器，带 CS/DC/RES 引脚）","杜邦线若干（尽量短）","逻辑分析仪或示波器（验 CS/DC/SCK，可选）"],goal:["说清 SPI 屏为什么比普通 SPI 器件多出 DC、RES 两根线，以及 CS 为什么要覆盖整帧","用 HAL 写出“命令 / 数据 / 开窗口 / 整块填色”四层，让屏先显示纯色块","估算刷一屏要多久，并把整块像素的发送交给 DMA，理解 CPU 只在起止两处参与","遇到白屏、花屏、只画一半时，能按 RES 复位、CS 时序、字节序、分频四项排查"],wiring:[{signal:"SCK",mcuPin:"PA5",device:"屏模块 SCL / SCK",note:"SPI1 的时钟线，复用推挽；按你的板子原理图核对（换成 SPI2 时引脚完全不同）"},{signal:"MOSI",mcuPin:"PA7",device:"屏模块 SDA / MOSI",note:"主机发、屏收；屏一般只写不读，MISO 可以省掉不接；按你的板子原理图核对"},{signal:"CS",mcuPin:"PA4",device:"屏模块 CS",note:"普通推挽输出，低有效；用软件片选，覆盖“命令 + 参数 + 像素”整段；按你的板子原理图核对"},{signal:"DC（A0）",mcuPin:"PA3",device:"屏模块 DC / A0",note:"数据/命令选择：低=命令，高=数据。没有它屏分不清字节是指令还是像素；按你的板子原理图核对"},{signal:"RESET",mcuPin:"PA2",device:"屏模块 RES / RST",note:"上电先拉低再拉高完成硬复位，之后给固定延时；按你的板子原理图核对"}],steps:[{title:"① 先认清屏的接线与驱动器",detail:"看模块丝印与配套例程，确认它是 SPI 接口、带 CS/DC/RES、驱动 IC 属于哪一类（常见 ST7735 类）。为什么第一步是这个：初始化序列是驱动 IC 私有的，换一类屏就得换表，先确认型号才不至于白忙。"},{title:"② 配 SPI1：主机、8 位、Mode 0、保守分频",detail:"SCK / MOSI 配成复用推挽（AF5），CS / DC / RES 配成普通推挽输出。先给几 MHz 量级的分频，把通信跑通；速度是后面再提的事，一上来满速会让“配错”和“跑太快”混在一起。"},{title:"③ 硬复位屏",detail:"先把 RES 拉低几十毫秒量级，再拉高，然后等模块手册要求的稳定时间。为什么不能省：驱动器上电后停在未知状态，不复位就发命令，屏幕大概率一直黑，而 SPI 波形看起来完全正常。"},{title:"④ 写底层三件套：选片、切 DC、发字节",detail:"封装 lcd_select / lcd_release、lcd_write_cmd（DC=0）、lcd_write_data（DC=1）。这一层只有十几行，却决定了后面所有调用对不对；先把它写对，再谈初始化表。"},{title:"⑤ 把模块例程里的初始化表原样搬过来",detail:"初始化是一串“命令 + 若干参数”，不同驱动 IC 不能混用，所以本页只给“怎么把表逐条发出去”的框架，不给具体命令码。数值照你的模块例程或数据手册填，别从别的屏抄。"},{title:"⑥ 开窗口 + 填纯色块，验证坐标与颜色",detail:"先设列范围、再设行范围，最后发“写显存”命令，之后连续写入的像素会按行填满窗口。先填三个纯色块：能验证坐标原点、扫描方向与 RGB565 的高低字节顺序。"},{title:"⑦ 提速：整块像素交给 DMA",detail:"一个像素 2 字节，一屏十几万字节用 CPU 逐字节发会占满主循环。改成“开窗口 → 启动一次 DMA 发送整块缓冲 → 完成回调里再开下一块”，CPU 只在起止两处出现。"},{title:"⑧ 用逻辑分析仪收尾",detail:"量 CS 是否覆盖整帧、DC 是否在命令与数据之间正确切换、SCK 空闲电平是否是低（Mode 0）。这三条对上了，屏还不亮就只剩初始化序列和供电两件事要查。"}],code:[{label:"HAL",language:"c",code:`#include "stm32f4xx_hal.h"

/* 本段只讲“怎么把字节按 SPI 屏的规矩送出去”，不含任何厂家初始化序列：
   不同驱动 IC 的初始化命令与参数不能混用，请把模块配套例程里的表原样搬进来。 */

extern SPI_HandleTypeDef hspi1;   /* CubeMX 生成：主机 / 8 位 / MSB 先发 / Mode 0 / 保守分频 */

#define LCD_CS_PORT   GPIOA
#define LCD_CS_PIN    GPIO_PIN_4
#define LCD_DC_PORT   GPIOA
#define LCD_DC_PIN    GPIO_PIN_3
#define LCD_RST_PORT  GPIOA
#define LCD_RST_PIN   GPIO_PIN_2

/* 命令码与参数格式由驱动 IC 决定：这里只用符号名占位，
   数值一律照你的模块手册填，跨驱动器套用会白屏。 */
#define LCD_CMD_CASET   0x2AU   /* 设置列地址（示意位置，见模块手册） */
#define LCD_CMD_RASET   0x2BU   /* 设置行地址 */
#define LCD_CMD_RAMWR   0x2CU   /* 开始写显存 */

/* 1. 片选：整帧（命令 + 参数 + 像素）期间保持低电平 */
static void lcd_select(void)  { HAL_GPIO_WritePin(LCD_CS_PORT, LCD_CS_PIN, GPIO_PIN_RESET); }
static void lcd_release(void) { HAL_GPIO_WritePin(LCD_CS_PORT, LCD_CS_PIN, GPIO_PIN_SET); }

/* 2. 一次把若干字节推上总线；SPI 是全双工，收到的字节这里直接丢掉 */
static void lcd_write_bytes(const uint8_t *p, uint16_t n)
{
    if (HAL_SPI_Transmit(&hspi1, (uint8_t *)p, n, 100) != HAL_OK) {
        Error_Handler();          /* 超时说明总线没动：先查时钟、引脚复用与分频 */
    }
}

/* 3. 命令：DC = 0 时屏把收到的字节当“指令” */
static void lcd_write_cmd(uint8_t cmd)
{
    HAL_GPIO_WritePin(LCD_DC_PORT, LCD_DC_PIN, GPIO_PIN_RESET);
    lcd_select();
    lcd_write_bytes(&cmd, 1);
    lcd_release();
}

/* 4. 参数与像素：DC = 1 时屏把字节当“数据”*/
static void lcd_write_data(const uint8_t *p, uint16_t n)
{
    HAL_GPIO_WritePin(LCD_DC_PORT, LCD_DC_PIN, GPIO_PIN_SET);
    lcd_select();
    lcd_write_bytes(p, n);
    lcd_release();
}

/* 5. 开窗口：之后的像素按行填满这个矩形，写满自动换到下一行 */
static void lcd_set_window(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1)
{
    uint8_t buf[4];

    lcd_write_cmd(LCD_CMD_CASET);                       /* 列范围：x0、x1 各两字节（高字节先发） */
    buf[0] = (uint8_t)(x0 >> 8); buf[1] = (uint8_t)x0;
    buf[2] = (uint8_t)(x1 >> 8); buf[3] = (uint8_t)x1;
    lcd_write_data(buf, 4);

    lcd_write_cmd(LCD_CMD_RASET);                       /* 行范围：y0、y1 */
    buf[0] = (uint8_t)(y0 >> 8); buf[1] = (uint8_t)y0;
    buf[2] = (uint8_t)(y1 >> 8); buf[3] = (uint8_t)y1;
    lcd_write_data(buf, 4);

    lcd_write_cmd(LCD_CMD_RAMWR);                       /* 从此以后写进去的字节都是像素 */
}

/* 6. 填充一个矩形：RGB565 每像素 2 字节，用一小块模板反复发，避免逐点起停 CS */
static void lcd_fill_rect(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1, uint16_t color)
{
    static uint8_t chunk[64];                            /* 32 个像素的模板，内容恒定 */
    uint32_t pixels = (uint32_t)(x1 - x0 + 1U) * (uint32_t)(y1 - y0 + 1U);
    uint16_t i;

    for (i = 0; i < sizeof(chunk); i += 2) {             /* 同一个颜色填满模板 */
        chunk[i]     = (uint8_t)(color >> 8);            /* RGB565 高字节先发 */
        chunk[i + 1] = (uint8_t)color;
    }

    lcd_set_window(x0, y0, x1, y1);

    /* 大块像素数据不必每 1 字节都切一次 CS：整段保持选中，DC 保持为“数据” */
    HAL_GPIO_WritePin(LCD_DC_PORT, LCD_DC_PIN, GPIO_PIN_SET);
    lcd_select();
    while (pixels > 0U) {
        uint16_t cnt = (pixels >= 32U) ? 32U : (uint16_t)pixels;   /* 最后一块可能不足 32 像素 */
        lcd_write_bytes(chunk, (uint16_t)(cnt * 2U));              /* 注意：长度是字节数，不是像素数 */
        pixels -= cnt;
    }
    lcd_release();
}

/* 7. 一次性初始化：只演示“怎么把表逐条发出去”，表内容照模块例程填 */
typedef struct {
    uint8_t        cmd;      /* 命令字节 */
    uint8_t        len;      /* 该命令跟几个参数字节 */
    const uint8_t *data;     /* 参数指针，可为 NULL */
} lcd_init_item_t;

static void lcd_init(const lcd_init_item_t *table, uint32_t count)
{
    HAL_GPIO_WritePin(LCD_RST_PORT, LCD_RST_PIN, GPIO_PIN_RESET);   /* 硬复位：低 */
    HAL_Delay(20);                                                  /* 延时量级按模块手册 */
    HAL_GPIO_WritePin(LCD_RST_PORT, LCD_RST_PIN, GPIO_PIN_SET);     /* 释放复位 */
    HAL_Delay(120);                                                 /* 等驱动器稳定 */

    for (uint32_t i = 0; i < count; i++) {
        lcd_write_cmd(table[i].cmd);
        if (table[i].len > 0U && table[i].data != NULL) {
            lcd_write_data(table[i].data, table[i].len);
        }
    }
}`,explain:[{item:"hspi1（Mode 0、保守分频）",desc:"SPI 屏绝大多数认 Mode 0（CPOL=0、CPHA=0，SCK 空闲为低、第一个边沿采样）。分频先给几 MHz 量级，跑通后再逐档提速，出错就退回一档。"},{item:"DC / A0 引脚",desc:"这是 SPI 屏与普通 SPI 器件最大的区别：同一个 MOSI 上既传命令又传数据，靠 DC 电平区分。DC 配错或接反的典型现象是屏幕亮着但内容全乱或全黑。"},{item:"CS 覆盖整段",desc:"一帧 = 命令 + 参数（+ 像素）。CS 在中间抖动会被屏当成“帧结束”，命令被截断。所以填充大块像素时不要每字节 release 一次。"},{item:"lcd_write_cmd / lcd_write_data",desc:"两层只是 DC 电平不同，其余完全一样。写底层时把它们严格分开，后面所有“初始化表、开窗口、写像素”都变成调用，出错也容易定位。"},{item:"lcd_set_window（CASET / RASET / RAMWR）",desc:"先设列范围，再设行范围，最后一条“写显存”命令把光标定位到窗口左上角。坐标从 0 开始还是从 1 开始、扫描方向如何，都由初始化里的方向设置决定，接错会整体偏移或镜像。"},{item:"chunk 小块模板 + 循环发送",desc:"纯色填充不需要准备整屏缓冲：把 64 字节模板反复发出去即可，既省 RAM 又够快。换成图片时把模板换成显存块，发送逻辑不用改。"},{item:"HAL_SPI_Transmit 的 Size 参数",desc:"单位是字节。2 字节/像素时长度要写“像素数 × 2”，写成像素数只会发一半，典型现象是画面只填了左半边或颜色错位。"},{item:"超时 100 ms",desc:"SCK 没跑起来（时钟没开、引脚没配成复用、分频配错）时 HAL 会返回 HAL_TIMEOUT。SPI 没有 ACK，超时是你为数不多能立刻拿到的错误信号。"}]},{label:"寄存器",language:"c",code:`/* 寄存器视角：把“发一个字节”压到最底层，看清 CS / DC / 总线三者的边界。
   寄存器名沿用 RM0090 的 SPI 章节；GPIO 用 BSRR 置位/复位，避免读改写。 */

#define LCD_CS_MASK  GPIO_PIN_4     /* PA4 */
#define LCD_DC_MASK  GPIO_PIN_3     /* PA3 */

static inline void lcd_cs_low(void)  { GPIOA->BSRR = (uint32_t)LCD_CS_MASK << 16; }  /* 高 16 位写 1 → 输出低 */
static inline void lcd_cs_high(void) { GPIOA->BSRR = (uint32_t)LCD_CS_MASK; }        /* 低 16 位写 1 → 输出高 */
static inline void lcd_dc_low(void)  { GPIOA->BSRR = (uint32_t)LCD_DC_MASK << 16; }
static inline void lcd_dc_high(void) { GPIOA->BSRR = (uint32_t)LCD_DC_MASK; }

/* 前提：SPI1 时钟与引脚复用已配好、SPE 已置位（见 SPI 页的初始化说明） */
static void lcd_write_byte_raw(uint8_t b)
{
    while ((SPI1->SR & SPI_SR_TXE) == 0U) { }    /* 等发送缓冲空 */
    SPI1->DR = b;                                /* 写 DR 即开始 8 个时钟 */

    while ((SPI1->SR & SPI_SR_RXNE) == 0U) { }   /* 全双工：这 8 个时钟里也收进了一个字节 */
    (void)SPI1->DR;                              /* 读走并清 RXNE，否则下一帧会溢出 */

    while ((SPI1->SR & SPI_SR_BSY) != 0U) { }    /* 等最后一帧真正移完，再动 CS */
}

/* 发一条命令 + 两个参数：CS 全程拉低，只有 DC 在切换 */
static void lcd_cmd2(uint8_t cmd, uint8_t p0, uint8_t p1)
{
    lcd_cs_low();

    lcd_dc_low();   lcd_write_byte_raw(cmd);      /* 命令阶段：DC = 0 */
    lcd_dc_high();  lcd_write_byte_raw(p0);       /* 参数阶段：DC = 1 */
    lcd_write_byte_raw(p1);

    lcd_cs_high();                                 /* 一帧结束 */
}`,explain:[{item:"SPI1->SR 的 TXE / RXNE / BSY",desc:"TXE 发送缓冲空（可以写下一个字节）、RXNE 接收缓冲非空（必须读走）、BSY 帧忙（最后一位还在移）。轮询顺序就是“等 TXE → 写 DR → 等 RXNE → 读 DR → 等 BSY 清”。"},{item:"写 DR 就产生时钟",desc:"SPI 的时钟由主机硬件在你写 DR 的瞬间产生，不需要软件拉 SCK；这也是寄存器写法里看不到“时钟循环”的原因。"},{item:"GPIOA->BSRR",desc:"低 16 位写 1 置高、高 16 位写 1 置低，单次写完成，不会像“读-改-写”那样被中断打断而丢位。屏幕刷得快时这个细节很值钱。"},{item:"CS / DC 的先后",desc:"先拉低 CS 再改 DC，结束先抬 DC 再抬 CS；顺序反了会在帧边界留下多余的电平变化，个别驱动会把它当成新命令。"}]}],pitfalls:[{mistake:"忘了复位或复位延时不够，初始化序列照发",symptom:"背光亮但屏幕全黑或全白，SPI 波形看起来完全正常；重新上电偶尔又正常",fix:"确认 RES 先低后高，并按模块手册给足稳定延时；示波器量 RES 与第一条命令的间隔。驱动 IC 上电后状态未知，没复位就不认命令。"},{mistake:"RGB565 高低字节顺序搞反",symptom:"画纯色块时颜色不对（红变蓝之类），或整体偏色、颜色像被“洗过”",fix:"高字节先发是常见约定，但屏的字节序由初始化里的设置决定；先画红/绿/蓝三个纯色块验证，再调字节顺序。别靠猜。"},{mistake:"CS 在整块像素中途被拉高，或 HAL_SPI_Transmit 长度写成像素数",symptom:"只画出第一条线、只填了半屏，或画面整体错位一格",fix:"大块像素整段保持 CS 低、DC 高；长度参数是字节数 = 像素数 × 2。用逻辑分析仪数一帧里的 SCK 个数，与“像素数 × 16”对照。"},{mistake:"SCK 分频太高，或杜邦线太长",symptom:"短线上正常，换长排线或提高一档分频就花屏、偶发白屏；降速后恢复",fix:"逐档提高分频直到出错，然后退回一档留余量；缩短走线、让 SCK 远离干扰源。屏是容性负载，边沿变缓后采样点容易错。"},{mistake:"换了一块屏，却沿用上一块的初始化序列",symptom:"新屏上电不亮、花屏或颜色异常，而代码“在旧屏上明明是好的”",fix:"初始化序列绑定驱动 IC，不可混用：看模块丝印/例程确认是哪一类（常见 ST7735 类），换成对应表；顺便核对分辨率与坐标方向设置。"}],quizIds:["spi-q1","spi-q2","spi-q3"],labIds:["spi-mode","dma-transfer"]},{slug:"adc-sampler",title:"ADC + DMA 采样",oneLine:"让 ADC 连续扫描、DMA 自动搬运，CPU 只在半满和全满时取走数据并换算。",level:"进阶",hardware:["STM32F407 开发板","10 kΩ 量级电位器（做一路可调输入）","热敏电阻或光敏电阻模块（做第二路，可选）","万用表（对照读数）","杜邦线若干"],goal:["用 LSB = VREF+ / 2^n 把原始码换算成 mV，并说清读数为什么会跳","配出 ADC1 扫描 + 连续 + DMA2 循环，让两个通道的结果按 Rank 顺序落进数组","用半满 / 全满回调切出“安全区”，保证处理的那一半没被 DMA 改写","读数不准时按参考电压、采样时间、源阻抗、缓冲长度对齐四项排查"],wiring:[{signal:"通道 0",mcuPin:"PA0",device:"电位器中间抽头",note:"电位器两端分别接 3V3 与 GND，抽头电压 0~3.3 V；按你的板子原理图核对"},{signal:"通道 1",mcuPin:"PA1",device:"第二路 0~3.3 V 信号（热敏/光敏模块输出）",note:"模块输出务必确认在 0~VREF+ 之内；按你的板子原理图核对"},{signal:"模拟供电",mcuPin:"3V3 / GND",device:"传感器模块 VCC / GND",note:"模拟地与功率地单点相连，传感器地就近回到板子 GND；按你的板子原理图核对"},{signal:"参考电压",mcuPin:"VREF+ / VDDA",device:"（板载去耦，不额外接线）",note:"小封装常把 VREF+ 与 VDDA 连在一起：供电有纹波，读数就跟着抖；按你的板子原理图核对"}],steps:[{title:"① 先接一个“确定电压”的输入",detail:"用 10 kΩ 量级电位器做 PA0 的输入，两端接 3V3 与 GND。为什么先用电位器：它能给出任意已知电压，等于给整套采样链路配了一把可对照的尺子，后面所有校验都靠它。"},{title:"② 开时钟、把引脚配成模拟模式",detail:"ADC1 挂 APB2、DMA2 与 GPIOA 挂 AHB1；PA0 / PA1 设成 GPIO_MODE_ANALOG，断开数字输入缓冲。配成普通输入或复用会引入额外漏电与干扰，读数会莫名偏低或跳。"},{title:"③ 配 ADC 基础参数",detail:"12 位、扫描、连续、软件触发、右对齐。F4 还要通过 ADC->CCR 的 ADCPRE 决定 ADC 时钟，别超过手册规定的上限——超了不是“算得慢”，而是结果不可信。"},{title:"④ 排序列与采样时间",detail:"Rank 1 = 通道 0，Rank 2 = 通道 1；采样时间先给长档（如 84 个 ADC 周期这一档，编码见手册）。源阻抗越高，采样电容越充不满，读数会系统性偏低——长档就是给电容留时间。"},{title:"⑤ 配 DMA：外设固定、内存自增、半字宽、循环",detail:"DMA2_Stream0 / Channel 0（ADC1 的请求映射，见参考手册），方向外设→内存，外设地址固定为 ADC1->DR，内存地址自增，两端半字宽，循环模式。长度填缓冲元素个数，不是字节数。"},{title:"⑥ 校准，然后启动",detail:"先 HAL_ADCEx_Calibration_Start 补偿内部失调，再 HAL_ADC_Start_DMA。校准期间不要触发转换；省掉校准，输入接地也可能读到几十个码。"},{title:"⑦ 在回调里切“安全区”",detail:"循环模式下缓冲一直被覆盖：半满回调里处理前半，全满回调里处理后半，这样你读的一半保证不是 DMA 正在写的一半。回调里只置标志，换算放主循环。"},{title:"⑧ 用万用表对照，再调参数",detail:"把 mV 结果与万用表读数比对：整体偏低→采样时间或源阻抗；零点偏移→没校准；跳得厉害→参考电压/地不干净。用 adc-sampling 实验看“采样时间不足”的读数长什么样，比背结论直观。"}],code:[{label:"HAL",language:"c",code:`#include "stm32f4xx_hal.h"

/* 硬件：PA0 = ADC1_IN0，PA1 = ADC1_IN1（按你的板子原理图核对通道号） */
#define ADC_CH_NUM   2U     /* 序列里几个通道 */
#define ADC_BUF_LEN  64U    /* 必须是 ADC_CH_NUM 的整数倍，半满/全满才正好落在通道边界上 */

ADC_HandleTypeDef hadc1;
DMA_HandleTypeDef hdma_adc1;

static uint16_t g_adcBuf[ADC_BUF_LEN];     /* DMA 一直在写，必须是常驻内存 */
static volatile uint32_t g_halfReady = 0;  /* 前半可读 */
static volatile uint32_t g_fullReady = 0;  /* 后半可读 */

/* 原始码 → 毫伏：12 位、3.3 V 参考，1 个码约 0.81 mV（量级示意） */
static uint32_t adc_to_mv(uint16_t raw)
{
    return ((uint32_t)raw * 3300U) / 4095U;   /* 用 4095 归一更接近满量程定义，与 4096 的差别可忽略 */
}

void App_ADC_Start(void)
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

    /* 3. DMA：外设地址固定、内存自增、半字宽、循环 */
    hdma_adc1.Instance                 = DMA2_Stream0;
    hdma_adc1.Init.Channel             = DMA_CHANNEL_0;          /* ADC1 的请求映射，见参考手册 */
    hdma_adc1.Init.Direction           = DMA_PERIPH_TO_MEMORY;
    hdma_adc1.Init.PeriphInc           = DMA_PINC_DISABLE;       /* DR 就一个地址 */
    hdma_adc1.Init.MemInc              = DMA_MINC_ENABLE;        /* 数组下标递增 */
    hdma_adc1.Init.PeriphDataAlignment = DMA_PDATAALIGN_HALFWORD;
    hdma_adc1.Init.MemDataAlignment    = DMA_MDATAALIGN_HALFWORD;
    hdma_adc1.Init.Mode                = DMA_CIRCULAR;           /* 装满自动回到开头 */
    hdma_adc1.Init.Priority            = DMA_PRIORITY_HIGH;
    if (HAL_DMA_Init(&hdma_adc1) != HAL_OK) { Error_Handler(); }

    __HAL_LINKDMA(&hadc1, DMA_Handle, hdma_adc1);                /* 把 DMA 挂到 ADC 句柄上 */

    /* 4. 中断：必须开 NVIC，否则回调永远不来 */
    HAL_NVIC_SetPriority(DMA2_Stream0_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(DMA2_Stream0_IRQn);

    /* 5. ADC 基础参数：12 位、扫描、连续、软件触发、右对齐 */
    hadc1.Instance                   = ADC1;
    hadc1.Init.ClockPrescaler        = ADC_CLOCK_SYNC_PCLK_DIV4;  /* ADC 时钟分频，别超手册上限 */
    hadc1.Init.Resolution            = ADC_RESOLUTION_12B;
    hadc1.Init.ScanConvMode          = ENABLE;                    /* 多通道必须开扫描 */
    hadc1.Init.ContinuousConvMode    = ENABLE;                    /* 一轮结束自动开始下一轮 */
    hadc1.Init.DiscontinuousConvMode = DISABLE;
    hadc1.Init.ExternalTrigConv      = ADC_SOFTWARE_START;        /* 先软件触发；要定时采样改定时器 TRGO */
    hadc1.Init.DataAlign             = ADC_DATAALIGN_RIGHT;
    hadc1.Init.DMAContinuousRequests = ENABLE;                    /* 循环模式下持续发 DMA 请求 */
    if (HAL_ADC_Init(&hadc1) != HAL_OK) { Error_Handler(); }

    /* 6. 通道与采样时间：Rank 决定转换顺序，也决定 DMA 写进数组的下标 */
    ADC_ChannelConfTypeDef ch = {0};
    ch.Channel      = ADC_CHANNEL_0;
    ch.Rank         = 1;
    ch.SamplingTime = ADC_SAMPLETIME_84CYCLES;   /* 源阻抗高就用更长档，见数据手册 */
    if (HAL_ADC_ConfigChannel(&hadc1, &ch) != HAL_OK) { Error_Handler(); }

    ch.Channel = ADC_CHANNEL_1;
    ch.Rank    = 2;
    if (HAL_ADC_ConfigChannel(&hadc1, &ch) != HAL_OK) { Error_Handler(); }

    /* 7. 校准 → 启动；搬运长度 = 缓冲元素个数 */
    HAL_ADCEx_Calibration_Start(&hadc1);
    HAL_ADC_Start_DMA(&hadc1, (uint32_t *)g_adcBuf, ADC_BUF_LEN);
}

/* 8. 半满：g_adcBuf[0 .. 31] 已就绪，后一半正在被写 */
void HAL_ADC_ConvHalfCpltCallback(ADC_HandleTypeDef *hadc)
{
    if (hadc->Instance == ADC1) {
        g_halfReady = 1;      /* 回调里只置标志；换算、滤波、上报放主循环 */
    }
}

/* 9. 全满：g_adcBuf[32 .. 63] 已就绪，循环模式下已从头继续写 */
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc)
{
    if (hadc->Instance == ADC1) {
        g_fullReady = 1;
    }
}

/* 10. 主循环里消费：每一半都按“通道 0、通道 1、通道 0…”的顺序排列 */
void App_ADC_Poll(void)
{
    if (g_halfReady) {
        g_halfReady = 0;
        uint32_t mv0 = adc_to_mv(g_adcBuf[0]);    /* 前半第一个元素 = 通道 0 */
        uint32_t mv1 = adc_to_mv(g_adcBuf[1]);    /* 第二个元素 = 通道 1 */
        (void)mv0; (void)mv1;
    }
    if (g_fullReady) {
        g_fullReady = 0;
        uint32_t mv0 = adc_to_mv(g_adcBuf[ADC_BUF_LEN / 2U]);
        uint32_t mv1 = adc_to_mv(g_adcBuf[ADC_BUF_LEN / 2U + 1U]);
        (void)mv0; (void)mv1;
    }
}`,explain:[{item:"ADC_BUF_LEN 必须是 ADC_CH_NUM 的整数倍",desc:"这是最容易忽略的一条：缓冲区按通道数循环排列，半满和全满必须正好落在“通道边界”上。长度不是通道数整数倍时，两半的交界处通道就错位，表现为“某些采样值突然跑到另一路”。"},{item:"GPIO_MODE_ANALOG",desc:"模拟模式断开数字输入缓冲，减小漏电与干扰。配成输入模式时漏电流会随温度变化，读数出现说不清的漂移。"},{item:"DMA 的 PeriphInc / MemInc",desc:"外设地址是 ADC1->DR，只有一个地址，所以 PeriphInc 关；内存要依次填数组，所以 MemInc 开。两个配反的典型现象是数组里全是同一个值。"},{item:"Mode = DMA_CIRCULAR",desc:"NDTR 到 0 自动重装，采集永不停。代价是缓冲一直被覆盖，所以读数据必须靠 HT/TC 判断安全区，不能想读就读。"},{item:"ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4",desc:"ADC 时钟由 PCLK2 分频得到，分频系数要在数据手册规定的 ADC 时钟上限内。分频不够不是“速度快”，而是转换结果失去意义。"},{item:"ch.Rank",desc:"Rank 决定通道在序列里的位置，也决定 DMA 把它写进数组的哪个下标。改 Rank 必须同步改数组与换算代码的对应关系，否则两路数据张冠李戴。"},{item:"HAL_ADCEx_Calibration_Start",desc:"补偿内部失调，必须在使能 ADC 之后、启动转换之前做，校准期间不要触发转换。省掉它，输入接地也可能读到几十个码的固定偏差。"},{item:"HAL_NVIC_EnableIRQ(DMA2_Stream0_IRQn)",desc:"DMA 侧的中断使能位与 NVIC 使能是两道门，都开了才进 ISR。只配 DMA 不开 NVIC，数据照搬、回调永远不来，是最常见的“明明在采却读不到”。"},{item:"HAL_ADC_ConvHalfCpltCallback / HAL_ADC_ConvCpltCallback",desc:"HAL 约定的弱函数，用户自己实现覆盖。半满处理前半、全满处理后半，处理的那一半保证不会被 DMA 同时改写。回调里只置标志，别做浮点换算与串口打印。"},{item:"adc_to_mv 用 4095 归一",desc:"LSB = VREF+ / 4096，而满量程码是 4095，两种归一差在千分之几，远小于噪声与参考误差。真正决定读数准不准的是参考电压、采样时间与地，不是这个常数。"}]},{label:"寄存器",language:"c",code:`/* 寄存器视角：同一套“扫描 + 连续 + DMA”落在哪几个 ADC 寄存器上。
   时钟、引脚与 DMA 侧的配置略（见 DMA 页），这里只看 ADC 本体。 */

/* 1. ADC 时钟：ADC->CCR 的 ADCPRE 决定分频，别超过数据手册上限 */
ADC->CCR = (ADC->CCR & ~ADC_CCR_ADCPRE) | ADC_CCR_ADCPRE_0;

/* 2. 采样时间：通道 0、1 都取较长档（编码与周期数对照见手册 ADC 章节） */
ADC1->SMPR2 |= ADC_SMPR2_SMP0_2 | ADC_SMPR2_SMP1_2;

/* 3. 序列：L 字段 = 转换个数 − 1（这里 2 个）；SQ1 = 通道 0，SQ2 = 通道 1 */
ADC1->SQR1 = ADC_SQR1_L_0 | ADC_SQR1_SQ2_0;

/* 4. 扫描 + 连续 + DMA + 每轮都发请求（DDS），最后打开 ADON */
ADC1->CR1 |= ADC_CR1_SCAN;
ADC1->CR2 |= ADC_CR2_CONT | ADC_CR2_DMA | ADC_CR2_DDS | ADC_CR2_ADON;

/* 5. 软件触发第一轮；此后由 DMA 把每个 EOC 结果搬走，CPU 不碰 DR */
ADC1->CR2 |= ADC_CR2_SWSTART;

/* 不要把 DR 读出来：多通道时读 DR 会与 DMA 抢同一个结果寄存器，
   结果被覆盖或错位，典型现象是“两路数据一会儿一样一会儿乱”。 */`,explain:[{item:"ADC->CCR 的 ADCPRE",desc:"公共寄存器，给 ADC 提供分频后的时钟（F4 可选 2/4/6/8 分频）。分频太小会超过手册规定的 ADC 时钟上限，转换结果不可信。"},{item:"ADC1->SMPR2",desc:"通道 0~9 的采样时间字段，通道 10 及以上在 SMPR1。字段编码与周期数的对照表在手册 ADC 章节，别自己按位去猜。"},{item:"ADC1->SQR1 的 L 字段",desc:"L = 转换个数 − 1。L 写错，序列长度就错，DMA 的长度也对不上，表现为数组里混进了上一轮的值。"},{item:"ADC_CR1_SCAN / CR2 的 CONT、DMA、DDS",desc:"SCAN 开扫描；CONT 连续转换；DMA 允许 DMA 请求；DDS 决定每轮结束后是否继续发请求。四个位组合起来才是“不间断地轮着采多个通道”。"},{item:"CR2 的 SWSTART 与 ADON",desc:"先 ADON 再 SWSTART，顺序反了触发会被忽略。ADON 之后还要等稳定时间（见手册），立刻触发可能拿到无效值。"}]}],pitfalls:[{mistake:"参考电压/模拟地不干净，或拿开关电源的 3.3 V 当基准",symptom:"同一电压重复测差好几个码；电机一转、手一摸板子读数就变",fix:"查 VDDA/VREF+ 的去耦电容与走线，模拟地与功率地单点连接；有独立 VREF+ 引脚就外接基准。先量参考电压本身稳不稳，再怀疑 ADC。"},{mistake:"采样时间太短或源阻抗太高",symptom:"读数系统性偏低；换到下一个通道时，前一个通道的电压“残留”过来（串扰）",fix:"按 t_s ≥ (R_AIN + R_ADC)·C_ADC·ln(2^(n+1)) 估算（示意），选更长档；源阻抗高就加运放缓冲或在输入端并小电容，别指望软件滤波救回来。"},{mistake:"缓冲区长度不是通道数的整数倍",symptom:"大部分数据正常，但每半块交界处有几组数据明显串到另一路；改一下长度又“好了”",fix:"让 BUF_LEN = 通道数 × 整数，半满/全满才落在通道边界上；再核对 Rank 顺序与数组下标是否一一对应。"},{mistake:"多通道扫描却只读一次 DR，或没开 DMA",symptom:"两路读出来几乎一样，或拿到的总是最后一个通道的值",fix:"扫描模式下所有通道都写同一个 DR，必须用 DMA（或每个 EOC 中断读一次）。用 DMA 时 CPU 不要再读 DR，否则和搬运抢结果。"},{mistake:"输入电压超出 0 ~ VREF+ 范围",symptom:"读数饱和在 4095 或 0；输入接 12 V 或负压时芯片发热，甚至整片损坏",fix:"先分压或运放衰减到量程内，再串限流电阻并加钳位；上电前用万用表逐路确认电压在范围内。ADC 的保护二极管只能兜底，不能当量程用。"}],quizIds:["adc-q1","adc-q2","adc-q3"],labIds:["adc-sampling","dma-transfer"]},{slug:"can-node",title:"CAN 节点收发",oneLine:"两块板各加一个收发器，配好位定时与过滤器，就能互相收到对方发来的 CAN 帧。",level:"综合",hardware:["STM32F407 开发板 × 2","CAN 收发器模块 × 2（TJA1050 / SN65HVD230 一类）","120 Ω 终端电阻 × 2","双绞线一段 + 杜邦线","USB-CAN 分析仪（可选，抓包与对照）"],goal:["说清 CANH/CANL 差分与显性/隐性，以及为什么只在总线两端各加一个 120 Ω","按 PCLK1 与目标波特率算出 BRP/TS1/TS2，并说出采样点大约落在位时间的哪个位置","用掩码模式过滤器只收关心的 ID，并在 FIFO0 回调里取帧、释放邮箱","单板先回环自测、双板再上总线，能按 TEC/REC 与 ACK 错误定位物理层问题"],wiring:[{signal:"CAN_RX",mcuPin:"PB8",device:"收发器模块 RXD（或 CRX）",note:"F407 上 PB8 复用为 CAN1_RX（AF9）；模块丝印以实物为准；按你的板子原理图核对（部分板子用 PA11/PA12）"},{signal:"CAN_TX",mcuPin:"PB9",device:"收发器模块 TXD（或 CTX）",note:"MCU 的 TX 接模块的 TX 输入，不要与 RX 交叉；按你的板子原理图核对"},{signal:"模块供电与地",mcuPin:"5V / 3V3 与 GND",device:"收发器模块 VCC / GND",note:"供电电压按模块要求选，别把 5 V 供电模块直接当 3.3 V 用；按你的板子原理图核对"},{signal:"CANH",mcuPin:"—（经收发器）",device:"对端节点 CANH",note:"两个节点的 CANH 对接、CANL 对接，两根线绞在一起走；按你的板子原理图核对"},{signal:"CANL / 终端",mcuPin:"—（经收发器）",device:"对端节点 CANL + 两端各一个 120 Ω",note:"终端电阻只加在总线物理两端，中间节点不加；按你的板子原理图核对"}],steps:[{title:"① 先把物理层接对，再谈代码",detail:"两个节点各一个收发器，CANH 对 CANH、CANL 对 CANL，用双绞线；只在总线两端各加一个 120 Ω。为什么第一步是接对线：CAN 的 ACK 与差分电平都在物理层，线不对时软件再对也发不出去。"},{title:"② 配时钟与复用引脚，确认 PCLK1",detail:"打开 CAN1 与 GPIOB 时钟，PB8/PB9 配成复用推挽（AF9，具体复用号查数据手册复用表）。F407 上 CAN1 挂在 APB1，先记下 PCLK1 的频率——位定时的每个数都从它算出来。"},{title:"③ 算位定时，两个节点必须完全一致",detail:"按 500 kbit/s 量级取一组参数：PCLK1 = 42 MHz 量级时，BRP=6、TS1=11、TS2=2，则 42 MHz / 6 / (1+11+2) = 500 kbit/s，采样点约 (1+11)/14 ≈ 85.7%（均为量级示意，必须按手册重算）。两边三个参数差一点，就会互相报位错误。"},{title:"④ 单板先回环自测",detail:"把模式设成 CAN_MODE_LOOPBACK，自己发自己收，验证“过滤器 → FIFO → 回调”这条软件链路。为什么先回环：它把“软件写错”和“总线不通”两类问题分开了，排查范围立刻减半。"},{title:"⑤ 配过滤器：只放行你关心的 ID",detail:"掩码模式下把标准 ID 左移 5 位放进 FilterIdHigh，掩码写 0x7FF << 5 表示 11 位全比较，命中进 FIFO0。不做过滤会把所有帧都收进来，CPU 来不及取就冲爆 FIFO，表现为“偶发丢帧”。"},{title:"⑥ 启动顺序不能颠倒",detail:"HAL_CAN_Init → HAL_CAN_ConfigFilter → HAL_CAN_Start → HAL_CAN_ActivateNotification。过滤器必须在 Start 之前配好，否则启动瞬间收到的帧会因为“没有过滤器”被全部丢掉。"},{title:"⑦ 收发：发靠邮箱，收靠 FIFO",detail:"HAL_CAN_AddTxMessage 把帧丢进空闲邮箱就返回，真正的仲裁、ACK 检查与重发全由硬件完成；接收在 HAL_CAN_RxFifo0MsgPendingCallback 里用 HAL_CAN_GetRxMessage 取帧，取完 FIFO 自动释放。"},{title:"⑧ 用错误计数器定位问题",detail:"两块板对发，看 ID/DLC/数据是否符合预期；再用 MSR 里的错误计数器判断：TEC 飞涨基本是物理层（终端、波特率、没有第二节点应答 ACK），REC 涨则重点查接收侧采样点与过滤器。"}],code:[{label:"HAL",language:"c",code:`#include "stm32f4xx_hal.h"

CAN_HandleTypeDef hcan1;
CAN_TxHeaderTypeDef txHeader;
CAN_RxHeaderTypeDef rxHeader;

/* 位定时量级示例：PCLK1 = 42 MHz 量级时，
   42 MHz / 6 / (1 + 11 + 2) = 500 kbit/s，采样点 ≈ 85.7%。
   这只是“量级示意”，换板子/换 PCLK1 必须按参考手册重算，
   并且全网的 BRP、TS1、TS2 必须完全一致。 */
#define CAN_PRESCALER   6U
#define CAN_TS1         CAN_BS1_11TQ
#define CAN_TS2         CAN_BS2_2TQ

static void App_CAN_Init(uint32_t mode)
{
    /* 1. 工作模式与位定时；时钟与 PB8/PB9 复用由 CubeMX 生成部分完成 */
    hcan1.Instance                  = CAN1;
    hcan1.Init.Prescaler            = CAN_PRESCALER;      /* BRP */
    hcan1.Init.Mode                 = mode;               /* 单板调试先用 CAN_MODE_LOOPBACK */
    hcan1.Init.SyncJumpWidth        = CAN_SJW_1TQ;        /* 重同步跳转宽度，先取 1 TQ */
    hcan1.Init.TimeSeg1             = CAN_TS1;            /* 传播段 + 相位缓冲段 1 */
    hcan1.Init.TimeSeg2             = CAN_TS2;            /* 相位缓冲段 2 */
    hcan1.Init.TimeTriggeredMode    = DISABLE;            /* 时间触发模式，一般不用 */
    hcan1.Init.AutoBusOff           = ENABLE;             /* 总线关闭后由硬件自动恢复 */
    hcan1.Init.AutoWakeUp           = DISABLE;            /* 自动唤醒只在睡眠模式下有意义 */
    hcan1.Init.AutoRetransmission   = ENABLE;             /* 仲裁失败/出错后硬件自动重发 */
    hcan1.Init.ReceiveFifoLocked    = DISABLE;            /* FIFO 满时覆盖旧帧，而不是锁死 */
    hcan1.Init.TransmitFifoPriority = DISABLE;            /* 按 ID 优先级排队，而不是入队顺序 */
    if (HAL_CAN_Init(&hcan1) != HAL_OK) { Error_Handler(); }

    /* 2. 过滤器：只让标准 ID 0x123 进 FIFO0（掩码模式，32 位尺度） */
    CAN_FilterTypeDef filter = {0};
    filter.FilterBank           = 0;                          /* 过滤器组 0 */
    filter.FilterMode           = CAN_FILTERMODE_IDMASK;      /* 掩码模式：只比较 mask 里为 1 的位 */
    filter.FilterScale          = CAN_FILTERSCALE_32BIT;
    filter.FilterIdHigh         = (uint16_t)(0x123U << 5);    /* 标准 ID 在 32 位里左对齐，故左移 5 位 */
    filter.FilterIdLow          = 0x0000;
    filter.FilterMaskIdHigh     = (uint16_t)(0x7FFU << 5);    /* 11 位全比较 */
    filter.FilterMaskIdLow      = 0x0000;
    filter.FilterFIFOAssignment = CAN_FILTER_FIFO0;           /* 命中的帧进 FIFO0 */
    filter.FilterActivation     = ENABLE;
    if (HAL_CAN_ConfigFilter(&hcan1, &filter) != HAL_OK) { Error_Handler(); }

    /* 3. 启动 CAN，并打开 FIFO0 接收中断（顺序不能颠倒：过滤器先于 Start） */
    if (HAL_CAN_Start(&hcan1) != HAL_OK) { Error_Handler(); }
    if (HAL_CAN_ActivateNotification(&hcan1, CAN_IT_RX_FIFO0_MSG_PENDING) != HAL_OK) {
        Error_Handler();
    }

    HAL_NVIC_SetPriority(CAN1_RX0_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(CAN1_RX0_IRQn);       /* 不开 NVIC，回调永远不会来 */
}

/* 4. 发一帧标准数据帧：放进邮箱就返回，仲裁与重发由硬件完成 */
HAL_StatusTypeDef App_CAN_Send(uint32_t stdId, const uint8_t *data, uint8_t len)
{
    uint32_t txMailbox = 0;

    if (len > 8U) {                          /* 经典 CAN 一帧最多 8 字节 */
        return HAL_ERROR;
    }

    txHeader.StdId = stdId;                  /* 11 位标准 ID，数值越小优先级越高 */
    txHeader.ExtId = 0U;                     /* 标准帧不用扩展 ID */
    txHeader.IDE   = CAN_ID_STD;             /* 标准帧；扩展帧用 CAN_ID_EXT + ExtId */
    txHeader.RTR   = CAN_RTR_DATA;           /* 数据帧；远程帧用 CAN_RTR_REMOTE */
    txHeader.DLC   = len;                    /* 数据长度码，0~8 */
    txHeader.TransmitGlobalTime = DISABLE;   /* 不用时间戳 */

    return HAL_CAN_AddTxMessage(&hcan1, &txHeader, (uint8_t *)data, &txMailbox);
}

/* 5. FIFO0 收到帧：取出来、看完就自动释放该邮箱 */
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan)
{
    uint8_t rxData[8];

    if (HAL_CAN_GetRxMessage(hcan, CAN_RX_FIFO0, &rxHeader, rxData) == HAL_OK) {
        /* rxHeader.StdId / rxHeader.DLC / rxData[] 就是这一帧的全部内容。
           DLC 只表示长度，字节含义由应用层约定，CAN 本体不关心。 */
        if (rxHeader.StdId == 0x123U && rxHeader.DLC == 4U) {
            /* 例如：把 4 字节当作一个 32 位数值（注意大小端与你的协议约定） */
            uint32_t value = ((uint32_t)rxData[0] << 24) |
                             ((uint32_t)rxData[1] << 16) |
                             ((uint32_t)rxData[2] << 8)  |
                              (uint32_t)rxData[3];
            (void)value;
        }
    }
}

/* 6. 中断入口：名字必须与启动文件里的向量表一致 */
void CAN1_RX0_IRQHandler(void)
{
    HAL_CAN_IRQHandler(&hcan1);
}`,explain:[{item:"Prescaler / TimeSeg1 / TimeSeg2",desc:"三者共同决定位时间与采样点：波特率 = f_CAN / (BRP × (1 + TS1 + TS2))。这里填的 6 / 11TQ / 2TQ 只是量级示意，真实值必须按你的 PCLK1 与目标波特率反算，并核对采样点位置。"},{item:"TimeSeg1 = 传播段 + 相位缓冲段 1",desc:"CAN 的位时间被切成同步段、传播段、相位缓冲段 1、2。HAL 把传播段与相位缓冲段 1 合在 TimeSeg1 里，所以“位总 TQ 数 = 1 + TS1 + TS2”，算采样点时别漏掉同步段那 1 个 TQ。"},{item:"Mode = CAN_MODE_LOOPBACK",desc:"单板调试用回环模式，自己发自己收，不依赖总线上有没有第二个节点。直接上正常模式又没有第二个节点应答 ACK，TEC 会一路涨到总线关闭，看起来像“代码坏了”。"},{item:"AutoRetransmission = ENABLE",desc:"仲裁失败或出错后由硬件自动重发，这是 CAN“无损仲裁”得以成立的前提。关掉它等于放弃规范特性，除非你明确只做一次性发送。"},{item:"FilterIdHigh = 0x123 << 5",desc:"标准帧的 11 位 ID 在 32 位过滤器里是左对齐的（占高位），所以要左移 5 位再写进高半部分。这一处写错，一个帧都收不到，而发送侧看起来完全正常。"},{item:"FilterMaskIdHigh = 0x7FF << 5",desc:"掩码里为 1 的位必须匹配，为 0 的位不关心。要验证“硬件通路是否通”，先把掩码全清零做全通过测试，再逐位收紧。"},{item:"HAL_CAN_ConfigFilter 在 HAL_CAN_Start 之前",desc:"过滤器属于接收路径，必须在使能 CAN 之前配好。顺序反了，上电瞬间到达的帧会因为“还没过滤器”被丢弃，表现为“偶尔收不到第一帧”。"},{item:"HAL_CAN_ActivateNotification + CAN1_RX0_IRQn",desc:"两道门：外设侧的中断允许位（ActivateNotification）与 NVIC 使能（CAN1_RX0_IRQn）。两处都开，中断里还要调 HAL_CAN_IRQHandler，回调才会被调用。"},{item:"HAL_CAN_AddTxMessage",desc:"把帧放进一个空闲发送邮箱并立即返回。真正的仲裁、ACK 检查、错误帧与重发全由 bxCAN 硬件完成，txMailbox 告诉你用了哪个邮箱。"},{item:"HAL_CAN_GetRxMessage",desc:"从 FIFO 取出最早的一帧；取完该邮箱自动释放。只取不释放、或回调里处理太慢，FIFO 满了就会开始覆盖/丢帧。"},{item:"DLC 与数据含义",desc:"DLC 只表示“几个字节”，不表示内容。多个节点用同一 ID 发不同含义的数据是设计错误：仲裁只解决“谁先说”，不解决“谁该用哪个 ID”。"}]},{label:"寄存器",language:"c",code:`/* 寄存器视角（bxCAN）：进入初始化 → 写位定时 → 配过滤器 → 退出初始化。
   STM32 的 LL 库没有覆盖 CAN 外设，所以这一栏只能落到寄存器；
   寄存器名与位定义以 RM0090 的 bxCAN 章节为准。 */

/* 1. 请求进入初始化模式，并等硬件确认（此时才能改 BTR 与过滤器） */
CAN1->MCR |= CAN_MCR_INRQ;
while ((CAN1->MSR & CAN_MSR_INAK) == 0U) { }

/* 2. 位定时：BRP / TS1 / TS2 三个字段写“实际值 − 1”（数值为量级示意） */
CAN1->BTR = ((6U - 1U)  << CAN_BTR_BRP_Pos)     /* 预分频 */
          | ((12U - 1U) << CAN_BTR_TS1_Pos)     /* 传播段 + 相位缓冲段 1 */
          | ((3U - 1U)  << CAN_BTR_TS2_Pos)     /* 相位缓冲段 2 */
          | (0U         << CAN_BTR_SJW_Pos);    /* SJW = 1 TQ */

/* 3. 过滤器：组 0 = 32 位、掩码模式、只关心标准 ID 0x123、命中进 FIFO0 */
CAN1->FMR |= CAN_FMR_FINIT;                     /* 过滤器有独立的初始化模式 */
CAN1->FM1R &= ~(1U << 0);                       /* 0 = 掩码模式（1 = 标识符列表模式） */
CAN1->FS1R |= (1U << 0);                        /* 1 = 32 位尺度 */
CAN1->sFilterRegister[0].FR1 = (0x123U << 21);  /* 要匹配的标准 ID，左对齐（位布局见手册） */
CAN1->sFilterRegister[0].FR2 = (0x7FFU << 21);  /* 掩码：只比较这 11 位 */
CAN1->FFA1R &= ~(1U << 0);                      /* 0 = 进 FIFO0（1 = FIFO1） */
CAN1->FA1R |= (1U << 0);                        /* 激活组 0 */
CAN1->FMR &= ~CAN_FMR_FINIT;                    /* 退出过滤器初始化 */

/* 4. 退出初始化模式，真正上线收发 */
CAN1->MCR &= ~CAN_MCR_INRQ;
while ((CAN1->MSR & CAN_MSR_INAK) != 0U) { }`,explain:[{item:"CAN_MCR_INRQ / CAN_MSR_INAK",desc:"一个请求、一个确认：写 INRQ 之后必须等 INAK 置位，才说明真的停在初始化模式。不等就写 BTR，配置可能整段不生效。"},{item:"CAN1->BTR 的“−1”编码",desc:"BRP、TS1、TS2 三个字段存的都是“实际值 − 1”。少减 1 或多减 1，波特率整体偏掉，表现为对端满屏位错误。"},{item:"CAN_FMR_FINIT",desc:"过滤器有独立的初始化模式：改 FM1R / FS1R / FFA1R / FA1R 之前必须先置位，改完再清，否则写入无效。"},{item:"sFilterRegister[0].FR1 / FR2",desc:"32 位尺度下 FR1 放要匹配的 ID、FR2 放掩码，标准 ID 在 32 位里左对齐（这里是 << 21）。具体位布局对照手册的过滤器章节，别按 16 位去算。"},{item:"CAN1->MSR 的错误计数器",desc:"TEC 一路涨到 255 几乎总是物理层问题：终端电阻缺失、两端位定时不一致、总线上没有第二个节点应答 ACK。REC 涨则重点查接收侧采样点与过滤器。"}]}],pitfalls:[{mistake:"终端电阻没接，或只在板子上接了一个",symptom:"桌面上短线低速看着能通，一加长线或提速就满屏错误帧，TEC 飞涨直到总线关闭",fix:"断电用万用表量 CANH 与 CANL 之间：两端各一个 120 Ω 时应量到 60 Ω 量级；量到 120 Ω 说明只有一个，量到很大说明一个都没接。终端只加在总线物理两端。"},{mistake:"两个节点的 BRP / TS1 / TS2 不一致",symptom:"单板回环完全正常，一接总线双方都发不出去；逻辑分析仪量到的位宽与对方对不上",fix:"按各自的 PCLK1 分别重算位定时（BRP = f_CAN / (波特率 × 位总 TQ 数)），核对采样点；两块板 PCLK1 不同则不能抄同一组参数。用示波器量一位的实际宽度交叉验证。"},{mistake:"过滤器写错：ID 没左对齐、组没激活、FIFO 分配错",symptom:"TSR 显示发送成功，但 HAL_CAN_GetRxMessage 永远拿不到帧、接收中断不触发",fix:"先把掩码全清零做“全通过”测试，确认硬件通路与中断没问题，再逐位收紧掩码。重点查 FA1R 是否激活、FFA1R 的 FIFO 分配、标准 ID 有没有左移 5 位。"},{mistake:"总线上只有自己一个节点，却在正常模式下等发送成功",symptom:"AddTxMessage 返回成功，但邮箱一直不空，TEC 持续上涨并报 ACK 错误，最后总线关闭",fix:"ACK 需要至少一个其他节点来拉低 ACK 槽。单板调试先改 CAN_MODE_LOOPBACK，或接第二块板/分析仪；这不是代码 bug，是拓扑缺了应答方。"},{mistake:"两个节点用同一个 ID 发不同内容",symptom:"同一 ID 的报文时而来自另一个节点、内容被覆盖；同时发送时还会在数据段分叉、触发位错误与反复重传",fix:"维护一张全网 ID 分配表（ID、发送节点、周期、含义），抓包按 ID 分组统计来源与周期。仲裁只解决“谁先说”，不解决“谁该用哪个 ID”。"}],quizIds:["can-q1","can-q2","can-q3"],labIds:["can-arbitration","nvic-interrupt"]},{slug:"dma-uart",title:"DMA 串口搬运",oneLine:"把串口收发交给 DMA：CPU 只写起始地址和长度，剩下的搬运全由硬件完成。",level:"进阶",hardware:["STM32F407 开发板","USB-TTL 串口模块（3.3 V 电平）","杜邦线（TX/RX/GND 三根）","电脑串口助手","逻辑分析仪（可选，看线上字节）"],goal:["说清 __HAL_LINKDMA 做了什么，为什么发送挂 hdmatx、接收挂 hdmarx","写出 USART1 的 DMA 发送（单次）与 DMA 接收（循环 + 半满回调）","解释为什么 DMA 缓冲不能是栈上的局部数组","偶发丢字节或乱码时，能按缓冲生命周期、NDTR 单位、NVIC、空闲中断四项排查"],wiring:[{signal:"TX",mcuPin:"PA9",device:"USB-TTL 模块 RXD",note:"MCU 的 TX 接模块的 RXD，交叉对接；按你的板子原理图核对"},{signal:"RX",mcuPin:"PA10",device:"USB-TTL 模块 TXD",note:"MCU 的 RX 接模块的 TXD；接反的表现是“能发不能收”或完全没数据；按你的板子原理图核对"},{signal:"地",mcuPin:"GND",device:"USB-TTL 模块 GND",note:"必须共地，否则电平没有共同参考，收到的常常是乱码；按你的板子原理图核对"},{signal:"电平确认",mcuPin:"3V3",device:"模块 VCC（按模块要求）",note:"MCU 是 3.3 V 逻辑，模块跳线选 3.3 V 档；5 V 电平直连可能损坏引脚；按你的板子原理图核对"}],steps:[{title:"① 先把“轮询版”跑通，再上 DMA",detail:"接好 TX/RX/GND，用 HAL_UART_Transmit 轮询发一句 hello，串口助手能看到。为什么先轮询：一次只引入一个变量，确认波特率、接线、电平都对，后面 DMA 出问题时才有对照基准。"},{title:"② 查请求映射表，选对流与通道",detail:"USART1_TX 与 USART1_RX 各接哪条流、哪个通道是芯片固定接好的：F407 上常见 TX = DMA2_Stream7 / Channel 4，RX = DMA2_Stream5 / Channel 4（另一条可选 Stream2），照参考手册的请求映射表核对。选错的表现是“启动返回成功，但一个字节都不出去”。"},{title:"③ 配 DMA 的四个旋钮",detail:"发送：内存→外设、内存自增、外设不自增、8 位、单次模式；接收方向相反、循环模式。直连（FIFO 关闭）模式下两端位宽必须一致，否则数据会错位。"},{title:"④ 关联与开中断",detail:"HAL_DMA_Init 之后紧跟 __HAL_LINKDMA：发送挂 hdmatx、接收挂 hdmarx，它同时把句柄的 Parent 指回 UART。再使能对应流的 NVIC 中断——少这一环，回调永远不来。"},{title:"⑤ 启动发送：异步，返回不等于发完",detail:"HAL_UART_Transmit_DMA 只负责“开始发”，立刻返回；句柄处于 BUSY_TX 时再次调用会返回 HAL_BUSY。缓冲在 TxCpltCallback 之前一个字都不能改。"},{title:"⑥ 启动接收：循环 + 半满，做双缓冲",detail:"HAL_UART_Receive_DMA 配循环模式，半满处理前半、全满处理后半，处理时另一半正在被写，天然不打架。这是不定长接收最省心的骨架。"},{title:"⑦ 用空闲中断切“一帧结束”",detail:"循环接收只知道“搬了多少”，不知道“对方停了”。打开 UART 的空闲（IDLE）中断，线上安静一个字符时间就认为一帧结束，再结合已收到的字节数定位数据。"},{title:"⑧ 验证：计数器 + 分析仪",detail:"让电脑连续发 1 KB 数据，对比串口助手的发送计数与 MCU 收到的字节数；用逻辑分析仪看线上实际字节，确认丢的是“线上就没有”还是“搬进内存时丢了”。"}],code:[{label:"HAL",language:"c",code:`#include "stm32f4xx_hal.h"
#include <string.h>

UART_HandleTypeDef huart1;
DMA_HandleTypeDef  hdma_usart1_tx;   /* USART1_TX → DMA2_Stream7 / Channel 4 */
DMA_HandleTypeDef  hdma_usart1_rx;   /* USART1_RX → DMA2_Stream5 / Channel 4 */

/* 缓冲必须是常驻内存：DMA 在整段传输期间都在读/写它 */
static uint8_t g_txBuf[128];
static uint8_t g_rxBuf[64];
static volatile uint8_t g_txDone = 0;

static void App_DMA_UART_Init(void)
{
    /* 1. DMA 控制器时钟：不开，后面写的寄存器全部无效 */
    __HAL_RCC_DMA2_CLK_ENABLE();

    /* 2. 发送侧：内存 → 外设，单次模式 */
    hdma_usart1_tx.Instance                 = DMA2_Stream7;          /* 请求映射表决定 */
    hdma_usart1_tx.Init.Channel             = DMA_CHANNEL_4;         /* USART1_TX 固定走通道 4 */
    hdma_usart1_tx.Init.Direction           = DMA_MEMORY_TO_PERIPH;
    hdma_usart1_tx.Init.PeriphInc           = DMA_PINC_DISABLE;      /* DR 地址固定 */
    hdma_usart1_tx.Init.MemInc              = DMA_MINC_ENABLE;       /* 缓冲逐个往后走 */
    hdma_usart1_tx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE;   /* 串口 8 位 */
    hdma_usart1_tx.Init.MemDataAlignment    = DMA_MDATAALIGN_BYTE;
    hdma_usart1_tx.Init.Mode                = DMA_NORMAL;            /* 发完就停，不循环 */
    hdma_usart1_tx.Init.Priority            = DMA_PRIORITY_LOW;
    hdma_usart1_tx.Init.FIFOMode            = DMA_FIFOMODE_DISABLE;  /* 直连：两端位宽一致 */
    if (HAL_DMA_Init(&hdma_usart1_tx) != HAL_OK) { Error_Handler(); }
    __HAL_LINKDMA(&huart1, hdmatx, hdma_usart1_tx);                  /* 发送挂 hdmatx */

    /* 3. 接收侧：外设 → 内存，循环模式 */
    hdma_usart1_rx.Instance                 = DMA2_Stream5;
    hdma_usart1_rx.Init.Channel             = DMA_CHANNEL_4;         /* USART1_RX 同通道 */
    hdma_usart1_rx.Init.Direction           = DMA_PERIPH_TO_MEMORY;
    hdma_usart1_rx.Init.PeriphInc           = DMA_PINC_DISABLE;
    hdma_usart1_rx.Init.MemInc              = DMA_MINC_ENABLE;
    hdma_usart1_rx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE;
    hdma_usart1_rx.Init.MemDataAlignment    = DMA_MDATAALIGN_BYTE;
    hdma_usart1_rx.Init.Mode                = DMA_CIRCULAR;          /* 装满自动回到开头 */
    hdma_usart1_rx.Init.Priority            = DMA_PRIORITY_MEDIUM;
    hdma_usart1_rx.Init.FIFOMode            = DMA_FIFOMODE_DISABLE;
    if (HAL_DMA_Init(&hdma_usart1_rx) != HAL_OK) { Error_Handler(); }
    __HAL_LINKDMA(&huart1, hdmarx, hdma_usart1_rx);                  /* 接收挂 hdmarx */

    /* 4. 两条流各自的 NVIC 中断 */
    HAL_NVIC_SetPriority(DMA2_Stream7_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(DMA2_Stream7_IRQn);
    HAL_NVIC_SetPriority(DMA2_Stream5_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(DMA2_Stream5_IRQn);

    /* 5. 打开 UART 空闲中断，用来判断“一帧结束”（波特率等参数由 CubeMX 生成） */
    __HAL_UART_ENABLE_IT(&huart1, UART_IT_IDLE);
}

/* 6. 异步发送：拷进常驻缓冲再启动，函数立刻返回 */
HAL_StatusTypeDef App_UART_Send(const uint8_t *data, uint16_t len)
{
    if (len == 0U || len > sizeof(g_txBuf)) {
        return HAL_ERROR;                 /* 缓冲不够就拒绝，别指望 HAL 帮你扩 */
    }
    memcpy(g_txBuf, data, len);           /* 拷进常驻缓冲，调用者的数据可以随即释放 */
    return HAL_UART_Transmit_DMA(&huart1, g_txBuf, len);
}

/* 7. 发送完成：最后一个字节已经移出移位寄存器，缓冲此刻才能复用 */
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        g_txDone = 1;                     /* 只置标志，下一帧的发送决策交给主循环 */
    }
}

/* 8. 接收启动：循环模式，长度 = 缓冲字节数 */
void App_UART_StartRx(void)
{
    HAL_UART_Receive_DMA(&huart1, g_rxBuf, sizeof(g_rxBuf));
}

/* 9. DMA 侧回调：半满处理前半、全满处理后半（循环模式下缓冲一直在被写） */
void HAL_UART_RxHalfCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        /* 此刻 g_rxBuf[0 .. 31] 已就绪，后一半正在被 DMA 改写。
           这里只做标记或用环形缓冲拷贝，别在原缓冲上做耗时解析。 */
    }
}

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        /* 此刻 g_rxBuf[32 .. 63] 就绪，循环模式下已从头继续写 */
    }
}

/* 10. 中断入口：流中断交给 HAL，UART 中断里检查空闲标志 */
void DMA2_Stream7_IRQHandler(void)
{
    HAL_DMA_IRQHandler(&hdma_usart1_tx);   /* 发送完成、出错都在这里分派 */
}

void DMA2_Stream5_IRQHandler(void)
{
    HAL_DMA_IRQHandler(&hdma_usart1_rx);   /* 接收半满/全满 */
}

void USART1_IRQHandler(void)
{
    /* 注意：IDLE 标志要先读 SR 再读 DR 才会清除，处理顺序别乱 */
    if (__HAL_UART_GET_FLAG(&huart1, UART_FLAG_IDLE) != RESET) {
        __HAL_UART_CLEAR_IDLEFLAG(&huart1);
        /* 空闲 = 一帧结束。结合已收到的字节数（缓冲长度 − 剩余）定位这一帧。[示意] */
    }
    HAL_UART_IRQHandler(&huart1);
}`,explain:[{item:"DMA2_Stream7 / Channel 4（发送）",desc:"哪条流、哪个通道能接 USART1_TX 是芯片固定接好的，必须照参考手册的请求映射表。选错的表现非常迷惑：启动返回成功、NDTR 也在减，但外设一个字节都不出去。"},{item:"DMA_MEMORY_TO_PERIPH / DMA_PERIPH_TO_MEMORY",desc:"发送是内存→外设，接收是外设→内存。方向接反时 HAL 往往照常启动，现象是发不出去、或把缓冲写脏，很难第一眼看出来。"},{item:"PeriphInc = DISABLE",desc:"USART 的 DR 只有一个地址，每来一个字节都写它；外设端绝不能自增。这一项配错，数据会被写到相邻的非法地址或原地打转。"},{item:"Mode：发送 Normal、接收 Circular",desc:"发一帧用单次；接收要一直收，用循环。循环模式下缓冲永远被覆盖，所以读数据必须靠半满/全满回调切“安全区”。"},{item:"__HAL_LINKDMA(&huart1, hdmatx, ...)",desc:"双向绑定：让 huart1.hdmatx 指向这个 DMA 句柄，同时让句柄的 Parent 指回 huart1。HAL 的 UART 驱动靠这两根指针找到“该回调谁、该清哪个状态”。发送挂 hdmatx、接收挂 hdmarx，挂错方向等于没挂。"},{item:"static uint8_t g_txBuf[128]",desc:"必须是常驻内存。把函数里的局部数组交给 DMA，函数一返回那块栈内存就被复用，现象是偶发乱码或只发出前几个字节，换个编译优化等级又会“自己好了”。"},{item:"HAL_UART_Transmit_DMA",desc:"写 PAR/M0AR/NDTR、开中断、置使能位后立刻返回。返回 HAL_OK 只代表“已经开始发”，不代表“发完了”；句柄 BUSY_TX 期间再次调用返回 HAL_BUSY。"},{item:"HAL_UART_TxCpltCallback",desc:"HAL 会先等 UART 的 TC 标志，确认最后一个字节真正移出移位寄存器才回调。所以“缓冲可以复用”的准确时刻是这里，不是 HAL_UART_Transmit_DMA 返回时。"},{item:"UART_IT_IDLE 与清除顺序",desc:"空闲中断标志要先读 SR 再读 DR 才清（或按 HAL 提供的宏清除）。顺序错会反复进中断，主循环被拖慢；这正是“不定长帧”方案最常见的坑。"},{item:"DMA2_Stream5 / Channel 4（接收）",desc:"USART1_RX 也能接 DMA2_Stream2（同通道），具体以映射表为准。接收这条流开的是“半满 + 全满”两个中断，所以回调里要分清是哪一半。"}]},{label:"LL",language:"c",code:`/* LL 视角：把“启动一次 DMA 发送”拆成一个个内联函数。
   LL 的函数名与常量名随系列略有差异，以你工程的 stm32f4xx_ll_dma.h 为准。 */

LL_DMA_SetChannelSelection(DMA2, LL_DMA_STREAM_7, LL_DMA_CHANNEL_4);   /* 请求源，查映射表 */
LL_DMA_SetDataTransferDirection(DMA2, LL_DMA_STREAM_7, LL_DMA_DIRECTION_MEMORY_TO_PERIPH);
LL_DMA_SetPeriphIncMode(DMA2, LL_DMA_STREAM_7, LL_DMA_PERIPH_NOINCREMENT);
LL_DMA_SetMemoryIncMode(DMA2, LL_DMA_STREAM_7, LL_DMA_MEMORY_INCREMENT);
LL_DMA_SetPeriphSize(DMA2, LL_DMA_STREAM_7, LL_DMA_PDATAALIGN_BYTE);
LL_DMA_SetMemorySize(DMA2, LL_DMA_STREAM_7, LL_DMA_MDATAALIGN_BYTE);

LL_DMA_ConfigAddresses(DMA2, LL_DMA_STREAM_7,
                       (uint32_t)g_txBuf, (uint32_t)&USART1->DR,
                       LL_DMA_DIRECTION_MEMORY_TO_PERIPH);   /* 一次写 PAR 与 M0AR */
LL_DMA_SetDataLength(DMA2, LL_DMA_STREAM_7, len);            /* 写 NDTR：数据项个数 */
LL_DMA_EnableIT_TC(DMA2, LL_DMA_STREAM_7);                   /* 只开传输完成中断 */
LL_DMA_EnableStream(DMA2, LL_DMA_STREAM_7);                  /* 置使能位，传输立即开始 */

/* 配套：还差 UART 侧的 DMA 发送请求使能（DMA 只负责搬，外设要肯“要”数据）。
   用 HAL 时这步由 HAL_UART_Transmit_DMA 代劳，纯 LL 要自己置位。 */`,explain:[{item:"LL_DMA_SetChannelSelection",desc:"选请求源通道，就是请求映射表的落点。选错等于接错线，现象与 HAL 侧一样：启动成功但外设没反应。"},{item:"LL_DMA_ConfigAddresses",desc:"一次写两个地址寄存器；参数顺序与方向强相关，写反会变成“从 DR 往内存搬”。"},{item:"LL_DMA_SetDataLength",desc:"写 NDTR，单位是数据项（8 位宽时等于字节数）。LL 同样不会替你换算。"},{item:"先 EnableIT_TC 再 EnableStream",desc:"先开中断、后开流，避免“已经传完但中断还没使能”而漏掉第一次完成通知。"},{item:"外设侧的 DMA 使能",desc:"DMA 控制器只是搬运工，还得让 USART 发出“我要数据”的请求。HAL 在启动函数里做了这件事，纯 LL 必须自己补上，否则 NDTR 一条都不减。"}]}],pitfalls:[{mistake:"把栈上的局部数组交给 DMA 发送",symptom:"偶发乱码、只发出前几个字节；改 -O0 或加一句打印又“看起来正常”，极难复现",fix:"DMA 缓冲必须是 static 全局数组或常驻堆内存，并且要活到 TxCplt 回调之后；发送前先 memcpy 进常驻缓冲再启动。"},{mistake:"忘了 __HAL_LINKDMA，或发送/接收挂错方向",symptom:"启动返回 HAL_OK，但一个字节都不出去（接收侧则是一个字节都进不来）",fix:"检查 huart1.hdmatx / hdmarx 是否分别指向对应句柄，以及句柄的 Parent 是否指回 huart1。发送挂 hdmatx、接收挂 hdmarx，不能互换。"},{mistake:"请求映射表选错流或通道",symptom:"NDTR 在减、启动也成功，但外设毫无反应；或数据被搬进了错误的缓冲",fix:"照 RM0090 的 DMA 请求映射表核对控制器、流、通道、方向四项。F407 上 USART1_TX 常见 DMA2_Stream7/Ch4，USART1_RX 常见 DMA2_Stream5/Ch4（另一可选 Stream2）。"},{mistake:"把 NDTR 的单位当成字节",symptom:"16 位宽时只搬了一半数据，或缓冲尾部多出一截旧内容",fix:"NDTR 是数据项个数：8 位宽时数据项 = 字节；16 位时 64 个数据项 = 128 字节。按“字节数”想问题，按“数据项数”填寄存器。"},{mistake:"接收用单次模式，却以为能一直收",symptom:"只收到第一批 len 个字节，之后缓冲不再更新；再启动返回 HAL_BUSY",fix:"接收改 Circular 模式，或在每次完成回调里重新启动；循环模式下用半满/全满回调切安全区，并用空闲中断处理不定长帧。"}],quizIds:["dma-q1","dma-q2","dma-q3"],labIds:["dma-transfer","uart-frame"]}],e=[{slug:"gpio-key-led",title:"按键中断点灯",oneLine:"按键拉出下降沿，EXTI 打断 CPU，主循环消抖后翻转 LED。",level:"入门",hardware:["STM32F407 / STM32G474 开发板","LED + 330 Ω 量级限流电阻（示意值）","轻触按键（两脚或四脚均可）","杜邦线 / 面包板","ST-Link 或 DAP-Link 调试器"],goal:["把 PA5 配成推挽输出、PA0 配成带内部上拉的下降沿中断输入","说出 PA0 → SYSCFG → EXTI → NVIC → ISR 这条链路，知道少一段会看到什么现象","在回调里只记录时间戳，把消抖与点灯放到主循环，理解中断里为什么不能延时","用 volatile 共享变量 + HAL_GetTick 时间戳写出不阻塞的按键处理"],wiring:[{signal:"LED",mcuPin:"PA5",device:"LED 阳极（阴极串 330 Ω 量级电阻到 GND）",note:"高电平点亮；具体串在哪一侧、电阻取多大，按你的板子原理图核对"},{signal:"按键",mcuPin:"PA0",device:"轻触按键一端（另一端接 GND）",note:"配内部上拉：松开为高、按下为低，下降沿触发；按你的板子原理图核对"},{signal:"共地",mcuPin:"GND",device:"按键与 LED 的公共地",note:"不共地就没有统一的电平参考；按你的板子原理图核对"},{signal:"调试口",mcuPin:"PA13 / PA14",device:"ST-Link 或 DAP-Link 的 SWDIO / SWCLK",note:"F4 上 SWD 常复用在这两个脚上；保留它便于单步看 EXTI->PR 与 NVIC->ISER，按你的板子原理图核对"}],steps:[{title:"① 建工程，先把时钟与 SysTick 定下来",detail:"用 CubeMX 选芯片、把 HCLK 配到板子能稳定跑的频率（F407 上限 168 MHz 一类，以数据手册为准），生成 HAL 工程。为什么先做这一步：中断的响应延迟、HAL_GetTick 的 1 ms 时基都建立在系统时钟与 SysTick 上，时钟不对，后面所有时间判断都会跟着偏。"},{title:"② 开 GPIOA 时钟，先把 LED 点起来",detail:"先调用 HAL_GPIO_WritePin 把 PA5 写成高电平，再把它配成 GPIO_MODE_OUTPUT_PP、低速档。为什么要先写初值：切成输出的那一瞬间 ODR 复位值是 0，会先把 LED 拉低闪一下；而时钟没开时写 MODER 等于写进空气，函数照样返回、引脚毫无反应。"},{title:"③ 把 PA0 配成中断输入",detail:"gpio.Mode = GPIO_MODE_IT_FALLING、gpio.Pull = GPIO_PULLUP。为什么这样配：按键另一端接 GND，松开时必须靠上拉把电平定高，否则悬空引脚会随机跳变、反复触发中断；选下降沿是因为“按下”的那一刻正好是 1→0。"},{title:"④ 开 SYSCFG 时钟，确认 EXTI0 归属 PORTA",detail:"调用 __HAL_RCC_SYSCFG_CLK_ENABLE()，HAL 会在 HAL_GPIO_Init 里写 SYSCFG->EXTICR[0] 把 EXTI0 接到 PORTA。为什么要单独开这个时钟：EXTI 线只按引脚号分组，PA0 / PB0 / PC0 共用 EXTI0，必须选一个端口；SYSCFG 时钟没开，这一步写不进去，现象是“NVIC 使能了、按键却完全没反应”。"},{title:"⑤ 配 NVIC，放行 EXTI0_IRQn",detail:"HAL_NVIC_SetPriority(EXTI0_IRQn, 5, 0) 给优先级，HAL_NVIC_EnableIRQ(EXTI0_IRQn) 写 NVIC->ISER。为什么要两步：外设侧的 EXTI->IMR 只是第一道门，NVIC 不放行 CPU 根本不会跳进 ISR；优先级先给中间值（示意），日后加串口、定时器中断还有调整余地。"},{title:"⑥ 写 ISR 与回调，只记时间戳",detail:"EXTI0_IRQHandler 里只调用 HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_0)；回调里写 g_keyTick = HAL_GetTick()、g_keyEvent = 1。为什么这么克制：HAL 会先清 EXTI->PR 再回调，自己写容易漏清；回调里一旦延时或打印，中断被拉长，别的中断和主循环都会被拖慢。"},{title:"⑦ 主循环消抖，再翻转 LED",detail:"等 (HAL_GetTick() - g_keyTick) >= 20 之后复读 PA0，仍为低才 HAL_GPIO_TogglePin。为什么要再读一次：机械按键按下瞬间会抖十几次，中断可能连着进好几次；隔 20 ms（示意值）再确认电平，才能把“抖动”和“真按下”分开，而且全程不阻塞。"},{title:"⑧ 上板验证，按链路逐段定位",detail:"先量松开时 PA0 是否接近 VDD；再在调试器里看按下时 EXTI->PR 是否置位、NVIC->ISER 对应位是否为 1；最后看回调有没有进。为什么按这个顺序：它正好对应“引脚与上下拉 → EXTI/SYSCFG → NVIC/ISR”三段，能一次判断断在哪，而不是盲改代码。"}],code:[{label:"HAL",language:"c",code:`#include "stm32f4xx_hal.h"

/* 硬件假设（示意，按你的板子原理图核对）：
 *   PA5 → LED，高电平点亮，串 330 Ω 量级限流电阻到 GND
 *   PA0 → 轻触按键一端，另一端接 GND；内部上拉，按下为低
 * 目标：按下（下降沿）触发 EXTI0；中断里只记时间戳，
 *       消抖与点灯都放主循环，中断服务函数保持极短。
 */

/* 中断与主循环共享的变量：volatile 防止编译器把读操作优化进寄存器 */
static volatile uint8_t  g_keyEvent = 0;   /* 1 = 有一次待处理的按下事件 */
static volatile uint32_t g_keyTick  = 0;   /* 事件发生时的毫秒时间戳 */

static void led_init(void)
{
    __HAL_RCC_GPIOA_CLK_ENABLE();          /* 1. 不开时钟，后面写 MODER 全是白写 */

    GPIO_InitTypeDef gpio = {0};

    /* 2. 先把输出锁存器写成高，再切成输出：
     *    避免“切到输出的瞬间 ODR 复位值 0”把 LED 拉低闪一下 */
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);

    gpio.Pin   = GPIO_PIN_5;
    gpio.Mode  = GPIO_MODE_OUTPUT_PP;      /* 推挽：能推能拉，点灯足够 */
    gpio.Pull  = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;      /* 慢信号用最低档：边沿缓一点、EMI 更小 */
    HAL_GPIO_Init(GPIOA, &gpio);
}

static void key_exti_init(void)
{
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_SYSCFG_CLK_ENABLE();         /* EXTI 的“这根线归哪个端口”在 SYSCFG 里 */

    GPIO_InitTypeDef gpio = {0};
    gpio.Pin  = GPIO_PIN_0;
    gpio.Mode = GPIO_MODE_IT_FALLING;      /* 输入 + 下降沿触发，HAL 顺手把 EXTI0 配好 */
    gpio.Pull = GPIO_PULLUP;               /* 按键接 GND：松开上拉为高，按下为低 */
    HAL_GPIO_Init(GPIOA, &gpio);

    /* 3. NVIC 是第二道门：EXTI->IMR 放开了，NVIC 不放行照样进不来 */
    HAL_NVIC_SetPriority(EXTI0_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(EXTI0_IRQn);
}

/* 4. 中断服务函数：名字必须与启动文件向量表完全一致 */
void EXTI0_IRQHandler(void)
{
    /* HAL 内部会判断挂起位、写 EXTI->PR 清标志，再调下面的回调；
     * 自己重写这段最容易漏清标志，现象是“只进一次中断” */
    HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_0);
}

/* 5. 回调：只做“记录事件”这一件极短的事，不延时、不打印 */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
    if (GPIO_Pin == GPIO_PIN_0) {
        g_keyTick  = HAL_GetTick();        /* 记下触发时刻，消抖留给主循环 */
        g_keyEvent = 1;
    }
}

int main(void)
{
    HAL_Init();                            /* 内含 SysTick 与 NVIC 优先级分组 */
    SystemClock_Config();                  /* 时钟树见“时钟与复位”页 */
    led_init();
    key_exti_init();

    for (;;) {
        /* 6. 消抖放主循环：等 20 ms（示意值）再复读电平，
         *    仍然为低才认为是“真的按下”，避免抖动被算成好几次 */
        if (g_keyEvent && (HAL_GetTick() - g_keyTick) >= 20U) {
            g_keyEvent = 0;

            if (HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0) == GPIO_PIN_RESET) {
                HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);   /* 翻转 LED */
            }
        }
    }
}`,explain:[{item:"__HAL_RCC_SYSCFG_CLK_ENABLE()",desc:"EXTI 的端口选择寄存器在 SYSCFG 里，不开它的时钟，HAL_GPIO_Init 写 EXTI 映射时等于写进空气。"},{item:"GPIO_MODE_IT_FALLING",desc:"HAL 会一次配好输入模式、SYSCFG 端口映射、EXTI 屏蔽位与下降沿触发位；按键按下的那一刻是 1→0，所以选下降沿。"},{item:"GPIO_PULLUP",desc:"按键另一端接 GND，必须有上拉在松开时把 PA0 定成高电平；悬空输入会变成“天线”，随机进中断。"},{item:"HAL_NVIC_SetPriority / HAL_NVIC_EnableIRQ",desc:"外设侧 EXTI->IMR 只是第一道门，NVIC 不放行 CPU 不会进 ISR；抢占优先级 5 是示意值，按你的中断体系分配。"},{item:"EXTI0_IRQHandler",desc:"名字与启动文件向量表绑定，写错一个字母编译不报错，但永远不进中断。"},{item:"HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_0)",desc:"先判断挂起位、写 EXTI->PR 清标志，再回调用户函数；绕过它自己写回调，最常见的结果就是标志没清、只进一次。"},{item:"volatile g_keyEvent / g_keyTick",desc:"中断里写、主循环里读，加 volatile 才保证每次都真读内存，而不是被优化进寄存器一直读到旧值。"},{item:"20 ms 后复读电平",desc:"抖动期会连着进好几次中断；隔 20 ms 再确认引脚仍为低，才是有效按下。数值按实际按键手感调，重点是“不阻塞”。"},{item:"HAL_GPIO_TogglePin",desc:"读 ODR 再取反写回；多任务或中断与主循环都改同一引脚时，用 GPIOA->BSRR 单条指令置位/复位更安全。"}]},{label:"寄存器对照",language:"c",code:`/* 同一个按键中断，只用真实寄存器名把链路走一遍；
 * 位定义与端口编码以你芯片的参考手册 EXTI / SYSCFG / NVIC 章节为准。 */

RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;     /* GPIOA 时钟 */
RCC->APB2ENR |= RCC_APB2ENR_SYSCFGEN;    /* SYSCFG 时钟：EXTI 端口选择在这里 */

/* 1. PA0 = 输入 + 内部上拉（MODER 每引脚 2 位，00 = 输入） */
GPIOA->MODER &= ~(3U << (0 * 2));
GPIOA->PUPDR &= ~(3U << (0 * 2));
GPIOA->PUPDR |=  (1U << (0 * 2));        /* 01 = 上拉 */

/* 2. 把 EXTI0 的来源选成 PORTA：每个 EXTIx 占 EXTICR 里的 4 位 */
SYSCFG->EXTICR[0] &= ~(0xFU << 0);
SYSCFG->EXTICR[0] |=  (0x0U << 0);       /* 0 = PORTA，1 = PORTB……见手册 */

/* 3. 放开屏蔽并选下降沿：IMR 1 = 不屏蔽，FTSR 1 = 下降沿 */
EXTI->IMR  |=  (1U << 0);
EXTI->FTSR |=  (1U << 0);
EXTI->RTSR &= ~(1U << 0);

/* 4. NVIC：IP 里有效的是高 4 位；ISER 按“编号 / 32”分组、组内按位寻址 */
NVIC->IP[EXTI0_IRQn]       = (uint8_t)(5U << 4);
NVIC->ISER[EXTI0_IRQn >> 5] = (1U << (EXTI0_IRQn & 0x1FU));

/* 5. ISR 里必须清挂起：PR 是“写 1 清除”，不写就只进一次 */
void EXTI0_IRQHandler(void)
{
    if (EXTI->PR & (1U << 0)) {
        EXTI->PR = (1U << 0);            /* 写 1 清挂起位 */
        HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);  /* 仅为演示链路；正式代码应只置标志 */
    }
}`,explain:[{item:"RCC->AHB1ENR / RCC->APB2ENR",desc:"GPIOA 挂在 AHB1，SYSCFG 挂在 APB2；两个时钟都得开，少一个就会出现“配置写了但不生效”。"},{item:"GPIOA->MODER / PUPDR",desc:"MODER 每引脚 2 位、PUPDR 每引脚 2 位；先清零再写目标编码，避免把上一位残留带进来。"},{item:"SYSCFG->EXTICR[0]",desc:"每个 EXTIx 占 4 位，写端口编号（0=PORTA）；同号的 PA0/PB0/PC0 只能选一个。"},{item:"EXTI->IMR / RTSR / FTSR",desc:"IMR 定“屏蔽与否”，RTSR/FTSR 定“上升沿还是下降沿”；按键按下是下降沿，所以置 FTSR、清 RTSR。"},{item:"EXTI->PR 写 1 清除",desc:"挂起位是写 1 清零，不是写 0；ISR 里不清，CPU 会一直认为中断还在。"},{item:"NVIC->IP / ISER",desc:"CMSIS 里 IP 按 IRQ 编号索引、只有高 4 位有效；ISER 的下标是“编号 / 32”，位号是“编号 % 32”。"}]}],pitfalls:[{mistake:"忘记开 SYSCFG 时钟，或把 PA0 配成普通输入却没配中断模式",symptom:"NVIC 已使能、调试器里 EXTI->IMR 也像是对的，但按键按下时 EXTI->PR 不置位、回调永远不进",fix:"先加 __HAL_RCC_SYSCFG_CLK_ENABLE()，再确认 gpio.Mode 用的是 GPIO_MODE_IT_FALLING 而不是 GPIO_MODE_INPUT；前者才会写 SYSCFG->EXTICR 与 EXTI 的边沿位。"},{mistake:"上下拉方向配反，或按键引脚一直悬空",symptom:"不按也会自己触发、按一下 LED 连闪好几次；万用表量松开时 PA0 只有 1 V 出头甚至乱跳",fix:"按键另一端接 GND 就必须配 GPIO_PULLUP（松开为高）。先量电平确认，再谈软件消抖；电平本身就是错的，消抖救不回来。"},{mistake:"在 ISR 或回调里调用 HAL_Delay、printf 做“消抖”",symptom:"按键偶尔没反应、串口开始丢字节、别的中断响应变慢，甚至看门狗复位",fix:"中断里只取时间戳、置标志；延时与打印全部移到主循环。要确认中断占用时间，可在 ISR 入口/出口翻转一个空闲 GPIO，用示波器量宽度。"},{mistake:"共享变量没加 volatile，或 ISR 里漏清 EXTI->PR",symptom:"主循环一直看不到事件标志；或者只进一次中断，之后按键完全没反应",fix:"给中断与主循环共享的标志加 volatile；ISR 必须走 HAL_GPIO_EXTI_IRQHandler 或自己写 EXTI->PR = 位掩码 清标志。用调试器看 EXTI->PR 是否一直为 1 最快。"},{mistake:"同一编号的引脚在两个端口上都配了 EXTI",symptom:"两个按键只有一个能用，或者两个都时灵时不灵",fix:"EXTI0 只能归属 PA0 / PB0 / PC0 中的一个：查 SYSCFG->EXTICR[0] 的值，确保只配置了实际使用的那个端口。"}],quizIds:["interrupt-q1","interrupt-q2","interrupt-q3"],labIds:["gpio-output","nvic-interrupt"]},{slug:"uart-echo",title:"UART 收发回显",oneLine:"把 USART1 配成 115200 8N1，收到字节进中断，放进环缓冲后原样回显。",level:"入门",hardware:["STM32F407 / STM32G474 开发板","USB-TTL 串口模块（CH340 / CP2102 一类）","杜邦线（TX、RX、GND 三根）","PC 端串口助手"],goal:["把 USART1 配成 115200 8N1，并说清 HAL_UART_Init 到底替你算了什么","打通“外设中断使能 + NVIC 使能”两道门，写对 USART1_IRQHandler","在回调里先重挂接收、再把字节放进环缓冲，由主循环负责发送","用发 0x55 量位宽的方法，把乱码问题收敛到波特率与时钟源"],wiring:[{signal:"TX",mcuPin:"PA9",device:"USB-TTL 模块的 RXD",note:"板 TX 接模块 RX（交叉接法）；PA9 是否引到排针按你的板子原理图核对"},{signal:"RX",mcuPin:"PA10",device:"USB-TTL 模块的 TXD",note:"板 RX 接模块 TX；复用号查数据手册复用表，按你的板子原理图核对"},{signal:"地",mcuPin:"GND",device:"USB-TTL 模块的 GND",note:"必须共地，否则电平没有共同参考，乱码时最容易漏查；按你的板子原理图核对"}],steps:[{title:"① 确认串口资源与引脚复用",detail:"在数据手册里确认 PA9 / PA10 能复用成 USART1_TX / USART1_RX（F4 上常见为 AF7），并确认这两根脚确实引到了排针。为什么先查表：复用编号随型号与封装变化，抄错 AF 的典型现象是“初始化返回成功、引脚上一点波形都没有”。"},{title:"② 开时钟，配 TX/RX 引脚",detail:"打开 GPIOA 与 USART1 的时钟；TX 配 GPIO_MODE_AF_PP（复用推挽），RX 配复用输入并加上拉。为什么要上拉：RX 在对方没驱动时容易悬空，弱上拉能让它保持空闲高电平，减少误起的起始位。"},{title:"③ 填初始化结构体：115200 8N1",detail:"BaudRate = 115200、WordLength = 8 位、StopBits = 1、Parity = NONE、Mode = TX_RX、OverSampling = 16。为什么这些字段要一起看：它们共同决定 BRR 与 CR1/CR2 的最终值，任何一项与对端不一致，都会表现为乱码或帧错误。"},{title:"④ 调用 HAL_UART_Init",detail:"HAL 用总线时钟与过采样算出 BRR 并写入，同时配好帧格式、使能收发。为什么它不够：HAL_UART_Init 不会帮你开 NVIC，也不会启动接收——这两件事必须自己做，否则“数据到了、回调不进”。"},{title:"⑤ 开 NVIC，放行 USART1_IRQn",detail:"HAL_NVIC_SetPriority(USART1_IRQn, 5, 0) 再 HAL_NVIC_EnableIRQ(USART1_IRQn)。为什么是两道门：外设侧的 RXNEIE 只是“我想中断”，NVIC 的使能位才是“CPU 允许你打断我”，缺一个都不进 ISR。"},{title:"⑥ 挂第一次中断接收",detail:"HAL_UART_Receive_IT(&huart1, &g_rxByte, 1)：收满 1 个字节进回调。为什么要强调“第一次”：这个函数是一次性的，收完 HAL 把状态改回 READY，必须再次调用才会继续收。"},{title:"⑦ ISR 与回调：先取字节、立刻重挂、再入环缓冲",detail:"USART1_IRQHandler 只调 HAL_UART_IRQHandler；回调里先把 g_rxByte 拷到局部变量，马上重挂 HAL_UART_Receive_IT，再把字节写进环缓冲。为什么是这个顺序：先拷贝避免下一个字节覆盖，先重挂把“没在收”的窗口压到最小，写缓冲则是非阻塞的搬运动作。"},{title:"⑧ 主循环发送，并用 0x55 验证",detail:"主循环从环缓冲取字节，HAL_UART_Transmit 发回 PC；串口助手应当逐字回显。为什么用 0x55：它的二进制是 01010101，线上是规整方波，量一个位的宽度就能反推实际波特率，比盯着配置项有效得多。"}],code:[{label:"HAL",language:"c",code:`#include "stm32f4xx_hal.h"   /* G474 工程换成 stm32g4xx_hal.h */

UART_HandleTypeDef huart1;

/* 中断接收的单字节落脚点：HAL 会把下一个收到的字节写到这里 */
static uint8_t g_rxByte;

/* 环形缓冲：中断只写、主循环只读。
 * 单写单读场景下，head/tail 各自只被一方修改，不需要关中断保护 */
#define RX_RING_SIZE  128U
static volatile uint8_t  g_ring[RX_RING_SIZE];
static volatile uint16_t g_head = 0;   /* 只由中断修改 */
static volatile uint16_t g_tail = 0;   /* 只由主循环修改 */

static void uart1_init(void)
{
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_USART1_CLK_ENABLE();       /* 1. 外设时钟，漏开则寄存器写不进去 */

    GPIO_InitTypeDef gpio = {0};
    gpio.Pin       = GPIO_PIN_9 | GPIO_PIN_10;  /* PA9 = TX，PA10 = RX */
    gpio.Mode      = GPIO_MODE_AF_PP;           /* 复用推挽；RX 侧由外设接管方向 */
    gpio.Pull      = GPIO_PULLUP;               /* RX 悬空时保持空闲高电平 */
    gpio.Speed     = GPIO_SPEED_FREQ_VERY_HIGH; /* 边际速率下别让 GPIO 拖慢边沿 */
    gpio.Alternate = GPIO_AF7_USART1;           /* F4 上 USART1 常见为 AF7，查手册确认 */
    HAL_GPIO_Init(GPIOA, &gpio);

    /* 2. 帧格式与时基：115200 8N1，16 倍过采样 */
    huart1.Instance          = USART1;
    huart1.Init.BaudRate     = 115200;               /* 目标值，HAL 据此算 BRR */
    huart1.Init.WordLength   = UART_WORDLENGTH_8B;   /* 8 位数据 */
    huart1.Init.StopBits     = UART_STOPBITS_1;      /* 1 个停止位 */
    huart1.Init.Parity       = UART_PARITY_NONE;     /* 无校验 → 8N1 */
    huart1.Init.Mode         = UART_MODE_TX_RX;      /* 收发都使能 */
    huart1.Init.HwFlowCtl    = UART_HWCONTROL_NONE;  /* 不用 RTS/CTS */
    huart1.Init.OverSampling = UART_OVERSAMPLING_16; /* 16 倍过采样：采样点更多、抗噪更好 */
    if (HAL_UART_Init(&huart1) != HAL_OK) {
        Error_Handler();
    }

    /* 3. 第二道门：不开 NVIC，RXNE 置位也进不了 ISR */
    HAL_NVIC_SetPriority(USART1_IRQn, 5, 0);
    HAL_NVIC_EnableIRQ(USART1_IRQn);

    /* 4. 挂第一次接收：一次性动作，收满 1 字节进回调 */
    if (HAL_UART_Receive_IT(&huart1, &g_rxByte, 1) != HAL_OK) {
        Error_Handler();
    }
}

/* 5. 中断入口：函数名与启动文件向量表完全一致 */
void USART1_IRQHandler(void)
{
    HAL_UART_IRQHandler(&huart1);   /* 清标志、判错误，再分派到 HAL 的回调 */
}

/* 6. 接收完成回调：只做搬运，不做阻塞操作 */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance != USART1) {
        return;
    }

    uint8_t b = g_rxByte;                              /* 先取走，避免下一字节覆盖 */
    HAL_UART_Receive_IT(&huart1, &g_rxByte, 1);        /* 先重挂，缩小丢字节窗口 */

    uint16_t next = (uint16_t)((g_head + 1U) % RX_RING_SIZE);
    if (next != g_tail) {                              /* 缓冲不满才写，满了就丢（可另计次数） */
        g_ring[g_head] = b;
        g_head = next;
    }
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    uart1_init();

    for (;;) {
        /* 7. 发送放主循环：中断只负责收，阻塞操作不占中断 */
        while (g_tail != g_head) {
            uint8_t b = g_ring[g_tail];
            g_tail = (uint16_t)((g_tail + 1U) % RX_RING_SIZE);

            /* 115200 8N1 下 1 字节约 87 µs（示意），10 ms 只是兜底超时 */
            HAL_UART_Transmit(&huart1, &b, 1, 10);
        }
    }
}`,explain:[{item:"gpio.Alternate = GPIO_AF7_USART1",desc:"把 PA9/PA10 交给 USART1 的具体复用编号；F4 上常见是 AF7，换型号或换引脚必须查数据手册复用表。"},{item:"Init.BaudRate = 115200",desc:"这里填目标值，HAL_UART_Init 会结合 PCLK 与过采样算出 BRR；实际波特率与目标的差就是误差。"},{item:"WordLength / StopBits / Parity",desc:"三者共同定义帧格式，本例 8 数据位 + 1 停止位 + 无校验 = 8N1；开校验时字长通常要按 9 位配，以 HAL 注释与手册为准。"},{item:"OverSampling = 16",desc:"16 倍过采样让接收端时间分辨率更高、抗噪更好；BRR 的小数位就是为这个分辨率服务的。"},{item:"HAL_UART_Init",desc:"写 BRR、配 CR1/CR2 帧格式、使能收发；它不开 NVIC、也不启动接收，这两件事必须自己补。"},{item:"HAL_NVIC_EnableIRQ(USART1_IRQn)",desc:"写 NVIC->ISER 对应位。只开外设的 RXNEIE 而漏掉这里，现象是“数据到了、标志也置了、回调永远不进”。"},{item:"HAL_UART_Receive_IT(&huart1, &g_rxByte, 1)",desc:"一次性挂接收：收满 1 字节进回调，随后 HAL 把状态改回 READY；不重新调用就不会再收。"},{item:"USART1_IRQHandler",desc:"名字与向量表绑定；函数体只调 HAL_UART_IRQHandler，别自己清标志，否则容易漏清 RXNE 或错误标志。"},{item:"环缓冲的 head / tail",desc:"单写单读的经典结构：中断只动 head，主循环只动 tail；判断 next != tail 来区分“空”和“满”，避免多存一个字节的歧义。"},{item:"HAL_UART_Transmit 放主循环",desc:"在中断里阻塞发送会拉长中断、导致后续字节溢出；主循环发送慢一点没关系，环缓冲就是用来吸收这个速度差的。"}]},{label:"寄存器对照",language:"c",code:`/* 同一件事的寄存器写法：前提是 GPIO 复用与时钟已由 HAL / CubeMX 配好。
 * 位名以 CMSIS 头文件为准，字段含义见参考手册 USART 章节。 */
uint32_t pclk = HAL_RCC_GetPCLK2Freq();          /* USART1 在 APB2（F4） */

/* 16 倍过采样下 BRR 是 Q4 定点：数值 ≈ fCK / 波特率（即 USARTDIV × 16） */
uint32_t brr = (uint32_t)(((uint64_t)pclk + 115200U / 2U) / 115200U);
USART1->BRR = (uint16_t)brr;                     /* 高 12 位整数，低 4 位小数 */

/* 先清帧格式相关位，再配 8 位数据、无校验、1 个停止位 */
USART1->CR1 &= ~(USART_CR1_M | USART_CR1_PCE | USART_CR1_PS);
USART1->CR2 &= ~USART_CR2_STOP;                  /* 00 = 1 个停止位 */

/* 收发使能 + 接收中断使能 + 总使能（UE 建议最后置位） */
USART1->CR1 |= USART_CR1_TE | USART_CR1_RE | USART_CR1_RXNEIE;
USART1->CR1 |= USART_CR1_UE;

/* NVIC 放行：下标是“中断号 / 32”，位号是“中断号 % 32” */
NVIC->ISER[USART1_IRQn >> 5] = (1U << (USART1_IRQn & 0x1FU));`,explain:[{item:"USART1->BRR",desc:"放的是分频值而不是波特率本身：16 倍过采样时数值 ≈ fCK / 波特率，高 12 位整数、低 4 位小数（1/16 步进）。"},{item:"HAL_RCC_GetPCLK2Freq()",desc:"USART1 挂在 APB2 上，用实际总线频率算 BRR；写成固定常数、时钟树一改就全错。"},{item:"USART_CR1_M / PCE / PS",desc:"字长、校验使能、校验选择位；先清零再置位，避免把复位值或上次配置的残留带进来。"},{item:"USART_CR1_TE / RE / RXNEIE",desc:"发送使能、接收使能、接收寄存器空中断使能；少 RE 就收不到，少 RXNEIE 就进不了中断。"},{item:"USART_CR1_UE",desc:"USART 总使能，建议配置完成后最后置位：配置没写完就使能，可能按旧参数先发一帧垃圾。"}]}],pitfalls:[{mistake:"TX/RX 没交叉，或两块板没有共地",symptom:"一边完全没数据、另一边毫无反应；偶尔收到了也全是乱码，手碰一下线又“好一会儿”",fix:"先确认板 TX 接模块 RX、板 RX 接模块 TX，再确认 GND 相连；用示波器或逻辑分析仪看发送端 TX 有没有波形，没有就先查引脚复用与时钟。"},{mistake:"只在初始化里挂了一次 HAL_UART_Receive_IT，回调里没有重新挂",symptom:"只能收到第一个字节，之后回调再也不进；调试器里句柄的接收状态一直是 READY 而不是 BUSY_RX",fix:"在 HAL_UART_RxCpltCallback 末尾再次调用 HAL_UART_Receive_IT；要连续收大量数据就改成环缓冲 + DMA，别靠反复重挂硬撑。"},{mistake:"中断函数名与向量表不一致，或忘了 HAL_NVIC_EnableIRQ",symptom:"数据确实到了，USART 的接收标志也置位，但回调从不执行，程序像“没收到”一样",fix:"对照启动文件确认 USART1_IRQHandler 拼写，确认 NVIC 使能已调用、中断服务函数里调了 HAL_UART_IRQHandler；三步缺一不可。"},{mistake:"双方波特率/校验位不一致，或一边用未校准的内部 RC",symptom:"低速勉强能通、高速必乱；偶发帧错误或校验错误，换块板子就好",fix:"发 0x55 量一个位的宽度反推实际波特率，再套误差公式核对 BRR 量化误差与时钟源偏差；总误差先压到 2–3% 量级（以手册与实测为准）。"},{mistake:"在接收回调里做阻塞发送、printf 或延时",symptom:"连续发数据时开始丢字节，接收溢出标志被置起，回显内容缺字符",fix:"中断里只取数、入环缓冲；发送交给主循环或 DMA。出现溢出错误时补一个 HAL_UART_ErrorCallback，在错误处理后重新挂接收。"}],quizIds:["uart-q1","uart-q2"],labIds:["uart-frame","nvic-interrupt"]},{slug:"i2c-sensor",title:"I²C 读取温湿度",oneLine:"按“发命令 → 等转换 → 读原始字节”三步，经 I²C 读一颗温湿度传感器。",level:"进阶",hardware:["STM32F407 / STM32G474 开发板","常见 I²C 温湿度传感器模块（如 SHT3x 类）","外部上拉电阻（阻值按总线电容与速率核算）","杜邦线","逻辑分析仪（可选，用来看 ACK）"],goal:["把 I²C1 的 SCL/SDA 配成复用开漏，并说清为什么不能配成推挽","用 HAL_I2C_IsDeviceReady 先探活，把“地址错 / 没上拉 / 没上电”三类问题分开","按“发测量命令 → 等转换 → 读回原始字节”完成一次读取，并核对每一步返回值","知道换算公式、CRC 与字节序都要照器件手册，案例只负责把原始数据正确拿回来"],wiring:[{signal:"SCL",mcuPin:"PB6",device:"传感器模块 SCL",note:"I²C1_SCL 的常见复用脚之一，复用号查数据手册；必须有外部上拉，按你的板子原理图核对"},{signal:"SDA",mcuPin:"PB7",device:"传感器模块 SDA",note:"I²C1_SDA；SCL 与 SDA 各接一个上拉到同一电源，按你的板子原理图核对"},{signal:"电源",mcuPin:"3V3",device:"模块 VCC",note:"供电电压按模块手册；不要用 GPIO 给模块供电，按你的板子原理图核对"},{signal:"地",mcuPin:"GND",device:"模块 GND",note:"必须与 MCU 共地，否则 ACK 都无从谈起，按你的板子原理图核对"}],steps:[{title:"① 先读手册，把三件事抄下来",detail:"从器件手册或模块丝印上确认：7 位从机地址（丝印有可能印的是已左移的 8 位值）、触发测量的命令字或寄存器地址、一次测量返回多少字节以及转换需要多久。为什么先做这件事：地址、命令、长度、转换时间这四项只要错一个，现象都是“通信不通”，而代码本身看不出任何毛病。"},{title:"② 硬件先就位：上拉、供电、共地",detail:"SCL/SDA 各接一个外部上拉到模块电源，确保模块上电并与 MCU 共地。为什么上拉是硬性要求：I²C 引脚只有开漏的下管，写 1 只是“放手”，没有上拉就根本没有高电平；内部弱上拉阻值很大，只够极短线的应急验证。"},{title:"③ 把引脚配成复用开漏",detail:"PB6/PB7 配 GPIO_MODE_AF_OD，速度别选最低档，复用号按数据手册填（F4 上 I²C1 常见为 AF4）。为什么必须开漏：总线上多个器件共用两根线，推挽输出“推高”会与别的器件“拉低”直接对灌；开漏才允许线与，也才有多主仲裁。"},{title:"④ 初始化 I²C1 的外设参数",detail:"ClockSpeed 先取 100 kbit/s（标准模式量级），7 位寻址，NoStretchMode 保持“允许时钟延展”，OwnAddress 设 0（只做主机）。为什么要允许延展：慢速传感器在转换期间可能拉住 SCL 不放，禁用延展会让这类器件直接被判超时。"},{title:"⑤ 探活：先只发地址，别急着读数据",detail:"HAL_I2C_IsDeviceReady(&hi2c1, DevAddress, 3, 10) 只做 START + 地址 + 看 ACK。为什么值得单独一步：它能把“地址算错 / 没上拉 / 模块没上电”与“命令或数据理解错”彻底分开，后面的排查范围立刻缩小一半。"},{title:"⑥ 发测量命令，并检查返回值",detail:"多数温湿度器件是“命令式”的：主机发 2 个字节的命令触发一次转换（有的器件是写寄存器）。命令长度、字节序、是否需要 CRC 都按手册来。为什么要检查返回值：HAL_ERROR 是 NACK 或仲裁失败，HAL_TIMEOUT 是总线卡住，两者的排查方向完全不同。"},{title:"⑦ 按手册等转换，再读回原始字节",detail:"转换需要时间（具体见手册），等够之后用 HAL_I2C_Master_Receive 读回固定长度数据。为什么不能边发边读：从机在转换期间不响应数据请求，读早了会拿到旧值或 NACK；延时宁可留余量，也别“感觉差不多”。"},{title:"⑧ 先打印原始字节，再套手册公式换算",detail:"把读回的每个字节打印出来，和手册里的示例数据格式对照：哪两个字节拼成一个量、字节序是高位在前还是低位在前、是否带 CRC。为什么停在这一步：换算系数与偏移是器件参数，必须来自手册；先确认“拿到的字节是对的”，再谈物理量算得准不准。"}],code:[{label:"HAL",language:"c",code:`#include "stm32f4xx_hal.h"

I2C_HandleTypeDef hi2c1;

/* ===== 三处 TODO：全部从器件手册/模块丝印抄，本案例不写死任何数值 =====
 * 1) 7 位从机地址：手册通常给 7 位值，也有模块丝印直接印已左移的 8 位值；
 * 2) 触发测量的命令字（或要写的寄存器地址）：见手册 command table / register map；
 * 3) 一次测量返回的字节数：见手册数据格式章节。
 * 下面的 0x00 只是占位，它不代表任何真实器件的地址或命令。 */
#define SENSOR_ADDR_7BIT   (0x00U)
#define SENSOR_MEAS_CMD    (0x0000U)
#define SENSOR_DATA_LEN    (6U)

/* HAL 的 DevAddress 要“已左移一位”的 8 位形式（读写位由 HAL 自己补），
 * 所以这里只左移一次；直接传 7 位值会变成另一个地址，表现为永远 NACK */
#define SENSOR_DEV_ADDR    ((uint16_t)(SENSOR_ADDR_7BIT << 1))

static void i2c1_init(void)
{
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_I2C1_CLK_ENABLE();

    GPIO_InitTypeDef gpio = {0};
    gpio.Pin       = GPIO_PIN_6 | GPIO_PIN_7;   /* PB6 = SCL，PB7 = SDA（按你的板子核对） */
    gpio.Mode      = GPIO_MODE_AF_OD;           /* 复用开漏：I²C 唯一正确的模式 */
    gpio.Pull      = GPIO_PULLUP;               /* 内部弱上拉只够应急，正式设计必须外部上拉 */
    gpio.Speed     = GPIO_SPEED_FREQ_VERY_HIGH; /* 别让 GPIO 拖慢上升沿 */
    gpio.Alternate = GPIO_AF4_I2C1;             /* 复用号查数据手册引脚表 */
    HAL_GPIO_Init(GPIOB, &gpio);

    hi2c1.Instance             = I2C1;
    hi2c1.Init.ClockSpeed      = 100000;                 /* 100 kbit/s 量级 */
    hi2c1.Init.DutyCycle       = I2C_DUTYCYCLE_2;
    hi2c1.Init.OwnAddress1     = 0;                      /* 只做主机 */
    hi2c1.Init.AddressingMode  = I2C_ADDRESSINGMODE_7BIT;
    hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
    hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
    hi2c1.Init.NoStretchMode   = I2C_NOSTRETCH_DISABLE;  /* 允许从机时钟延展 */
    if (HAL_I2C_Init(&hi2c1) != HAL_OK) {
        Error_Handler();
    }
}

/* 1) 探活：只做 START + 地址 + 看 ACK，不读数据 */
static HAL_StatusTypeDef sensor_probe(uint32_t trials)
{
    return HAL_I2C_IsDeviceReady(&hi2c1, SENSOR_DEV_ADDR, trials, 10);
}

/* 2) 发测量命令：本例按“2 字节命令、高字节在前”写，是否大端见手册 */
static HAL_StatusTypeDef sensor_start_measure(void)
{
    uint8_t cmd[2];
    cmd[0] = (uint8_t)(SENSOR_MEAS_CMD >> 8);
    cmd[1] = (uint8_t)(SENSOR_MEAS_CMD & 0xFFU);

    return HAL_I2C_Master_Transmit(&hi2c1, SENSOR_DEV_ADDR, cmd, 2, 10);
}

/* 3) 读回原始字节：只负责搬数据，不做换算 */
static HAL_StatusTypeDef sensor_read_raw(uint8_t *buf, uint16_t len)
{
    return HAL_I2C_Master_Receive(&hi2c1, SENSOR_DEV_ADDR, buf, len, 10);
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    i2c1_init();

    uint8_t raw[SENSOR_DATA_LEN] = {0};

    /* 4) 先探活：地址、上拉、供电，三件事里只要有一件不对，这里就过不去 */
    if (sensor_probe(3) != HAL_OK) {
        Error_Handler();
    }

    for (;;) {
        if (sensor_start_measure() != HAL_OK) {
            Error_Handler();          /* NACK 或超时：按返回值分类排查 */
        }

        /* 5) 等一次转换完成：具体时间见器件手册，20 ms 只是演示节奏 */
        HAL_Delay(20);

        if (sensor_read_raw(raw, SENSOR_DATA_LEN) == HAL_OK) {
            /* 6) raw[] 就是原始数据：
             *    - 哪两个字节拼成一个量、字节序如何、是否带 CRC，全看手册；
             *    - 物理量按手册公式换算（常见形式是 a + b × raw），
             *      本案例不写系数，避免出现“看着像真参数”的假数字。
             * 调试期最实用的做法：把 raw[] 原样打印，和手册示例数据对一遍。 */
            (void)raw;
        }

        HAL_Delay(1000);          /* 采样间隔（示意），按需要改 */
    }
}`,explain:[{item:"gpio.Mode = GPIO_MODE_AF_OD",desc:"复用开漏是 I²C 引脚的正确模式：写 1 只“放手”，高电平靠上拉；配成推挽会与总线上其他器件的拉低动作对顶。"},{item:"gpio.Pull = GPIO_PULLUP",desc:"内部弱上拉阻值很大、上升沿很慢，只适合低速短线的应急验证；正式设计必须按总线电容与规范核算外部上拉。"},{item:"SENSOR_DEV_ADDR = 7 位地址 << 1",desc:"HAL 的 DevAddress 参数是“已含读写位位置”的 8 位值；少左移一位，总线上就会出现另一个地址，永远是 NACK。"},{item:"SENSOR_ADDR_7BIT / SENSOR_MEAS_CMD / SENSOR_DATA_LEN",desc:"这三个值必须来自器件手册；案例写 0x00 只是占位，目的是提醒你“这几项不能抄网上的、也不能猜”。"},{item:"hi2c1.Init.ClockSpeed = 100000",desc:"标准模式量级的速率；线短、上拉合适时可以试 400 kbit/s 量级，但先让 100 k 通起来再提速，排查会简单很多。"},{item:"NoStretchMode = I2C_NOSTRETCH_DISABLE",desc:"“禁用延展”这一位要保持允许：慢速传感器转换时会拉住 SCL，禁用后表现为偶发超时或 NACK。"},{item:"HAL_I2C_IsDeviceReady",desc:"只做 START + 地址 + 看 ACK；先让它通过，就能把“地址/上拉/供电”与“命令/数据格式”两类问题分开。"},{item:"HAL_I2C_Master_Transmit / Master_Receive",desc:"分别对应“写方向发命令”和“读方向取数据”；返回值 HAL_ERROR 是 NACK 或仲裁失败，HAL_TIMEOUT 是总线卡住。"},{item:"HAL_Delay(20) 等转换",desc:"命令发出后从机要花时间做一次测量；具体时长见手册，宁可留余量。有些器件在转换期间不响应地址，读早了就是 NACK。"},{item:"raw[] 与手册公式",desc:"本案例只保证“原始字节能正确读回”；拼接方式、字节序、CRC 与换算系数都属于器件参数，照手册抄，别按常见型号猜。"}]}],pitfalls:[{mistake:"SDA/SCL 没接外部上拉，或只靠内部弱上拉",symptom:"HAL_I2C_IsDeviceReady 一直失败；示波器看空闲电平只有 1 V 出头，上升沿是缓慢的“圆头”",fix:"先万用表量空闲电平：开漏释放时两根线都应接近模块电源电压。不够就补外部上拉（按总线电容与速率核算），并确认引脚模式是 GPIO_MODE_AF_OD 而不是推挽。"},{mistake:"地址没左移，或把丝印上的 8 位地址又左移了一次",symptom:"地址字节后的第 9 个时钟收到 NACK，探活一直失败；换个写法（比如把 0x?? 改成左移后的值）立刻通了",fix:"HAL 的 DevAddress 要“7 位地址 << 1”。用 HAL_I2C_IsDeviceReady 扫一遍 0x08–0x77 找到真正应答的 7 位地址，再写进代码。"},{mistake:"总线被从机拉死，BUSY 一直不释放",symptom:"上电第一次传输就超时，之后所有操作都返回 HAL_BUSY；示波器上 SDA 恒为低、SCL 空闲为高",fix:"多半是从机在传输中途被复位、正拉着 SDA 等时钟。把 SCL 临时切成 GPIO 手动发 9 个以上时钟脉冲再补一个 STOP，然后重新初始化 I²C；长期方案是让从机先于 MCU 完成上电或加电源监控。"},{mistake:"命令字、寄存器地址、字节序抄错",symptom:"探活能过，但读到的数据固定不变、或明显超出量程；换一个命令字就“活”了",fix:"回手册核对：命令是 2 字节还是 1 字节、高低位谁先发、返回数据里是否夹着 CRC 字节。先把 raw[] 原样打印，和手册示例数据逐字节对照。"},{mistake:"把读最后一个字节时的 NACK 当成通信故障，或干脆不检查返回值",symptom:"代码里一遇到 NACK 就报错退出，永远读不到数据；或者返回值不看，读到的全是 0 还以为是传感器坏了",fix:"分清阶段：地址阶段的 NACK 才是“没人应答”，主机读最后一个字节回 NACK 是正常的收尾。用 HAL_I2C_Mem_Read 时这一步由 HAL 自动完成，不要自己再判错。"}],quizIds:["i2c-q1","i2c-q2","i2c-q3"],labIds:["i2c-transfer","clock-tree"]},{slug:"pwm-dimmer",title:"PWM 调光",oneLine:"在 TIM2_CH1 上输出 1 kHz PWM，只改 CCR 就改变 LED 亮度。",level:"入门",hardware:["STM32F407 / STM32G474 开发板","LED + 330 Ω 量级限流电阻（示意值）","可选：N 沟道 MOS 管，用来驱动更大电流的灯带","杜邦线","示波器（可选，量频率与占空比）"],goal:["用 f = TIMclk / ((PSC+1)(ARR+1)) 手算出 1 kHz，并说清两个 +1 的来历","按“时钟 → 引脚复用 → 时基 → 通道 → 启动”的顺序配好一路 PWM","运行中用 __HAL_TIM_SET_COMPARE 只改占空比，理解为什么频率不变","知道 0% 与 100% 的边界条件，以及预装载（ARPE / OC1PE）如何避免毛刺"],wiring:[{signal:"PWM 输出",mcuPin:"PA0",device:"LED 阳极（阴极串 330 Ω 量级电阻到 GND）",note:"TIM2_CH1，F4 上复用号为 AF1；电流更大的灯要经 MOS 管驱动，按你的板子原理图核对"},{signal:"调光输入",mcuPin:"PA1",device:"轻触按键一端（另一端接 GND）",note:"可选：按下换一档亮度，内部上拉、下降沿；按你的板子原理图核对"},{signal:"共地",mcuPin:"GND",device:"LED 或驱动级的公共地",note:"用 MOS / 三极管驱动时必须与 MCU 共地，否则栅极电平没有参考，按你的板子原理图核对"},{signal:"调试口",mcuPin:"PA13 / PA14",device:"ST-Link 或 DAP-Link 的 SWDIO / SWCLK",note:"F4 上 SWD 常复用在这两个脚上，便于单步看 TIM2->PSC / ARR / CCR1；按你的板子原理图核对"}],steps:[{title:"① 先确认 TIM2 的计数时钟是多少",detail:"查你工程的时钟树：F407 上 TIM2 挂在 APB1，APB1 定时器时钟常见为 84 MHz（示意，以参考手册与 CubeMX 显示为准）。为什么先做这一步：后面所有频率计算都以 TIMclk 为分子，取错总线频率，频率就会差一倍，怎么调 ARR 都对不上。"},{title:"② 开时钟，把 PA0 配成复用推挽",detail:"打开 TIM2 与 GPIOA 的时钟，把 PA0 配成 GPIO_MODE_AF_PP，复用号填 TIM2_CH1 对应的值（F4 上为 AF1，查数据手册确认）。为什么用复用而不是普通输出：PWM 波形由定时器比较器直接产生，CPU 不参与，波形稳定、无软件抖动。"},{title:"③ 用公式定 PSC 与 ARR",detail:"84 MHz / (83+1) = 1 MHz 计数频率，1 MHz / (999+1) = 1 kHz。为什么要盯着 +1：实际分频是 PSC+1、一个周期是 ARR+1 个计数点，漏掉任何一个，频率就正好差一档。调频率优先动 PSC，调占空比才动 CCR。"},{title:"④ 配通道：PWM 模式 1 + 初始占空比",detail:"OCMode 选 TIM_OCMODE_PWM1、Pulse 先给 300（30%）、OCPolarity 高有效。为什么高有效：LED 接在引脚与地之间时高电平点亮，占空比就等于亮度比例；如果驱动级是低有效，就改成低极性，别在代码里靠“取反 CCR”绕。"},{title:"⑤ 打开预装载并启动",detail:"AutoReloadPreload 设为使能（等于 ARPE），HAL_TIM_PWM_ConfigChannel 会打开 CCR 预装载（OC1PE），最后 HAL_TIM_PWM_Start 同时启动计数器与通道输出。为什么必须 Start 两次都做：只开 Base_Start 时计数器在跑，但通道没接到引脚，示波器上什么都看不到。"},{title:"⑥ 主循环里按档位改 CCR",detail:"把亮度分成 0–10 共 11 档，用 (step × (ARR+1)) / 10 算出 CCR，再 __HAL_TIM_SET_COMPARE 写进去。为什么只改 CCR：ARR 不动，一个周期的时间就不变，所以频率不变、只有高电平宽度改变——这就是“调光不调频”。"},{title:"⑦ 上板验证频率、占空比与边界",detail:"示波器量周期应为 1 ms、高电平宽度应为周期的 30%；再把 step 调到 0 和 10，确认 0% 时恒低、100% 时恒高。为什么专门测边界：CCR=0 与 CCR≥ARR+1 是两种特殊情况，很多“调不到全亮/全灭”的问题就卡在这里。"},{title:"⑧ 按负载决定要不要驱动级",detail:"小电流 LED 可以直接由引脚串限流电阻驱动；灯带、多个 LED 或电机必须经 MOS 管 / 三极管，并注意共地与续流。为什么：GPIO 的驱动电流有明确上限（见数据手册 I/O 特性），硬扛大电流会拉低电平、发热，甚至复位。"}],code:[{label:"HAL",language:"c",code:`#include "stm32f4xx_hal.h"

TIM_HandleTypeDef htim2;

/* 目标：PA0（TIM2_CH1）输出 1 kHz PWM，占空比决定 LED 亮度。
 * 时钟假设（示意，以你的时钟树为准）：TIM2 计数时钟 = 84 MHz
 *   84 MHz / (83+1) = 1 MHz 计数频率
 *   1 MHz  / (999+1) = 1 kHz 输出频率 */

static void pwm_init(void)
{
    /* 1. 两路时钟都要开：TIM2 在 APB1，GPIOA 在 AHB1 */
    __HAL_RCC_TIM2_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /* 2. PA0 交给 TIM2_CH1，推挽输出由定时器比较器驱动 */
    GPIO_InitTypeDef gpio = {0};
    gpio.Pin       = GPIO_PIN_0;
    gpio.Mode      = GPIO_MODE_AF_PP;
    gpio.Pull      = GPIO_NOPULL;
    gpio.Speed     = GPIO_SPEED_FREQ_LOW;
    gpio.Alternate = GPIO_AF1_TIM2;        /* F4 上 TIM2 为 AF1，换型号先查复用表 */
    HAL_GPIO_Init(GPIOA, &gpio);

    /* 3. 时基：PSC 分频、ARR 定一圈多少个计数点 */
    htim2.Instance               = TIM2;
    htim2.Init.Prescaler         = 83;     /* 写 83 → 实际分频 84，不是写 84 */
    htim2.Init.CounterMode       = TIM_COUNTERMODE_UP;
    htim2.Init.Period            = 999;    /* 写 999 → 一圈 1000 个计数点 */
    htim2.Init.ClockDivision     = TIM_CLOCKDIVISION_DIV1;
    htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE;  /* 打开 ARPE */
    HAL_TIM_PWM_Init(&htim2);

    /* 4. 通道：PWM 模式 1，初始占空比 30%，高电平有效 */
    TIM_OC_InitTypeDef oc = {0};
    oc.OCMode     = TIM_OCMODE_PWM1;       /* CNT < CCR 时输出有效电平（高） */
    oc.Pulse      = 300;                   /* CCR1 = 300 → 300/1000 = 30% */
    oc.OCPolarity = TIM_OCPOLARITY_HIGH;
    oc.OCFastMode = TIM_OCFAST_DISABLE;
    HAL_TIM_PWM_ConfigChannel(&htim2, &oc, TIM_CHANNEL_1);

    /* 5. 启动：计数器 + 通道输出一起打开，引脚才开始出波形 */
    HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);
}

/* 6. 设亮度：step 取 0–10，对应 0%–100% */
static void set_brightness(uint8_t step)
{
    if (step > 10U) {
        step = 10U;                        /* 上限保护，避免算出超过 ARR+1 的 CCR */
    }

    /* 只改比较值：ARR 不动 → 频率不变，高电平宽度变 → 亮度变 */
    uint32_t ccr = ((uint32_t)step * (htim2.Init.Period + 1U)) / 10U;
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, ccr);
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    pwm_init();

    uint8_t step = 3;
    set_brightness(step);                  /* 上电先给 30% */

    for (;;) {
        /* 演示：每 500 ms 换一档。实际项目里换成按键扫描或串口命令 */
        HAL_Delay(500);
        step = (uint8_t)((step + 1U) % 11U);
        set_brightness(step);
    }
}`,explain:[{item:"gpio.Alternate = GPIO_AF1_TIM2",desc:"把 PA0 连到 TIM2 的复用功能上；F4 上 TIM2 是 AF1，换型号或换引脚都必须查数据手册复用表。"},{item:"Prescaler = 83",desc:"PSC 寄存器写 83，实际分频是 84；84 MHz / 84 = 1 MHz 计数频率。写 84 会得到另一个频率。"},{item:"Period = 999",desc:"ARR 写 999，一圈共 1000 个计数点；1 MHz / 1000 = 1 kHz。改频率就改它或 PSC，改完记得重算。"},{item:"TIM_AUTORELOAD_PRELOAD_ENABLE",desc:"等价于置 CR1 的 ARPE：运行中改 ARR 时新周期在更新事件生效，避免出现“半个周期长、半个周期短”的怪波形。"},{item:"oc.Pulse = 300",desc:"写 CCR1 的初始值，决定初始占空比 300/1000 = 30%；之后随时可以用 __HAL_TIM_SET_COMPARE 改。"},{item:"oc.OCMode = TIM_OCMODE_PWM1",desc:"CNT < CCR 时输出有效电平（本例为高），所以占空比 = CCR / (ARR+1)；PWM 模式 2 则相反。"},{item:"HAL_TIM_PWM_Start",desc:"同时打开计数器与通道输出；只调 HAL_TIM_Base_Start 时计数器在跑，但引脚不会有波形。"},{item:"set_brightness 里的 ccr 计算",desc:"把 0–10 档换算成 0–1000 的计数点数，而不是把百分数直接写进 CCR；CCR 是“第几个计数点翻转”，量纲别混。"},{item:"__HAL_TIM_SET_COMPARE",desc:"只写 CCR1、不动时基；配合 OC1PE 预装载，新占空比在下一个更新事件生效，不会把当前脉冲从中间截断。"}]},{label:"寄存器对照",language:"c",code:`/* 同一路 PWM 的寄存器写法：只写真实寄存器名，
 * 字段含义与编码见参考手册 TIM 章节。 */
RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;     /* GPIOA 时钟 */
RCC->APB1ENR |= RCC_APB1ENR_TIM2EN;      /* TIM2 时钟 */

/* 1. PA0 → 复用功能，AF1（TIM2），推挽 */
GPIOA->MODER  &= ~(3U << (0 * 2));
GPIOA->MODER  |=  (2U << (0 * 2));       /* 10 = 复用功能 */
GPIOA->OTYPER &= ~(1U << 0);             /* 0 = 推挽 */
GPIOA->AFR[0]  = (GPIOA->AFR[0] & ~(0xFU << (0 * 4))) | (1U << (0 * 4));

/* 2. 时基：PSC 83 → 1 MHz，ARR 999 → 1 kHz */
TIM2->PSC  = 83;
TIM2->ARR  = 999;
TIM2->CR1 |= TIM_CR1_ARPE;               /* 打开 ARR 预装载 */

/* 3. 通道 1：PWM 模式 1、高有效、开 CCR 预装载 */
TIM2->CCR1  = 300;                       /* 30% 初始占空比 */
TIM2->CCMR1 &= ~TIM_CCMR1_OC1M;
TIM2->CCMR1 |= (TIM_CCMR1_OC1M_1 | TIM_CCMR1_OC1M_2);  /* PWM 模式 1 */
TIM2->CCMR1 |= TIM_CCMR1_OC1PE;          /* 打开 CCR1 预装载 */
TIM2->CCER  |= TIM_CCER_CC1E;            /* 使能 CH1 输出（CC1P = 0 为高有效） */

/* 4. 先把 PSC / ARR 装进影子寄存器，否则首个周期会按复位值走 */
TIM2->EGR |= TIM_EGR_UG;

/* 5. 启动计数器，引脚开始出波形 */
TIM2->CR1 |= TIM_CR1_CEN;`,explain:[{item:"RCC->AHB1ENR / RCC->APB1ENR",desc:"GPIOA 挂在 AHB1，TIM2 挂在 APB1；两个时钟门控都得打开，否则后面写寄存器全部无效。"},{item:"GPIOA->MODER / AFR[0]",desc:"MODER 每引脚 2 位写 10 表示复用；AFR 每引脚 4 位写外设编号，PA0 位于 AFR[0] 的第 0–3 位。"},{item:"TIM2->PSC / ARR",desc:"写入的是寄存器值，实际分频与周期都要 +1：84 MHz/(83+1)/(999+1) = 1 kHz。"},{item:"TIM_CR1_ARPE / TIM_CCMR1_OC1PE",desc:"分别是 ARR 与 CCR1 的预装载使能；运行中改参数时，新值在更新事件生效，才是无毛刺的关键。"},{item:"TIM2->EGR 的 UG 位",desc:"软件产生一次更新事件，把刚写的 PSC/ARR 立刻装进影子寄存器；不写它，第一个周期可能按复位值跑出异常频率。"},{item:"TIM_CCER_CC1E",desc:"通道 1 输出使能；不开它，计数器在跑、比较也在做，但引脚上不会出现波形。"}]}],pitfalls:[{mistake:"只调了 HAL_TIM_Base_Start，没有调 HAL_TIM_PWM_Start（或通道使能没打开）",symptom:"程序跑得很正常，示波器在引脚上却看不到任何波形，万用表量一直是低（或一直是高）",fix:"确认调用的是 HAL_TIM_PWM_Start；再核对复用号、CCR 通道号与 CCMR/CCER 的通道使能，三重确认后再怀疑硬件。"},{mistake:"PSC / ARR 忘了 +1，或把 PCLK1 当成定时器时钟",symptom:"实际频率正好是设计值的一半或两倍，怎么微调 ARR 都对不上",fix:"用 HAL_RCC_GetPCLK1Freq 取实际总线频率，按手册判断定时器时钟是否要 ×2，再手算 TIMclk/((PSC+1)(ARR+1))，最后用示波器量一个周期验证。"},{mistake:"运行中直接改 CCR / ARR，却没有开预装载",symptom:"每次调亮度或频率的瞬间，LED 闪一下、示波器上出现一个明显偏窄的脉冲",fix:"打开 ARPE 与 OCxPE（HAL 里是 AutoReloadPreload 与通道配置），让新值在更新事件生效；改 PSC 后主动等一次更新事件再观察。"},{mistake:"占空比按“百分数”直接写进 CCR，或想调 100% 却只写到 ARR",symptom:"亮度只能到一半左右；或者怎么加 CCR 都到不了全亮，最亮和最暗差得很少",fix:"CCR 是计数点数不是百分数：CCR = 档位 × (ARR+1) / 总档数；100% 需要 CCR ≥ ARR+1，0% 则是 CCR = 0。"},{mistake:"用 GPIO 直驱大电流负载，或驱动级没共地",symptom:"LED 偏暗、亮度不稳定；接灯带时引脚发热、电压被拉低，严重时一动作就复位",fix:"引脚只出控制信号：加 MOS 管 / 三极管 / 恒流驱动，感性负载加续流二极管；(N)MOS 低边驱动时源极与 MCU 共地。电流上限见数据手册 I/O 特性。"}],quizIds:["timer-q1","timer-q2","timer-q3"],labIds:["timer-pwm","clock-tree"]}],t=[...e,..._];export{t as C};
