/**
 * Calls the model through the locally installed codex CLI, so development
 * costs nothing in API spend.
 *
 * Bun / Node only — a browser cannot spawn a process. This is why the main
 * process owns every model call and the webview reaches it over RPC.
 *
 * Each call carries roughly 18k tokens of agent harness overhead, several times
 * the chapter text itself. That is why the map stage batches; see pipeline/map.ts.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LlmError, type LlmProvider, type LlmRequest } from '../types';

export interface CodexOptions {
  readonly model?: string;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 180_000;

export function codexCliProvider(options: CodexOptions = {}): LlmProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: 'codex-cli',
    // Each call is a whole agent process: more of them strains the machine and invites rate limits
    suggestedConcurrency: 2,
    overheadTokens: 18_000,

    async complete(request: LlmRequest): Promise<string> {
      const dir = await mkdtemp(join(tmpdir(), 'vibe-codex-'));
      const outPath = join(dir, 'out.txt');

      try {
        const args = [
          'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
          '-s', 'read-only', '--color', 'never',
          '-o', outPath,
        ];
        if (options.model) args.push('-m', options.model);
        if (request.schema) {
          const schemaPath = join(dir, 'schema.json');
          await writeFile(schemaPath, JSON.stringify(request.schema), 'utf8');
          args.push('--output-schema', schemaPath);
        }
        args.push('-');

        await spawnCodex(args, buildPrompt(request), timeoutMs, request.signal);

        const output = await readFile(outPath, 'utf8').catch(() => '');
        if (output.trim().length === 0) {
          throw new LlmError('codex 未产生任何输出', 'bad_output');
        }
        return output;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

function buildPrompt(request: LlmRequest): string {
  return request.system ? `${request.system}\n\n---\n\n${request.prompt}` : request.prompt;
}

async function spawnCodex(
  args: readonly string[],
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const child = Bun.spawn(['codex', ...args], {
    stdin: new TextEncoder().encode(prompt),
    stdout: 'ignore',
    stderr: 'pipe',
  });

  const timer = setTimeout(() => child.kill(), timeoutMs);
  const onAbort = (): void => child.kill();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const code = await child.exited;
    if (signal?.aborted) throw new LlmError('调用已取消', 'aborted');
    if (code !== 0) {
      const stderr = await new Response(child.stderr).text();
      throw new LlmError(`codex 退出码 ${code}`, 'provider_failed', stderr.slice(-400));
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
