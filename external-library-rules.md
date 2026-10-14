# Crownfall1 外部内容库接入规则

适用日期：2026 年 10 月 14 日。项目版本：Unity 2022.3.62f3c1。内容协议：`SchemaVersion = 1`，`ProfileId = "crownfall1-v1"`。

这套规则用于网站生成、玩家下载与分享，以及游戏导入外部内容。设计者应先确定内容分类，再按本规则生成文件；涉及游戏行为时，只组合已经注册的事件子效果，并引用当前世界实际存在的资源和角色上下文。

同目录的 [content-profile.json](content-profile.json) 是当前 **103 种子效果的完整参数能力目录**，供网站和 AI 查询。它不是可导入的事件库，也不是涵盖所有库分类的完整 JSON Schema。

## 1 当前能接入哪些内容

| 分类目录名称 | 根内容字段 | 当前用途 | 可交付范围 |
|---|---|---|---|
| `CityNames` | `Items` | 城市命名候选池 | 支持 |
| `NPCNames` | `Items` | NPC 命名候选池 | 支持 |
| `FamilyNames` | `Items` | 家族命名候选池 | 支持 |
| `CompanyNames` | `Items` | 公司命名候选池 | 支持 |
| `CountryNames` | `Items` | 国家命名候选池 | 支持 |
| `Dialogues` | `Lines / Conversations / Profiles` | NPC 单句、分支会话、AI 人设知识 | 支持，按第 4 节匹配和触发 |
| `AIStyles` | `Name / WorldBackground / StyleInstructions` 及版本字段 | 世界共同背景与总体 AI 表达风格 | 支持独立 JSON，载入后点击应用；不能进入 Mod 包 |
| `Events` | `Entries` | 完整事件，由现有子效果组合 | 支持，按第 5～6 节执行 |
| `Festivals` | `Entries` | 节日时间规则、关联事件 | 支持，关联事件需同时启用 |
| `Items` | `Entries` | 外部物品、图标、消耗效果、贸易和生产来源 | 支持，使用专用 JSON＋PNG 导入 |
| `Quests` | `Entries` | 支线设计说明及阶段条目 | 可加载和保存，尚无外部任务自动执行入口 |
| `SpecialNPCs` | `Entries` | 特殊 NPC 描述条目 | 可加载和保存，尚无自动生成人物入口 |
| `Other` | 不适用 | 外部素材页保存文件 | 不代表进入游戏运行 |
| 疾病定义 | 无外部分类 | 游戏内置疾病资源 | 当前不能以玩家外部库新增疾病 |

名字库只提供候选名称，不负责创建城市、国家、NPC 或公司，也不表示按文件顺序给所有对象逐一赋名。城市数量、归属和世界生成仍由游戏系统决定。

`Quests` 和 `SpecialNPCs` 的文件通过校验，不等于玩家能领取任务或出现特殊 NPC。现有任务效果可引用游戏已有任务资源；生成 NPC 的效果可调用已有生成路径，两者都不能替代尚未接通的描述库。

## 2 文件与交付要求

### 2.1 通用作者规则

新增交付文件统一使用 UTF-8 标准 JSON，单一根对象，字段大小写精确一致。不要使用注释、尾逗号、单引号字符串、重复键、额外根对象、`$type` 等 CLR 类型元数据、C# 类、脚本或 Unity 对象序列化。

游戏已经明确拒绝未知字段、重复键、根对象后的额外内容、错误类型、非法枚举和数值溢出。部分 JSON 读取器可能容忍非标准语法；作者仍应生成标准 JSON，不能依赖这种兼容行为。

| 要求 | 当前边界 |
|---|---|
| 普通单文件体积 | 不超过 `10 × 1024 × 1024` 字节，即 10 MiB |
| JSON 嵌套深度 | 不超过 64 |
| 名字／Entries 数量 | 1～5000 条；名字还需至少一个有效非空名称 |
| 版本 | 新文件明确写 `"SchemaVersion": 1` |
| 能力配置 | 新文件明确写 `"ProfileId": "crownfall1-v1"` |
| 枚举 | 使用本规则或能力目录中的英文原名字符串，不能写中文、数字或改变大小写 |
| 整数 | JSON 整数，符合对应范围；通用整数不能溢出 Int32 |
| 小数 | 有限值，符合能力目录范围；不使用 NaN、Infinity |
| 空值 | 需要空文本时写 `""`，空列表写 `[]`，空匹配写 `{}`；不要把对象或条目写成 `null` |

名字、事件、节日和物品的两个版本字段目前兼容省略；上述要求是新文件的交付规范。**对话库和世界 AI 风格必须显式提供这两个字段**，否则会拒绝。名字库中的 `null`、空白和重复词条有兼容忽略逻辑，新文件应在生成时清理。AIStyles 的文件上限是 **128 KiB**，不适用普通库的 10 MiB 上限，也不使用 Items / Entries 数量规则；完整规则见第 4.5 节。

文字长度限制按 C# `string.Length` 计算，即 UTF-16 代码单元，包含标点、换行；部分 emoji 会占多个单位。

### 2.2 分类和安装路径

游戏使用：

```text
Application.persistentDataPath/
  NameLibraries/
    CityNames/城市库.json
    NPCNames/人物库.json
    FamilyNames/家族库.json
    CompanyNames/公司库.json
    CountryNames/国家库.json
    Dialogues/对话库.json
    AIStyles/世界风格.json
    Events/事件库.json
    Festivals/节日库.json
    Items/物品库.json
```

当前 Windows 项目的根目录为：

```text
C:/Users/19656/AppData/LocalLow/DefaultCompany/Crownfall1/
```

发布版应使用游戏实际的 `Application.persistentDataPath`，不能把本机用户名和目录硬编码到网站生成内容中。

优先从游戏已有外部资源面板导入，选择正确分类。库选择值是文件的名称部分，例如 `对话库`，不包含 `.json`，不能填绝对路径、`../` 或目录分隔符。同名导入会生成带 `_2`、`_3` 等后缀的新文件，应选择实际保存后的名称。

素材页可以保存 `.txt / .csv / .yaml / .yml` 等文件，但当前库消费者使用 JSON。这些格式保存成功，不表示可以运行。素材页“导入文件夹”只处理该目录的直接文件，最多 256 个，不负责递归安装整个 Mod。

### 2.3 ID 和依赖约定

作者统一使用稳定的命名空间编号，例如 `myworld.event.market_day`、`myworld.item.herb`、`myworld.dialogue.shopkeeper`。推荐使用小写 ASCII 字母、数字、点、下划线和连字符，且不超过 80 个字符，方便同时满足物品和对话引用的限制。

这是跨分类设计约定，不表示所有 DTO 都有相同的代码硬限制。物品 ID 的硬限制见第 8 节，对话 ID 的硬限制见第 4 节。

名称与 ID 分开：显示文字可以翻译，ID 不应随中文文案修改。不要使用显示名字冒充物品 ID、事件 ID 或会话节点 ID。固定玩家、NPC、国家、建筑编号通常只适用于某个存档，通用分享库应优先使用当前事件上下文。

依赖说明应放在下载页或单独的 README 中，不能向 JSON 根对象添加未支持的 `Dependencies`、`Metadata`、`Author`、`Version` 等字段。

## 3 名字库

五类名字库使用同一结构，分类由导入目录决定：

