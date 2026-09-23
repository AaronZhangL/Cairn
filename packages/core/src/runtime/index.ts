/**
 * The side-effecting half of core: everything that spawns a process or touches
 * the disk. Pipelines depend on the interfaces in `pipeline/` and `llm/`, never
 * on this directory — which is what keeps those stages testable without codex
 * or a narration service reachable.
 *
 * The rule that decides what belongs here: if a file imports `node:*` for
 * anything but pure path arithmetic, it is runtime, not domain.
 */
export { codexCliProvider, type CodexOptions } from './codex-cli';
export {
  type CodexApiKeyLogin, type CodexLogin, type CodexOAuthLogin,
  FALLBACK_CODEX_MODEL, readCodexLogin, refreshAccessToken, refreshCodexLogin,
  type RefreshedTokens,
} from './codex-credentials';
export {
  type ChatGptCodexConfig, chatGptCodexProvider, collect,
} from './chatgpt-codex';
export { firstMessage, type HttpLlmConfig, httpLlmProvider } from './http-llm';
export {
  edgeTtsNarrator, ensureNarrationReachable, forgetNarrationProbe, speakSample, synthesize,
} from './edge-tts-ws';
export { listTraces, readTrace, traceDirSink, traceFileName } from './trace-dir';
