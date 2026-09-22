# Cairn — v0 架构

2026-09-21 · 实现形态：桌面优先的 Web 应用，后续以 Electrobun 打包 Mac / Windows 桌面端

> 前置文档：[PRD-v0.md](./PRD-v0.md)。v0 是实验不是产品，唯一交付物是「10 个陌生人的第一本书完读率」。
> 本文所有取舍都服务于这一件事。
>
> **不做移动端适配。** 两小时的学习是桌前行为，不是地铁行为——桌前会话的完读率本就显著更高。

## 一、核心结论：零后端

BYOK 推出了整条架构：

```
用户自带 LLM key
  → key 不能上服务器（保管责任 + 用户不会粘贴）
  → key 留在浏览器
  → LLM 调用从浏览器直接发出
  → 不需要后端
```

连锁收益：

| 收益 | 说明 |
| --- | --- |
| 版权风险消失 | 书在浏览器里解析，永不上传。PRD 的「不存原文、不跨用户复用」由架构保证，不靠自律 |
| 无密钥托管责任 | key 只进 localStorage，不出设备 |
| 零运维 | 纯静态资源，Cloudflare Pages 免费额度足够 |
| 开发快 | v0 的目的是一周内拿到数据，不是建系统 |

**唯一的服务端**是埋点收集，因为完读率无法在客户端自证。它是一个无状态 Worker，
**只接收匿名进度事件，永远看不到书名、书的内容或用户身份**。

唯一的例外是 TTS：`edge-tts` 跑在 Bun 里，浏览器调不了。它以本地脚本形式存在
（`scripts/tts.ts`），只有我们自己在制作端用，不是线上服务。见第六节。

## 二、两个入口，一份代码

### 为什么

**10 个陌生人不该为了走一遍路径去申请一个 LLM API key。**

若阅读端要求 BYOK，完读率数据会被注册漏斗污染——测到的是「有多少人愿意配 key」，
不是「有多少人愿意走完」。而 PRD 明确：v0 只验证完读率，不验证获客。

### 怎么分

| | `/studio` 制作端 | `/p/:id` 阅读端 |
| --- | --- | --- |
| 使用者 | 我们自己 | 受测陌生人 |
| 需要 API key | 是 | **否** |
| 需要上传 | 是 | **否** |
| 职责 | 传书 → 解析 → 压缩 → 生成路径与幻灯 → 导出 bundle | 加载 bundle → 走完 → 埋点 |

陌生人的完整流程是：**点链接 → 直接开始**。零 onboarding。

节点展开、口播音频全部在制作端预生成并打进 bundle，**阅读端永远不需要 key**。

## 三、固定的是时间预算，不是节点数

**产品承诺是「两小时走完」，完读率直接受总时长支配。所以时长是约束，节点数是结果。**

节点数由**目录结构 + map 阶段产出的逐章摘要**共同决定，二者都来自真实正文。

> **不使用模型的预训练记忆来判断结构。**
> PRD 记录了放弃原方案的原因：依赖预训练记忆，头部名著尚可，长尾书变成自信的编造。
> 若让记忆决定路径有几个节点、怎么切，这个依赖就从内容层回到结构层，且更隐蔽——
> 内容编错还能被读过的人抓到，**结构编错看起来和真的一模一样**。

### 约束参数

- 目标总时长 **100–120 分钟**
- 每站 3–5 页幻灯，口播 2–4 分钟
- reduce 必须为每个节点输出 `estMinutes` 和 `sourceChapters`
- **硬上限：总时长 > 150 分钟 → 强制合并后重跑一次 reduce**

上限不是产品洁癖，是实验设计：若某本书生成出 5 小时的路径，完读率必然趋近于零，
**那测到的是「太长了」，不是「路径设计好不好」**。长度会污染 v0 唯一的指标。

## 四、内容形态：幻灯 + 口播，不是纯文字