```json
{
  "SchemaVersion": 1,
  "ProfileId": "crownfall1-v1",
  "Items": [
    "青麦镇",
    "石桥镇",
    "榆树湾",
    "霜灯村",
    "白溪城",
    "铜铃港"
  ]
}
```

每项必须是字符串。导入时修剪首尾空白并按精确字符串去重；大小写不同的英文名字不视为同一个。国家名字每项最长 100 个 UTF-16 单位，其余名字类别目前没有独立的词条长度硬限制，仍受总文件大小限制。

设计上应提供足够冗余，超过预计生成对象数，避免世界扩大后频繁重名；冗余词条也必须落在 5000 条的单分类上限内。基础库与 Mod 合并后的有效名称同样不能超过 5000。当前内置 NPC 名字池每套已有 4800 条，继续叠加全新名字时尤其需要检查总量；不要直接把三个完整世界的名字池全部合并。

名字库中不能加入人口、性格、坐标、国家归属或头像字段，这些属于其他系统。

## 4 NPC 对话和 AI 背景库

### 4.1 根对象和字段

`Dialogues` 不使用 `Entries` 或 `Items`。根对象仅允许 `SchemaVersion / ProfileId / Lines / Conversations / Profiles`。后三个数组至少提供一个；未提供的数组按空数组处理。作者交付至少包含一条有效内容，避免空库覆盖。

| 结构 | 允许字段 | 关键规则 |
|---|---|---|
| 单句 Line | `Id, Scene, Weight, Match, Text` | ID 非空唯一；Scene 默认 ambient；Weight 默认 1 |
| 会话 Conversation | `Id, Title, Default, Priority, Match, StartNodeId, Nodes` | StartNodeId 必须指向本会话节点；Default 默认 true，Priority 默认 10 |
| 节点 Node | `Id, Speaker, Text, NextNodeId, Options` | Speaker 仅 npc／player；节点可直接跳转或提供选项 |
| 回答 Option | `Id, Text, NextNodeId, EventId, Conditions` | 可跳转本会话节点，可引用已注册事件 |
| AI 背景 Profile | `Id, Priority, Match, Persona, Knowledge` | 人设与知识文本，不自动开启 AI |
| 文本对象 | `Text, TextKey, Table, Translations` | 默认 Table 为 AGame_NPC；至少一种文字来源有效 |
| 匹配 Match | `NpcIds, PlayerIds, NpcTags, PlayerTags, Tone, Conditions` | 默认空匹配；不同字段共同满足 |

限制：

- `Lines + Conversations + Profiles` 合计不超过 5000。
- 内容 ID 最长 128 个单位；Lines、Conversations、Profiles 各自在本集合内判重。
- 单会话 1～512 个节点；节点 ID 在本会话内唯一，回答 ID 在本节点内唯一。
- 单节点最多 16 个回答。有非空 `Options` 时，节点不能同时提供非空 `NextNodeId`。
- 所有非空 `NextNodeId` 必须存在于同一会话中，不能跨会话跳节点。
- `EventId` 最长 128。对话导入器不核实事件是否真实注册，必须额外检查依赖。
- 单句 `Weight` 为 0～1000000 的整数，0 表示不会抽到该单句。
- `Text.Text` 和每条翻译最长 4000；翻译语言代码非空、最长 32。
- `Persona` 最长 8000；`Knowledge` 最多 128 条，每条最长 4000。
- `Title / Scene / Priority` 没有额外专用长度或范围校验，仍受文件大小和类型限制。

### 4.2 文本、匹配和条件

文本对象示例：

```json
{
  "Text": "你好，{player}。",
  "TextKey": "",
  "Table": "AGame_NPC",
  "Translations": {
    "zh-Hans": "你好，{player}。",
    "en": "Hello, {player}."
  }
}
```

运行时优先采用有效的本地化键，再查当前语言和基础语言翻译，再使用 Text，最后使用第一项非空翻译。外部内容应自带可读的 `Text`；不能只引用游戏中不存在的 `TextKey`。文本按普通文本设计，不依赖脚本命令或富文本控制功能。

常用占位符：

| 占位符 | 含义 |
|---|---|
| `{name} / {npc}` | 当前 NPC |
| `{player}` | 当前玩家 |
| `{city}` | 当前会话聚落上下文 |

未绑定的名字会为空。公共闲聊通常没有玩家听众，不应使用 `{player}`，也不应设置 PlayerIds、PlayerTags 或依赖玩家的条件。

匹配规则：

- NpcIds、PlayerIds 使用当前世界的正整数角色编号，各列表内任意一个命中即可。
- NpcTags、PlayerTags 每项都必须满足；Conditions 每项都必须满足。
- 不同匹配字段为 AND。
- Tone 仅 `"" / warm / cold / neutral`，不能填写自定义性格名。
- 写入标签不会自动给角色加标签，必须引用角色已有标签。
- 当前实际使用的 Scene 为 `ambient / conversation / meet / enter_tavern / tavern`。自定义 Scene 虽可解析，没有消费者查询就不会触发。

对话条件和事件选项共用简化条件，只允许：

```text
字段：Type, Param, Threshold, Op
Type：Gold, Health, Prestige, Age, Stat, HasTag, HasItem,
      NpcLoyalty, NpcGreed
Op：GreaterEqual, Greater, LessEqual, Less, Equal
Stat.Param：Charm, Attack, Defense, Health, Prestige
```

Gold、Health、Prestige、Age、Stat、HasTag、HasItem 检查当前玩家；NpcLoyalty、NpcGreed 检查当前 NPC。HasTag 只判断是否具有 Param 标签，不使用 Threshold／Op。HasItem 的 Param 是物品 ID，Threshold 是数量；对话导入器不检查该物品 ID 是否存在。

### 4.3 可直接据此设计的分支模板

以下是通用问候，包含两种回答和返回分支。`Default:true + Match:{}` 会匹配普通 NPC；专用会话应通过已有标签限制，或使用 `Default:false` 并由事件明确启动。

```json
{
  "SchemaVersion": 1,
  "ProfileId": "crownfall1-v1",
  "Conversations": [
    {
      "Id": "designer.sample.local_greeting",
      "Title": "居民问候",
      "Default": true,
      "Priority": 10,
      "Match": {},
      "StartNodeId": "greeting",
      "Nodes": [
        {
          "Id": "greeting",
          "Speaker": "npc",
          "Text": { "Text": "你好，{player}。想聊点什么？" },
          "Options": [
            {
              "Id": "ask_life",
              "Text": { "Text": "这里的生活怎么样？" },
              "NextNodeId": "life",
              "EventId": "",
              "Conditions": []
            },
            {
              "Id": "goodbye",
              "Text": { "Text": "先聊到这里，再见。" },
              "NextNodeId": "farewell",
              "EventId": "",
              "Conditions": []
            }
          ]
        },
        {
          "Id": "life",
          "Speaker": "npc",
          "Text": { "Text": "我在{city}过日子，做好每天的事情就很踏实。" },
          "NextNodeId": "greeting"
        },
        {
          "Id": "farewell",
          "Speaker": "npc",
          "Text": { "Text": "再见，{player}，路上小心。" }
        }
      ]
    }
  ],
  "Profiles": [
    {
      "Id": "designer.sample.resident_persona",
      "Priority": 10,
      "Match": {},
      "Persona": "你是一位普通居民，回答自然简短，不知道的事情就直说。",
      "Knowledge": [
        "当前角色、玩家和聚落名称以游戏给出的上下文为准。",
        "聊天不代表已经发放物品、金币、任务或改变关系。"
      ]
    }
  ]
}
```

