[English](./README.md) | 中文

[![Release](https://img.shields.io/github/v/release/jiehaoZ/Cairn?label=release)](https://github.com/jiehaoZ/Cairn/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey?logo=apple)](#下载)
[![Bun](https://img.shields.io/badge/Bun-1.3+-000000?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Cairn

<!-- 截图：把图片存为 docs/images/screenshot.png，然后删掉下一行两端的注释符号 -->
<!-- ![Cairn](./docs/images/screenshot.png) -->

<!-- 视频：在 GitHub 网页上编辑本文件，把 .mp4 拖进来，用它生成的 https://github.com/user-attachments/assets/... 那一行替换这条注释 -->

把你已经拥有的电子书，变成一条能走到底的路。

Cairn 把一本书完整读一遍，排出一条**路径**：由若干**站**组成，每站是一小组带朗读的幻灯片，按阶段分组，最后以一站回顾收尾。
你决定想花多久走完，站数由此而定。每一站都取材于书的原文，并记录它来自哪些章节。

## 功能

- **你自己的书，在本地处理。** 支持 EPUB、PDF、MOBI/AZW3、DOCX、TXT、Markdown，也可以是你自己写的 Markdown 笔记。
- **四档时长。** 知道个大概、抓住要点、真的读懂、完整走一遍。时间越紧，删掉的是整站，而不是每站都讲得更浅。
- **以原文为准。** 路径由目录和各章内容决定，不靠模型对这本书的记忆。
- **是幻灯片，不是视频。** 十四种图表版式，字幕跟着朗读走。
- **马上就能开始。** 第 1 站一好就能播放，后面的站在你往前走的同时生成。
- **会标出处的伴读。** 可以问这本书、读完的书，或者上网查，回答都带引用。
- **中英文都支持。** 书用它自己的语言朗读，与界面语言无关。

## 下载

从 [最新 Release](https://github.com/jiehaoZ/Cairn/releases/latest) 下载 DMG。目前只支持 Apple Silicon 的 Mac。

应用没有经过 Apple 公证。如果 macOS 提示"已损坏"或"无法打开"，把应用拖进"应用程序"后运行一次：

```bash
xattr -dr com.apple.quarantine /Applications/Cairn.app
```

第一次打开时，在**设置**里选择模型服务商并填入 key。[pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai)
支持的服务商都可以用，支持结构化输出的模型排在前面。

## 从源码构建

需要 [Bun](https://bun.sh) 1.3 或更高版本。

```bash
git clone https://github.com/jiehaoZ/Cairn.git
cd Cairn
bun install
cd apps/desktop && bunx electrobun prepare   # 每个 checkout 跑一次

bun run start       # 启动应用
bun run package     # 打包成 .app
```

`bun test` 跑测试，`bun run typecheck` 检查全部四个 TypeScript 项目。其余命令和项目约定见 [`AGENTS.md`](AGENTS.md)。

## 配置

所有设置都在应用的**设置**面板里。key 一栏写成 `$NAME` 的形式时，会读取对应的环境变量，而不是把 key 存下来。

| 环境变量 | 用途 |
| --- | --- |
| `CAIRN_DATA_DIR` | 书库位置，默认 `~/Library/Application Support/Cairn/` |
| `FIRECRAWL_API_KEY` | 可选，不填也能用有限额度的网页搜索 |
| `BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` | 选了对应的搜索服务才需要 |
| `WEREAD_API_KEY` | 可选，接入微信读书 |

## 隐私

书、音频和缓存都留在你的 Mac 上。没有账号，也没有任何统计上报。只有以下情况会有数据离开本机：

- **你的模型服务商**：生成路径时的书籍正文，以及你在伴读里发的消息；
- **朗读服务**（微软 Edge 朗读语音）：每一站的讲稿；
- **你选择的搜索服务**：模型写的搜索词，不会有整章内容；
- **微信读书**（仅在填了 key 时）：书名和作者，用来匹配划线。

## 文档

以下文档为英文：

- [`docs/PRD.md`](docs/PRD.md)：产品定义，按模块组织
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：模块边界及背后的决策
- [`docs/DESIGN.md`](docs/DESIGN.md)：视觉设计与幻灯片版式
- [`docs/EVAL.md`](docs/EVAL.md)：如何评判一次流水线改动

## 路线图

- iPhone 播放器：在 Mac 上生成的书通过 iCloud 同步到手机上听
- 每一站的纯文本版本
- 跨书记住你已经走过的内容

## 参与贡献

欢迎在 [issues](https://github.com/jiehaoZ/Cairn/issues) 里提 bug 和想法。提 PR 之前请先读
[`AGENTS.md`](AGENTS.md)，里面列了必须通过的检查，以及流水线依赖的约束。

## 许可证

[MIT](./LICENSE)。朗读所依赖的 `edge-tts-universal` 使用 AGPL-3.0，因此打包后的应用整体按 AGPL-3.0 的条款分发。
