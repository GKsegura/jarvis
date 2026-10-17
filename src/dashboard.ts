import './style.css';
import { VoiceCore } from './core';
import { canvasScale } from './budget';
import { pollAdaptive } from './poll';
import {
  diskPercent,
  formatCountdown,
  formatGb,
  formatRate,
  formatUptime,
  memPercent,
  type ProjectStatus,
  type Reminder,
  type SystemInfo,
  type WeatherInfo,
  weatherLabel,
} from './info';
import { openLink, type LinkMessage, type LinkState } from './link';

/**
 * Painel de controle das outras telas ("Jarvis, assume as telas"): gráficos do PC ao longo do
 * tempo, previsão do tempo, lembretes, projetos e o núcleo de voz sincronizado com a tela principal.
 * Sem câmera e sem microfone: quem ouve e fala é só a janela principal.
 */

const screenNumber = new URLSearchParams(location.search).get('screen') ?? '2';
document.title = `J.A.R.V.I.S. · TELA ${screenNumber}`;
document.body.classList.add('dashboard');

const canvas = document.getElementById('hud') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const core = new VoiceCore();

const CYAN = '#4dd8ff';
const DIM = 'rgba(77, 216, 255, 0.45)';
const FAINT = 'rgba(77, 216, 255, 0.16)';
const TEXT = '#dff7ff';
const HOT = '#ffb347';
const OK = '#7cffb2';
const BAD = '#ff6b6b';
const mono = (size: number) => `${size}px "Share Tech Mono", ui-monospace, monospace`;
const orbitron = (size: number, weight = 600) => `${weight} ${size}px Orbitron, sans-serif`;

let view = { w: window.innerWidth, h: window.innerHeight };
function resize() {
  view = { w: window.innerWidth, h: window.innerHeight };
  const dpr = canvasScale(window.devicePixelRatio);
  canvas.width = Math.round(view.w * dpr);
  canvas.height = Math.round(view.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- Ligação com a tela principal ----------
let link: { state: LinkState; at: number } | null = null;
const channel = openLink();
if (channel) channel.onmessage = (e: MessageEvent<LinkMessage>) => {
  if (e.data?.type === 'state') link = { state: e.data.state, at: performance.now() };
};
/** A tela principal parou de mandar notícias (fechada ou travada). */
const linked = (now: number) => link !== null && now - link.at < 3000;

// ---------- Dados do servidor ----------
const HISTORY_MS = 5 * 60_000;
const SYSTEM_EVERY_MS = 2000;
interface Sample {
  t: number;
  cpu: number;
  mem: number;
  down: number;
  up: number;
}
const history: Sample[] = [];
let system: SystemInfo | null = null;
let weather: WeatherInfo | null = null;
let reminders: Reminder[] = [];
let projects: ProjectStatus[] = [];

const getJson = async <T>(url: string): Promise<T | null> => {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
};

const poll = (fn: () => Promise<void>, ms: number) => pollAdaptive(fn, ms, () => (document.hidden ? 4 : 1));
poll(async () => {
  const s = await getJson<SystemInfo>('/api/system');
  if (!s) return;
  system = s;
  const now = Date.now();
  history.push({ t: now, cpu: s.cpu, mem: memPercent(s), down: s.netDown ?? 0, up: s.netUp ?? 0 });
  while (history.length && now - history[0].t > HISTORY_MS) history.shift();
}, SYSTEM_EVERY_MS);
poll(async () => {
  weather = (await getJson<WeatherInfo>('/api/weather')) ?? weather;
}, 10 * 60_000);
poll(async () => {
  reminders = (await getJson<{ reminders: Reminder[] }>('/api/reminders'))?.reminders ?? reminders;
}, 5000);
poll(async () => {
  projects = (await getJson<{ projects: ProjectStatus[] }>('/api/actions/status'))?.projects ?? projects;
}, 10_000);

// ---------- Desenho ----------
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cartão com cantos marcados, como os painéis da tela principal. */
function card(b: Box, title: string, note = '', noteColor = DIM): void {
  ctx.fillStyle = 'rgba(2, 16, 24, 0.7)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = FAINT;
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  const c = 14;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + c); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + c, b.y);
  ctx.moveTo(b.x + b.w - c, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h - c);
  ctx.stroke();
  ctx.font = orbitron(12);
  ctx.textAlign = 'left';
  ctx.fillStyle = CYAN;
  ctx.fillText(title, b.x + 16, b.y + 24);
  if (note) {
    ctx.font = mono(12);
    ctx.textAlign = 'right';
    ctx.fillStyle = noteColor;
    ctx.fillText(note, b.x + b.w - 16, b.y + 24);
  }
  ctx.fillStyle = FAINT;
  ctx.fillRect(b.x + 16, b.y + 34, b.w - 32, 1);
}