玩家回答编号由 UI 添加，文件中不要写“1、2、3、4”。常规节点建议 2～4 个短回答。数字键支持 1～9，更多选项使用鼠标。

### 4.4 事件、记忆和 AI 的衔接

回答的 `EventId` 必须属于当前世界已注册的事件。缺失、冷却中或已经完成的事件可能让对应选项被隐藏；选择时还会再次校验。每个提供选项的交互节点应保留一个无条件且 `EventId:""` 的返回或告辞选项，避免所有选项消失。

回答触发事件时，Actor 是当前 NPC，Player 是当前玩家，地点来自 NPC 会话上下文。对话库不能内嵌 Effects；实际奖惩应定义在 Events 中，再由 EventId 引用。

`StartDialogueEffect.Parameters.Title` 优先匹配外部 `Conversation.Id`，其次匹配会话 Title，再尝试已有静态对话适配。推荐填写稳定的 Conversation.Id。它需要有效的 NPC、玩家、连接、距离和世界状态；找不到会话可能回退问候，不能用“显示了问候气泡”证明目标分支启动成功。

成功接受的玩家回答会写入该 NPC 与该玩家的私有记忆，包括导致换分支或会话关闭的回答。公共酒馆闲聊与个人会话需要分别验收，不能把私人记忆当成所有玩家共享的事实。

Profiles 只提供 AI 人设和知识。AI NPC 自由回复仍需要游戏中已有的 APIKey、模型与 AI 启用配置，外部库不保存密钥，也不决定联网服务是否可用。多个匹配 Profile 按 Priority 降序、Id 顺序拼接；背景会受运行时长度限制而截断，避免重复和相互矛盾。

AI 说“给你金币”不会自动修改游戏数据。需要实际奖励时使用受服务器验证的事件路径，不能把自然语言承诺当成已经执行的子效果。

### 4.5 世界 AI 风格：独立五字段文件

AIStyles 提供整个世界的共同文化背景和表达要求，与按角色匹配的 `Dialogues.Profiles` 共存。它不修改角色身份、性格、关系、记忆、事实、事件权限或 AI 服务凭据。

```json
{
  "SchemaVersion": 1,
  "ProfileId": "crownfall1-v1",
  "Name": "田园诸邦",
  "WorldBackground": "河谷市镇以农业和商旅往来为共同文化背景。实际国家、城市和人物以游戏当前状态为准。",
  "StyleInstructions": "使用自然、简洁的中文口语，遵循角色性格、已知记忆和事实，不将传闻写成已发生的结果。"
}
```

根对象只能有上面五个字段，全部必填、区分大小写：

| 字段 | 接受规则 |
|---|---|
| `SchemaVersion` | JSON 整数 `1`，不能省略或用文本、小数代替 |
| `ProfileId` | 必须为 `crownfall1-v1` |
| `Name` | 非空且非纯空白文本，最多 80 个 UTF-16 代码单元 |
| `WorldBackground` | 文本，最多 8000 个 UTF-16 代码单元，可为空 |
| `StyleInstructions` | 文本，最多 8000 个 UTF-16 代码单元，可为空 |

两个长文本合计最多 **12000 个 UTF-16 代码单元**。文件连同字段名、空白、引号与 JSON 转义最多 **128 KiB（131072 字节）**，必须是有效 UTF-8 标准 JSON。拒绝重复字段、未知字段、注释、单引号、尾随逗号、额外根对象、嵌套对象／数组、`null`、无效 Unicode 或 UTF-8。不要加入 `Enabled`、`ApiKey`、`Model`、`BaseUrl`、`NpcIds`、`Profiles`、`Items`、`Entries` 或 `$type`。两个长文本都为空时不补充风格内容。

安装和使用：

1. 网站选择世界 AI 风格，生成或手动编辑上述文件，校验后下载独立 JSON。
2. 游戏打开 **新游戏 → AI → 世界风格**，导入文件；也可将文件放入 `Application.persistentDataPath/NameLibraries/AIStyles/` 后刷新，选择并载入编辑区。
3. 外部素材页 AIStyles 分类可以保存文件，但仍需回到世界风格页选择、载入。导入、载入或修改磁盘文件都不等于已经应用。
4. 检查“使用总体风格”开关和文本，点击 **应用风格**。这个开关随世界设置保存，不属于外部文件。

新游戏页面的应用只更新开局草稿；当前世界的应用在下一次世界存档时保存为快照，读档不依赖原 JSON。联机应用遵循现有主机权限。应用影响后续 AI 请求，不重写静态台词、已发生的对话、NPC 记忆、历史或既有报纸。

游戏统一请求入口使用总体风格处理 NPC 自由对话、酒馆闲聊、NPC 决策、已实现并通过权限检查的国家事务、AI 内容生成和报纸文字。报纸插画在原事实和任务保留后，按剩余提示词预算使用风格资料。独立音频／图片服务参数和第三方请求不由此文件配置；实际请求仍需可用模型和 API Key。

总体背景不能把 NPC 变成全知角色、披露私人记忆、证明事件已经发生、创建未注册子效果或绕过服务器。不要把角色秘密放进世界共同背景。作者仍需检查文本与实际世界是否矛盾。

**AIStyles 不属于当前 Mod 加载器支持的分类**。网站不把它加入多库 ZIP；应单独下载、分享并在游戏 AI 页载入、应用。GitHub Issues 分享正文超过本站 50000 字符容量时，缩短背景和风格文本，或直接将下载的 JSON 文件分享给朋友，不能改用 Mod ZIP 绕过限制。

游戏依据：`AGame/Script/Core/AI/WorldAIStyleStore.cs`、`WorldAIStyleSettings.cs`、`WorldAIStyleComposer.cs` 与 `AGame/Docs/AI/世界AI风格外部文件规则.md`。

## 5 事件库

### 5.1 事件根对象和条目字段

`Events` 根对象使用 `Entries`。事件通过 TriggerConsequences 和 Options 中的 Consequences 组合子效果。

| 字段 | 类型或约束 |
|---|---|
| `Id` | 稳定唯一字符串；省略兼容为 content_＋Name，作者应明确填写 |
| `Name` | 非空字符串 |
| `Description` | 说明文本 |
| `Type` | 旧处理器路由键，不能把子效果类名填在这里；新组合事件可省略 |
| `Weight` | 整数 ≥0，默认 10；执行载体至少按 1 处理，不能用 0 可靠禁用 |
| `CooldownDays` | 整数 ≥0 |
| `EventType` | Bad／Good／Notice |
| `TriggerPhase` | Daily／WorldStart／PlayerStart／Manual |
| `Repeatable` | 布尔 |
| `Score` | 整数 −10～10 |
| `Tags` | None／Nature／Social／Economy／Politics／Military／Health／Culture |
| `IsPrivate` | 布尔；个人事件仍需要真实玩家上下文 |
| `FactKind` | 字符串，默认 EventExecution |
| `RumorHint` | 流言提示文本 |
| `DescriptionVariants` | 字符串数组 |
| `CausalTagModifiers` | 因果标签倍率数组 |
| `Target` | 第 5.2 节的事件目标 |
| `TriggerConditions` | 完整事件条件数组，全部满足 |
| `TriggerConsequences` | 子效果数组，顺序执行 |
| `Options` | 事件选项数组 |

