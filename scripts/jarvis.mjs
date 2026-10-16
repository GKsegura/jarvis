// Abre o J.A.R.V.I.S.: sobe o servidor do Vite e abre o Chrome em modo app
// (janela própria, sem barra de endereço, com som liberado desde o início).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME_PATHS = [
  join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

const server = await createServer({ root });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
server.printUrls();

const chrome = CHROME_PATHS.find((p) => existsSync(p));
if (chrome) {
  // Perfil próprio: as permissões de câmera e microfone ficam salvas e as flags sempre valem,
  // mesmo que o Chrome normal já esteja aberto
  const profile = join(root, '.chrome-profile');
  mkdirSync(profile, { recursive: true });
  spawn(
    chrome,
    [
      `--app=${url}`,
      `--user-data-dir=${profile}`,
      '--autoplay-policy=no-user-gesture-required',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--start-maximized',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { detached: true, stdio: 'ignore' },
  ).unref();
  console.log('\n  J.A.R.V.I.S. aberto no Chrome. Para desligar, feche esta janela ou aperte Ctrl+C.\n');
} else {
  console.log(`\n  Chrome não encontrado. Abra ${url} no navegador (comandos de voz só funcionam no Chrome).\n`);
}
