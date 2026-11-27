const e={slug:"i2c",title:"I²C",en:"Inter-Integrated Circuit",oneLine:"I²C 只用两根线（SCL 时钟 / SDA 数据），靠开漏加地址，让几十个器件共享一条总线。",category:"protocol",level:"入门",minutes:25,goals:["画出 SCL/SDA 两根线的接法，并说清开漏 + 上拉为什么不是“可选优化”而是硬性要求","对照波形讲出 START、重复 START、STOP 的电平条件，以及第 9 个时钟上 ACK/NACK 由谁产生","看到 7 位地址与读/写位，能自己拼出地址字节，并解释 10 位地址为什么占两个字节","能按“写寄存器地址 → 重复 START → 读数据”的流程读懂一帧传感器读数，并知道用 `HAL_I2C_Mem_Read` 怎么实现"],analogy:{title:"一根被弹簧拉高的绳子，谁都能往下拽",text:"把 SDA 想成一根绷在弹簧上的绳子：每个器件手里只有一个“往下拽”的钩子（开漏的下管），没有人能主动往上推。大家都松手时，弹簧（上拉电阻）把绳子拉回高处，这就是逻辑 1；任何一个器件一拽，绳子就到低处，这就是逻辑 0。正因为“不能往上推”，两个器件同时动手也不会打架——这就是 I²C 敢让几十个器件挂在同一根线上的底气。"},why:["**传感器世界的默认总线**：温湿度、气压、加速度计、OLED、EEPROM、RTC 大量使用 I²C，学会一页就能对接一大类模块。","**两根线的代价最低**：引脚宝贵的封装里，I²C 用 2 个脚挂 100 多个地址，比 SPI 省片选、比 UART 省线。","**它把“总线”的概念讲透了**：线与、仲裁、ACK、时钟延展，这些机制在 CAN、USB 里会以别的形式再出现一遍。","**调试里最容易翻车的地方**：没上拉、地址错、总线被拉死，占了 I²C 故障的绝大多数——会查比会写代码更值钱。"],sections:[{id:"two-wires",title:"两根线：SCL 与 SDA",lead:"先建立物理图像：谁驱动、谁释放、高电平从哪来。",blocks:[{kind:"p",text:"**I²C（Inter-Integrated Circuit，内部集成电路总线）**由 Philips（现 NXP）提出，是**同步、多主多从、半双工**的串行总线：**SCL** 负责时钟，**SDA** 负责数据，两者都是**开漏（open-drain）+ 上拉电阻**。主机产生时钟并决定“什么时候开始说话”，从机靠地址被选中；同一时刻总线上只能有一个方向在传数据，所以说它是半双工。"},{kind:"terms",items:[{zh:"SCL",en:"Serial Clock",desc:"时钟线，由主机（或正在延展时钟的从机）拉低；高电平由上拉提供。"},{zh:"SDA",en:"Serial Data",desc:"数据线，双向；同一时刻由发送方驱动，接收方只读。"},{zh:"开漏",en:"open-drain",desc:"输出级只有下管：写 0 拉低，写 1 等于“放手”，高电平全靠外部上拉。"},{zh:"上拉",en:"pull-up",desc:"把总线在无人驱动时拉到高电平的电阻；它的阻值决定边沿快慢与功耗。"}]},{kind:"p",text:"**开漏的本质**：器件写 1 时并不是“输出高电平”，而是**把引脚放开（高阻）**，让上拉电阻把线拉到 VDD。所以总线的实际电平是“所有器件拉低动作的逻辑或”：只要有一个器件在拉低，线就是低；全体放手，线才是高。这叫**线与（wired-AND）**。"},{kind:"ul",items:["**必须开漏的理由一：线与，避免短路。** 如果改用推挽，一个器件推高、另一个拉低，等于把 VDD 和 GND 通过两只导通的管子短接，电流会烧引脚。开漏下“拉低”是唯一主动动作，物理上不可能互相顶牛。","**必须开漏的理由二：多主仲裁只能这么实现。** 仲裁要能发现“我发的是 1，线上却是 0”——只有“1 = 放手”时，这件事情才有意义，输的一方也能立刻放手而不损坏任何东西。","**必须开漏的理由三：电平转换。** 上拉到哪个电压，高电平就是哪个电压。3.3 V 器件和 5 V 器件可以挂同一条总线（前提是器件手册允许），因为 3.3 V 器件从不去“推高”，不会和 5 V 上拉对顶。"]},{kind:"note",tone:"info",title:"一句话区分：协议 ≠ 电平标准",text:"**I²C 是协议，不是电平标准**：它规定了“两根线怎么配合、帧长什么样、ACK 怎么回”，而“高电平要几伏、上升时间允许多大”由规范里的电气章节和你选的器件共同约束。同理，RS232/RS485 是电气标准，Modbus 是应用层协议（协议总览页有完整四层框架）。"},{kind:"kv",items:[{k:"线数",v:"2 根（SCL / SDA）+ 共地"},{k:"速率",v:"标准模式 100 kbit/s、快速模式 400 kbit/s 量级（具体以规范/手册为准）"},{k:"拓扑",v:"多主多从共享一条总线，靠地址选中从机"},{k:"寻址",v:"7 位地址为主，另有 10 位地址扩展"},{k:"电平",v:"开漏 + 上拉，高电平由上拉所接电源决定"},{k:"典型器件",v:"温湿度传感器、EEPROM、OLED、RTC、IO 扩展芯片"}]}]},{id:"transaction",title:"事务时序：START 到 STOP",lead:"这一节是 I²C 的语法：什么时候算开始、什么时候算一字节、谁在第 9 个时钟说话。",blocks:[{kind:"p",text:"**数据有效性规则**先定下来：SCL 为高电平期间，SDA 必须保持稳定（接收方就在这个窗口采样）；SDA 只允许在 SCL 为低时改变。**唯一例外就是 START 与 STOP**——它们故意在 SCL 高时让 SDA 跳变，从而和普通数据位区分开。"},{kind:"p",text:"以下三种总线状态是 **I²C 规范的定义**（不是“约定俗成”）："},{kind:"ul",items:["**START（启动）**：SCL 保持高电平时，SDA 由**高变低**。总线从空闲进入占用，后面的第一个字节一定是地址。","**重复 START（Repeated START，写作 Sr）**：一次事务中途**不发 STOP**，直接再制造一次“SCL 高时 SDA 高→低”，相当于“换个话题继续聊”。典型用途是把“写寄存器地址”和“读数据”接到一起，且不让别的潜在主机插进来。","**STOP（停止）**：SCL 保持高电平时，SDA 由**低变高**。总线回到空闲，任何主机都可以重新发起 START。"]},{kind:"table",caption:"一次“写寄存器地址 → 读数据”的事务分解，与下方动画实验室的步骤一一对应。",head:["阶段","主机发什么","从机回什么","总线状态"],rows:[["START","SCL 高时把 SDA 由高拉低","—","总线由空闲转为忙"],["地址字节（写）","`7 位地址 + 0`，共 8 位","第 9 个时钟把 SDA 拉低 = ACK","被寻址的从机就位"],["寄存器地址","要访问的内部寄存器地址 1 字节","ACK（不认就 NACK）","从机内部指针指向该寄存器"],["重复 START","SCL 高时 SDA 再跳变一次，不发 STOP","—","总线不释放，方向切换"],["地址字节（读）","`7 位地址 + 1`","ACK，随后开始送数据","从机接管 SDA"],["数据字节","每收 1 字节回 ACK，最后一字节回 NACK","逐字节送出 8 位数据","主机决定何时收尾"],["STOP","SCL 高时把 SDA 由低放高","—","总线回到空闲"]]},{kind:"p",text:"**7 位地址怎么拼**：地址帧是 8 位 = 7 位从机地址 + 1 位方向位。方向位 `0` 表示主机写（主机→从机），`1` 表示主机读（从机→主机）。所以手册里写“地址 0x48”通常指 7 位值，总线上实际出现的是 `0x48<<1 | 0 = 0x90`（写）或 `0x91`（读）。**HAL 要的是已左移的 8 位形式**，这是新手最常见的地址错误来源。"},{kind:"p",text:"**10 位地址**一句话：为地址空间不足而扩展，第一个字节用 `11110` 作前缀带上 2 位高位地址与方向位，第二个字节补上剩下 8 位——也就是一次寻址要吃掉两个字节，且重复 START 后仍要再发一遍。日常接传感器基本用不到，见到 `0x78` 这类“看起来像 8 位地址”的值先确认它是不是已经左移过的 7 位地址。"},{kind:"p",text:"**ACK / NACK 发生在每个字节之后的第 9 个时钟**：发送方发完 8 位后**释放 SDA**（开漏让它被上拉为高），接收方如果想“收到了”，就在这第 9 个时钟把 SDA **拉低**，这就是 **ACK**；如果保持放手让 SDA 为高，就是 **NACK**。所以“谁拉低 SDA”永远是这个字节的接收方：地址字节阶段是从机，主机读数据阶段是主机自己。"},{kind:"ul",items:["**NACK 含义一：从机不在。** 地址阶段没人应答，通常意味着地址算错、器件没上电、没接上拉或总线被拉死。主机应放弃本次事务（发 STOP 或重新 START），HAL 会返回错误。","**NACK 含义二：主机不想再收了。** 读数据时，主机在最后一个字节回 NACK，是**正常的结束信号**，告诉从机“够了，我要发 STOP 了”。这不是出错。","**从机也可能回 NACK**：写数据时若从机内部忙或缓冲区满，它可以不应答，主机据此决定重试或放弃。"]},{kind:"lab",labId:"i2c-transfer",caption:"单步走一遍 START → 地址 → ACK → 寄存器 → 重复 START → 数据 → STOP；试着改上拉强弱，看上升沿怎么变慢。"},{kind:"note",tone:"tip",title:"别把 START/STOP 当“电平标准”",text:"START 和 STOP 是**总线状态的迁移条件**，判断依据是“SCL 高电平时 SDA 往哪个方向跳”。用逻辑分析仪抓波形时，I²C 解码器找的就是这两处跳变；如果一段数据里出现“SCL 高时 SDA 跳变”，解码器会认为这里有一个 START 或 STOP——这也是毛刺最容易造成误帧的地方。"}]},{id:"stretching-arbitration",title:"延展、仲裁与电容上限",lead:"三个机制解释了 I²C 的能力边界：能等、能抢、但不能太长太快。",blocks:[{kind:"p",text:"**时钟延展（clock stretching）**：从机来不及处理时，可以在 SCL 为低的阶段**把 SCL 拉住不放**，主机释放 SCL 后必须检测到 SCL 真正变高才继续。这是 I²C 里少见的“从机反控主机”，也是慢速传感器（如正在做一次转换的温度计）能与高速主机共存的原因。注意 HAL 里有个 `NoStretchMode`，把它设成“禁用延展”会让这类从机直接被判超时。"},{kind:"p",text:"**多主仲裁（arbitration）**：两个主机同时发 START、同时发地址时，双方逐位比较 SDA：每个主机一边发一边读回总线电平。**发 1（放手）却读到 0 的那一方，当场输掉仲裁**，立刻停止驱动 SDA，转为监听（通常切到从机接收模式），赢家完全感知不到有人抢过。因为“0”会盖住“1”（线与），地址数值小的那一方自然胜出，而且**整个过程不丢任何一位数据**——这叫无损仲裁。"},{kind:"ul",items:["**仲裁的前提是开漏**：只有“1 = 放手”时，输家才能毫无副作用地退出；推挽输出一旦对顶就是短路。","**仲裁比的是地址与数据位**，不是“谁先发”——先发的一方只是先占线，位比较仍按位进行。","**单主系统也用得上**：总线上只要存在第二个可能发起传输的器件（多主、或多核系统），就必须按仲裁规则设计。"]},{kind:"p",text:"**总线电容是硬上限**：I²C 规范对一条总线的**总电容**设了上限（具体数值以规范原文为准），它由器件引脚电容、PCB 走线、排线/杜邦线共同贡献。电容越大，同样的上拉电阻下**上升沿越慢**，高电平可能还没到就被采样，或者直接违反规范允许的上升时间——于是表现为“器件少时正常、一挂多就偶发 NACK”。长线、多器件、大上拉，三者只能取其二。"},{kind:"formula",latex:"t_{r} \\approx 0.847 \\times R \\times C",caption:"把总线看成上拉电阻 R 与总线电容 C 组成的一阶 RC：从 30% 到 70% 的上升时间近似为 0.847·R·C。这是**RC 充电近似**，只用来判断量级与调参方向——真实边沿还受器件驱动能力、多个上拉并联（等效 R 变小）、探头电容影响，最终以 I²C 规范对上升时间的要求和你的示波器实测为准，不要拿它当验收数字。"},{kind:"ul",items:["**上拉太小（R 小）**：边沿快，但器件拉低时要灌入更大电流，功耗升高，还可能超出引脚的灌电流能力。","**上拉太大（R 大）**：省电，但上升沿变慢，容易撞上规范允许的最大上升时间，速率与挂载数量都受限。","**没有唯一“正确阻值”**：它被“最大上升时间”和“最大灌电流”两头夹住，还要算上总电容，必须按规范公式核算后再实测波形确认。"]},{kind:"note",tone:"warn",title:"不要背数字，要会算",text:"本页刻意不给“上拉应为 X kΩ、上升时间应为 Y ns”这类具体值：它们随总线电容、供电电压、器件灌电流能力而变，抄一个数字往往比不抄更危险。正确做法是拿规范里的电气表格 + 你板子的实测上升时间互相验证。"}]},{id:"sensor-read",title:"读传感器：写地址再读数据",lead:"把前面的时序拼起来，就是每天都在用的“读一个寄存器”。",blocks:[{kind:"p",text:"绝大多数 I²C 传感器内部是一张**寄存器表**（谁是谁、地址多少，看器件手册的 register map）。主机想读温度，实际动作是：先告诉从机“我要访问哪个寄存器”，再让从机把这个寄存器的内容送回来。中间必须用**重复 START** 换方向，而不是 STOP 后再 START——否则中间可能被别的主机插队，且多一次总线释放。"},{kind:"ol",items:["**START**：主机拉低 SDA 抢占总线。","**发地址 + 写位（0）**：等从机在第 9 个时钟回 ACK。","**发寄存器地址**：1 个字节（也有器件用 16 位寄存器地址，那就发 2 个字节），从机 ACK 后内部指针指向该寄存器。","**重复 START**：不发 STOP，直接再起一次，方向准备翻转。","**发地址 + 读位（1）**：从机 ACK，随后由从机驱动 SDA 逐位送出数据；主机每收一字节回 ACK，最后一字节回 **NACK**。","**STOP**：主机释放总线，事务结束。"]},{kind:"code",title:"HAL 实现：读传感器的 WHO_AM_I 与温度寄存器（学习示意，引脚与地址请按你的板子核对）",language:"c",code:`#include "stm32f4xx_hal.h"

I2C_HandleTypeDef hi2c1;

/* 7 位地址 0x48 只是示意：以器件手册写的地址为准。
   HAL 的 DevAddress 参数要的是“已左移一位”的 8 位形式。 */
#define SENSOR_ADDR_7BIT   0x48U
#define SENSOR_DEV_ADDR    (SENSOR_ADDR_7BIT << 1)   /* 0x90；HAL 内部按读/写自动改最低位 */
#define REG_WHO_AM_I       0x0FU                     /* 器件身份寄存器（地址查手册） */
#define REG_TEMP           0x00U                     /* 温度寄存器起始地址（查手册） */

static void i2c1_init(void)
{
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_I2C1_CLK_ENABLE();

    /* 1. 引脚：复用 + 开漏；高电平靠外部上拉，内部弱上拉只适合临时验证 */
    GPIO_InitTypeDef gpio = {0};
    gpio.Pin       = GPIO_PIN_8 | GPIO_PIN_9;   /* PB8=SCL，PB9=SDA（按你的板子改） */
    gpio.Mode      = GPIO_MODE_AF_OD;            /* AF_OD：交给 I2C1，且必须是开漏 */
    gpio.Pull      = GPIO_PULLUP;
    gpio.Speed     = GPIO_SPEED_FREQ_VERY_HIGH;  /* 边沿要够快，别让 GPIO 拖慢上升时间 */
    gpio.Alternate = GPIO_AF4_I2C1;              /* 复用编号见数据手册引脚表 */
    HAL_GPIO_Init(GPIOB, &gpio);

    /* 2. 外设参数 */
    hi2c1.Instance             = I2C1;
    hi2c1.Init.ClockSpeed      = 100000;                  /* 标准模式 100 kbit/s 量级；快速模式 400 kbit/s 量级 */
    hi2c1.Init.DutyCycle       = I2C_DUTYCYCLE_2;
    hi2c1.Init.OwnAddress1     = 0;                       /* 只做主机，不需要自身地址 */
    hi2c1.Init.AddressingMode  = I2C_ADDRESSINGMODE_7BIT; /* 7 位地址模式 */
    hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
    hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
    hi2c1.Init.NoStretchMode   = I2C_NOSTRETCH_DISABLE;   /* 允许从机时钟延展，慢速器件才不会被判超时 */
    if (HAL_I2C_Init(&hi2c1) != HAL_OK) {
        Error_Handler();                                  /* CubeMX 生成的错误处理 */
    }
}

/* 3. 读一个 8 位寄存器：HAL 内部会做 START → 地址+W → 寄存器地址 → 重复 START → 地址+R → 收数据 → STOP */
static HAL_StatusTypeDef sensor_read(uint8_t reg, uint8_t *buf, uint16_t len)
{
    return HAL_I2C_Mem_Read(&hi2c1,
                            SENSOR_DEV_ADDR,       /* 已左移的 8 位地址 */
                            reg,                   /* 寄存器地址：先写进从机内部指针 */
                            I2C_MEMADD_SIZE_8BIT,  /* 寄存器地址宽度 8 位（16 位器件改这个参数） */
                            buf, len,              /* 读到哪里、读几个字节 */
                            10);                   /* 超时（ms）：慢速从机要留余量 */
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();   /* 时钟树见“时钟与复位”页 */
    i2c1_init();

    uint8_t id = 0;
    uint8_t temp[2] = {0};

    /* 4. 先探活：地址对了、器件在、总线有上拉，这里才会返回 HAL_OK */
    if (HAL_I2C_IsDeviceReady(&hi2c1, SENSOR_DEV_ADDR, 3, 10) != HAL_OK) {
        Error_Handler();
    }

    /* 5. 读身份：手册里 WHO_AM_I 是固定值，用它确认“读的是对的那颗片子” */
    if (sensor_read(REG_WHO_AM_I, &id, 1) == HAL_OK) {
        /* 例如与手册比对：id == 0x5A */
    }

    /* 6. 连续读两个寄存器：温度高字节 + 低字节，从机内部指针会自动递增 */
    (void)sensor_read(REG_TEMP, temp, 2);

    for (;;) { }
}`,explain:[{item:"gpio.Mode = GPIO_MODE_AF_OD",desc:"复用开漏是 I²C 引脚的唯一正确模式；写成推挽会与总线上其他器件的拉低动作对顶。"},{item:"gpio.Pull = GPIO_PULLUP",desc:"内部弱上拉阻值很大、上升时间很长，只能用于低速短线的临时验证；正式设计必须查总线电容后选外部上拉。"},{item:"SENSOR_DEV_ADDR = 7 位地址 << 1",desc:"HAL 的 DevAddress 是“已含读写位位置”的 8 位值；直接传 0x48 会变成另一个地址，表现为永远 NACK。"},{item:"reg + I2C_MEMADD_SIZE_8BIT",desc:"MemAddress 是要访问的内部寄存器号，MemAddSize 决定它是 1 字节还是 2 字节——取决于器件手册。"},{item:"buf, len",desc:"要读的字节数；len > 1 时从机内部地址指针通常自增（是否自增、是否跨页，以手册为准）。"},{item:"10（Timeout）",desc:"单位毫秒。总线被拉死或上拉缺失时，函数会在这里超时返回 HAL_TIMEOUT，而不是永远卡住。"},{item:"HAL_I2C_Mem_Read 内部时序",desc:"等价于本节 6 步：START → 地址+W → 写寄存器地址 → 重复 START → 地址+R → 收数据（最后一字节回 NACK）→ STOP。"}]},{kind:"tabs-code",title:"同一件事（读一个寄存器）的三种写法",note:"三种写法操作的是同一组寄存器，区别只在“谁帮你串流程”。注意：F4 与 G4 的 I²C 实现不同（时序计算与状态位命名都不一样），本页寄存器写法用允许的 `I2C1->CR1/CR2/OAR1/CCR/TRISE/ISR/ICR/DR` 拼骨架，**真实位定义必须对照你手上系列的参考手册**。",variants:[{label:"HAL",language:"c",code:`/* 高层封装：一条函数覆盖“写寄存器地址 + 重复 START + 读数据 + STOP” */
uint8_t who = 0;

if (HAL_I2C_Mem_Read(&hi2c1,
                     (0x48U << 1),          /* DevAddress：已左移的 7 位地址 */
                     0x0FU,                 /* MemAddress：寄存器号 */
                     I2C_MEMADD_SIZE_8BIT,  /* 寄存器地址宽度 */
                     &who, 1,               /* 数据指针与长度 */
                     10) != HAL_OK) {       /* 超时 ms */
    /* HAL_ERROR = 收到 NACK / 仲裁失败；HAL_TIMEOUT = 总线卡住 */
}`,explain:[{item:"HAL_I2C_Mem_Read",desc:"HAL 里“读寄存器”的专用封装；内部已经包含重复 START 与末字节 NACK，不用自己拼。"},{item:"返回值",desc:"HAL_OK / HAL_ERROR / HAL_BUSY / HAL_TIMEOUT，分别对应“成功 / NACK 或仲裁失败 / 外设忙 / 超时”，调错时按这个分类排查最快。"}]},{label:"LL",language:"c",code:`#include "stm32f4xx_ll_i2c.h"

/* LL 没有“内存读”的复合封装：写寄存器地址与读数据要自己接成两段 */
LL_I2C_HandleTransfer(I2C1,
                      (uint32_t)(0x48U << 1),        /* 地址 + 写 */
                      LL_I2C_ADDRSLAVE_7BIT,
                      1U,                            /* 本轮发 1 个字节 */
                      LL_I2C_MODE_SOFTWAREEND,       /* 结束不发 STOP，为重复 START 留路 */
                      LL_I2C_GENERATE_START_WRITE);
while (LL_I2C_IsActiveFlag_TXIS(I2C1) == 0U) { }     /* 等发送寄存器空 */
LL_I2C_TransmitData8(I2C1, 0x0FU);                   /* 发寄存器地址，从机在此后回 ACK */
while (LL_I2C_IsActiveFlag_TC(I2C1) == 0U) { }       /* 等这一字节（含第 9 个时钟）走完 */

LL_I2C_HandleTransfer(I2C1,
                      (uint32_t)((0x48U << 1) | 1U), /* 地址 + 读 */
                      LL_I2C_ADDRSLAVE_7BIT,
                      1U,
                      LL_I2C_MODE_AUTOEND,           /* 读完由硬件发 STOP */
                      LL_I2C_GENERATE_START_READ);   /* 这里的 START 就是重复 START */
while (LL_I2C_IsActiveFlag_RXNE(I2C1) == 0U) { }     /* 等接收寄存器有数据 */
uint8_t who = LL_I2C_ReceiveData8(I2C1);`,explain:[{item:"LL_I2C_HandleTransfer",desc:"一次配置“地址 + 本次字节数 + 结束方式 + 是否发 START”，是 LL 操作 I²C 的核心入口。"},{item:"LL_I2C_MODE_SOFTWAREEND / AUTOEND",desc:"前者结束时不自动发 STOP（留给重复 START），后者由硬件在字节数收满后自动 STOP。"},{item:"TXIS / TC / RXNE",desc:"分别是“发送寄存器空 / 当前字节传完 / 接收寄存器有数据”，对应三个必须等待的时刻。"}]},{label:"寄存器",language:"c",code:`/* 骨架示意：只用本页允许的 I2C1->CR1/CR2/OAR1/CCR/TRISE/ISR/ICR/DR。
   先配时序、再启传输、最后搬字节；位定义以你系列参考手册为准。 */

/* 1. 配时序：必须先关外设（CR1 的 PE）再写配置，否则多数配置位不生效 */
I2C1->CR1   &= ~I2C_CR1_PE;
I2C1->CR2    = 42U;      /* 例：APB1 = 42 MHz，告诉外设算时序用的时钟（按你的时钟树改） */
I2C1->CCR    = 210U;     /* 占位示意：约等于 APB1/(2×100 kHz)；实际按手册公式算 */
I2C1->TRISE  = 43U;      /* 占位示意：标准模式下常取 APB1 周期数 + 1，见手册 */
I2C1->OAR1   = 0U;       /* 只做主机，不需要自身地址 */
I2C1->CR1   |= I2C_CR1_PE;   /* 使能后外设才开始驱动引脚 */

/* 2. 写阶段：START + 地址(写) + 寄存器地址 */
while ((I2C1->ISR & I2C_ISR_BUSY) != 0U) { }   /* 总线忙就等，别硬发 */
I2C1->CR2 = ((0x48U << 1)                      /* SADD：7 位地址左移一位 */
             | I2C_CR2_START);                 /* 置 START；RD_WRN=0 表示写方向 */
while ((I2C1->ISR & I2C_ISR_TXIS) == 0U) { }   /* 等发送寄存器空 */
I2C1->DR = 0x0FU;                              /* 发寄存器地址字节 */
while ((I2C1->ISR & I2C_ISR_TC) == 0U) { }     /* TC：该字节（含第 9 个时钟 ACK）走完 */

/* 3. 读阶段：重复 START + 地址(读) + 读 1 字节，末字节主机回 NACK */
I2C1->CR2 = ((0x48U << 1)
             | I2C_CR2_RD_WRN                  /* 读方向：地址字节最低位为 1 */
             | I2C_CR2_START);                 /* 再置 START = 重复 START，总线不释放 */
while ((I2C1->ISR & I2C_ISR_RXNE) == 0U) { }   /* 等接收寄存器有数据 */
uint8_t who = (uint8_t)I2C1->DR;               /* 读出数据；收尾（NACK/STOP）按手册配置 */

/* 出错时看状态位并用 ICR 清标志，再按需要重新初始化外设 */
I2C1->ICR = I2C_ICR_STOPCF;                    /* 清 STOP 检测标志（示例） */`,explain:[{item:"I2C1->CR1 的 PE",desc:"外设使能位。关掉它才能安全改 CCR/TRISE/OAR1，改完再打开。"},{item:"I2C1->CR2 = 42",desc:"CR2 里有一个字段要填入 APB1 时钟（MHz），CCR 与 TRISE 的算法都依赖它；写成实际频率，别照抄 42。"},{item:"I2C1->CCR / I2C1->TRISE",desc:"I²C 的“速率与建立时间”配置；具体系数与单位以参考手册时序章节为准，本页数值只是占位示意。"},{item:"I2C1->ISR 的 BUSY / TXIS / TC / RXNE",desc:"分别是总线忙、发送寄存器空、当前字节完成、收到数据；流程就靠这几位串起来。"},{item:"I2C1->ICR",desc:"只写寄存器：写 1 清对应标志，典型是在错误恢复后清 STOP/NACK 检测位。"}]}]},{kind:"p",text:"**`HAL_I2C_IsDeviceReady` 是排查神器**：它只做“START + 地址 + 看有没有 ACK”，不读数据。写业务代码前先让它通过，能把“地址错 / 没上拉 / 没上电”三类问题和“寄存器读错”彻底分开。"}]},{id:"config-order",title:"配置顺序与上板排查",lead:"同样的代码在别人板子上能跑，在你板子上不行，通常差在这六步里的某一步。",blocks:[{kind:"ol",items:["**确认引脚复用**：查数据手册引脚表，确认 PB8/PB9 之类引脚确实能复用成 I2C1，且复用编号正确；换系列或换封装都要重查。","**把引脚配成复用开漏**：`GPIO_MODE_AF_OD`，速度别选最低档；上下拉先按“外部上拉已就位”处理。","**评估上拉**：数一下总线上器件与走线，按规范的最大上升时间与器件灌电流能力核算，先算再实测。","**配外设参数**：速率（100 kbit/s 标准模式 / 400 kbit/s 快速模式量级）、7 位或 10 位寻址、允许时钟延展。","**探活**：用 `HAL_I2C_IsDeviceReady` 以正确（已左移）的地址确认从机应答，再进入业务读写。","**读一条已知值**：读 WHO_AM_I 这类固定值寄存器比对，能立刻区分“通信不通”和“寄存器理解错”。"]},{kind:"note",tone:"tip",title:"调试顺序：先量电平，再抓波形，最后怀疑代码",text:"① 万用表量空闲时 SCL/SDA 是否都被拉到 VDD——不是高电平，先怀疑上拉和供电；② 示波器/逻辑分析仪看有没有 START、地址后第 9 个时钟是不是低（ACK）；③ 才去看代码里的地址是否左移、寄存器号是否抄对。这个顺序能把排查时间压到最短。"},{kind:"p",text:"**兜底手段：总线卡死时怎么救**。如果从机在传输中途被复位（比如你的 MCU 比从机先上电、或调试时反复复位），从机可能一直拉着 SDA 等时钟，表现为 `BUSY` 永远置位、每次传输都超时。标准做法是：**手动把 SCL 当作 GPIO 敲 9 个以上时钟脉冲**，让从机把剩下的位移完，再补一个 STOP，然后重新初始化 I²C 外设。很多 HAL 版本也提供 `HAL_I2C_DeInit` + 重新 `HAL_I2C_Init` 的复位路径作为临时手段。"},{kind:"compare",cardId:"i2c"}]}],mistakes:[{mistake:"SDA/SCL 没接上拉，或只靠内部弱上拉",symptom:"什么数据都读不到，`HAL_I2C_Mem_Read` 返回 HAL_TIMEOUT 或 HAL_ERROR；用示波器看空闲电平可能只有 1 V 出头，上升沿“圆头”很慢",fix:"先量空闲电平：开漏释放时两根线都应该是接近 VDD 的高电平。不是就补外部上拉（按总线电容与规范上升时间核算），并把引脚模式确认为复用开漏。"},{mistake:"地址没左移，或把 8 位地址当 7 位地址用",symptom:"每次传输都在地址字节后的第 9 个时钟收到 NACK，`HAL_I2C_IsDeviceReady` 一直失败；换个地址写法（如 0x48 与 0x90）就通了",fix:"HAL 的 DevAddress 要的是“7 位地址左移一位”。先用 `HAL_I2C_IsDeviceReady` 扫一遍 0x08–0x77，找到真正应答的 7 位地址再写进代码；注意有些模块丝印写的是已左移的值。"},{mistake:"总线被拉死（SDA 一直为低，BUSY 不释放）",symptom:"上电后第一次传输就超时，之后所有操作都返回 HAL_BUSY；示波器上 SDA 恒定低电平，SCL 空闲高",fix:"多半是从机在传输中途被复位，正拉着 SDA 等第 9 个时钟。把 SCL 临时切成 GPIO 手动发 9 个以上时钟脉冲 + 一个 STOP，再重新初始化外设；长期方案是让从机先于 MCU 完成上电，或加电源监控。"},{mistake:"把 NACK 一律当成“通信故障”",symptom:"读最后一个字节时收到 NACK，代码里报错退出，结果永远读不到数据",fix:"分清阶段：地址阶段的 NACK 才是“没人应答”；主机读数据时最后一字节回 NACK 是**正常的结束标志**。用 `HAL_I2C_Mem_Read` 时这件事由 HAL 自动完成，不要自己在回调里把它当错误。"},{mistake:"禁用时钟延展，或超时设得过短",symptom:"平时能读，器件做转换时偶发 HAL_TIMEOUT/NACK；降低速率后症状减轻",fix:"保持 `NoStretchMode` 为允许延展，并把 Timeout 按器件手册的最长转换时间留足余量；若从机确实不支持延展，就降低速率或拉长轮询间隔。"}],takeaways:["两根线 + 开漏 + 上拉 = 一条“谁都能拉低、谁都不能推高”的线与总线；开漏不是省事，而是线与、多主仲裁、电平转换三件事的共同前提。","START/重复 START/STOP 的本质是“SCL 高时 SDA 跳变”；每字节后的第 9 个时钟由接收方拉低 SDA 表示 ACK，NACK 可能意味着“没人在”也可能意味着“主机不想再收”。","读传感器永远是“写寄存器地址 → 重复 START → 读数据”；上拉阻值由总线电容与上升时间决定，先算再实测，别抄数字。"],quizIds:["i2c-q1","i2c-q2","i2c-q3"],keywords:["I²C","SCL","SDA","开漏","上拉电阻","线与","ACK/NACK","7 位地址","时钟延展","多主仲裁"]};export{e as i2cLesson};