多个标签写成 `"Tags": "Health, Economy"`，不能写标签数组。CausalTagModifiers 每项字段是小写 `targetTag / probabilityMultiplier / durationDays / decayOverTime`，倍率和持续天数必须大于 0。

共享条目还接受 `Stages` 和节日规则字段，但把这些放进 Events 不会自动得到支线或节日功能，应按对应分类设计。

默认触发阶段是 Daily。作者应明确填写阶段，避免原本用于手动调用的事件进入日常触发：

| 阶段 | 用途 |
|---|---|
| Daily | 由日常事件路径筛选和触发，受条件、冷却、权重等影响 |
| WorldStart | 新世界启动；只使用直接后果或自动选项 |
| PlayerStart | 实际玩家建立后；由服务器提供该玩家上下文 |
| Manual | 由对话、节日、交互或其他事件明确调用，不会因文件存在自动执行 |

### 5.2 事件上下文 Target

Target 仅允许：

```text
ActorId, PlayerId, SettlementId, RandomSettlement,
Selection, MinPrestige, MinAge, MaxAge, CharacterKind,
BindSpouse, BindLover, LoverMinRelationship
```

- ActorId、PlayerId 为非负整数；0 表示由上下文解析。PlayerStart 中这两个值必须保持 0。
- SettlementId 当前实际使用聚落名称键，必须匹配世界已有城市／村落，不是任意数字编号。
- RandomSettlement 可选择当前世界中的实际聚落。
- Selection 为 `Existing / AdultInSettlement / MarriedInSettlement / PregnantInSettlement / AffairInSettlement`。
- CharacterKind 为 `Any / Npc / Player`。
- MinAge≥0；Selection 不是 Existing 时 MinAge≥18；MaxAge≥MinAge；MinPrestige≥0。
- LoverMinRelationship 为有限数值，范围 −100～100。
- BindSpouse 绑定已有配偶；BindLover 从同聚落的成年、非自己、非配偶、非血亲且达到关系阈值的候选中随机选择情人角色，并不要求已有情人关系。Target 中没有 SpouseId、LoverId、MotherId、FatherId 字段。
- 调用方已提供的角色和地点优先于文件默认值。

Actor 表示本次事件的参与角色，可以是 NPC，也可以是玩家。不能在通用分享库中把所有事件目标固定为全局主角。

事件文本支持 `{SettlementName} / {ActorName} / {PlayerName} / {SpouseName} / {LoverName} / {MotherName} / {FatherName}`。未绑定对象会替换为空，应先保证上下文完整。

### 5.3 完整条件

TriggerConditions 和 ConditionEffect.Parameters.Conditions 支持以下字段：

```text
Type, Target, CharacterId, Param, Threshold, Op, Negate,
Season, QuestState, RelationshipTarget, RelationshipCharacterId
```

Type：

```text
Gold, Health, Prestige, Age, Stat, HasTag, HasItem,
NpcLoyalty, NpcGreed, Happiness, Fate, Flag,
Year, DayOfYear, Hour, TotalDays, Season, Disease, QuestState, Minute,
HasSpouse, ActivePregnancy, HasAffair,
AffairDiscovered, AffairExposed, Relationship
```

| 字段 | 允许值或含义 |
|---|---|
| Target、RelationshipTarget | Actor／Player／SpecificId／Spouse／Lover／Mother／Father |
| CharacterId、RelationshipCharacterId | SpecificId 对应编号必须大于 0 |
| Op | GreaterEqual／Greater／LessEqual／Less／Equal |
| Param | 标签、物品、旗标、疾病、任务等对应的真实键 |
| Stat 的 Param | Charm／Attack／Defense／Health／Prestige |
| Season | Spring／Summer／Autumn／Winter |
| QuestState | WaitingToStart／Active／Successful／Failed／Abandoned／Disabled |
| Negate | 对有效条件结果取反，缺少目标或依赖不会因此成为成功 |

条件数组为 AND。需要 OR 时用已有组合分支表达，不能添加未支持的 Or 字段。选项 Conditions 使用第 4.2 节的简化九类条件，不能向选项条件中加入 Target、Negate、Disease 或 QuestState。

### 5.4 事件选项

允许字段：

```text
OptionText, AutoExecute, Tooltip, Conditions, Consequences,
HasInputField, InputLabel, InputDefault, InputMin, InputMax
```

OptionText 非空。启用数值输入时必须满足 `InputMin ≤ InputDefault ≤ InputMax`。使用输入值的银行效果等只能放在真正提供输入值的执行路径中，直接后果不会凭空获得玩家输入。

WorldStart、PlayerStart 只能直接执行后果，或使用 `AutoExecute:true` 的选项。城市瘟疫等自动世界事件建议 `Options:[]`，不需要为了组合子效果额外设置选择。

有玩家选择的事件必须具备真实玩家上下文。联机时只有本次事件关联的 PlayerId 所属玩家能选择，同次事件只能消费一次，客户端不能独立执行世界后果。选项后果中途失败也不会再次开放同次奖励。

## 6 子效果组合和能力目录

### 6.1 子效果结构

效果定义仅允许：

```text
Type, Parameters, Children, ElseChildren, WeightedBranches
```

Type 使用真实注册类名，Parameters 新文件写 JSON 对象。旧文件的“字符串编码参数对象”仅作兼容，不用于新设计。

| 组合效果 | 用法 |
|---|---|
| SequenceEffect | Children 依次执行 |
| RandomEffect | Parameters.Chance 为 0～1，决定整组 Children 是否执行 |
| ConditionEffect | Parameters.Conditions 使用完整条件；条件有效且匹配时执行 Children，不匹配时执行 ElseChildren；缺少角色或管理器等依赖时中止，不进入 ElseChildren |
| WeightedRandomEffect | WeightedBranches 中各分支为 Weight／Children；权重非负且有限，至少一个大于 0，选择一个分支 |

Children、ElseChildren、WeightedBranches 属于效果外层，不能放入 Parameters。普通叶效果不能添加自己不支持的非空分支。

完整组合格式示例，适用于有实际 Actor 的事件：

```json
{
  "Type": "ConditionEffect",
  "Parameters": {
    "Conditions": [
      {
        "Type": "Health",
        "Target": "Actor",
        "Threshold": 30,
        "Op": "LessEqual"
      }
    ]
  },
  "Children": [
    {
      "Type": "SetHealthEffect",
      "Parameters": { "TargetMode": "Self", "Value": 50 }
    }
  ],
  "ElseChildren": [
    {
      "Type": "ModifyHealthEffect",
      "Parameters": { "TargetMode": "Self", "Delta": 5 }
    }
  ]
}
```

这是效果片段，应放进完整事件的 TriggerConsequences 或某个选项的 Consequences，不能作为独立 Events 文件导入。

效果图递归深度不超过 32；一次 BuildEffects 构建的图最多 1024 个效果，所有组合分支都计数。不要把 1024 错解为整个文件的事件条目上限。

顺序执行不具有事务回滚：前一步已经改变金币、死亡状态或生成人物，后一步失败不会撤销前一步。重要依赖尽量先用条件检查，并避免即时互相调用、循环奖励和不可达分支。

### 6.2 通用角色目标与持续时间

按具体效果能力目录可使用：

```text
EffectName, EffectKey, StackPolicy, SpecificCharId,
TargetCount, TargetTagName, CharacterKind,
RemainingDays, IsLethal, TargetMode
```

TargetMode：

