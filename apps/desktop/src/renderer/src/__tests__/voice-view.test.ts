import { expect, it } from 'vitest';
import { sampleText, voicesFound } from '../voice-view';

it('hears a voice say the film’s own first line, cut short, else a sentence in its language', () => {
  expect(sampleText([{ text: '  ' }, { text: '一个人用 AI，可以做得更多。' }])).toBe('一个人用 AI，可以做得更多。');
  expect(sampleText([{ text: 'x'.repeat(130) }])).toBe(`${'x'.repeat(120)}…`);
  expect(sampleText([], 'zh-CN-XiaoxiaoNeural')).toBe('热量从高处流向低处，除非你推它一把。');
  expect(sampleText([], 'alloy')).toBe('Heat moves downhill, unless you push it.');
});

it('finds voices by every word typed, in their name, language or id', () => {
  const voices = [
    { id: 'male-qn-jingying', name: '精英青年', language: 'zh-CN' },
    { id: 'female-shaonv', name: '少女', language: 'zh-CN' },
    { id: 'English_Graceful_Lady', name: 'Graceful Lady', language: 'en' },
  ];
  expect(voicesFound(voices, '').length).toBe(3);
  expect(voicesFound(voices, 'zh').map((v) => v.id)).toEqual(['male-qn-jingying', 'female-shaonv']);
  expect(voicesFound(voices, 'lady en').map((v) => v.id)).toEqual(['English_Graceful_Lady']);
  expect(voicesFound(voices, 'jingying')).toHaveLength(1);
});
