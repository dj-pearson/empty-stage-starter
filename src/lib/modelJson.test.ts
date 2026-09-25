// @vitest-environment node
// Vitest coverage for supabase/functions/_shared/modelJson.ts, the request
// builder and JSON extraction shared by the AIServiceV2 callers.
import { describe, expect, it } from 'vitest';
import {
  buildChatRequest,
  extractJsonArray,
  extractJsonObject,
} from '../../supabase/functions/_shared/modelJson';

describe('buildChatRequest', () => {
  it('builds the AIRequest shape generateContent takes: system then user message', () => {
    expect(buildChatRequest('sys', 'user prompt')).toEqual({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'user prompt' },
      ],
    });
  });

  it('carries temperature and maxTokens only when given', () => {
    const req = buildChatRequest('s', 'u', { temperature: 0.3, maxTokens: 900 });
    expect(req.temperature).toBe(0.3);
    expect(req.maxTokens).toBe(900);
    expect('temperature' in buildChatRequest('s', 'u')).toBe(false);
  });
});

describe('extractJsonObject', () => {
  it('reads plain, fenced and prose-wrapped objects', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a": {"b": 2}}\n```')).toEqual({ a: { b: 2 } });
    expect(extractJsonObject('Sure! Here it is:\n{"a": 1}\nEnjoy.')).toEqual({ a: 1 });
  });

  it('tolerates trailing commas', () => {
    expect(extractJsonObject('{"a": [1, 2,],}')).toEqual({ a: [1, 2] });
  });

  it('keeps a comma-brace sequence inside a string when the JSON is already valid', () => {
    expect(extractJsonObject('{"a": "x,}"}')).toEqual({ a: 'x,}' });
  });

  it('skips a stray brace in the prose before the payload', () => {
    expect(extractJsonObject('Use {name} as a slot. {"a": 1}')).toEqual({ a: 1 });
  });

  it.each([undefined, null, 42, '', '   ', 'no json', '{ not json }', '{"a": ', '[1, 2]', 'null'])(
    'returns null for %j',
    (input) => {
      expect(extractJsonObject(input)).toBeNull();
    },
  );
});

describe('extractJsonArray', () => {
  it('reads plain, fenced and prose-wrapped arrays', () => {
    expect(extractJsonArray('[1, 2]')).toEqual([1, 2]);
    expect(extractJsonArray('```json\n[{"a": 1}]\n```')).toEqual([{ a: 1 }]);
    expect(extractJsonArray('Here are the recipes:\n[{"a": 1},]\nThanks')).toEqual([{ a: 1 }]);
  });

  it('skips a stray bracket in the prose before the payload', () => {
    expect(extractJsonArray('Step [1] of 2:\n[{"a": 1}]')).toEqual([{ a: 1 }]);
  });

  it.each([undefined, '', 'nothing', '[1, 2', '{"a": 1}'])('returns null for %j', (input) => {
    expect(extractJsonArray(input)).toBeNull();
  });
});