| 值 | 目标 |
|---|---|
| Self | 本次事件 Actor |
| Player | 本次关联的实际玩家；没有上下文不能回退全局主角 |
| SpecificId | SpecificCharId>0 的现有角色 |
| AllInSettlement | 当前事件聚落内的角色 |
| RandomInSettlement | 当前聚落中随机 TargetCount 个角色，TargetCount>0 |
| ByTag | 具有非空 TargetTagName 的角色 |
| Spouse／Lover／Mother／Father | 已绑定的关系角色 |

CharacterKind 用于 Any／Npc／Player 过滤。角色标签与物品标签是两个系统，不可混用。

RemainingDays 只能 −1 或正整数；正整数只适用于目录中 `supportsGenericDuration:true` 的效果。不能给所有效果加 3 天就当作可撤销 Buff。部分效果有自己独立的 DurationDays，需遵循该效果规则。

StackPolicy 的 `Stack / Ignore / Refresh / Replace` 仅对已登记的可逆 Buff 有意义。目录中的 inactiveParameters 表示对应参数不会产生预期控制作用，应省略。IsLethal 也不能被当成所有数值效果共同的死亡开关。

某些效果另有参数 Target，用于玩家／聚落、事件地点／固定聚落等选择，与 TargetMode 不同。能否作用于离场 NPC 以 `supportsStoredNpc` 及当前管理器为准，不能把所有效果都假定为离场可执行。

### 6.3 如何让网站和 AI 使用 content-profile.json

查询顺序：

1. 在 `effects` 中查找 Type；不存在就停止生成该功能。
2. 从 `effects[Type].parameters` 读取字段白名单、类型、enum、数值范围、文本长度和资源类别。
3. 检查 allowsChildren、allowsElseChildren、allowsWeightedBranches，决定组合形态。
4. 检查 parameterRules、requiredAnyOf、parameterUsage 和 inactiveParameters。
5. 检查 requiredBindingFields、bindingRules、contextRules，以及当前上下文能否提供角色、地点、资源。
6. 根据 supportsGenericDuration、supportsTrackedBuff、supportsStoredNpc 决定持续时间、叠加与离场角色可用性。
7. 在游戏导入校验和实际执行中再次验证，不能只看生成器通过。

默认值不等于可执行的完整配置：空任务编号、空对话名称、0 建筑编号等仍需要实际资源。嵌套参数说明中出现 `default:null` 只是能力目录未给出实例默认值，作者文件不能据此写 null。

能力目录根字段使用小写开头的 `schemaVersion / profileId / effects / resources / resourcesComplete`；内容库仍使用大写开头的 `SchemaVersion / ProfileId`，两者不能混用。

resources 是导出时可见的资源快照。当前目录疾病列表为空且 `resourcesComplete.diseases:false`，表示未完整采集，不能当作“没有疾病”或“允许任意疾病”。已打包疾病见第 9 节，运行时仍需检查。

当前目录物品标签包括：农作物、农具、原材料、奢侈品、武器、矿石、药材、食物。新增资源、改变效果注册或协议时，应从真实项目重新导出，不能手改目录伪造支持。

### 6.4 时间、说明面板和出生地

| 功能 | 当前效果及限制 |
|---|---|
| 改变日期时间 | SetTimeEffect：Year、DayOfYear 为 0 时沿用当前值；Hour 0～23、Minute 0～59；只能向前设置，每次最多跨 1000 天 |
| 推进天数 | AdvanceTimeEffect：Days 1～1000 |
| 推进分钟 | AdvanceMinutesEffect：Minutes 1～1440000 |
| 时间倍速／暂停 | SetTimeSpeedEffect：正数且≤100；SetTimePausedEffect 使用布尔值 |
| 延时事件 | ScheduleGameEventEffect：DelayDays≥1，EventId 必须实际注册 |
| 提示和故事 | ShowMessageUIEffect／ShowStoryPanelEffect：引用现有面板，不创建新的 UI Prefab |
| 出生规则 | SetPlayerBirthplaceEffect：设置后续玩家的出生策略，不移动已有玩家 |

当前默认一年 **3 天**，四季名称为 Spring／Summer／Autumn／Winter；实际范围必须按当前世界的 DaysPerYear 计算。不能把现实 365 天日历或 30 天月份直接套进 DayOfYear。高级日期还受绝对日和 Int32 上限限制，以目录 calendar 和游戏当前时间为准。

说明效果支持 Title、Text、TitleKey、MessageKey、OpenPanel、Recipient、Duration 等参数，精确字段以目录为准。Text 或 MessageKey 至少一个有效；Title≤256，Text≤16000，Duration 为有限非负数，0 表示手动关闭。Recipient 为 `Auto / Broadcast / ContextPlayer / TargetPlayer`，私人提示需要真实玩家上下文。

出生效果建议放在 WorldStart，在玩家创建前设置。Mode 为 `Random / ContextSettlement / SettlementName / Hex`。ContextSettlement 需要当前地点；SettlementName 必须匹配真实聚落；Hex 使用 `TargetHex:{"x":整数,"y":整数}`，必须能够解析为安全聚落出生点。规则随世界存档保存，并作用于后续新建玩家，包括晚加入者。写在 PlayerStart 之后不能修改已生成玩家的原始出生地。

### 6.5 开局故事示例

这是完整 Events 文件结构。已有说明面板和世界启动路径正常时，由 WorldStart 调用：

```json
{
  "SchemaVersion": 1,
  "ProfileId": "crownfall1-v1",
  "Entries": [
    {
      "Id": "designer.sample.world_intro",
      "Name": "新的旅途",
      "Description": "你来到一片陌生的土地。",
      "EventType": "Notice",
      "TriggerPhase": "WorldStart",
      "Repeatable": false,
      "TriggerConsequences": [
        {
          "Type": "ShowStoryPanelEffect",
          "Parameters": {
            "Title": "新的旅途",
            "Text": "村镇、家族与商旅在这里共同生活。你的故事由此开始。",
            "Recipient": "Broadcast",
            "Duration": 0
          }
        }
      ],
      "Options": []
    }
  ]
}
```

### 6.6 城市瘟疫的组合示例

此例随机选择真实聚落和其中一名成年 NPC 作为事件参与角色，再从该聚落随机感染最多三名 NPC、提高药材价格、广播故事说明。感染目标本身没有成年过滤。它依赖疾病、供需系统、聚落数据及可用目标；Daily 触发还受事件池筛选影响，导入后不会立即执行。

```json
{
  "SchemaVersion": 1,
  "ProfileId": "crownfall1-v1",
  "Entries": [
    {
      "Id": "designer.sample.plague",
      "Name": "城镇瘟疫",
      "Description": "{SettlementName}出现疫病，居民急需药材。",
      "EventType": "Bad",
      "TriggerPhase": "Daily",
      "Repeatable": true,
      "Weight": 10,
      "CooldownDays": 6,
      "Tags": "Health, Economy",
      "Target": {
        "RandomSettlement": true,
        "Selection": "AdultInSettlement",
        "CharacterKind": "Npc",
        "MinAge": 18,
        "MaxAge": 120
      },
      "TriggerConsequences": [
        {
          "Type": "SequenceEffect",
          "Parameters": {},
          "Children": [
            {
              "Type": "InfectDiseaseEffect",
              "Parameters": {
                "DiseaseName": "瘟疫",
                "TargetMode": "RandomInSettlement",
                "TargetCount": 3,
                "CharacterKind": "Npc"
              }
            },
            {
              "Type": "ModifyPriceMultiplierEffect",
              "Parameters": {
                "Target": "TargetLocation",
                "Selection": "Tag",
                "ItemTag": "药材",
                "Multiplier": 1.3,
                "DurationDays": 3
              }
            },
            {
              "Type": "ShowStoryPanelEffect",
              "Parameters": {
                "Title": "城镇瘟疫",
                "Text": "{SettlementName}传出疫病消息，药材价格上涨。",
                "Recipient": "Broadcast",
                "Duration": 0
              }
            }
          ]
        }
      ],
      "Options": []
    }
  ]
}
```

