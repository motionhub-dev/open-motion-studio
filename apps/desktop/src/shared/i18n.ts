// The interface's two languages: English is the source and the key, Chinese is looked up in translations.ts. Only
// the Studio's own messages are translated; a value filled into a message is never translated or re-read.

import { zh } from './translations';

export type MessageValues = Record<string, unknown>;
/** Substitute only the message template, never recursively inspect interpolated content. */
export function translate(text: string, chinese: boolean, values?: MessageValues): string {
  const message = chinese ? zh[text] ?? text : text;
  return values ? message.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match) : message;
}

// Only application-generated messages use these patterns. User/model prose never enters this path.
const systemTemplates = [
  'Codex asks for {0}', 'Exported {0}', 'Exported a Remotion project to {0}',
  'Imported {0} files; a message carries up to eight references, so {1} wait in Assets.',
  'Listing {0}', 'Looking at {0} s', 'Searching motionhub for "{0}"', 'Taking {0}', 'Reading {0}', 'Writing {0}', 'Editing {0}', 'Running {0}', 'Searching for {0}',
  'Voicing {0} of {1} lines', 'Layer “{0}” extends beyond the frame. This may be intentional.',
  '{0} needs its key.', '{0} is not set up: add it in Models, under Voices.',
  "Type {0}'s key to test it.", '{0} has no key: add one in Settings.',
  'Not an address: {0}', 'Claude Code takes an effort of {0}.',
  'Stopped after {0} model calls. Send a message to let it go on.',
  'The files are back as they were. {0} still remembers the turn you undid.',
  'The turn stopped at its cap{0}. Raise or remove the cap per turn in Models to go on.',
];
const patterns = systemTemplates.map(template => {
  const keys: string[] = [];
  const chunks = template.split(/(\{\d+\})/g).map(part => {
    if (/^\{\d+\}$/.test(part)) { keys.push(part.slice(1, -1)); return '([\\s\\S]*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { template, keys, regex: new RegExp('^' + chunks.join('') + '$') };
});
export function translateSystem(text: string, chinese: boolean): string {
  if (!chinese) return text;
  if (Object.hasOwn(zh, text)) return zh[text]!;
  for (const { template, keys, regex } of patterns) {
    const match = regex.exec(text);
    if (match) return translate(template, true, Object.fromEntries(keys.map((key, index) => [key, match[index + 1]])));
  }
  return text;
}
