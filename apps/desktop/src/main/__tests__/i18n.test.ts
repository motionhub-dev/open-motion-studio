import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { translate, translateSystem } from '../../shared/i18n';
import { zh } from '../../shared/translations';
import { tokenParts, workedFor, turnLine, changeLine } from '../../renderer/src/activity';

const tr = (text: string, values?: Record<string, unknown>) => translate(text, true, values);
describe('Chinese interface', () => {
  it('preserves model names, paths, and placeholder-looking user content verbatim', () => {
    const name = 'My Film {1} <script> / English';
    expect(tr('Remove {0}?', {0: name})).toBe('移除 ' + name + '？');
    expect(translate('Remove {0}?', false, {0: name})).toBe('Remove ' + name + '?');
    expect(translateSystem('Reading C:\\Films\\English.tsx', true)).toBe('读取 C:\\Films\\English.tsx');
    expect(translateSystem('Layer “English {0}” extends beyond the frame. This may be intentional.', true)).toBe('图层“English {0}”超出画面边界。这可能是有意设计。');
    expect(translate('User-authored English script', true)).toBe('User-authored English script');
    expect(translateSystem('Third-party diagnostic: E123', true)).toBe('Third-party diagnostic: E123');
  });
  it('localizes numeric activity without changing English output', () => {
    expect(workedFor(72, tr)).toBe('耗时 1 分 12 秒');
    expect(workedFor(72)).toBe('Worked for 1m 12s');
    expect(tokenParts({ input: 12, output: 3, cacheRead: 0, cacheWrite: 0, reasoning: 0, calls: 2 }, tr)).toBe('模型调用 2 次 · 输入 12 · 输出 3');
    expect(turnLine([{kind: 'tool', id: '1', name: 'read_file', summary: 'Reading English.tsx'}], tr)).toBe('读取 1 个文件');
    expect(changeLine([{change: 'added', ref: {kind: 'scene', label: 'English', scene: 'scene'}}], tr)).toBe('+1 场景');
  });
  it('does not introduce new interpolation fields in translations', () => {
    for (const [english, chinese] of Object.entries(zh)) {
      const fields = new Set(english.match(/\{\w+\}/g) ?? []);
      for (const field of chinese.match(/\{\w+\}/g) ?? []) expect(fields.has(field), english + ': ' + field).toBe(true);
    }
  });
  it('keeps static interface labels and help behind the translation boundary', () => {
    const root = fileURLToPath(new URL('../../renderer/src/', import.meta.url));
    const technical = new Set(['OpenMotionStudio', 'OpenMotionStudio /', 'OpenMotion', 'Studio', 'media/', 'MOTION.md', 'motionhub', 'H.264 ·', 'C', 'eastasia']);
    const missing: string[] = [];
    for (const name of readdirSync(root).filter(name => name.endsWith('.tsx'))) {
      const source = ts.createSourceFile(name, readFileSync(root + name, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function walk(node: ts.Node) {
        if (ts.isJsxText(node)) {
          const text = node.text.trim().replace(/\s+/g, ' ');
          if (/[A-Za-z]/.test(text) && !technical.has(text)) missing.push(name + ': ' + text);
        }
        if (ts.isJsxAttribute(node) && ['aria-label', 'title', 'placeholder', 'data-tip', 'label'].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
          const text = node.initializer.text;
          if (/[A-Za-z]/.test(text) && !technical.has(text)) missing.push(name + ': ' + text);
        }
        if (ts.isCallExpression(node) && ['t', 'tr'].includes(node.expression.getText(source)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text;
          if (!Object.hasOwn(zh, key)) missing.push(name + ': missing translation ' + key);
        }
        ts.forEachChild(node, walk);
      }
      walk(source);
    }
    expect(missing).toEqual([]);
  });
});