感染是已有疾病系统的状态，不是靠任意 Buff 名称创建新病种。价格效果的三天期限使用 DurationDays，不能改成该效果不支持的通用 RemainingDays。

## 7 节日库

节日使用 Entries 和通用条目字段，额外规则为：

| 字段 | 允许值或边界 |
|---|---|
| RuleType | Periodic／ByDayInYear／BySeason |
| RuleDayInYear | 1～实际 DaysPerYear |
| RuleSeason | Spring／Summer／Autumn／Winter |
| RulePeriodDays | 正整数 |
| RuleDurationDays | 正整数 |
| LinkedEventIds | 可为空数组；每个事件 ID 非空、无重复 |

周期和持续天数必须为正数，即使当前规则不是 Periodic，也应保留有效默认值。LinkedEventIds 中每个事件必须存在于当前启用的事件库中。单个节日文件导入无法证明跨库依赖已启用，新游戏选库和实际触发时要再次检查。

节日文件本身不定义新的子效果；触发时从多个 LinkedEventIds 中随机选一个事件执行。RuleDurationDays 控制节日活跃显示时长，不会让关联事件每天重复，也不会成为子效果的持续期限。需要奖励、市场涨价或说明文本时，另写 Events，并用 LinkedEventIds 关联。关联事件推荐 Manual 阶段，避免它同时按 Daily 和节日两条路径触发。

最小节日规则示例，不包含奖励：

```json
{
  "SchemaVersion": 1,
  "ProfileId": "crownfall1-v1",
  "Entries": [
    {
      "Id": "designer.sample.market_day",
      "Name": "集市日",
      "Description": "每三天举行一次集市。",
      "RuleType": "Periodic",
      "RuleDayInYear": 1,
      "RuleSeason": "Spring",
      "RulePeriodDays": 3,
      "RuleDurationDays": 1,
      "LinkedEventIds": []
    }
  ]
}
```

## 8 外部物品和图标

### 8.1 物品字段

Items 分类也使用 Entries，不要与名字库的 Items 根数组混淆。

| 字段 | 规则 |
|---|---|
| Id | 1～80 个 ASCII 字符，只允许字母、数字、下划线、点、连字符；不能以点开头，不能含连续两个点 |
| Name | 非空，≤120 |
| Description | ≤4000 |
| Category | Material／Consumable／Quest／Special；外部 Equipment 当前拒绝 |
| Rarity | Common／Uncommon／Rare／Epic／Legendary |
| BaseValue | 整数 0～100000000 |
| MaximumStack | 整数 1～1000000 |
| Weight | 整数 0～1000000，不是小数 |
| Perishable | 布尔 |
| ShelfLifeDays | 整数 0～1000000；Perishable 为 true 时至少 1 |
| Tags | 最多 64 条，每条非空且≤80 |
| UseEffects | 只有 Consumable 可以非空，使用同一子效果协议 |
| Sources | 最多 64 条获取来源 |
| Icon | 第 8.3 节的 PNG 配置 |

不能覆盖内置物品 ID，同包和启用包中的物品 ID 不得重复。装备需要引用已有资源，JSON 不会创建新的武器 Prefab、动画或攻击配置。

### 8.2 来源 Sources

每项只允许：

```text
Type, SettlementId, RequiresMine, DailyRate,
MaxStock, InitialStock, EventId, Description
```

Type 为 Trade／Production／EventReward／Loot／Crafting。SettlementId≤120，按当前城市名称匹配。DailyRate、MaxStock 为 0～1000000 的整数，InitialStock 在 0～MaxStock。EventId≤120，Description≤1000。Production 还要求 DailyRate>0、MaxStock>0。

当前供需系统自动处理 **Trade 和 Production**。EventReward、Loot、Crafting 目前只是来源声明，没有外部自动发奖、掉落或配方消费者。只填写 EventId 不会发放物品，实际奖励需事件中的 GiveItemEffect 等已有路径。

空 SettlementId 的贸易和生产按现有规则作用于 SettlementPriority≥75 的聚落；指定地点则匹配真实名称。RequiresMine 为 true 时需要城市两格范围内有矿点。同地点多条规则取最大值，不累加补货。

### 8.3 图标 Icon

Icon 只允许 `Path, Hash, X, Y, Width, Height, PixelsPerUnit`。

- 作者包必须包含真实 PNG。Path 相对于物品 JSON 所在目录，例如 `icons/herb.png`。
- Path≤240，使用正斜杠；不能是绝对路径，不能含冒号、反斜杠、空路径段、`.` 或 `..`，不能通过目录链接读包外文件。
- 单张 PNG≤2 MiB，每边 1～2048 像素，单图最多 4194304 像素；必须能按 PNG 实际解码。
- PixelsPerUnit 为 1～10000 的有限数值，默认 100。
- Width、Height 同为 0 表示整图，此时 X、Y 为 0；切片时宽高都必须正数，坐标非负且不得越界。
- JSON＋去重 PNG 总体积≤32 MiB，去重图像总像素≤16777216。
- Hash 可省略，由导入器计算；显式提供时必须为 64 位小写十六进制 SHA-256，并与实际 PNG 字节一致。只有 Hash 没有可读取 Path 的内部结构不能作为作者物品包使用。
- 导入器按哈希保存图标并改写引用，作者不必预先生成内部哈希文件名。

目录示例：

```text
药材包/
  items.json
  icons/
    herb.png
```

对应 items.json；必须附上真实 herb.png，单独复制 JSON 不构成完整物品包：

```json
{
  "SchemaVersion": 1,
  "ProfileId": "crownfall1-v1",
  "Entries": [
    {
      "Id": "designer.sample.herb",
      "Name": "草药",
      "Description": "普通药材。",
      "Category": "Material",
      "Rarity": "Common",
      "BaseValue": 10,
      "MaximumStack": 100,
      "Weight": 1,
      "Perishable": false,
      "ShelfLifeDays": 0,
      "Tags": ["药材"],
      "UseEffects": [],
      "Sources": [
        {
          "Type": "Trade",
          "SettlementId": "",
          "RequiresMine": false,
          "DailyRate": 0,
          "MaxStock": 30,
          "InitialStock": 10,
          "EventId": "",
          "Description": "城镇贸易"
        }
      ],
      "Icon": {
        "Path": "icons/herb.png",
        "PixelsPerUnit": 100
      }
    }
  ]
}
```

物品存档和网络内部快照另用 `ProfileId:"crownfall1-items-v1"` 及含 PngBase64 的 Icons，这是游戏内部协议，网站不要把它当成普通作者库输出。

当前没有通用外部音频、Prefab、DLL、材质或任意图片的资源接入协议。物品 PNG 属于上述明确支持的路径；Mod 预览图仅供列表展示。

## 9 疾病和尚未接通的库

游戏已打包的五种疾病为 **感冒、痢疾、风寒、食物中毒、瘟疫**。DiseaseManager 的 Inspector 配置优先，Resources 疾病资源其次，打包默认内容补足缺项。

