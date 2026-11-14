// Deterministic test adapter only. Harness still owns scheduling, turns, tools and persistence.
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
export const inject = ['llm'];
class Fixture extends LlmAdapter {
  seen = new Set();
  async resolveModel(provider, model) {
    return { provider, id: model, name: 'Deterministic test fixture', defaultMaxTokens: 4096 };
  }
  async *stream(options) {
    const text = JSON.stringify(options.messages);
    if (text.includes('EXPECT_MEMORY') && !text.includes('FIXTURE_SAVED_MEMORY'))
      throw new Error('Confirmed memory missing from a native model request');
    if (text.includes('EXPECT_NO_MEMORY') && text.includes('FIXTURE_SAVED_MEMORY'))
      throw new Error('Deleted memory leaked into a new native Session');
    if (options.maxTokens > 2048) throw new Error('Unattended output cap was not applied');
    if (text.includes('FIXTURE_HANG')) {
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'Fixture is running until interrupted.' };
      await new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(new Error('aborted'));
          return;
        }
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
      return;
    }
    const run = [...text.matchAll(/Run ([0-9a-f-]{36})\./g)].at(-1)?.[1];
    if (run && !this.seen.has(run)) {
      this.seen.add(run);
      const args = JSON.stringify({
        summary: 'Deterministic fixture result — not a real research discovery.',
        sources: ['https://example.org/fixture'],
        changed: !text.includes('FIXTURE_NO_CHANGE'),
      });
      const id = 'fixture-' + run;
      yield { type: 'block-start', index: 0, blockType: 'tool-call' };
      yield {
        type: 'tool-call-delta',
        index: 0,
        id,
        name: 'always_on_report',
        argumentsDelta: args,
      };
      yield {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id, name: 'always_on_report', arguments: args },
      };
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 10 } };
      yield { type: 'finish', reason: { kind: 'tool-calls' } };
    } else {
      const result = 'Fixture check complete.';
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: result };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: result } };
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
}
export function apply(ctx) {
  ctx.llm.registerAdapter(['always-on-test'], new Fixture());
}
