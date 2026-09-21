import { describe, expect, test } from 'bun:test';
import { countWords, decodeBytes, decodeEntities, htmlToText, normalizeText } from '../../src/parse/text';

describe('countWords', () => {
  test('中文按字计', () => expect(countWords('锚定效应')).toBe(4));
  test('西文按词计', () => expect(countWords('anchoring effect')).toBe(2));
  test('中英混排相加', () => expect(countWords('系统 1 与 System 2')).toBe(6)); // 系统与=3 + 1/System/2=3
  test('标点不计入', () => expect(countWords('你好，世界！')).toBe(4));
  test('空串为 0', () => expect(countWords('')).toBe(0));
});

describe('normalizeText', () => {
  test('统一 CRLF', () => expect(normalizeText('a\r\nb')).toBe('a\nb'));
  test('保留段落边界', () => expect(normalizeText('a\n\n\n\nb')).toBe('a\n\nb'));
  test('折叠全角空格', () => expect(normalizeText('a　　b')).toBe('a b'));
  test('去除零宽字符', () => expect(normalizeText('a​b')).toBe('ab'));
});

describe('decodeBytes', () => {
  test('解出 UTF-8 中文', () => {
    expect(decodeBytes(new TextEncoder().encode('锚定效应'))).toBe('锚定效应');
  });
  test('非法字节不抛错', () => {
    expect(() => decodeBytes(new Uint8Array([0xff, 0xfe, 0x41]))).not.toThrow();
  });
});

describe('decodeEntities', () => {
  test('具名实体', () => expect(decodeEntities('a&amp;b&nbsp;c')).toBe('a&b c'));
  test('十进制数字实体', () => expect(decodeEntities('&#38;')).toBe('&'));
  test('十六进制数字实体', () => expect(decodeEntities('&#x4e2d;')).toBe('中'));
  test('未知实体原样保留', () => expect(decodeEntities('&zzz;')).toBe('&zzz;'));
});

describe('htmlToText', () => {
  test('块级标签转换为换行，段落不粘连', () => {
    expect(htmlToText('<p>第一段</p><p>第二段</p>')).toBe('第一段\n第二段');
  });
  test('剥离 script 与 style', () => {
    expect(htmlToText('<style>p{color:red}</style><p>正文</p>')).toBe('正文');
  });
  test('br 转换为换行', () => {
    expect(htmlToText('<p>上<br/>下</p>')).toBe('上\n下');
  });
});
