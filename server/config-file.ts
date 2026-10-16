import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Texto do jarvis.config.json, que é pessoal de cada pessoa e fica fora do git.
 * Sem ele, usa o jarvis.config.example.json do repositório.
 */
export function readConfigText(root: string): string {
  const personal = join(root, 'jarvis.config.json');
  return readFileSync(existsSync(personal) ? personal : join(root, 'jarvis.config.example.json'), 'utf8');
}
