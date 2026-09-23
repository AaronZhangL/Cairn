---
name: cairn-desktop-verify
description: Verify Cairn desktop behavior in the right surface. Use for Electrobun shell, RPC, local library, native dialog, audio, or other behavior that Vite alone cannot prove, and for rendered UI checks before claiming desktop work is verified.
---

# Cairn Desktop Verify

Choose the surface that exercises the behavior under test:

| Surface | What it proves |
| --- | --- |
| `cd apps/desktop && bun run dev` | React rendering, layout, copy, and `?gauntlet` slide overflow in Vite. `inShell` is false: model calls, native dialogs, and the local library are unavailable by design. |
| `cd apps/desktop && bun run build` | The webview bundles successfully, including the check against `node:*` imports reaching it. This does not run the main process. |
| `cd apps/desktop && bun run start` | The real Electrobun main process and WebView, including the RPC bridge, native actions, library server, settings persistence, and playback. Verify the changed interaction in its window. |

Read `AGENTS.md` for the current test and typecheck commands. Run checks relevant to the change before opening the app. Use `?gauntlet` when slide layout or CSS can overflow; inspect the rendered result because unit tests cannot establish fit.

For shell-dependent changes, observe the actual app. Check the user action, resulting UI state, and terminal errors. When the task concerns generated books or settings, use a temporary `CAIRN_DATA_DIR` to keep verification data separate from the owner's library. Exercise model or speech generation only when the changed behavior requires it.

Cairn currently uses the native macOS WebView (`bundleCEF: false` in `apps/desktop/electrobun.config.ts`). The llm-space CEF CDP scripts and port `9333` do not target this renderer. Use an available native desktop inspection tool or direct window interaction; report what was observed. If the real app cannot be opened, state that shell behavior remains unverified rather than treating a Vite check as equivalent.