/** Gráfico de área dos últimos 5 minutos. `max` = topo do eixo. */
function chart(b: Box, series: Array<{ values: Array<{ t: number; v: number }>; color: string; fill: boolean }>, max: number, unit: (v: number) => string): void {
  const now = Date.now();
  const x = (t: number) => b.x + b.w - ((now - t) / HISTORY_MS) * b.w;
  const y = (v: number) => b.y + b.h - (Math.min(v, max) / max) * b.h;
  // Grade
  ctx.font = mono(10);
  ctx.textAlign = 'left';
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const gy = b.y + b.h - f * b.h;
    ctx.fillStyle = 'rgba(77, 216, 255, 0.07)';
    ctx.fillRect(b.x, gy, b.w, 1);
    ctx.fillStyle = 'rgba(77, 216, 255, 0.35)';
    ctx.fillText(unit(max * f), b.x + 4, gy + 12);
  }
  for (let m = 1; m < 5; m++) {
    const gx = b.x + b.w - (m / 5) * b.w;
    ctx.fillStyle = 'rgba(77, 216, 255, 0.05)';
    ctx.fillRect(gx, b.y, 1, b.h);
  }
  ctx.fillStyle = 'rgba(77, 216, 255, 0.35)';
  ctx.textAlign = 'left';
  ctx.fillText('-5 min', b.x, b.y + b.h + 14);
  ctx.textAlign = 'right';
  ctx.fillText('agora', b.x + b.w, b.y + b.h + 14);

  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y - 2, b.w, b.h + 4);
  ctx.clip();
  for (const s of series) {
    if (s.values.length < 2) continue;
    ctx.beginPath();
    s.values.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p.v)) : ctx.moveTo(x(p.t), y(p.v))));
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    if (s.fill) {
      const last = s.values[s.values.length - 1];
      ctx.lineTo(x(last.t), b.y + b.h);
      ctx.lineTo(x(s.values[0].t), b.y + b.h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, s.color.replace('rgb(', 'rgba(').replace(')', ', 0.28)'));
      g.addColorStop(1, s.color.replace('rgb(', 'rgba(').replace(')', ', 0)'));
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
  ctx.restore();
}

function bigValue(b: Box, text: string, color = TEXT): void {
  ctx.font = orbitron(26, 500);
  ctx.textAlign = 'right';
  ctx.fillStyle = color;
  ctx.fillText(text, b.x + b.w - 16, b.y + 70);
}

