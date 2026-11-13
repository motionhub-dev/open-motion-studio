// A stand-in for `claude -p --input-format stream-json --output-format stream-json`: for each user line on stdin,
// the events a turn that reads a file and answers would print, then its result.
import { createInterface } from 'node:readline';

const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
out({ type: 'system', subtype: 'init', session_id: 's1', tools: ['Read'], mcp_servers: [] });
let turn = 0;
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  turn++;
  const words = message.message.content.find((c) => c.type === 'text')?.text ?? '';
  if (words === 'hang') continue;
  out({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: `Turn ${turn}: ${words}` } } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: `Turn ${turn}` }, { type: 'tool_use', id: `t${turn}`, name: 'Read', input: { file_path: 'film.tsx' } }] } });
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${turn}`, content: 'export default' }] } });
  out({ type: 'result', subtype: 'success', is_error: words === 'fail', result: words === 'fail' ? 'Not logged in. Please run /login' : 'done' });
}
