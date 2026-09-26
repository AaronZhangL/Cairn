[English](./README.md) | 中文

[![Release](https://img.shields.io/github/v/release/jiehaoZ/Cairn?label=release)](https://github.com/jiehaoZ/Cairn/releases)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)](#下载)
[![Bun](https://img.shields.io/badge/Bun-1.3+-000000?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Cairn

![Cairn](./docs/images/screenshot.jpg)

https://github.com/user-attachments/assets/cd272d51-46c1-4838-aa74-ab6e3c69cc6f

Cairn 把一本书变成一组带朗读的短片，短片的时长由你希望了解这本书的深浅控制。

## 功能

- 支持 EPUB、PDF、MOBI/AZW3、DOCX、TXT 和 Markdown，自己写的 Markdown 笔记也能用。
- 四档时长，从「知道个大概」到「完整走一遍」。
- 路径按书的目录和各章内容来排，不靠模型对这本书的记忆。
- 每一站是一组幻灯片，配语音朗读和字幕，版式有时间线、对比、流程图、矩阵等十四种。
- 渐进式加载：第 1 站生成好就能播放，后面的站在你收听时由后台接着生成。
- 播放器旁边有一个伴读 Agent 助手，可以问当前这本书的任何问题，回答里的每条说法都链接到对应的原文段落或网页。

## 下载

从 [最新 Release](https://github.com/jiehaoZ/Cairn/releases/latest) 下载 DMG。目前只在 Apple Silicon 的 Mac 上测试过。

应用没有经过 Apple 公证。如果 macOS 提示"已损坏"或"无法打开"，把应用拖进"应用程序"后运行一次：

```bash
xattr -dr com.apple.quarantine /Applications/Cairn.app
```

第一次打开时，在**设置**里选择模型服务商，见 [支持的模型](#支持的模型)。

## 支持的模型

Cairn 通过 [pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai) 调用模型。
生成站点和伴读对话可以用同一个模型，也可以给伴读单独选一个。

| 服务商 | 接入方式 | 默认模型 |
| --- | --- | --- |
| OpenAI | API key（`OPENAI_API_KEY`） | `gpt-5.4-mini` |
| OpenAI Codex | 用 `codex login` 登录的 ChatGPT 账户 | `gpt-5.6-sol` |
| Anthropic | API key（`ANTHROPIC_API_KEY`） | `claude-haiku-4-5` |
| Google | API key（`GEMINI_API_KEY`） | `gemini-3.5-flash` |
| DeepSeek | API key（`DEEPSEEK_API_KEY`） | `deepseek-flash` |
| OpenRouter | API key（`OPENROUTER_API_KEY`） | `google/gemini-2.5-flash` |
| Groq | API key（`GROQ_API_KEY`） | `llama-3.3-70b-versatile` |
| 自定义 | 任意 OpenAI 兼容接口，比如本地模型服务 | 自己填 |

key 一栏可以直接填 key，也可以填 `$变量名` 读取环境变量。选中的服务商没有可用凭据时，Cairn 会改用第一个有凭据的。

设置里只列出支持约束输出（structured output）的模型，也就是服务端能强制模型按 JSON Schema 回复。
生成一本书要调用模型上百次，每次都需要格式正确的结构化结果，所以只靠模型自觉守格式的不提供。
xAI、Moonshot 和 MiniMax 暂时不在列表里。

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

## 参与贡献

欢迎在 [issues](https://github.com/jiehaoZ/Cairn/issues) 里提 bug 和想法。提 PR 之前请先读
[`AGENTS.md`](AGENTS.md)，里面列了必须通过的检查，以及流水线依赖的约束。

## 许可证

Cairn 基于 [MIT 许可证](./LICENSE) 发布。