PRD 的核心判断是「大部分人更愿意消费图和视频，文字门槛高」。
所以**一站的主界面是一组自动播放的幻灯配口播**，文字是备选视图，不是主视图。

### 视频是播放体验，不是文件格式

**不渲染 mp4，做幻灯 + 音频的同步播放器。** 四个理由：

1. **零后端渲不了。** 浏览器里 ffmpeg.wasm 渲 100 分钟视频不现实；放服务端渲染则书必须上传，版权风险全部回来。
2. **改一页要重渲整条。** 幻灯是数据，改一页就是改一条 JSON。
3. **完读率会失真。** 一条长 mp4 里「走完」退化成「播到底」，拖进度条即可作弊。按站计数的埋点是唯一指标，不能含糊。
4. **视频的观感不需要 mp4。** 自动翻页 + 口播 + 自动进入下一站，体验上就是在看视频，但可跳、可搜、可复制、可切文字模式。

真要 mp4（引流到 B 站 / 小红书）是以后的**导出功能**，服务端渲一次，不是核心形态。

### 不做文生图

AI 生成插图对抽象概念基本无效——「锚定效应」画出来只会是漂亮但无信息量的图。
真实的好 PPT 本来就主要是字和图表。

幻灯是**结构化生成的版式**，用 React / SVG 渲染，不调图像模型：零成本、零延迟、风格统一、每页可溯源。

| 版式 `layout` | 用途 | 适用 |
| --- | --- | --- |
| `title` | 每站开场 | 通用 |
| `points` | 3 条以内核心论断 | 通用 |
| `number` | 实验数据、关键比例对比 | 知识类 |
| `quote` | 原文金句（接微信读书热门划线） | 通用 |
| `compare` | A vs B | 知识类 |
| `flow` | 推导链、因果链 | 知识类 |
| `relation` | 人物关系图 | 小说 |
| `timeline` | 故事线 | 小说 |
| `world` | 世界观设定 | 小说 |

## 五、导航模型：专注模式为主干，路径总览为辅

三个方案对比后选定（见设计评审）：

- **主干：专注模式。** 一次只见一站，无侧栏。键盘 `←` `→` 翻页、`↓` 下一站、`空格` 暂停、`O` 呼出总览。
  没有跳读入口，**「走完」的定义不含糊，埋点最干净**。
- **辅助：路径总览。** 独立页面，按 `O` 呼出，在开始时、每走完一部时、全部走完时出现。
  承担专注模式缺的两样：位置感，和「走完一条路」的画面。
- **排除：左栏路径 + 右栏内容。** 侧栏邀请跳读，与唯一指标冲突；且长得像每一个文档站。

## 六、管道

```
parse     电子书 → Chapter[]                纯本地，无 LLM
  ↓
map       每章 → ChapterNote                N 次 LLM 调用，全文只读一遍
  ↓
classify  全部 gist → 书籍类型               1 次调用
  ↓
reduce    全部 ChapterNote → PathNode[]      1-2 次调用，受时间预算约束
  ↓
slides    每站 → Slide[] + 口播稿            N 次调用
  ↓
tts       口播稿 → mp3 + 字幕时间轴          本地 bun 脚本，edge-tts，免费
  ↓
bundle    Path JSON + mp3 → 阅读端可加载的包
```

一本 30 万字的书约 50–100 章，map 阶段即 50–100 次调用。这是整个系统最脆弱的地方，
必须按**可恢复的任务状态机**来写，不能写成一个 `await Promise.all`：

- **每章摘要一落地就写 IndexedDB**，刷新页面不丢
- **并发上限 4**，失败指数退避重试，单章失败不影响整体
- **进度逐章可见**（第 37/82 章），不是一个转圈的 loading
- 中断后可从断点继续

### TTS

`edge-tts` 白嫖微软 Edge 朗读服务：**免费、无需 key、中文音色接近真人**。
音色用 `zh-CN-YunjianNeural`（云健，微软为有声书与解说调校）或 `zh-CN-XiaoxiaoNeural`（晓晓，偏知识讲解）。