function drawSystemCharts(area: Box): void {
  const gap = 18;
  const h = (area.h - 2 * gap - 44) / 3;
  const cards: Box[] = [0, 1, 2].map((i) => ({ x: area.x, y: area.y + i * (h + gap), w: area.w, h }));
  const inner = (b: Box): Box => ({ x: b.x + 16, y: b.y + 86, w: b.w - 32, h: b.h - 110 });
  const level = (v: number) => (v >= 90 ? BAD : v >= 75 ? HOT : TEXT);

  card(cards[0], 'PROCESSADOR', system ? `${system.cores} NÚCLEOS` : '');
  if (system) bigValue(cards[0], `${system.cpu}%`, level(system.cpu));
  chart(inner(cards[0]), [{ values: history.map((s) => ({ t: s.t, v: s.cpu })), color: 'rgb(77, 216, 255)', fill: true }], 100, (v) => `${Math.round(v)}%`);

  const mem = system ? memPercent(system) : 0;
  card(cards[1], 'MEMÓRIA', system ? `${formatGb(system.memTotal - system.memFree)} / ${formatGb(system.memTotal)}` : '');
  if (system) bigValue(cards[1], `${mem}%`, level(mem));
  chart(inner(cards[1]), [{ values: history.map((s) => ({ t: s.t, v: s.mem })), color: 'rgb(180, 140, 255)', fill: true }], 100, (v) => `${Math.round(v)}%`);

  const peak = Math.max(64 * 1024, ...history.map((s) => Math.max(s.down, s.up)));
  card(cards[2], 'REDE', system?.online === false ? '● SEM INTERNET' : system?.online ? '● ONLINE' : '', system?.online === false ? BAD : OK);
  if (system) {
    ctx.font = orbitron(18, 500);
    ctx.textAlign = 'right';
    ctx.fillStyle = OK;
    ctx.fillText(`↓ ${formatRate(system.netDown ?? 0)}`, cards[2].x + cards[2].w - 170, cards[2].y + 70);
    ctx.fillStyle = HOT;
    ctx.fillText(`↑ ${formatRate(system.netUp ?? 0)}`, cards[2].x + cards[2].w - 16, cards[2].y + 70);
  }
  chart(
    inner(cards[2]),
    [
      { values: history.map((s) => ({ t: s.t, v: s.down })), color: 'rgb(124, 255, 178)', fill: true },
      { values: history.map((s) => ({ t: s.t, v: s.up })), color: 'rgb(255, 179, 71)', fill: false },
    ],
    peak * 1.15,
    (v) => formatRate(v),
  );

  // Faixa de baixo: disco, tempo ligado e bateria
  if (system) {
    const y = area.y + area.h - 18;
    const disk = diskPercent(system);
    const parts = [
      disk !== null && system.disk ? `DISCO C: ${disk}% · ${formatGb(system.disk.free)} LIVRES` : 'DISCO —',
      `LIGADO HÁ ${formatUptime(system.uptimeSec)}`,
      system.battery !== null ? `BATERIA ${system.battery}%${system.charging ? ' ⚡' : ''}` : 'NA TOMADA',
    ];
    ctx.font = mono(13);
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.fillText(parts.join('     ·     '), area.x, y);
  }
}

function drawWeather(b: Box): void {
  card(b, 'CLIMA', weather ? weather.place.toUpperCase() : '');
  if (!weather) return;
  const w = weather;
  ctx.textAlign = 'left';
  ctx.font = orbitron(40, 500);
  ctx.fillStyle = TEXT;
  ctx.fillText(`${Math.round(w.temp)}°`, b.x + 16, b.y + 88);
  ctx.font = mono(15);
  ctx.fillText(weatherLabel(w.code), b.x + 120, b.y + 62);
  ctx.font = mono(12);
  ctx.fillStyle = DIM;
  ctx.fillText(`MÁX ${Math.round(w.max)}°  MÍN ${Math.round(w.min)}°  ·  SENSAÇÃO ${Math.round(w.feels)}°  ·  UMIDADE ${w.humidity}%`, b.x + 120, b.y + 82);
  ctx.fillStyle = w.rainChance >= 60 ? HOT : DIM;
  ctx.fillText(`CHANCE DE CHUVA HOJE: ${w.rainChance}%`, b.x + 120, b.y + 100);
  // Próximas horas: temperatura e barra de chuva
  const hours = w.hours;
  if (!hours.length) return;
  const top = b.y + 122;
  const cell = (b.w - 32) / hours.length;
  const barH = b.h - (top - b.y) - 52;
  hours.forEach((h, i) => {
    const cx = b.x + 16 + cell * i + cell / 2;
    ctx.textAlign = 'center';
    ctx.font = mono(12);
    ctx.fillStyle = TEXT;
    ctx.fillText(`${Math.round(h.temp)}°`, cx, top + 12);
    ctx.fillStyle = FAINT;
    ctx.fillRect(cx - 4, top + 20, 8, barH);
    ctx.fillStyle = h.rain >= 60 ? HOT : CYAN;
    ctx.fillRect(cx - 4, top + 20 + barH * (1 - h.rain / 100), 8, barH * (h.rain / 100));
    ctx.fillStyle = DIM;
    ctx.fillText(`${h.rain}%`, cx, top + barH + 36);
    ctx.fillText(`${String(h.hour).padStart(2, '0')}h`, cx, top + barH + 50);
  });
}

