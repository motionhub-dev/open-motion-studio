// A stand-in for `claude -p --input-format stream-json --output-format stream-json --replay-user-messages`: each user
// line on stdin is echoed (isReplay) when taken in, then the events a turn that reads a file and answers would print,
// then its result. As Claude Code 2.1 does with a message written mid-turn: a `slow` turn pauses after its tool, takes
// in what arrived meanwhile and answers it in the same turn; a `late` turn pauses after its answer and ends, so what
// arrived meanwhile runs as a turn of its own.
import { createInterface } from 'node:readline';

const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const lines = [];
let wake = null;
createInterface({ input: process.stdin }).on('line', (line) => {
  lines.push(JSON.parse(line));
  wake?.();
});
const next = () =>
  lines.length
    ? Promise.resolve(lines.shift())
    : new Promise((done) => {
        wake = () => {
          wake = null;
          done(lines.shift());
        };
      });
const said = (message) => message.message.content.find((c) => c.type === 'text')?.text ?? '';
const delta = (text) => out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });

out({ type: 'system', subtype: 'init', session_id: 's1', tools: ['Read'], mcp_servers: [] });
let turn = 0;
for (;;) {
  const message = await next();
  out({ type: 'user', isReplay: true, message: message.message });
  turn++;
  const words = said(message);
  if (words === 'hang') continue;
  out({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } });
  delta(`Turn ${turn}: ${words}`);
  out({ type: 'assistant', message: { content: [{ type: 'text', text: `Turn ${turn}` }, { type: 'tool_use', id: `t${turn}`, name: 'Read', input: { file_path: 'film.tsx' } }] } });
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${turn}`, content: 'export default' }] } });
  if (words === 'slow') {
    await pause(300);
    for (let taken = lines.shift(); taken; taken = lines.shift()) {
      out({ type: 'user', isReplay: true, message: taken.message });
      delta(`Took in: ${said(taken)}`);
    }
  }
  if (words === 'late') await pause(300);
  out({ type: 'result', subtype: 'success', is_error: words === 'fail', result: words === 'fail' ? 'Not logged in. Please run /login' : 'done' });
}