不使用浏览器自带的 `SpeechSynthesis`：音色随用户操作系统而变，**10 个受测者听到的东西不同，完读率不可比**，会污染实验。

用量参考：34 站 × 3 分钟 ≈ 2.5 万字符/本。edge-tts 为 ¥0；若改用阿里云约 ¥7.5/本。

风险：非官方接口，可能被限流或关闭。届时切换到阿里云 / 火山，成本可接受。

## 七、数据模型

```
Book        { id, title, author, type: 'knowledge'|'narrative', chapterCount, createdAt }
Chapter     { id, bookId, idx, title, text, wordCount }     // text 只进 IndexedDB，不进 bundle
ChapterNote { chapterId, gist, keyPoints[], quotes[] }       // map 产物

Path        { id, bookId, title, type, nodes[], totalMinutes, generatedAt }
PathNode    {
  id, idx, title, kind,
  slides: Slide[],
  narration: NarrationCue[],     // 字幕时间轴，驱动幻灯翻页与高亮
  audio: { src, durationMs },
  text,                          // 文字模式正文，同一份数据的另一个视图
  sourceChapters: number[],      // 溯源
  estMinutes,
  children: PathNode[]           // 展开的子节点，制作端预生成一层
}
Slide         { id, layout, data, atMs }        // atMs = 在口播时间轴上的出现时刻
NarrationCue  { text, startMs, endMs }
Progress      { pathId, currentIdx, doneIds[], startedAt, finishedAt }
```

**`sourceChapters` 是防幻觉的关键**，代价极低：每一站都能跳回原文验证。

**`Chapter.text` 永不进入导出的 bundle。** 导出物只含衍生内容，不含原文。

**幻灯是数据不是视频**，所以同一份内容能渲成播放器、渲成文字模式、以后也能在服务端渲成 mp4。

## 八、工程结构