function drawReminders(b: Box, personal: boolean): void {
  const pending = reminders.filter((r) => !r.done).sort((a, c) => a.dueAt - c.dueAt);
  card(b, 'LEMBRETES', personal && pending.length ? `${pending.length} PENDENTE${pending.length > 1 ? 'S' : ''}` : '');
  ctx.font = mono(14);
  ctx.textAlign = 'left';
  if (!personal) {
    ctx.fillStyle = DIM;
    ctx.fillText('oculto (confirme o rosto na tela principal)', b.x + 16, b.y + 62);
    return;
  }
  if (!pending.length) {
    ctx.fillStyle = DIM;
    ctx.fillText('nada pendente', b.x + 16, b.y + 62);
    return;
  }
  const now = Date.now();
  const max = Math.floor((b.h - 50) / 26);
  pending.slice(0, max).forEach((r, i) => {
    const y = b.y + 62 + i * 26;
    const left = r.dueAt - now;
    const when =
      r.kind === 'timer'
        ? formatCountdown(left)
        : new Date(r.dueAt).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    ctx.textAlign = 'left';
    ctx.fillStyle = left < 60_000 ? HOT : TEXT;
    ctx.fillText(`${r.kind === 'timer' ? '⏱' : '•'} ${r.text}`, b.x + 16, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = left < 60_000 ? HOT : CYAN;
    ctx.fillText(when, b.x + b.w - 16, y);
  });
}

function drawProjects(b: Box): void {
  const on = projects.filter((p) => p.running).length;
  card(b, 'PROJETOS', projects.length ? `${on}/${projects.length} NO AR` : '');
  projects.forEach((p, i) => {
    const y = b.y + 62 + i * 24;
    ctx.fillStyle = p.running ? OK : 'rgba(160, 190, 200, 0.4)';
    ctx.beginPath();
    ctx.arc(b.x + 21, y - 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = mono(14);
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.fillText(p.name, b.x + 34, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = p.running ? OK : DIM;
    ctx.fillText(p.running ? 'NO AR' : p.running === false ? 'DESLIGADO' : '—', b.x + b.w - 16, y);
  });
}

const covers = new Map<string, HTMLImageElement>();
function drawMusic(b: Box, music: LinkState['music']): void {
  card(b, 'SPOTIFY', music ? (music.playing ? '● TOCANDO' : '❚❚ PAUSADO') : '', music?.playing ? OK : DIM);
  if (!music) return;
  let img: HTMLImageElement | null = null;
  if (music.cover) {
    img = covers.get(music.cover) ?? null;
    if (!img) {
      img = new Image();
      img.src = music.cover;
      covers.set(music.cover, img);
    }
  }
  const size = b.h - 56;
  if (img?.complete && img.naturalWidth) ctx.drawImage(img, b.x + 16, b.y + 44, size, size);
  ctx.textAlign = 'left';
  ctx.font = mono(16);
  ctx.fillStyle = TEXT;
  ctx.fillText(music.name, b.x + 32 + size, b.y + 66);
  ctx.font = mono(13);
  ctx.fillStyle = DIM;
  ctx.fillText(music.artist, b.x + 32 + size, b.y + 86);
  const barX = b.x + 32 + size;
  const barW = b.w - (barX - b.x) - 16;
  ctx.fillStyle = FAINT;
  ctx.fillRect(barX, b.y + b.h - 22, barW, 3);
  ctx.fillStyle = CYAN;
  ctx.fillRect(barX, b.y + b.h - 22, barW * Math.min(1, music.durationMs ? music.elapsedMs / music.durationMs : 0), 3);
}

/** Quebra o texto em linhas que cabem na largura. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

let lastFrameAt = -Infinity;

function frame(now: number) {
  // O painel é informativo: 30 fps bastam
  if (now - lastFrameAt < 31) {
    requestAnimationFrame(frame);
    return;
  }
  lastFrameAt = now;
  const { w, h } = view;
  ctx.clearRect(0, 0, w, h);
  const ok = linked(now);
  const state = ok ? link!.state : null;

  // Cabeçalho
  ctx.textAlign = 'left';
  ctx.font = orbitron(22);
  ctx.fillStyle = CYAN;
  ctx.fillText('J.A.R.V.I.S.', 40, 56);
  ctx.font = mono(13);
  let x = 40;
  const status = state ? state.status : [{ text: 'SEM CONEXÃO COM A TELA PRINCIPAL', color: HOT }];
  [{ text: `TELA ${screenNumber} · PAINEL DE CONTROLE` }, ...status].forEach((p, i) => {
    const text = i === 0 ? p.text : `  ·  ${p.text}`;
    ctx.fillStyle = p.color ?? DIM;
    ctx.fillText(text, x, 80);
    x += ctx.measureText(text).width;
  });
  const date = new Date();
  ctx.textAlign = 'right';
  ctx.font = orbitron(26, 500);
  ctx.fillStyle = CYAN;
  ctx.fillText(date.toLocaleTimeString('pt-BR'), w - 40, 56);
  ctx.font = mono(13);
  ctx.fillStyle = DIM;
  ctx.fillText(date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase(), w - 40, 80);

  const top = 110;
  const bottom = h - 90;
  const left: Box = { x: 40, y: top, w: Math.round(w * 0.56) - 60, h: bottom - top };
  drawSystemCharts(left);

  // Coluna da direita: núcleo, clima, lembretes, projetos e música
  const rx = left.x + left.w + 30;
  const rw = w - rx - 40;
  const personal = state?.personal ?? false;
  const r = Math.min(70, (bottom - top) * 0.09);
  core.draw(ctx, { x: rx + r + 20, y: top + r + 26, r, state: state?.core.state ?? 'idle', level: state?.core.level ?? 0, time: now });
  // Ao lado do núcleo: o que ele está falando ou ouvindo
  ctx.textAlign = 'left';
  const textX = rx + 2 * r + 70;
  const textW = rw - (textX - rx);
  if (state?.transcript) {
    ctx.font = mono(15);
    ctx.fillStyle = 'rgba(223, 247, 255, 0.75)';
    wrap(`“${state.transcript}”`, textW).slice(0, 2).forEach((l, i) => ctx.fillText(l, textX, top + 50 + i * 20));
  }
  if (state?.caption) {
    ctx.font = mono(17);
    ctx.fillStyle = CYAN;
    wrap(state.caption, textW).slice(0, 4).forEach((l, i) => ctx.fillText(l, textX, top + (state.transcript ? 100 : 56) + i * 24));
  }

  let y = top + 2 * r + 70;
  const gap = 18;
  const music = personal ? (state?.music ?? null) : null;
  const space = bottom - y;
  const weatherH = Math.min(280, space * 0.36);
  drawWeather({ x: rx, y, w: rw, h: weatherH });
  y += weatherH + gap;
  const projectsH = 50 + Math.max(1, projects.length) * 24;
  const musicH = music ? 120 : 0;
  const remindersH = bottom - y - projectsH - gap - (music ? musicH + gap : 0);
  drawReminders({ x: rx, y, w: rw, h: remindersH }, personal);
  y += remindersH + gap;
  drawProjects({ x: rx, y, w: rw, h: projectsH });
  y += projectsH + gap;
  if (music) drawMusic({ x: rx, y, w: rw, h: musicH }, music);

  // Rodapé
  ctx.textAlign = 'center';
  ctx.font = mono(12);
  ctx.fillStyle = 'rgba(77, 216, 255, 0.4)';
  ctx.fillText('"JARVIS, LIBERA AS TELAS" PARA FECHAR ESTE PAINEL', w / 2, h - 40);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
