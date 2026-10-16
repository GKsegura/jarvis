import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const cache = new Map<string, { mtimeMs: number; text: string }>();

/**
 * Texto do jarvis.config.json, que é pessoal de cada pessoa e fica fora do git.
 * Sem ele, usa o jarvis.config.example.json do repositório.
 * Só relê do disco quando o arquivo muda (a edição continua valendo sem reiniciar).
 */
export function readConfigText(root: string): string {
  const personal = join(root, 'jarvis.config.json');
  const file = existsSync(personal) ? personal : join(root, 'jarvis.config.example.json');
  const { mtimeMs } = statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.text;
  const text = readFileSync(file, 'utf8');
  cache.set(file, { mtimeMs, text });
  return text;
}
