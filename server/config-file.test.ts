import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readConfigText } from './config-file';

const dirs: string[] = [];
const tempRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-config-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readConfigText', () => {
  it('usa o exemplo quando não existe o arquivo pessoal', () => {
    const root = tempRoot();
    writeFileSync(join(root, 'jarvis.config.example.json'), '{"a":1}');
    expect(readConfigText(root)).toBe('{"a":1}');
  });

  it('prefere o arquivo pessoal ao exemplo', () => {
    const root = tempRoot();
    writeFileSync(join(root, 'jarvis.config.example.json'), '{"a":1}');
    writeFileSync(join(root, 'jarvis.config.json'), '{"a":2}');
    expect(readConfigText(root)).toBe('{"a":2}');
  });

  it('relê quando o arquivo muda', () => {
    const root = tempRoot();
    const file = join(root, 'jarvis.config.json');
    writeFileSync(file, '{"a":1}');
    expect(readConfigText(root)).toBe('{"a":1}');
    writeFileSync(file, '{"a":3}');
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(readConfigText(root)).toBe('{"a":3}');
  });
});