参考 [deer-flow/llm-space](https://github.com/deer-flow/llm-space) 的 monorepo 边界——
它是「先 Web、后桌面」该有的形状。**抄它的目录边界，不抄它的工程规模**
（我们跳过 husky / lint-staged / 发布脚本 / 插件体系，那些会吃掉验证完读率的时间）。

```
packages/
  core/          领域类型、解析、管道、LLM 客户端、存储 —— 无框架依赖
    parse/       epub.ts  txt.ts  markdown.ts
    llm/         client.ts  providers/
    pipeline/    job.ts  map.ts  classify.ts  reduce.ts  slides.ts  prompts/
    store/       Dexie schema
  ui/            共享 React 组件与设计 token（幻灯版式渲染器在此）
apps/
  web/
    studio/      制作端
    reader/      阅读端
  desktop/       Electrobun 壳 —— 留位，v0 不实现
scripts/
  tts.ts         本地 edge-tts 批量生成
```

**边界约束：`apps/web/reader` 不得 import `core/parse`、`core/llm`、`core/pipeline`。**
这条用 ESLint 规则强制。它保证阅读端永远无需 key、包体最小。

### 技术选型

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 语言/工具 | TypeScript + Bun | 与参考项目一致，起手快 |
| 构建 | Vite | H5 产物小 |
| UI | React + Tailwind + shadcn/ui | 制作端直接抄现成组件；阅读端只用 token，不用组件库 |
| 动效 | Motion | 成就感是动画做出来的。幻灯转场、完成反馈 |
| 本地存储 | Dexie（IndexedDB） | 原文可达几 MB |
| EPUB 解析 | JSZip + DOMParser | 只需抽文本；epub.js 带整套渲染机制，过重 |
| 桌面壳 | **Electrobun**（后续） | 与参考项目一致。v0 只留目录位，不实现 |
| 部署 | Cloudflare Pages | 静态托管 + 埋点 Worker 同平台 |

阅读端不引入组件库：默认审美是「表单 + 表格」，而我们要做的是一条让人想走完的路；
且完整移动端组件库压缩后 200KB 起步，阅读端本可控制在 50KB 以内。

## 九、埋点（v0 的唯一交付物）

```
path_opened    { sessionId, pathId, ts }
node_done      { sessionId, pathId, nodeIdx, ts }
node_expanded  { sessionId, pathId, nodeIdx, ts }
mode_switched  { sessionId, pathId, nodeIdx, to: 'audio'|'text', ts }
path_finished  { sessionId, pathId, ts }
```

- `sessionId` 为设备本地生成的随机串，不含任何身份信息
- **不上报书名、节点标题、任何书的内容**
- 完读率 = `path_finished` 独立 sessionId 数 / `path_opened` 独立 sessionId 数
- `node_done` 的分布同样重要：**人在第几站掉队**，比最终那个百分比更有指导意义
- `mode_switched` 验证 PRD 的核心假设：人是否真的更愿意听而不是读

## 十、待验证的技术风险

1. ~~国内 LLM 厂商是否支持浏览器直连（CORS）。~~ **已验证通过，2026-09-21。**
   对各厂商发 CORS 预检（`OPTIONS` + `Origin` + `Access-Control-Request-Headers: authorization`）：

   | 厂商 | 预检状态 | `Authorization` 头 |
   | --- | --- | --- |
   | DeepSeek | 200 | 允许 |
   | 月之暗面 Kimi | 204 | 允许 |
   | 通义 DashScope | 200（`*`） | 允许 |
   | 智谱 GLM | 200 | 允许 |
   | OpenAI | 200 | 允许 |

   四家国内厂商均回显 `Access-Control-Allow-Origin` 并放行 `authorization` 头。
   **零后端成立，不需要转发 Worker，key 不经过我们的服务器。**
   残留项：预检通过不完全等于实际 `POST` 响应也带 CORS 头。带 key 发一次真实请求即可终验。

2. ~~微信内置浏览器对文件选择的限制。~~ **不适用**——v0 不在微信内打开，且不做移动端。

3. **edge-tts 的稳定性。** 非官方接口。若被限流，切阿里云 / 火山，约 ¥7.5/本，可接受。

4. **IndexedDB 在 Safari 的容量与稳定性。** 原文丢失可接受（可重传），
   但**进度不能丢**——进度同时写埋点，以服务端为准。

## 十一、v0 明确不做

- PDF 解析
- mp4 渲染（幻灯播放器代替；导出视频是后续功能）
- 文生图
- **小说模式**——版式已在数据模型中留位，但 v0 不实现。理由见下
- 平台代付 LLM
- 产物跨用户复用
- 遗忘曲线复习
- 微信读书划线叠加（第二批，懒加载；`quote` 版式已为它留好位置）
- 用户账号体系
- Electrobun 桌面端（只留目录位）
- 服务端存储书籍内容（架构上不存在这条路径）

### 为什么小说不进 v0

小说速读有真实需求，且比 PRD 最初判断的大——**剧在播、大家在聊、想知道剧情但不想读**。
对一个明确不打算读的人，剧透就是产品本身，不是副作用。

但它和知识类是**两个产品，指标不同**：

| | 知识类 | 长篇连载 |
| --- | --- | --- |
| 单位 | 一本书 | **一段进度**（追到第 X 卷） |
| 用户目标 | 走完 | **够聊天就行** |
| 结束条件 | 完读 | **满足** |
| 人物关系 | — | 需按当前进度裁剪 |

以《凡人修仙传》为例：700 万字、2400 余章，是《思考，快与慢》的 25 倍。
管道跑得完（map 约 50 分钟、几十元），但「两小时走完」的承诺直接破产。

**混进同一个 v0，完读率会变成两种行为的混合，什么也证明不了。**

处置：v0 只测知识类；小说由我们自己 dogfood（凡人修仙传），不进实验数据。
附带提醒——该书在起点有 DRM，只能用盗版 txt，这是 PRD「核心用户是手上有盗版书库的人」
那条风险的第一个具体案例。