外部事件可以通过 InfectDiseaseEffect、ApplyDiseaseEffect、CureDiseaseEffect 等已有子效果引用 DiseaseName。不能把新的疾病名称写进去就创建病种，也不能将 diseases.json 放进 Events 让游戏识别成疾病定义。

目前 LibraryType 没有 Diseases 分类，打包疾病读取固定 Resources 路径，并限定默认疾病集合。新增病种需要以后实现正式分类、加载器和校验器，再升级外部协议。

Quests 可接收描述文件，字段包括 Name、Description、Stages。Name≤100、Description≤8000，Stages≤100；每项 StageName 非空、≤100、修剪后不重复，阶段 Description≤8000。这些条目尚未转换成任务系统的实际目标、完成条件和奖励，网站应标记为“设计说明”，不能标成“可运行任务包”。

SpecialNPCs 也只有通用描述条目入口，不能承诺自动生成角色。

其他已知边界：

- FollowTargetEffect 的 Formation 模式尚未支持。
- KillNpcEffect 的 ByPosition 目标模式尚未支持。
- 战争后果目前实现的是 Reparations，不应导出其他后果并承诺生效。
- SetFamilyEffect 不代表完整跨家族迁移流程。
- 外部数据不能直接新增种族、性格／特质资源定义、角色模型、网络 Prefab、C# 子效果。
- 生成交互物需要已有并注册的网络资源编号、组件和客户端资源；不能把一个下载图片当成可生成建筑。

能力目录登记一个类型，表示有当前执行入口；具体模式、绑定、上下文和限制仍必须检查，不能只做类型存在性判断。

## 10 Mod 下载和分享

### 10.1 支持的目录包

当前内容 Mod 依靠分类目录识别，没有通用可执行 manifest.json 协议。网站可提供按以下结构打包的 ZIP，玩家需要解压成目录后放入游戏 Mods 根目录，再从模组页刷新和启用：

```text
Application.persistentDataPath/
  Mods/
    MyWorldPack/
      preview.png
      NameLibraries/
        CityNames/cities.json
        NPCNames/people.json
        FamilyNames/families.json
        CompanyNames/companies.json
        CountryNames/countries.json
        Dialogues/dialogues.json
        Events/events.json
        Festivals/festivals.json
        Items/items.json
        Items/icons/herb.png
```

也支持包内直接放 `Events/events.json` 等分类目录。为了统一网站输出，推荐上面的 NameLibraries 结构。preview.png 可选，只用于列表头像。

当前 Windows 项目的 Mods 根目录是 `%USERPROFILE%\AppData\LocalLow\DefaultCompany\Crownfall1\Mods\`。网站导出的 ZIP 需先解压，再把整个包文件夹放入该目录。单独物品 ZIP 则从游戏外部素材页选择 Items，导入包内 JSON；普通库选择器只列出 NameLibraries/Items 根目录的 JSON，不递归扫描外层物品包。

安装列表显示 ZIP、裸 JSON 或任意文件，不表示这些文件能作为运行包启用。运行内容来自识别到分类的 JSON 目录；代码文件和未分类文件不会自动执行。

AIStyles 使用第 4.5 节的独立安装与应用流程，不属于上述 Mod 支持分类。不要把它写入 Mod 的 NameLibraries 目录并期待启用模组后自动生效。

### 10.2 限额与合并

| 项目 | 限制或行为 |
|---|---|
| JSON 文件数 | 一个内容包最多 256 个 |
| 单 JSON | ≤10 MiB |
| 包总体积 | JSON＋去重物品 PNG≤32 MiB |
| 目录遍历 | 每分类最多 256 个目录，最多递归 4 层 |
| 隐藏、系统、链接文件 | 跳过；链接根目录拒绝 |
| 名字 | 合并去重后每分类≤5000 |
| 事件／节日等内容条目 | 按 ID 合并，后合并的同 ID 可覆盖整个记录 |
| 对话 | 同集合同 ID 后合并覆盖整个记录，不合并 Nodes |
| 物品 | 重复 ID 拒绝，不能覆盖内置或其他已启用物品 |
| 启用范围 | 新世界读取选择和启用设置，不热替换已有世界内容 |

不要依赖覆盖顺序实现核心设计。各包使用唯一命名空间，跨包依赖写在下载页，避免顺序变化导致内容被覆盖。合并后需要重新校验；与程序内事件注册冲突的条目还可能被跳过。

### 10.3 网站和 GitHub 流程

1. 网站让作者选择名字、对话、世界 AI 风格、事件、节日、物品或多分类 Mod，不输出未支持的“大一统世界 JSON”。世界 AI 风格独立交付，不进入 Mod。
2. 生成器使用本规则和同期 content-profile.json，先生成数据，再完成语法、字段、引用、限额检查。
3. 单类别导出 JSON；物品同时提供 PNG；多类别导出上述目录结构的 ZIP。
4. GitHub 保存并分享数据文件和说明，给出作者、适配游戏版本、依赖包和安装方式。
5. 下载页提示玩家选择对应基础库／启用 Mod，并用新世界验收。世界 AI 风格须导入或载入后点击应用，再通过后续 AI 请求验收。

GitHub 仓库 URL 不是游戏已支持的远程加载指令。玩家先下载并安装文件；JSON 中不能新增 DownloadUrl、GitHubRepo 等字段要求游戏自动联网下载。

发布包不能包含 APIKey、访问令牌或私人存档。密钥由玩家在游戏配置中选择，不属于共享内容。

## 11 存档、联机、历史与记忆验收

创建世界时，基础库选择和已启用 Mod 合并为世界内容快照，并随存档保存。修改原 JSON、启停本地 Mod 或更换文件名称不会自动修改已有存档。读档使用已保存的快照，移动作者原文件不会使已有快照消失。

服务器负责事件执行、角色状态和对话选择验证。客户端本地文件不能覆盖服务器的物品目录；外部物品通过游戏内部快照同步。玩家端显示“单机”仍使用项目当前的本地权威执行路径，作者文件不应包含 Host、客户端启动或网络配置指令。

事件的 Description、FactKind、Tags、Score、IsPrivate、RumorHint 为现有执行和历史相关路径提供信息。记录范围和隐私仍由当前游戏系统决定；不能仅在说明文本写“已经改变关系”就认为角色关系或历史事实已变化。

对话接受的回答进入对应 NPC 与玩家的私有记忆。实际奖惩必须由事件子效果执行，再检查角色数据和相应记录。公共故事广播、个人提示、历史公开范围和 NPC 私有记忆应分别验收。

## 12 网站和 AI 生成要求

以下内容可作为后续生成器的固定要求：

> 为 Crownfall1 当前外部协议生成内容。先确认分类及同期能力目录，SchemaVersion 为 1，ProfileId 为 crownfall1-v1。只输出该分类允许的字段，精确保持大小写，使用 UTF-8 标准 JSON，不输出脚本、CLR 类型元数据、注释或未实现字段。对话使用 Lines／Conversations／Profiles，名字使用 Items，事件、节日、物品使用 Entries。所有引用使用真实稳定 ID。子效果 Type 和 Parameters 必须来自 content-profile.json；同时遵守组合字段、参数条件、资源绑定、角色与地点上下文。事件可以影响 NPC 或玩家，以本次上下文决定目标，不固定全局主角。不能保证的资源依赖要列在文件外的依赖说明中；未支持的疾病定义、装备资源、任务自动执行、特殊 NPC 库和任意脚本功能应明确标记为待开发，不能伪造可运行 JSON。生成后执行语法、白名单、类型、范围、引用、限额及目标游戏验证。

生成器还应做到：

- 对缺少信息的功能要求说明，例如“指定哪个已有任务”“当前世界哪个城市”“依赖哪个物品包”，不能猜编号。
- 资源目录的 Complete 为 false 时，转为待运行时核对，不能把不完整列表当作完整黑白名单。
- 只有在明确获得对应资源后才生成有依赖的效果。
- 把条件放在正确层级：完整事件条件与简化选项条件分开。
- 对话中每个提供选项的节点保留可离开的无条件路径。
- 内容 ID、文件名和 UI 显示名分开。
- AI 人设只描述知识和行为，不让自然语言承担真实奖惩。
- APIKey、模型选择等由游戏已有配置系统处理，不写入可分享库。
- 未知字段和效果立即反馈作者，不通过自动改名或悄悄删除来伪装支持。

## 13 内容接受与运行验收标准

“文件被保存”“校验可接受”“世界已加载”和“玩法成功执行”是不同结果。发布给玩家前，按顺序完成以下检查：

| 层级 | 必须通过的检查 |
|---|---|
| 1 格式 | 单根标准 JSON、UTF-8、无重复键；版本、字段、类型、枚举、数值、长度和文件限额正确 |
| 2 内容 | 名字有效；对话节点和跳转正确；效果图可构建，参数白名单与组合限制正确 |
| 3 依赖 | 当前启用库中事件、物品、商品标签、疾病、任务、会话和已注册资源确实存在 |
| 4 上下文 | 实际 Actor、Player、聚落、关系角色、离场 NPC 支持和管理器可用 |
| 5 导入 | 游戏导入面板接受文件；选择实际保存后的库名或启用目录包 |
| 6 执行 | 新世界加载后实际触发；检查执行报告、角色数据、库存、价格、UI 和条件分支 |
| 7 对话和 AI | 检查气泡回答、数字键、无条件退出、NPC 与玩家记忆；有 AI 时真实调用已配置服务 |
| 8 存档 | 保存后退出，移走作者原文件再读档，快照和效果仍可使用 |
| 9 联机 | 涉及多人时，用真实客户端验证服务器执行一次、正确玩家选择、UI 范围、数据同步及晚加入 |

收到校验警告时需要判断依赖是否暂时不可见或功能尚未接通；“有警告但能保存”不能作为运行通过。日常事件可能因权重、条件或冷却不触发，验收时应通过已有服务器测试入口明确调用，而不是只等随机抽中。

本规则中的示例属于字段与结构模板。物品需要真实 PNG，疾病／城市／角色效果需要对应系统和世界上下文；不能仅凭模板语法正确就标记为完整运行验收通过。

### 常见错误定位

| 表现 | 优先检查 |
|---|---|
| 保存成功但没有内容 | 文件不是 JSON、分类错误、用了错误根字段，或加载的是旧世界快照 |
| 未知字段／类型 | 大小写拼错、混用不同分类字段、Type 未注册、参数借用了其他效果 |
| 对话没有出现 | Match 不满足、Scene 没有消费者、Default／Priority 选择、NPC 或距离无效 |
| 回答选项消失 | EventId 缺失／冷却／已完成、条件失败；需要保留无事件退出项 |
| AI 没有自由回复 | 游戏 AI 配置、密钥、模型或 API 不可用，Profiles 不能替代配置 |
| 事件导入后不立即发生 | TriggerPhase 为 Manual，或 Daily 筛选、条件、冷却未满足 |
| 设置出生地无变化 | 已经生成玩家、地点无效，或没有放在创建玩家前执行 |
| 图标失败 | 缺 PNG、路径越界、格式尺寸不合格；只提供了内部 Hash |
| 节日没有奖励 | 只写了规则，没有启用 LinkedEventIds 引用的事件 |
| 重复名字／重复物品错误 | 合并后超过 5000，或物品 ID 与内置／启用包冲突 |
| 同名疾病无效 | DiseaseManager 未提供该资源；外部文件不能自行创建病种 |

## 14 目前已有内容与维护位置

三套预设均为 Version 2：**金穗诸邦**（golden-grain）、**四时之环**（turning-seasons）、**余冠诸领**（fallen-crown）。

每套当前资源如下：

| 内容 | 每套数量 |
|---|---:|
| 城市名 | 1200 |
| NPC 名 | 4800 |
| 家族名 | 1200 |
| 公司名 | 800 |
| 国家名 | 240 |
| 专属事件 | 17 |
| 专属节日 | 4 |
| 对话单句 Lines | 76 |
| 会话 Conversations | 4 |
| AI 背景 Profiles | 4 |
| 会话节点 | 20 |
| 会话回答选项 | 40 |

共同资源另有 27 条事件、16 条节日、5 种疾病；预设加载时合并共同事件和节日，所以**每个世界最终为 44 条事件、20 条节日**。

每套对话单句分布为 ambient 32、conversation 12、enter_tavern 8、meet 8、tavern 16。当前每套的 40 个回答选项 EventId 均为空，已有问答分支不会因此自动执行事件奖惩。预设没有独立 Items、Quests、SpecialNPCs 文件；不要据此覆盖游戏其他已有资源。

项目内对应位置：

| 内容 | 项目路径 |
|---|---|
| 世界选择和打包资源 | `AGame/Resources/WorldPresets/manifest.json` 及各世界目录、Common 目录 |
| 通用严格校验与参数能力 | `AGame/Script/Map/ExternalContentContract.cs` |
| 内容条目结构 | `AGame/Script/Map/EntryLibraryStore.cs` |
| 分类、选库与快照 | `AGame/Script/Map/LibraryPanel.cs`、`NameLibraryStore.cs`、`LibraryRegistry.cs` |
| 事件结构与构建 | `AGame/Script/Core/Event/EventLibraryDefinition.cs`、`EventEffectRegistry.cs` |
| 事件执行与上下文 | `AGame/Script/Core/Event/EventManager.cs`、`RuntimeContentEvent.cs`、`EventExecutionContext.cs` |
| 对话结构与读取 | `AGame/Script/Core/Dialogue/DialogueLibraryDefinition.cs`、`DialogueLibraryStore.cs` |
| 世界 AI 风格格式与请求接入 | `AGame/Script/Core/AI/WorldAIStyleStore.cs`、`WorldAIStyleSettings.cs`、`WorldAIStyleComposer.cs` |
| 对话匹配、玩家回答和记忆 | `AGame/Script/Core/Dialogue/DialogueLibraryRuntime.cs`、`NpcConversationSessionService.cs` |
| 物品包与资源 | `AGame/Script/Core/Inventory/ExternalItemDefinition.cs`、`ExternalItemPackageImporter.cs`、`ExternalItemCatalog.cs` |
| Mod 校验和合并 | `AGame/Script/UI/ModContentSelectionService.cs` |
| 导出器 | `AGame/Editor/WebContentContractExporter.cs` |
| 项目能力目录 | `AGame/Docs/Events/content-profile.json` |

子效果注册或参数改变后，在 Unity 使用已有菜单 **Tools → Events → 导出网站内容协议**，重新生成能力目录，再同步网站生成器、下载规则与本文件。资源快照的完整性应按实际注册状态检查，不应手写“完整”标记。
