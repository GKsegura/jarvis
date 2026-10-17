import './style.css';
import { pollAdaptive, pollSlowdown } from './poll';
import { AlertEngine } from './alerts';
import { canvasScale, frameInterval, handInterval, type Activity } from './budget';
import { CameraError, startCamera } from './camera';
import type { CoreState } from './core';
import { dist, mid, toScreen, type Pt } from './geometry';
import { GESTURE_LABEL, GestureTracker, gestureMetrics, type Gesture } from './gestures';
import { OneEuroFilter } from './filters';
import { HandControl, type ControlContext, type ControlEvent, type ControlHand } from './handcontrol';
import { parseHandAction, type Shortcut, type ShortcutPose } from './handactions';
import { TOAST_MS, type HandUiFrame } from './handui';
import { averageFeatures, poseFeatures, type LearnedGesture } from './poses';
import { FACE_STATE_LABEL, FaceGuard } from './face';
import { CONFIRM_ANIMATION_MS, type FaceScanFrame, type FaceScanMode } from './facescan';
import { MOOD_LABEL, moodSpeech, MoodTracker, type Mood } from './mood';
import { HandTracker } from './hands';
import { HandStabilizer, type StableHand } from './tracking';
import { Hud, inRect, type HitTarget, type MusicButton, type MusicView, type PanelId } from './hud';
import { PANEL_ORDER, UI_SCALE_MAX, UI_SCALE_MIN, type PanelsData } from './panels';
import { greeting, LINES } from './lines';
import { openCameraMic } from './mic-device';
import { MicLevel, VoiceTerminal } from './terminal';
import { financeSpeech, type FinanceSummary } from './finance';
import { headlinesSpeech, type NewsItem } from './news';
import { AUTO_COMMANDS, clock, routineId, routineLabel, type Candidate, type Routine, type UsageKind } from './routines';
import {
  daySummarySpeech,
  dateSpeech,
  durationSpeech,
  projectsSpeech,
  remindersSpeech,
  systemSpeech,
  timeSpeech,
  weatherSpeech,
  whenSpeech,
  type ProjectStatus,
  type Reminder,
  type SystemInfo,
  type WeatherInfo,
} from './info';
import {
  confirmation,
  normalize as normalizeText,
  parseFinance,
  parseIntent,
  parseMusic,
  parseNews,
  parseRoutines,
  type Catalog,
  type CatalogItem,
  type Intent,
  type MusicIntent,
  type NewsIntent,
  type RoutinesIntent,
  type WindowOp,
  matchWindow,
  parseWindowRequest,
  type OpenWindow,
  type WindowRequest,
} from './intents';
import { ObjectSpotter } from './objects';
import { openLink, type LinkMessage, type LinkState } from './link';
import { COMMAND_LABEL, JarvisVoice, parseCommand, parseForgetGesture, parseLearnGesture, pick, VoiceCommands, type Command } from './voice';
import { FOLLOW_UP_MS, stripWake } from './wake';
import { parseTimeRequest, type TimeRequest } from './when';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = el<HTMLVideoElement>('camera');
const hudCanvas = el<HTMLCanvasElement>('hud');
const notice = el<HTMLParagraphElement>('notice');
const styleButton = el<HTMLButtonElement>('toggle-style');
const speechButton = el<HTMLButtonElement>('toggle-speech');
const micButton = el<HTMLButtonElement>('toggle-mic');
const claudeButton = el<HTMLButtonElement>('toggle-claude');
const spotifyButton = el<HTMLButtonElement>('toggle-spotify');

/** Pontos da palma (pulso e bases dos dedos), cuja média dá o centro da mão. */
const PALM = [0, 5, 9, 13, 17];

const hud = new Hud(hudCanvas);
const panels = hud.panels;
const voice = new JarvisVoice();
const face = new FaceGuard();
const objects = new ObjectSpotter();
const terminal = new VoiceTerminal(el('terminal'));
const micLevel = new MicLevel();
voice.onSay = (text) => terminal.log('jarvis', `JARVIS: ${text}`);

// ---------- Humor (expressão do rosto) ----------
const mood = new MoodTracker();
face.onExpression = (scores) => mood.add(scores);
/** Janela para "como o senhor está agora". */
const MOOD_WINDOW_MS = 15_000;
/** Quando o senhor começou a falar a frase atual (primeiro texto parcial do microfone). */
let speechStartedAt = -Infinity;
/** Humor enquanto o senhor falava a última frase. */
let moodAtSpeech: Mood | null = null;

/** Começou a falar: lê o rosto com mais frequência para pegar a expressão durante a frase. */
function noteSpeaking(now: number) {
  if (now - interimAt > 2500) speechStartedAt = now;
  face.watchClosely(6000);
}

/** Humor durante a frase que acabou de ser dita (ou dos últimos segundos, se não deu para medir). */
function captureMood(now: number) {
  moodAtSpeech = mood.between(Math.min(speechStartedAt, now - 4000) - 1000, now) ?? mood.recent(MOOD_WINDOW_MS, now);
  if (moodAtSpeech) terminal.log('info', `↳ expressão: ${MOOD_LABEL[moodAtSpeech.expression].toLowerCase()} (${Math.round(moodAtSpeech.confidence * 100)}%)`);
}
const L = () => LINES[voice.style];

let view = { w: window.innerWidth, h: window.innerHeight };

function resize() {
  view = { w: window.innerWidth, h: window.innerHeight };
  hud.resize(view.w, view.h, canvasScale(window.devicePixelRatio));
}
window.addEventListener('resize', resize);
resize();

const palmOf = (points: Pt[]): Pt => {
  const sum = PALM.reduce((acc, i) => ({ x: acc.x + points[i].x, y: acc.y + points[i].y }), { x: 0, y: 0 });
  return { x: sum.x / PALM.length, y: sum.y / PALM.length };
};

const videoSize = () => ({ w: video.videoWidth || 1280, h: video.videoHeight || 720 });

// ---------- Estado ----------
interface Hand {
  key: string;
  gesture: Gesture;
  /** Gesto do frame anterior, para saber quando um gesto começa. */
  before: Gesture;
  points: Pt[];
  pinch: Pt;
  palm: Pt;
  /** Ponta do indicador (cursor ao apontar). */
  tip: Pt;
  justPinched: boolean;
  /** Mão que o detector perdeu há pouco; está congelada na última posição. */
  stale: boolean;
  /** Pontos em metros (para o modo de depuração). */
  world: Pt[];
  /** Pontos normalizados (0..1) na imagem da câmera, sem espelhar. */
  raw: Pt[];
}

/** Painel sendo arrastado por uma mão (pinça) ou pelo mouse. */
interface Grab {
  id: PanelId;
  hand: string;
  dx: number;
  dy: number;
}

const MOUSE = 'mouse';
let boot = 'INICIALIZANDO A CÂMERA';
let grab: Grab | null = null;
let handTracker: HandTracker | null = null;
let cameraOn = false;
let heard = '';
let heardAt = -Infinity;
let interim = '';
let interimAt = -Infinity;
const stabilizer = new HandStabilizer();
let stableHands: StableHand[] = [];
/** Modo de depuração (tecla D): mostra os números de cada gesto perto da mão. */
let debug = false;
const trackers = new Map<string, GestureTracker>();
const previousGesture = new Map<string, Gesture>();
let lastHandsSeenAt = -Infinity;
let handsAnnouncedAt = -Infinity;
/** Áreas clicáveis do último frame (botões dos painéis). */
let targets: HitTarget[] = [];
/** Painel em destaque (mostra mais detalhes); troca deslizando a mão. */
let focus: PanelId | null = null;

let noticeTimer = 0;
function showNotice(text: string, kind: 'error' | 'info' = 'error', ms = 10000) {
  notice.textContent = text;
  notice.className = kind;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  if (ms > 0) noticeTimer = window.setTimeout(() => (notice.hidden = true), ms);
}

/** Fala quando o JARVIS terminar a frase atual (até 6 s de espera). */
function sayWhenFree(text: string, waited = 0) {
  if (voice.busy && waited < 6000) setTimeout(() => sayWhenFree(text, waited + 300), 300);
  else void voice.say(text);
}

// ---------- Mãos ----------
function readHands(now: number): Hand[] {
  if (!handTracker) return [];
  // Só atualiza quando chega um frame novo da câmera; entre frames, reaproveita as mãos estáveis
  const detected = handTracker.detect(video, now, handInterval(activity(now)));
  if (detected) stableHands = stabilizer.update(detected, now);

  const hands = stableHands.map((h): Hand => {
    let tracker = trackers.get(h.id);
    if (!tracker) trackers.set(h.id, (tracker = new GestureTracker()));
    // Mão congelada (perdida há pouco) mantém o último gesto: não solta o que estava segurando
    const gesture = h.stale || !detected ? tracker.current : tracker.update(h.world, now);
    const before = previousGesture.get(h.id) ?? 'none';
    previousGesture.set(h.id, gesture);
    const points = h.landmarks.map((p) => toScreen(p, videoSize(), view));
    return {
      key: h.id,
      gesture,
      before,
      points,
      pinch: mid(points[4], points[8]),
      palm: palmOf(points),
      tip: points[8],
      justPinched: gesture === 'pinch' && before !== 'pinch',
      stale: h.stale,
      world: h.world,
      raw: h.landmarks,
    };
  });

  // Esquece mãos que saíram de cena
  for (const key of trackers.keys()) {
    if (!hands.some((h) => h.key === key)) {
      trackers.delete(key);
      previousGesture.delete(key);
    }
  }
  return hands;
}

// ---------- Botões dos painéis (clique, pinça ou apontar e esperar) ----------
const targetAt = (p: Pt) => targets.find((t) => inRect(p, t.rect)) ?? null;

function pressTarget(id: string) {
  const [kind, value] = id.split(/:(.*)/s);
  if (kind === 'music') pressMusicButton(value as MusicButton);
  else if (kind === 'reminder') void cancelReminder(value);
  else if (kind === 'panel') setFocus(focus === value ? null : (value as PanelId));
}

function setFocus(id: PanelId | null) {
  focus = id;
  terminal.log('info', id ? `Painel em destaque: ${id}` : 'Nenhum painel em destaque.');
}

// ---------- Gestos ----------
/** Apontar parado sobre um botão por este tempo aciona o botão. */
const DWELL_MS = 800;
let dwell: { id: string; since: number; fired: boolean } | null = null;
let cursor: { x: number; y: number; progress: number } | null = null;

function updatePointer(hands: Hand[], now: number) {
  const hand = hands.find((h) => h.gesture === 'point' && !h.stale);
  if (!hand) {
    cursor = null;
    dwell = null;
    return;
  }
  const target = targetAt(hand.tip);
  if (!target) dwell = null;
  else if (dwell?.id !== target.id) dwell = { id: target.id, since: now, fired: false };
  const progress = dwell && !dwell.fired ? Math.min(1, (now - dwell.since) / DWELL_MS) : 0;
  if (dwell && !dwell.fired && progress >= 1) {
    dwell.fired = true;
    pressTarget(dwell.id);
  }
  cursor = { x: hand.tip.x, y: hand.tip.y, progress };
}

/** Joinha = "sim", polegar para baixo = "não", quando o JARVIS fez uma pergunta. */
function updateThumbs(hands: Hand[]) {
  const hand = hands.find((h) => (h.gesture === 'thumbsUp' || h.gesture === 'thumbsDown') && h.before !== h.gesture);
  if (!hand) return;
  if (!pendingProject && !pendingRoutine) {
    // Sem pergunta pendente, joinha tira do modo silencioso (depois do "shh")
    if (hand.gesture === 'thumbsUp' && silent) setSilent(false);
    return;
  }
  terminal.log('heard', `GESTO: ${hand.gesture === 'thumbsUp' ? 'joinha (sim)' : 'polegar para baixo (não)'}`);
  handleConfirmation(hand.gesture === 'thumbsUp' ? 'sim' : 'não');
}

function cycleFocus(step: 1 | -1) {
  const data = panelsData(Date.now());
  const visible = PANEL_ORDER.filter((id) => panels.visible(id, data));
  if (!visible.length) return;
  const i = focus ? visible.indexOf(focus) : -1;
  setFocus(visible[(i + step + visible.length) % visible.length]);
}

/** Pinça: arrasta painéis e aperta botões. */
function interact(hands: Hand[]) {
  if (mouseMode || control.zooming || control.menu || standby) {
    if (grab && grab.hand !== MOUSE) {
      grab = null;
      panels.save();
    }
    return;
  }
  const pinching = hands.filter((h) => h.gesture === 'pinch');
  if (grab && grab.hand !== MOUSE) {
    const current = grab;
    const hand = pinching.find((h) => h.key === current.hand);
    if (!hand) {
      grab = null;
      panels.save();
    } else panels.move(current.id, hand.pinch.x - current.dx, hand.pinch.y - current.dy);
  }
  if (!grab) {
    const hand = pinching.find((h) => h.justPinched);
    if (hand) grab = tryGrab(hand.key, hand.pinch);
  }
}

function tryGrab(hand: string, p: Pt): Grab | null {
  const target = targetAt(p);
  if (target && !target.id.startsWith('panel:')) {
    pressTarget(target.id);
    return null;
  }
  const id = panels.panelAt(p, panelsData(Date.now()));
  if (!id) return null;
  const r = panels.rects[id];
  return { id, hand, dx: p.x - r.x, dy: p.y - r.y };
}

// ---------- Mouse e teclado ----------
let mouseDown: Pt | null = null;
hudCanvas.addEventListener('pointerdown', (e) => {
  const p = { x: e.clientX, y: e.clientY };
  mouseDown = p;
  grab = tryGrab(MOUSE, p);
  if (grab) hudCanvas.setPointerCapture(e.pointerId);
});
hudCanvas.addEventListener('pointermove', (e) => {
  if (grab?.hand === MOUSE) panels.move(grab.id, e.clientX - grab.dx, e.clientY - grab.dy);
});
hudCanvas.addEventListener('pointerup', (e) => {
  const p = { x: e.clientX, y: e.clientY };
  // Clique sem arrastar no cabeçalho de um painel: põe em destaque
  if (grab?.hand === MOUSE && mouseDown && dist(p, mouseDown) < 4) {
    const header = targetAt(p);
    if (header?.id.startsWith('panel:')) pressTarget(header.id);
  }
  if (grab?.hand === MOUSE) {
    grab = null;
    panels.save();
  }
  mouseDown = null;
});
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target instanceof HTMLInputElement) return;
  const key = e.key.toLowerCase();
  if (key === 'l') toggleStyle();
  else if (key === 's') toggleSpeech();
  else if (key === 'v') void toggleMic();
  else if (key === 't') terminal.setVisible(!terminal.visible);
  else if (key === 'c') setClaude(!claudeOn);
  else if (key === 'o') runCommand('look');
  else if (key === 'm') setMouseMode(!mouseMode);
  else if (key === 'escape' && mouseMode) setMouseMode(false);
  else if (key === 'g') helpUntil = helpUntil > performance.now() ? 0 : performance.now() + 60_000;
  else if (key === 'r') {
    panels.resetLayout();
    setUiScale(1);
    terminal.log('info', 'Painéis de volta às posições iniciais e interface em 100%.');
  } else if (key === 'd') {
    debug = !debug;
    terminal.log('info', `Modo de depuração das mãos: ${debug ? 'LIGADO' : 'desligado'}.`);
  }
});

// ---------- Comandos locais ----------
function runCommand(cmd: Command, text = '') {
  if (AUTO_COMMANDS.has(cmd)) logUsage('command', cmd);
  switch (cmd) {
    case 'status':
      void handleStatus();
      break;
    case 'projects':
      void refreshProjects().then(() => voice.say(projects ? projectsSpeech(projects, voice.style) : L().statusError));
      break;
    case 'time':
      void voice.say(timeSpeech(new Date(), voice.style));
      break;
    case 'date':
      void voice.say(dateSpeech(new Date(), voice.style));
      break;
    case 'weather':
      void handleWeather();
      break;
    case 'reminders':
      if (privacy) void voice.say(L().privateNow);
      else void refreshReminders().then(() => voice.say(reminders ? remindersSpeech(reminders, Date.now(), voice.style) : L().remindersError));
      break;
    case 'cancelTimer':
      void cancelNext(/lembrete/.test(normalizeText(text)) ? 'reminder' : 'timer');
      break;
    case 'look':
      void handleLook();
      break;
    case 'takeScreens':
      void takeScreens();
      break;
    case 'mouseOn':
    case 'mouseOff':
      setMouseMode(cmd === 'mouseOn');
      break;
    case 'speakAgain':
      setSilent(false);
      break;
    case 'daySummary':
      void handleDaySummary();
      break;
    case 'uiBigger':
    case 'uiSmaller':
      setUiScale(uiScale * (cmd === 'uiBigger' ? 1.15 : 1 / 1.15));
      break;
    case 'gestures':
      helpUntil = performance.now() + 20_000;
      void voice.say(L().gesturesList(learned.map((g) => g.phrase)));
      break;
    case 'standby':
      enterStandby();
      break;
    case 'releaseScreens':
      void releaseScreens();
      break;
    case 'mood': {
      const m = moodAtSpeech ?? mood.recent(MOOD_WINDOW_MS);
      void voice.say(m && face.absentFor() < 5000 ? L().moodRead(moodSpeech(m, voice.style)) : L().moodUnseen);
      break;
    }
    case 'who':
      void voice.say(L().who);
      break;
    case 'study':
      void voice.say(pick(L().study));
      break;
    case 'hello':
      void voice.say(L().hello(greeting(new Date(), voice.style)));
      break;
    case 'mute':
      void voice.say(L().mute);
      setTimeout(() => setSpeech(false), 1800);
      break;
    case 'voiceUk':
    case 'voiceBr':
      voice.setStyle(cmd === 'voiceUk' ? 'uk' : 'br');
      void voice.say(L().styleChanged);
      break;
    case 'claudeOn':
    case 'claudeOff':
      setClaude(cmd === 'claudeOn');
      break;
    case 'enrollFace':
      void enrollFace();
      break;
    case 'forgetFace':
      void forgetFace();
      break;
  }
}

// ---------- Dados reais: sistema, projetos, clima, lembretes ----------
let system: SystemInfo | null = null;
let projects: ProjectStatus[] | null = null;
let weather: WeatherInfo | null = null;
let reminders: Reminder[] | null = null;
let finance: { summary: FinanceSummary; until: number } | null = null;
let news: NewsItem[] | null = null;

const getJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, init);
  const data = (await r.json()) as T & { message?: string };
  if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
  return data;
};

const refreshSystem = () =>
  getJson<SystemInfo>('/api/system')
    .then((s) => (system = s))
    .catch(() => null);
const refreshProjects = () =>
  getJson<{ projects: ProjectStatus[] }>('/api/actions/status')
    .then((d) => (projects = d.projects))
    .catch(() => null);
const refreshWeather = () =>
  getJson<WeatherInfo>('/api/weather')
    .then((w) => (weather = w))
    .catch(() => null);
const refreshNews = () =>
  getJson<{ items: NewsItem[] }>('/api/news')
    .then((d) => (news = d.items))
    .catch(() => null);
const refreshReminders = () =>
  getJson<{ reminders: Reminder[] }>('/api/reminders')
    .then((d) => (reminders = d.reminders))
    .catch(() => null);

const poll = (fn: () => Promise<unknown>, everyMs: number) =>
  pollAdaptive(fn, everyMs, () => pollSlowdown({ standby, away: presence.away, hidden: document.hidden }));
poll(refreshSystem, 3000);
poll(refreshProjects, 10_000);
poll(refreshWeather, 10 * 60_000);
poll(refreshNews, 10 * 60_000);
poll(refreshReminders, 30_000);

async function handleStatus() {
  await Promise.all([refreshSystem(), refreshProjects()]);
  void voice.say(system ? systemSpeech(system, projects ?? [], voice.style) : L().statusError);
}

async function handleWeather() {
  await refreshWeather();
  void voice.say(weather ? weatherSpeech(weather, voice.style) : L().weatherError);
}

const postReminders = (body: unknown) =>
  getJson<{ reminders: Reminder[] }>('/api/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((d) => (reminders = d.reminders));

async function handleTimeRequest(req: TimeRequest) {
  try {
    if (req.kind === 'timer') {
      await postReminders({ op: 'add', kind: 'timer', text: 'Timer', dueAt: Date.now() + req.ms });
      terminal.log('cmd', `↳ timer de ${durationSpeech(req.ms)}`);
      void voice.say(L().timerSet(durationSpeech(req.ms, voice.style)));
    } else {
      await postReminders({ op: 'add', kind: 'reminder', text: req.text, dueAt: req.dueAt });
      terminal.log('cmd', `↳ lembrete: ${req.text} (${new Date(req.dueAt).toLocaleString('pt-BR')})`);
      void voice.say(L().reminderSet(req.text.toLowerCase(), whenSpeech(req.dueAt, Date.now(), voice.style)));
    }
  } catch (e) {
    terminal.log('error', `Lembretes: ${e instanceof Error ? e.message : e}`);
    void voice.say(L().remindersError);
  }
}

async function cancelReminder(id: string) {
  const r = reminders?.find((x) => x.id === id);
  try {
    await postReminders({ op: 'cancel', id });
    terminal.log('warn', `↳ cancelado: ${r?.text ?? id}`);
    if (r) void voice.say(r.kind === 'timer' ? L().timerCancelled : L().reminderCancelled(r.text));
  } catch {
    void voice.say(L().remindersError);
  }
}

/** "Cancela o timer": o próximo timer a vencer (ou o próximo lembrete, se pediu lembrete). */
async function cancelNext(kind: Reminder['kind']) {
  await refreshReminders();
  const pending = (reminders ?? []).filter((r) => !r.done).sort((a, b) => a.dueAt - b.dueAt);
  const next = pending.find((r) => r.kind === kind) ?? pending[0];
  if (!next) void voice.say(L().nothingToCancel);
  else await cancelReminder(next.id);
}

/** Bipe curto (WebAudio) quando um timer ou lembrete vence. */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* sem som */
  }
}

/** Lembretes que já foram anunciados (o servidor confirma o "concluído" logo depois). */
const announced = new Set<string>();

function checkDue() {
  const now = Date.now();
  for (const r of reminders ?? []) {
    if (r.done || r.dueAt > now || announced.has(r.id)) continue;
    announced.add(r.id);
    beep();
    terminal.log('cmd', `⏰ ${r.kind === 'timer' ? 'timer terminou' : `lembrete: ${r.text}`}`);
    // Fora da frente do PC: só bipa e conta, para avisar na volta
    if (presence.away) presence.missed++;
    else sayWhenFree(r.kind === 'timer' ? L().timerDone : privacy ? L().reminderPrivate : L().reminderDue(r.text));
    void postReminders({ op: 'done', id: r.id }).catch(() => {});
  }
}
setInterval(checkDue, 1000);

// ---------- Outras telas ("Jarvis, assume as telas") ----------
const link = openLink();
let linkSentAt = 0;

async function takeScreens() {
  void voice.say(L().screensTaking);
  try {
    // Centro desta janela, para o servidor deixar este monitor de fora
    const center = { x: window.screenX + window.outerWidth / 2, y: window.screenY + window.outerHeight / 2 };
    const data = await getJson<{ screens: number }>('/api/screens/take', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: location.origin, ...center }),
    });
    terminal.log('cmd', `↳ painel aberto em ${data.screens} tela(s)`);
    sayWhenFree(data.screens > 0 ? L().screensTaken(data.screens) : L().screensNone);
  } catch (e) {
    terminal.log('error', `Telas: ${e instanceof Error ? e.message : e}`);
    sayWhenFree(L().actionFailed);
  }
}

async function releaseScreens() {
  try {
    const data = await getJson<{ closed: number }>('/api/screens/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    terminal.log('cmd', `↳ ${data.closed} painel(is) fechado(s)`);
    void voice.say(L().screensReleased);
  } catch (e) {
    terminal.log('error', `Telas: ${e instanceof Error ? e.message : e}`);
    void voice.say(L().actionFailed);
  }
}

/** Manda para os painéis das outras telas o que só esta janela sabe (umas 15 vezes por segundo). */
function broadcast(now: number, state: Omit<LinkState, 'personal' | 'music'>) {
  if (!link || now - linkSentAt < 66) return;
  linkSentAt = now;
  const personal = face.verified && !privacy;
  const m = personal ? musicView(now) : null;
  const message: LinkMessage = {
    type: 'state',
    at: now,
    state: {
      ...state,
      personal,
      music: m && nowPlaying?.track ? { name: m.name, artist: m.artist, playing: m.playing, elapsedMs: m.elapsedMs, durationMs: m.durationMs, cover: nowPlaying.track.image } : null,
    },
  };
  link.postMessage(message);
}

// ---------- Objetos na câmera ----------
let looking = false;

async function handleLook(quiet = false) {
  if (!cameraOn) {
    void voice.say(L().lookUnavailable);
    return;
  }
  if (looking) return;
  looking = true;
  if (!quiet) void voice.say(pick(L().lookStart));
  terminal.log('cmd', '↳ olhando pela câmera…');
  try {
    // Centro da mão mais recente, em coordenadas do vídeo (o objeto costuma estar nela)
    const handAt = () => {
      const h = stableHands.find((x) => !x.stale);
      if (!h) return null;
      const p = PALM.reduce((acc, i) => ({ x: acc.x + h.landmarks[i].x / PALM.length, y: acc.y + h.landmarks[i].y / PALM.length }), { x: 0, y: 0 });
      return p;
    };
    const { objects: seen, shown } = await objects.look(video, handAt);
    terminal.log('info', `Objetos: ${seen.map((o) => `${o.label} ${(o.score * 100).toFixed(0)}%`).join(', ') || '(nenhum)'}`);
    if (!shown) sayWhenFree(L().lookNothing);
    else if (shown.label === 'person' && seen.length === 1) sayWhenFree(L().lookMany(shown.name));
    else sayWhenFree(L().lookFound(shown.name));
  } catch (e) {
    terminal.log('error', `Objetos: ${e instanceof Error ? e.message : e}`);
    sayWhenFree(L().lookUnavailable);
  } finally {
    looking = false;
  }
}

/** Caixas do último "o que é isso?", por 6 segundos. */
function objectsOnScreen(now: number) {
  const last = objects.last;
  if (!last || now - last.at > 6000) return [];
  return last.objects.slice(0, 4).map((o) => {
    const p1 = toScreen({ x: o.box.x, y: o.box.y }, videoSize(), view);
    const p2 = toScreen({ x: o.box.x + o.box.w, y: o.box.y + o.box.h }, videoSize(), view);
    return {
      rect: { x: Math.min(p1.x, p2.x), y: p1.y, w: Math.abs(p2.x - p1.x), h: p2.y - p1.y },
      name: o.name,
      shown: o === last.shown,
    };
  });
}

// ---------- Rosto e presença ----------
let welcomed = false;

/** Recursos sensíveis (Claude, apps, projetos, Spotify, finanças) só com o rosto do dono verificado. */
function requireFace(feature: string): boolean {
  if (face.verified) return true;
  terminal.log('warn', `↳ ${feature} bloqueado: identidade ${FACE_STATE_LABEL[face.state].toLowerCase()}`);
  void voice.say(face.state === 'unenrolled' ? L().lockedNotEnrolled : L().locked);
  return false;
}

async function enrollFace() {
  if (face.state === 'unavailable' || face.state === 'loading') {
    terminal.log('warn', 'Reconhecimento facial indisponível (precisa da câmera e de internet para baixar os modelos).');
    return;
  }
  terminal.log('info', 'Cadastrando rosto: olhe para a câmera e vire o rosto devagar.');
  void voice.say(L().enrollStart);
  try {
    await face.enroll();
    terminal.log('cmd', 'Rosto cadastrado. Fica salvo só neste computador (.face-profile.json).');
    sayWhenFree(L().enrollDone);
  } catch (e) {
    const denied = (e as { denied?: boolean }).denied;
    terminal.log('error', `Cadastro do rosto falhou: ${e instanceof Error ? e.message : e}`);
    sayWhenFree(denied ? L().enrollDenied : L().enrollFail);
  }
}

async function forgetFace() {
  if (!requireFace('Apagar rosto')) return;
  if (await face.forget()) {
    terminal.log('warn', 'Perfil facial apagado.');
    void voice.say(L().faceForgotten);
  }
}

/** Sem ninguém na frente da câmera por este tempo: o senhor saiu. */
const AWAY_MS = 60_000;
/** Dois rostos por este tempo: tem visita. Um só por VISITOR_CLEAR_MS: a visita foi embora. */
const VISITOR_MS = 2000;
const VISITOR_CLEAR_MS = 6000;
const VISITOR_ANNOUNCE_EVERY_MS = 5 * 60_000;

const presence = { away: false, pausedMusic: false, missed: 0, visitorSince: 0, aloneSince: 0, visitorAnnouncedAt: -Infinity };
/** Outra pessoa na frente da câmera: os painéis pessoais somem e o Claude é avisado. */
let privacy = false;

function updatePresence(now: number) {
  if (!cameraOn || face.state === 'loading' || face.state === 'unavailable' || face.state === 'enrolling') return;
  const absent = face.absentFor(now);

  if (!presence.away && absent > AWAY_MS) {
    presence.away = true;
    presence.missed = 0;
    terminal.log('warn', 'Presença: o senhor saiu da frente do PC.');
    if (nowPlaying?.playing && spotifyStatus.connected && face.token) {
      presence.pausedMusic = true;
      void handleMusic({ action: 'pause' }, true);
    }
  } else if (presence.away && absent < 4000 && face.verified) {
    presence.away = false;
    terminal.log('info', 'Presença: o senhor voltou.');
    sayWhenFree(presence.missed > 0 ? L().welcomeBackMissed(presence.missed) : L().welcomeBack);
    if (presence.pausedMusic) void handleMusic({ action: 'resume' }, true);
    presence.pausedMusic = false;
  }
  // Quem chegou não é o dono: continua "ausente" para a música e os lembretes, sem cumprimentar

  const many = face.faceCount >= 2 && absent < 4000;
  if (many) {
    presence.visitorSince ||= now;
    presence.aloneSince = 0;
  } else {
    presence.aloneSince ||= now;
    presence.visitorSince = 0;
  }
  if (!privacy && many && now - presence.visitorSince > VISITOR_MS) {
    privacy = true;
    terminal.log('warn', 'Privacidade: outra pessoa na câmera. Dados pessoais ocultos.');
    if (now - presence.visitorAnnouncedAt > VISITOR_ANNOUNCE_EVERY_MS) {
      presence.visitorAnnouncedAt = now;
      sayWhenFree(L().visitor);
    }
  } else if (privacy && !many && now - presence.aloneSince > VISITOR_CLEAR_MS) {
    privacy = false;
    terminal.log('info', 'Privacidade: só o senhor na câmera de novo.');
  }
}

face.onChange = (state, previous) => {
  terminal.log(state === 'unknown' ? 'warn' : 'info', `Identidade: ${FACE_STATE_LABEL[state]}`);
  if (!welcomed) return;
  // Voltando de uma ausência, quem cumprimenta é a presença (com o resumo do que aconteceu)
  if (state === 'verified' && previous !== 'enrolling' && !presence.away) welcomeOrBriefing();
  else if (state === 'unknown') sayWhenFree(L().faceUnknown);
  else if (state === 'identifying' && previous === 'verified') {
    terminal.log('warn', 'Identidade expirada: recursos sensíveis bloqueados até eu ver o senhor de novo.');
  }
};

// ---------- Claude (via Claude Code do próprio usuário) ----------
const CLAUDE_KEY = 'jarvis.claude';
// Ligado por padrão; só fica desligado se o senhor desligou de propósito
let claudeOn = true;
let claudeAvailable = true;
let claudeThinking = false;
try {
  claudeOn = localStorage.getItem(CLAUDE_KEY) !== 'off';
} catch {
  /* sem armazenamento: fica ligado */
}

fetch('/api/claude/status')
  .then((r) => r.json() as Promise<{ available?: boolean }>)
  .then((s) => {
    claudeAvailable = Boolean(s.available);
    if (!claudeAvailable) claudeOn = false;
    updateButtons();
  })
  .catch(() => {});

function setClaude(on: boolean, announce = true) {
  if (on && !claudeAvailable) {
    void voice.say(L().claudeUnavailable);
    return;
  }
  claudeOn = on;
  try {
    localStorage.setItem(CLAUDE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignora */
  }
  terminal.log(on ? 'cmd' : 'warn', on ? 'Claude CONECTADO (usa a cota do seu plano).' : 'Claude BLOQUEADO.');
  updateButtons();
  if (announce) void voice.say(on ? L().claudeOn : L().claudeOff);
}

/** O que só o navegador sabe, para o Claude responder com o contexto real. */
function clientContext() {
  const track = nowPlaying?.playing && nowPlaying.track ? `${nowPlaying.track.name} — ${nowPlaying.track.artist}` : undefined;
  const last = objects.last;
  const object = last?.shown && performance.now() - last.at < 5 * 60_000 ? `${last.shown.name} (${Math.round((performance.now() - last.at) / 1000)} s atrás)` : undefined;
  // A expressão é do rosto maior na câmera: com visita, pode ser de outra pessoa
  const m = privacy ? null : moodAtSpeech;
  const expression = m ? `${moodSpeech(m)} (${Math.round(m.confidence * 100)}% de confiança)` : undefined;
  return { music: privacy ? undefined : track, object, visitor: privacy, mood: expression };
}

async function askClaude(text: string) {
  if (!requireFace('Claude')) return;
  if (claudeThinking) {
    void voice.say(L().claudeBusy);
    return;
  }
  claudeThinking = true;
  updateButtons();
  terminal.log('thinking', '↳ perguntando ao Claude…');
  void voice.say(pick(L().claudeThinking));
  try {
    const r = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...face.headers() },
      body: JSON.stringify({ text, context: clientContext() }),
    });
    const data = (await r.json()) as { reply?: string; actions?: ClaudeAction[]; message?: string; code?: string };
    if (data.code === 'face') {
      terminal.log('warn', '↳ Claude recusou: rosto não verificado');
      void voice.say(L().locked);
      return;
    }
    if (!r.ok || !data.reply) throw new Error(data.message ?? `HTTP ${r.status}`);
    // O Claude pode ter sido bloqueado enquanto pensava: nesse caso a resposta é descartada
    if (!claudeOn) return;
    // Algumas ações falam depois da resposta do Claude (confirmação de projeto, resumo financeiro, objeto)
    const followUps = (data.actions ?? []).map(runClaudeAction).filter((f): f is () => void => f !== null);
    void voice.say(data.reply);
    followUps.forEach((f) => f());
  } catch (e) {
    terminal.log('error', `Claude: ${e instanceof Error ? e.message : e}`);
    void voice.say(L().claudeError);
  } finally {
    claudeThinking = false;
    updateButtons();
  }
}

interface ClaudeAction {
  name: string;
  arg?: string;
}

const findItem = (items: CatalogItem[], arg = '') => {
  const key = normalizeText(arg);
  return items.find((i) => i.id === key || i.aliases.some((a) => normalizeText(a) === key)) ?? null;
};

/**
 * Executa a ação pedida pelo Claude sem a fala padrão do comando (quem fala é a resposta dele).
 * Devolve o que precisa ser dito depois da resposta, se houver.
 */
function runClaudeAction({ name, arg }: ClaudeAction): (() => void) | null {
  terminal.log('cmd', `↳ Claude pediu: ${name}${arg ? ` (${arg})` : ''}`);
  switch (name) {
    case 'play':
      void handleMusic({ action: 'play', query: arg ?? '' }, true);
      return null;
    case 'pause':
    case 'resume':
    case 'next':
    case 'previous':
      void handleMusic({ action: name }, true);
      return null;
    case 'monitor':
    case 'maximize':
    case 'minimize': {
      const app = findItem(catalog.apps, arg);
      if (app) void callAction('window', app, name === 'monitor' ? 'right' : name);
      else terminal.log('warn', `↳ app fora da lista: ${arg}`);
      return null;
    }
    case 'open':
    case 'focus': {
      const app = findItem(catalog.apps, arg);
      if (app) void callAction(name, app);
      else terminal.log('warn', `↳ app fora da lista: ${arg}`);
      return null;
    }
    case 'run': {
      const project = findItem(catalog.projects, arg);
      if (!project) {
        terminal.log('warn', `↳ projeto fora da lista: ${arg}`);
        return null;
      }
      // Mesmo pedido pelo Claude, rodar projeto sempre espera o "sim" do senhor
      pendingProject = { item: project, expires: performance.now() + CONFIRM_MS };
      return () => sayWhenFree(L().confirmRun(project.name));
    }
    case 'finance':
      return () => void handleFinance();
    // O servidor já criou o timer/lembrete e guardou a memória: aqui só atualiza o painel
    case 'timer':
    case 'reminder':
      void refreshReminders();
      return null;
    case 'remember':
    case 'forget':
      return null;
    case 'look':
      return () => void handleLook(true);
    default:
      return null;
  }
}

// ---------- Finanças (janus, só leitura) ----------
const FINANCE_CARD_MS = 30_000;

async function handleFinance() {
  if (!requireFace('Finanças')) return;
  if (privacy) {
    void voice.say(L().privateNow);
    return;
  }
  terminal.log('cmd', '↳ consultando o janus…');
  try {
    const r = await fetch('/api/janus/summary', { headers: face.headers() });
    const data = (await r.json()) as FinanceSummary & { code?: string; message?: string };
    if (data.code === 'face') {
      void voice.say(L().locked);
      return;
    }
    if (data.code === 'offline') {
      terminal.log('warn', `janus desligado: ${data.message}`);
      const project = catalog.projects.find((p) => p.id === 'janus');
      if (project) pendingProject = { item: project, expires: performance.now() + CONFIRM_MS };
      sayWhenFree(project ? L().janusOffline : L().janusError);
      return;
    }
    if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
    terminal.log('cmd', `↳ ${data.month}: entrou ${data.ganho.toFixed(2)}, saiu ${(data.fixo + data.variavel).toFixed(2)}, sobra ${data.restante.toFixed(2)}`);
    finance = { summary: data, until: performance.now() + FINANCE_CARD_MS };
    sayWhenFree(financeSpeech(data, voice.style));
  } catch (e) {
    terminal.log('error', `janus: ${e instanceof Error ? e.message : e}`);
    void voice.say(L().janusError);
  }
}

/** O que o JARVIS está lendo agora: a lista e onde parou ("mais uma" continua dali). */
let newsReading: { items: NewsItem[]; next: number } | null = null;

async function handleNews(intent: NewsIntent) {
  try {
    if (intent.action === 'read') {
      const items = intent.topic
        ? (await getJson<{ items: NewsItem[] }>(`/api/news?topic=${encodeURIComponent(intent.topic)}`)).items
        : news ?? (await refreshNews()) ?? [];
      newsReading = { items, next: 0 };
    }
    const spoken = newsReading ? headlinesSpeech(newsReading.items, newsReading.next) : null;
    if (!spoken || !newsReading) {
      void voice.say(L().newsNone);
      return;
    }
    newsReading.next = spoken.next;
    terminal.log('cmd', `↳ notícias: ${newsReading.items.slice(spoken.next - 3 < 0 ? 0 : spoken.next - 3, spoken.next).map((i) => i.title).join(' | ')}`);
    sayWhenFree(spoken.text);
  } catch (e) {
    terminal.log('error', `notícias: ${e instanceof Error ? e.message : e}`);
    void voice.say(L().newsError);
  }
}

/** Frases longas vão para o Claude mesmo que tenham uma palavra-chave ("volta", "abre"...). */
const LOCAL_COMMAND_MAX_WORDS = 4;
/** "Quais são meus lembretes para amanhã?" ainda é pedido local. */
const INFO_MAX_WORDS = 7;

// ---------- Ações no PC (lista fixa do jarvis.config.json) ----------
let catalog: Catalog = { apps: [], projects: [] };
fetch('/api/actions/list')
  .then((r) => r.json() as Promise<Catalog>)
  .then((c) => {
    catalog = c;
    const extra = c as Catalog & { handMenu?: Shortcut[]; poses?: Partial<Record<ShortcutPose, Shortcut>> };
    shortcuts = { handMenu: extra.handMenu ?? [], poses: extra.poses ?? {} };
  })
  .catch(() => terminal.log('warn', 'Não consegui carregar a lista de apps e projetos.'));

/** Projeto esperando o "sim" do senhor (a pergunta expira). */
let pendingProject: { item: CatalogItem; expires: number } | null = null;
const CONFIRM_MS = 10_000;

async function callAction(kind: 'open' | 'focus' | 'project' | 'window', item: CatalogItem, op?: WindowOp): Promise<boolean> {
  try {
    const r = await fetch('/api/actions/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...face.headers() },
      body: JSON.stringify({ kind, id: item.id, op }),
    });
    const data = (await r.json()) as { message?: string; code?: string };
    if (data.code === 'face') {
      terminal.log('warn', '↳ recusado: rosto não verificado');
      void voice.say(L().locked);
      return false;
    }
    if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
    terminal.log('cmd', `↳ ${data.message}`);
    if (kind === 'open' || kind === 'focus') logUsage('app', item.id);
    return true;
  } catch (e) {
    terminal.log('error', `Ação falhou: ${e instanceof Error ? e.message : e}`);
    void voice.say(L().actionFailed);
    return false;
  }
}

function handleIntent(intent: Intent) {
  if (!requireFace('Ações no PC')) return;
  if (intent.kind === 'project') {
    pendingProject = { item: intent.project, expires: performance.now() + CONFIRM_MS };
    terminal.log('cmd', `↳ rodar ${intent.project.name}? Responda "sim" ou "não" (ou joinha / polegar para baixo).`);
    void voice.say(L().confirmRun(intent.project.name));
    return;
  }
  if (intent.kind === 'window') {
    const { app, op } = intent;
    terminal.log('cmd', `↳ janela do ${app.name}: ${op}`);
    void voice.say(L().windowOp(op, app.name));
    void callAction('window', app, op);
    return;
  }
  terminal.log('cmd', `↳ ${intent.kind === 'open' ? 'abrir' : 'trazer para a frente'}: ${intent.app.name}`);
  void voice.say(intent.kind === 'open' ? L().opening(intent.app.name) : L().focusing(intent.app.name));
  void callAction(intent.kind, intent.app);
}

/** Resposta à pergunta "Devo iniciar...?". Devolve true se a frase era a resposta. */
function handleConfirmation(text: string): boolean {
  if (answerRoutine(text)) return true;
  if (!pendingProject) return false;
  if (performance.now() > pendingProject.expires) {
    pendingProject = null;
    return false;
  }
  const answer = confirmation(text);
  if (!answer) return false;
  const { item } = pendingProject;
  pendingProject = null;
  if (answer === 'no') {
    terminal.log('warn', `↳ ${item.name}: cancelado`);
    void voice.say(L().cancelled);
    return true;
  }
  if (!requireFace('Rodar projeto')) return true;
  void callAction('project', item).then((ok) => {
    if (!ok) return;
    void voice.say(L().runningProject(item.name));
    setTimeout(() => void refreshProjects(), 8000);
  });
  return true;
}

// ---------- Rotinas aprendidas (observa e pergunta) ----------
/** Pergunta de rotina esperando o "sim" do senhor (expira). */
let pendingRoutine: { cand: Candidate; expires: number } | null = null;
/** Rotinas já perguntadas nesta sessão: não insiste. */
const askedRoutines = new Set<string>();
/** Enquanto uma rotina roda sozinha, o que ela faz não conta como hábito novo. */
let routineRunning = false;
const ROUTINE_ASK_MS = 20_000;
const ROUTINE_EVERY_MS = 60_000;

const usageHeaders = () => ({ 'Content-Type': 'application/json', ...face.headers() });

/** Anota o que o senhor faz (app, música, comando) para perceber hábitos. Só com o rosto do dono verificado. */
function logUsage(kind: UsageKind, key: string) {
  if (routineRunning || !face.verified || privacy) return;
  void fetch('/api/usage', { method: 'POST', headers: usageHeaders(), body: JSON.stringify({ kind, key }) }).catch(() => null);
}

const describeRoutine = (kind: UsageKind, key: string) => routineLabel(kind, key, catalog.apps.find((a) => a.id === key)?.name);

async function runRoutine(routine: Routine) {
  routineRunning = true;
  try {
    const label = describeRoutine(routine.kind, routine.key);
    terminal.log('cmd', `↳ rotina: ${label}`);
    sayWhenFree(L().routineRunning(label));
    if (routine.kind === 'app') {
      const app = catalog.apps.find((a) => a.id === routine.key);
      if (app) await callAction('focus', app);
    } else if (routine.kind === 'music') {
      await handleMusic({ action: 'play', query: routine.key }, true);
    } else if (AUTO_COMMANDS.has(routine.key)) {
      runCommand(routine.key as Command);
    }
  } finally {
    routineRunning = false;
    void fetch('/api/routines/ran', { method: 'POST', headers: usageHeaders(), body: JSON.stringify({ id: routine.id }) }).catch(() => null);
  }
}

async function routineTick() {
  if (!face.verified || privacy || presence.away || standby || routineRunning) return;
  const r = await fetch('/api/routines/tick', { headers: face.headers() });
  if (!r.ok) return;
  const { suggest, run } = (await r.json()) as { suggest: Candidate | null; run: Routine[] };
  for (const routine of run) await runRoutine(routine);
  const id = suggest ? routineId(suggest.kind, suggest.key) : '';
  if (suggest && !pendingRoutine && !askedRoutines.has(id) && !voice.busy && !claudeThinking && !pendingProject) {
    askedRoutines.add(id);
    pendingRoutine = { cand: suggest, expires: performance.now() + ROUTINE_ASK_MS };
    const label = describeRoutine(suggest.kind, suggest.key);
    terminal.log('cmd', `↳ rotina sugerida: ${label} às ${clock(suggest.minute)}. Responda "sim" ou "não" (ou joinha / polegar para baixo).`);
    void voice.say(L().routineAsk(label, clock(suggest.minute)));
  }
}

function answerRoutine(text: string): boolean {
  if (!pendingRoutine) return false;
  if (performance.now() > pendingRoutine.expires) {
    pendingRoutine = null;
    return false;
  }
  const answer = confirmation(text);
  if (!answer) return false;
  const { cand } = pendingRoutine;
  pendingRoutine = null;
  const body = JSON.stringify({ kind: cand.kind, key: cand.key, minute: cand.minute, answer });
  void fetch('/api/routines/answer', { method: 'POST', headers: usageHeaders(), body }).then(() => {
    // Aceitou agora: marca como feita hoje para não rodar de novo logo em seguida
    if (answer === 'yes') {
      void fetch('/api/routines/ran', { method: 'POST', headers: usageHeaders(), body: JSON.stringify({ id: routineId(cand.kind, cand.key) }) });
    }
  });
  void voice.say(answer === 'yes' ? L().routineYes : L().routineNo);
  return true;
}

async function handleRoutines(intent: RoutinesIntent) {
  if (!requireFace('Rotinas')) return;
  try {
    if (intent === 'forget') {
      await fetch('/api/routines/forget', { method: 'POST', headers: usageHeaders(), body: '{}' });
      askedRoutines.clear();
      void voice.say(L().routinesForgotten);
      return;
    }
    const r = await fetch('/api/routines', { headers: face.headers() });
    const data = (await r.json()) as { routines: Routine[]; candidates: Candidate[] };
    const accepted = data.routines.filter((x) => x.state === 'accepted');
    const known = new Set(data.routines.map((x) => x.id));
    const watching = data.candidates.filter((c) => !known.has(routineId(c.kind, c.key))).length;
    if (accepted.length === 0 && watching === 0) {
      void voice.say(L().routinesNone);
      return;
    }
    sayWhenFree(L().routinesList(accepted.map((x) => `${describeRoutine(x.kind, x.key)} às ${clock(x.minute)}`), watching));
  } catch {
    void voice.say(L().actionFailed);
  }
}

// ---------- Alertas proativos (bateria, CPU, projeto que caiu, chuva) ----------
const alertEngine = new AlertEngine(() => voice.style);
const ALERTS_EVERY_MS = 5000;

function checkAlerts() {
  // Em espera ou com o senhor ausente, não fala sozinho
  if (standby || presence.away) return;
  for (const alert of alertEngine.check({ system, projects, weather, now: Date.now() })) {
    terminal.log('warn', `↳ alerta: ${alert.text}`);
    sayWhenFree(alert.text);
  }
}
setInterval(checkAlerts, ALERTS_EVERY_MS);

pollAdaptive(
  () => routineTick().catch(() => null),
  ROUTINE_EVERY_MS,
  () => pollSlowdown({ standby, away: presence.away, hidden: document.hidden }),
);

// ---------- Spotify ----------
let spotifyStatus = { configured: false, connected: false, redirectUri: '' };

function refreshSpotify() {
  return fetch('/api/spotify/status')
    .then((r) => r.json() as Promise<typeof spotifyStatus>)
    .then((s) => {
      spotifyStatus = s;
      updateButtons();
    })
    .catch(() => {});
}
void refreshSpotify();

function spotifySetupHelp() {
  terminal.setVisible(true);
  terminal.log('warn', 'Spotify: 1) crie um app em developer.spotify.com/dashboard (Web API).');
  terminal.log('warn', `Spotify: 2) Redirect URI: ${spotifyStatus.redirectUri || 'http://127.0.0.1:5173/api/spotify/callback'}`);
  terminal.log('warn', 'Spotify: 3) cole o Client ID em SPOTIFY_CLIENT_ID no .env e reinicie o JARVIS.');
}

let spotifyPoll = 0;

function connectSpotify() {
  if (!spotifyStatus.configured) {
    spotifySetupHelp();
    return;
  }
  window.open('/api/spotify/login', '_blank');
  terminal.log('info', 'Spotify: faça o login na aba que abriu.');
  // Confere de tempos em tempos até o login terminar (por até 2 minutos); um clique novo reinicia a espera
  clearInterval(spotifyPoll);
  let tries = 0;
  spotifyPoll = window.setInterval(() => {
    void refreshSpotify().then(() => {
      if (spotifyStatus.connected || ++tries > 40) {
        clearInterval(spotifyPoll);
        if (spotifyStatus.connected) terminal.log('cmd', 'Spotify conectado.');
      }
    });
  }, 3000);
}

/** `quiet`: pedido do Claude, de um gesto ou da presença; só fala se der erro (ou se for "o que está tocando"). */
async function handleMusic(music: MusicIntent, quiet = false) {
  if (!spotifyStatus.configured) {
    spotifySetupHelp();
    void voice.say(L().spotifyNotConfigured);
    return;
  }
  if (!spotifyStatus.connected) {
    void voice.say(L().spotifyNotConnected);
    return;
  }
  if (!requireFace('Spotify')) return;
  if (music.action === 'play') logUsage('music', music.query);
  terminal.log('cmd', `↳ Spotify: ${music.action}${'query' in music ? ` "${music.query}"` : ''}`);
  try {
    const r = await fetch('/api/spotify/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...face.headers() },
      body: JSON.stringify(music),
    });
    const data = (await r.json()) as { code?: string; message?: string; track?: { name: string; artist: string }; nothing?: boolean; volume?: number };
    if (!r.ok) {
      terminal.log('error', `Spotify: ${data.message}`);
      const byCode: Record<string, string> = {
        face: L().locked,
        not_configured: L().spotifyNotConfigured,
        not_connected: L().spotifyNotConnected,
        not_found: L().spotifyNotFound('query' in music ? music.query : ''),
        no_device: L().spotifyNoDevice,
        premium: L().spotifyPremium,
      };
      void voice.say(byCode[data.code ?? ''] ?? L().actionFailed);
      return;
    }
    // Atualiza o visor logo depois do comando
    nowPlayingPollAt = performance.now() + 700;
    if (data.track) terminal.log('cmd', `↳ ${data.track.name} — ${data.track.artist}`);
    const say: Record<MusicIntent['action'], string> = {
      play: data.track ? L().spotifyPlaying(data.track.name, data.track.artist) : '',
      current: data.nothing || !data.track ? L().spotifyNothing : L().spotifyNow(data.track.name, data.track.artist),
      pause: L().spotifyPaused,
      resume: L().spotifyResumed,
      next: L().spotifyNext,
      previous: L().spotifyPrevious,
      volume: L().spotifyVolume(data.volume ?? 0),
    };
    if (!say[music.action]) return;
    if (!quiet) void voice.say(say[music.action]);
    else if (music.action === 'current') sayWhenFree(say.current);
  } catch (e) {
    terminal.log('error', `Spotify: ${e instanceof Error ? e.message : e}`);
    void voice.say(L().actionFailed);
  }
}

/** Comandos de música curtos ("pausa", "próxima") só valem em frases curtas, para não atrapalhar conversas. */
const MUSIC_MAX_WORDS = 5;

// ---------- Palavra "Jarvis" e roteamento das frases ----------
/** Até quando dá para falar sem repetir "Jarvis" (depois de chamá-lo ou de uma resposta). */
let awakeUntil = 0;
/** Conversa em andamento: enquanto ele fala, a janela para continuar vai sendo empurrada. */
let conversation = false;

function wake() {
  conversation = true;
  awakeUntil = performance.now() + FOLLOW_UP_MS;
}

/**
 * Frase falada: só vale se começar com "Jarvis", se o senhor acabou de falar com ele
 * ou se ele está esperando um "sim" ou "não".
 */
function handleSpoken(text: string) {
  captureMood(performance.now());
  const rest = stripWake(text);
  if (rest === '') {
    wake();
    void voice.say(pick(L().wakeAck));
    return;
  }
  if (rest === null && performance.now() > awakeUntil) {
    if (!handleConfirmation(text)) terminal.log('info', '↳ ignorado (comece com "Jarvis")');
    return;
  }
  wake();
  handleUtterance(rest ?? text);
}

function handleUtterance(text: string) {
  if (handleConfirmation(text)) return;
  const learnPhrase = parseLearnGesture(text);
  if (learnPhrase) {
    startLearning(learnPhrase);
    return;
  }
  const forget = parseForgetGesture(text);
  if (forget) {
    void forgetGesture(forget);
    return;
  }
  const time = parseTimeRequest(text);
  if (time) {
    void handleTimeRequest(time);
    return;
  }
  const cmd = parseCommand(text);
  // Pedidos de informação local ("que horas são", "como está o tempo") vêm antes da música e das ações
  const info: Command[] = [
    'time', 'date', 'weather', 'reminders', 'cancelTimer', 'look', 'projects', 'mood', 'takeScreens', 'releaseScreens',
    'mouseOn', 'mouseOff', 'speakAgain', 'daySummary', 'uiBigger', 'uiSmaller', 'gestures', 'standby',
  ];
  const words = text.split(/\s+/).length;
  const short = words <= LOCAL_COMMAND_MAX_WORDS;
  if (cmd && info.includes(cmd) && (words <= INFO_MAX_WORDS || !claudeOn)) {
    terminal.log('cmd', `↳ comando: ${COMMAND_LABEL[cmd]}`);
    runCommand(cmd, text);
    return;
  }
  const music = /\b(lembr|timer|alarme|temporizador)/.test(normalizeText(text)) ? null : parseMusic(text);
  if (music && (music.action === 'play' || words <= MUSIC_MAX_WORDS)) {
    void handleMusic(music);
    return;
  }
  if (parseFinance(text)) {
    void handleFinance();
    return;
  }
  const routinesIntent = parseRoutines(text);
  if (routinesIntent) {
    void handleRoutines(routinesIntent);
    return;
  }
  const newsIntent = parseNews(text);
  if (newsIntent) {
    void handleNews(newsIntent);
    return;
  }
  const intent = parseIntent(text, catalog);
  if (intent) {
    handleIntent(intent);
    return;
  }
  const windowRequest = parseWindowRequest(text);
  if (windowRequest) {
    void handleAnyWindow(text, windowRequest);
    return;
  }
  const isClaudeToggle = cmd === 'claudeOn' || cmd === 'claudeOff';
  if (cmd && (isClaudeToggle || !claudeOn || short)) {
    terminal.log('cmd', `↳ comando: ${COMMAND_LABEL[cmd]}`);
    runCommand(cmd, text);
  } else if (claudeOn) {
    void askClaude(text);
  } else {
    terminal.log('warn', '↳ comando não reconhecido (Claude desligado)');
    void voice.say(L().unknownNoClaude);
  }
}

terminal.onSubmit((text) => {
  terminal.log('heard', `VOCÊ: "${text}"`);
  // Digitado não precisa da palavra "Jarvis"
  handleUtterance(stripWake(text) || text);
});

const mic = new VoiceCommands(
  (text) => {
    heard = text;
    heardAt = performance.now();
    interim = '';
    terminal.log('heard', `OUVI: "${text}"`);
    if (voice.busy) {
      // provavelmente é o próprio JARVIS falando
      terminal.log('warn', '↳ ignorado: o JARVIS estava falando');
      return;
    }
    handleSpoken(text);
  },
  (message) => {
    micLevel.stop();
    terminal.setListening(false);
    terminal.log('error', message);
    updateButtons();
    showNotice(message);
  },
  (text) => {
    noteSpeaking(performance.now());
    interim = text;
    interimAt = performance.now();
    terminal.interim(text);
  },
  (message) => terminal.log('warn', message),
);

function setSpeech(on: boolean) {
  voice.setEnabled(on);
  updateButtons();
}

function toggleSpeech() {
  silent = false;
  setSpeech(!voice.enabled);
  if (voice.enabled) void voice.say(L().unmute);
}

function toggleStyle() {
  voice.setStyle(voice.style === 'uk' ? 'br' : 'uk');
  void voice.say(L().styleChanged);
}

const MIC_KEY = 'jarvis.mic';
let micStarting = false;

async function toggleMic(announce = true) {
  if (micStarting) return;
  if (!VoiceCommands.supported) {
    showNotice('Comandos de voz só funcionam no Google Chrome. Abra o JARVIS pelo atalho (npm run jarvis).');
    return;
  }
  if (mic.active) {
    mic.stop();
    micLevel.stop();
    terminal.setListening(false);
    terminal.log('info', 'Microfone desligado.');
    try {
      localStorage.setItem(MIC_KEY, 'off');
    } catch {
      /* ignora */
    }
    if (announce) void voice.say(L().micOff);
  } else {
    micStarting = true;
    let track: MediaStreamTrack | undefined;
    try {
      const opened = await openCameraMic(video.srcObject instanceof MediaStream ? video.srcObject : null);
      track = opened.stream.getAudioTracks()[0];
      terminal.log('info', `Microfones encontrados: ${opened.available.join(' • ') || '(nenhum)'}`);
      terminal.log(
        opened.fromCamera ? 'cmd' : 'warn',
        opened.fromCamera ? `Usando o microfone da câmera: ${track.label}` : `A câmera não tem microfone; usando: ${track.label}`,
      );
      await micLevel.start(opened.stream).catch(() => terminal.log('warn', 'Sem medidor de volume.'));
    } catch {
      terminal.log('warn', 'Não consegui abrir o microfone da câmera; usando o padrão do Chrome.');
    } finally {
      micStarting = false;
    }
    mic.start(track);
    if (mic.active) {
      terminal.setListening(true);
      terminal.log('info', 'Microfone ligado. Comece cada pedido com "Jarvis" (ex.: "Jarvis, que horas são?").');
      try {
        localStorage.setItem(MIC_KEY, 'on');
      } catch {
        /* ignora */
      }
      if (announce) void voice.say(L().micOn);
    } else {
      micLevel.stop();
    }
  }
  updateButtons();
}

function updateButtons() {
  styleButton.textContent =
    voice.style === 'uk' ? 'VOZ: FILME (UK)' : voice.fishReady ? 'VOZ: JARVIS DUBLADO' : 'VOZ: PT-BR';
  styleButton.title = `Voz do JARVIS (tecla L). Atual: ${voice.voiceName}`;
  speechButton.textContent = `FALA: ${voice.enabled ? 'ON' : 'OFF'}`;
  speechButton.classList.toggle('on', voice.enabled);
  micButton.textContent = `MICROFONE: ${mic.active ? 'ON' : 'OFF'}`;
  micButton.classList.toggle('on', mic.active);
  claudeButton.textContent = !claudeAvailable
    ? 'CLAUDE: INDISPONÍVEL'
    : `CLAUDE: ${claudeOn ? (claudeThinking ? 'PENSANDO…' : 'ON') : 'OFF'}`;
  claudeButton.classList.toggle('on', claudeOn);
  claudeButton.disabled = !claudeAvailable;
  spotifyButton.textContent = !spotifyStatus.configured
    ? 'SPOTIFY: CONFIGURAR'
    : spotifyStatus.connected
      ? 'SPOTIFY: CONECTADO'
      : 'SPOTIFY: CONECTAR';
  spotifyButton.classList.toggle('on', spotifyStatus.connected);
}

voice.onChange = updateButtons;
styleButton.addEventListener('click', toggleStyle);
speechButton.addEventListener('click', toggleSpeech);
micButton.addEventListener('click', () => void toggleMic());
claudeButton.addEventListener('click', () => setClaude(!claudeOn));
spotifyButton.addEventListener('click', connectSpotify);
updateButtons();

// ---------- Inicialização (sem tela inicial: liga direto) ----------
const BRIEFED_KEY = 'jarvis-briefed-day';

/** Na primeira vez do dia que o rosto é confirmado, em vez do "bem-vindo" vem o resumo do dia com as manchetes. */
function welcomeOrBriefing(): void {
  const today = new Date().toDateString();
  let briefed = false;
  try {
    briefed = localStorage.getItem(BRIEFED_KEY) === today;
    if (!briefed) localStorage.setItem(BRIEFED_KEY, today);
  } catch {
    briefed = true; // sem armazenamento, não repete o resumo a cada reconhecimento
  }
  if (briefed || privacy) sayWhenFree(L().welcomeBack);
  else void handleDaySummary();
}

async function welcome() {
  await voice.ready;
  const line =
    face.state === 'identifying'
      ? L().identifying
      : face.state === 'unenrolled'
        ? L().notEnrolled
        : L().online(greeting(new Date(), voice.style));
  const spoke = await voice.say(line);
  welcomed = true;
  // O rosto pode ter sido confirmado enquanto ele falava a primeira frase
  if (face.state === 'verified') welcomeOrBriefing();
  if (spoke) return;
  // O navegador bloqueou o som antes da primeira interação: fala no primeiro clique ou tecla
  showNotice('Clique em qualquer lugar para ouvir o JARVIS.', 'info', 0);
  const unlock = () => {
    notice.hidden = true;
    void voice.say(line);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

async function startBoot() {
  try {
    await startCamera(video);
    boot = 'CARREGANDO O RASTREAMENTO DAS MÃOS';
    handTracker = await HandTracker.create();
    cameraOn = true;
    boot = 'CARREGANDO O RECONHECIMENTO FACIAL';
    await face.init();
  } catch (e) {
    showNotice(
      `${e instanceof CameraError ? e.message : 'Não consegui carregar o modelo de rastreamento (precisa de internet).'} Usando o mouse por enquanto.`,
    );
  }
  if (!cameraOn) face.disable();
  boot = '';
  void welcome();
  // Microfone sempre ligado (esperando o "Jarvis"), a não ser que o senhor tenha desligado
  let micPref = 'on';
  try {
    micPref = localStorage.getItem(MIC_KEY) ?? 'on';
  } catch {
    /* ignora */
  }
  if (micPref !== 'off' && VoiceCommands.supported) void toggleMic(false);
}

void startBoot();

// ---------- Visor de música ----------
interface NowPlaying {
  playing: boolean;
  track: { name: string; artist: string; album: string; image: string | null; durationMs: number; progressMs: number } | null;
}
let nowPlaying: NowPlaying | null = null;
let nowPlayingAt = 0;
let nowPlayingPollAt = 0;
let nowPlayingBusy = false;
const NOW_PLAYING_EVERY_MS = 4000;
const covers = new Map<string, HTMLImageElement>();

const musicVisible = () => spotifyStatus.connected && face.verified && !privacy && nowPlaying?.track != null;

function pollNowPlaying(now: number) {
  if (!spotifyStatus.connected || !face.verified || nowPlayingBusy || now < nowPlayingPollAt) return;
  nowPlayingBusy = true;
  nowPlayingPollAt = now + NOW_PLAYING_EVERY_MS;
  fetch('/api/spotify/now', { headers: face.headers() })
    .then((r) => (r.ok ? (r.json() as Promise<NowPlaying>) : null))
    .then((data) => {
      if (!data) return;
      nowPlaying = data;
      nowPlayingAt = performance.now();
    })
    .catch(() => {})
    .finally(() => (nowPlayingBusy = false));
}

function cover(url: string | null): HTMLImageElement | null {
  if (!url) return null;
  let img = covers.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    covers.set(url, img);
  }
  return img;
}

function musicView(now: number): MusicView | null {
  if (!musicVisible()) return null;
  const { track, playing } = nowPlaying!;
  // Entre uma consulta e outra, o tempo avança localmente
  const elapsed = Math.min(track!.durationMs, track!.progressMs + (playing ? now - nowPlayingAt : 0));
  return {
    name: track!.name,
    artist: track!.artist,
    playing,
    elapsedMs: elapsed,
    durationMs: track!.durationMs,
    cover: cover(track!.image),
  };
}

function pressMusicButton(button: MusicButton) {
  terminal.log('cmd', `↳ visor: ${button}`);
  if (button === 'toggle') {
    const playing = nowPlaying?.playing ?? false;
    if (nowPlaying?.track) {
      // Atualiza o visor na hora (o Spotify confirma na próxima consulta)
      const elapsed = musicView(performance.now())?.elapsedMs ?? nowPlaying.track.progressMs;
      nowPlaying = { playing: !playing, track: { ...nowPlaying.track, progressMs: elapsed } };
      nowPlayingAt = performance.now();
    }
    void handleMusic({ action: playing ? 'pause' : 'resume' }, true);
  } else void handleMusic({ action: button }, true);
}

// ---------- Janelas quaisquer (não só as da lista) ----------
async function handleAnyWindow(text: string, request: WindowRequest) {
  if (!requireFace('Janelas')) return;
  let target: { hwnd: number } | { target: 'foreground' };
  let label: string;
  if (request.foreground) {
    target = { target: 'foreground' };
    label = 'essa janela';
  } else {
    let windows: OpenWindow[] = [];
    try {
      const r = await fetch('/api/actions/windows', { headers: face.headers() });
      windows = ((await r.json()) as { windows?: OpenWindow[] }).windows ?? [];
    } catch {
      /* lista vazia: cai no "não encontrei" */
    }
    const w = matchWindow(text, windows);
    if (!w) {
      terminal.log('warn', `↳ janela não encontrada. Abertas: ${windows.map((x) => x.process).join(', ') || '(nenhuma)'}`);
      void voice.say(L().windowNotFound);
      return;
    }
    target = { hwnd: w.hwnd };
    label = w.process;
  }
  terminal.log('cmd', `↳ janela ${label}: ${request.op}`);
  void voice.say(request.op === 'focus' ? L().focusing(label) : L().windowOp(request.op, label));
  try {
    const r = await fetch('/api/actions/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...face.headers() },
      body: JSON.stringify({ kind: 'window', op: request.op, ...target }),
    });
    if (!r.ok) throw new Error(((await r.json()) as { message?: string }).message ?? `HTTP ${r.status}`);
  } catch (e) {
    terminal.log('error', `Janela: ${e instanceof Error ? e.message : e}`);
    void voice.say(L().actionFailed);
  }
}

// ---------- Gestos avançados (HandControl) ----------
const control = new HandControl();
/** Mouse no ar: a mão controla o cursor do Windows. */
let mouseMode = false;
/** Modo espera (aceno de tchau): microfone desligado, painéis apagados. */
let standby = false;
let micBeforeStandby = false;
/** Modo silencioso (dedo nos lábios): responde só com legenda. */
let silent = false;
let helpUntil = 0;
/** Última coisa que o JARVIS disse (mão na orelha repete). */
let lastSpoken = '';
let shortcuts: { handMenu: Shortcut[]; poses: Partial<Record<ShortcutPose, Shortcut>> } = { handMenu: [], poses: {} };
let learned: LearnedGesture[] = [];
let toast: { text: string; tone: 'cyan' | 'hot' | 'red'; at: number } | null = null;

const UI_SCALE_KEY = 'jarvis.uiScale';
let uiScale = 1;
try {
  const saved = Number(localStorage.getItem(UI_SCALE_KEY));
  if (saved >= UI_SCALE_MIN && saved <= UI_SCALE_MAX) uiScale = saved;
} catch {
  /* sem armazenamento: 100% */
}
let zoomBase = 1;

function showToast(text: string, tone: 'cyan' | 'hot' | 'red' = 'cyan') {
  toast = { text, tone, at: performance.now() };
}

function setUiScale(value: number, save = true) {
  uiScale = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value));
  showToast(`INTERFACE ${Math.round(uiScale * 100)}%`);
  if (!save) return;
  try {
    localStorage.setItem(UI_SCALE_KEY, String(uiScale));
  } catch {
    /* ignora */
  }
}

// Falas curtas de espera não contam como "a última coisa que ele disse"
const FILLER = new Set([...LINES.br.claudeThinking, ...LINES.uk.claudeThinking, ...LINES.br.wakeAck, ...LINES.uk.wakeAck, ...LINES.br.lookStart, ...LINES.uk.lookStart]);
const previousOnSay = voice.onSay;
voice.onSay = (text) => {
  previousOnSay(text);
  if (!FILLER.has(text)) lastSpoken = text;
};

fetch('/api/gestures')
  .then((r) => r.json() as Promise<{ gestures?: LearnedGesture[] }>)
  .then((d) => (learned = d.gestures ?? []))
  .catch(() => {});

/** Manda comandos de mouse, teclado e volume para o Windows (precisa do rosto confirmado). */
function sendInput(cmds: unknown[]): Promise<boolean> {
  return fetch('/api/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...face.headers() },
    body: JSON.stringify({ cmds }),
  })
    .then((r) => r.ok)
    .catch(() => false);
}

function setSilent(on: boolean) {
  if (silent === on) return;
  silent = on;
  if (on) voice.stop();
  setSpeech(!on);
  showToast(on ? 'SILENCIOSO' : 'VOZ DE VOLTA');
  terminal.log(on ? 'warn' : 'info', on ? '↳ modo silencioso (só legenda). Joinha ou "Jarvis, pode falar" para voltar.' : '↳ voz de volta');
  if (!on) void voice.say(L().unmute);
}

function setMouseMode(on: boolean) {
  if (on === mouseMode) return;
  if (on && !requireFace('Mouse no ar')) return;
  mouseMode = on;
  if (!on) for (const e of control.cancel()) handleControl(e);
  control.closeMenu();
  showToast(on ? 'MOUSE NO AR' : 'MOUSE NO AR DESLIGADO', on ? 'hot' : 'cyan');
  terminal.log('cmd', on ? '↳ mouse no ar ligado (punho por 1 s para sair)' : '↳ mouse no ar desligado');
  void voice.say(on ? L().mouseOn : L().mouseOff);
}

function enterStandby() {
  if (standby) return;
  standby = true;
  setMouseMode(false);
  control.closeMenu();
  void voice.say(L().standbyOn);
  micBeforeStandby = mic.active;
  // Desliga o microfone sem gravar isso como preferência (é só uma pausa)
  setTimeout(() => {
    if (!standby || !mic.active) return;
    mic.stop();
    micLevel.stop();
    terminal.setListening(false);
    updateButtons();
  }, 1500);
  terminal.log('warn', 'Modo espera: acene ou levante a mão para acordar.');
}

function wakeFromStandby() {
  if (!standby) return;
  standby = false;
  if (micBeforeStandby && !mic.active) void toggleMic(false);
  void voice.say(L().standbyOff);
  terminal.log('info', 'Acordado.');
}

async function handleDaySummary() {
  await Promise.all([refreshWeather(), refreshProjects(), refreshReminders(), refreshNews()]);
  const now = new Date();
  sayWhenFree(
    daySummarySpeech({ now, greeting: greeting(now, voice.style), weather, reminders, projects, personal: face.verified && !privacy, news }, voice.style),
  );
}

/** Executa um atalho do config (menu na mão, poses-atalho). */
function runShortcut(s: Shortcut) {
  const action = parseHandAction(s.action);
  terminal.log('cmd', `↳ atalho: ${s.label} (${s.action})`);
  showToast(s.label.toUpperCase(), 'hot');
  if (!action) return;
  switch (action.kind) {
    case 'play':
      void handleMusic({ action: 'play', query: action.query });
      break;
    case 'music':
      void handleMusic({ action: action.action });
      break;
    case 'open':
    case 'focus': {
      const app = catalog.apps.find((a) => a.id === action.id);
      if (app) handleIntent({ kind: action.kind, app });
      break;
    }
    case 'run': {
      const project = catalog.projects.find((p) => p.id === action.id);
      if (project) handleIntent({ kind: 'project', project });
      break;
    }
    case 'timer':
      void handleTimeRequest({ kind: 'timer', ms: action.minutes * 60_000 });
      break;
    case 'command':
      if (action.command in COMMAND_LABEL) runCommand(action.command as Command);
      break;
    case 'mouse':
      setMouseMode(!mouseMode);
      break;
    case 'say':
      handleUtterance(action.text);
      break;
  }
}

// ---------- Volume no ar ----------
/** Volume do Windows no começo do gesto (0..1), e o valor sendo mostrado. */
let volumeBase: number | null = null;
let volumeValue: number | null = null;
let volumeAt: Pt | null = null;
let volumeSentAt = 0;
/** Quantos pixels de mão para ir de 0 a 100%. */
const VOLUME_PX = 300;

async function startVolume() {
  if (!requireFace('Volume')) return;
  try {
    const r = await fetch('/api/input/volume', { headers: face.headers() });
    const data = (await r.json()) as { volume?: number };
    if (typeof data.volume === 'number') {
      volumeBase = data.volume;
      volumeValue = data.volume;
    }
  } catch {
    volumeBase = null;
  }
}

// ---------- Mouse no ar ----------
const cursorFilter = { x: new OneEuroFilter(1.0, 8), y: new OneEuroFilter(1.0, 8) };
let pendingMove: [number, number] | null = null;
let moveSentAt = 0;
let mouseAt: Pt | null = null;
let mousePressed = false;

// ---------- Gravar um gesto novo ----------
const LEARN_WAIT_MS = 1500;
const LEARN_MS = 2000;
let learning: { phrase: string; startAt: number; samples: number[][]; gestures: Gesture[]; at: Pt | null } | null = null;

function startLearning(phrase: string) {
  if (!requireFace('Aprender gesto')) return;
  learning = { phrase, startAt: performance.now() + LEARN_WAIT_MS, samples: [], gestures: [], at: null };
  terminal.log('cmd', `↳ aprendendo gesto para: "${phrase}"`);
  void voice.say(L().learnStart);
}

async function finishLearning() {
  const l = learning!;
  learning = null;
  if (l.samples.length < 15) {
    sayWhenFree(L().learnFail);
    return;
  }
  // Pose que já é um gesto fixo (mão aberta, punho, ✌...) não pode virar gesto aprendido
  const counts = new Map<Gesture, number>();
  for (const g of l.gestures) counts.set(g, (counts.get(g) ?? 0) + 1);
  const [main] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (main !== 'none') {
    sayWhenFree(L().learnKnown(GESTURE_LABEL[main].toLowerCase()));
    return;
  }
  try {
    const r = await fetch('/api/gestures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...face.headers() },
      body: JSON.stringify({ op: 'add', phrase: l.phrase, features: averageFeatures(l.samples) }),
    });
    const data = (await r.json()) as { gestures?: LearnedGesture[]; message?: string };
    if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
    learned = data.gestures ?? learned;
    terminal.log('cmd', `↳ gesto aprendido: "${l.phrase}"`);
    sayWhenFree(L().learnDone(l.phrase.charAt(0).toLowerCase() + l.phrase.slice(1)));
  } catch (e) {
    terminal.log('error', `Gestos: ${e instanceof Error ? e.message : e}`);
    sayWhenFree(L().actionFailed);
  }
}

async function forgetGesture(key: string) {
  if (!requireFace('Esquecer gesto')) return;
  const k = normalizeText(key);
  const targets = key === '*' ? learned : learned.filter((g) => normalizeText(g.phrase).includes(k));
  if (targets.length === 0) {
    void voice.say(L().gestureNotFound);
    return;
  }
  for (const g of targets) {
    try {
      const r = await fetch('/api/gestures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...face.headers() },
        body: JSON.stringify({ op: 'remove', id: g.id }),
      });
      const data = (await r.json()) as { gestures?: LearnedGesture[] };
      if (data.gestures) learned = data.gestures;
    } catch {
      /* tenta os outros */
    }
  }
  void voice.say(L().gestureForgotten(targets.length));
}

// ---------- Regiões do rosto (boca, orelhas, peito) para os gestos ----------
function faceRegions(now: number): Pick<ControlContext, 'mouth' | 'ears' | 'chest' | 'raiseY'> {
  const b = face.box;
  if (!b || !cameraOn || face.absentFor(now) > 1500) return { mouth: null, ears: [], chest: null, raiseY: view.h * 0.2 };
  const p1 = toScreen({ x: b.x, y: b.y }, videoSize(), view);
  const p2 = toScreen({ x: b.x + b.w, y: b.y + b.h }, videoSize(), view);
  const box = { x: Math.min(p1.x, p2.x), y: p1.y, w: Math.abs(p2.x - p1.x), h: p2.y - p1.y };
  // Boca: pontos 48 a 67 do rosto, com margem; sem eles, o terço de baixo do rosto
  let mouth = { x: box.x + box.w * 0.2, y: box.y + box.h * 0.6, w: box.w * 0.6, h: box.h * 0.4 };
  if (now - face.landmarksAt < 3000 && face.landmarks.length === 68) {
    const pts = face.landmarks.slice(48, 68).map((p) => toScreen(p, videoSize(), view));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    mouth = { x: Math.min(...xs) - w * 0.35, y: Math.min(...ys) - h * 0.6, w: w * 1.7, h: h * 2.2 };
  }
  const earW = box.w * 0.6;
  const earY = box.y + box.h * 0.1;
  const earH = box.h * 0.55;
  return {
    mouth,
    ears: [
      { x: box.x - earW, y: earY, w: earW, h: earH },
      { x: box.x + box.w, y: earY, w: earW, h: earH },
    ],
    chest: { x: box.x - box.w, y: box.y + box.h * 1.05, w: box.w * 3, h: view.h },
    raiseY: box.y - box.h * 0.15,
  };
}

function updateGestures(hands: Hand[], now: number) {
  // Sem o rosto do dono, o mouse no ar desliga sozinho
  if (mouseMode && face.state !== 'verified') setMouseMode(false);
  const controlHands: ControlHand[] = hands.map((h) => {
    const a = h.raw[5];
    const b = h.raw[9];
    // Imagem espelhada: mão para a direita = cursor para a direita
    const anchor = a && b ? { x: 1 - (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0.5, y: 0.5 };
    return { key: h.key, gesture: h.gesture, stale: h.stale, palm: h.palm, tip: h.tip, pinch: h.pinch, anchor, world: h.world };
  });
  const musicRect = musicVisible() ? panels.rects.music : null;
  const events = control.update(controlHands, {
    now,
    mouseMode,
    standby,
    ...faceRegions(now),
    overUi: (p) => targetAt(p) !== null || panels.panelAt(p, panelsData(Date.now())) !== null,
    music: musicRect,
    learned,
  });

  // Gravando um gesto: junta os frames e ignora os outros gestos (menos o "parar tudo")
  if (learning) {
    const hand = hands.find((h) => !h.stale);
    learning.at = hand?.palm ?? null;
    if (now >= learning.startAt && hand) {
      learning.samples.push(poseFeatures(hand.world));
      learning.gestures.push(hand.gesture);
    }
    if (now >= learning.startAt + LEARN_MS) void finishLearning();
    for (const e of events) if (e.type === 'stopAll') handleControl(e);
    return;
  }
  for (const e of events) handleControl(e);

  // Mouse no ar: manda a posição umas 30 vezes por segundo
  if (mouseMode && pendingMove && now - moveSentAt > 33) {
    moveSentAt = now;
    void sendInput([{ move: pendingMove }]);
    pendingMove = null;
  }
  const mouseHand = mouseMode ? hands.find((h) => !h.stale) : undefined;
  mouseAt = mouseHand?.palm ?? null;
}

const WINDOW_KEYS: Record<string, { keys: string[]; label: string }> = {
  'victory:right': { keys: ['alt', 'tab'], label: 'ALT+TAB →' },
  'victory:left': { keys: ['alt', 'shift', 'tab'], label: '← ALT+TAB' },
  'victory:up': { keys: ['win', 'tab'], label: 'TODAS AS JANELAS' },
  'victory:down': { keys: ['win', 'd'], label: 'ÁREA DE TRABALHO' },
  'three:right': { keys: ['win', 'ctrl', 'right'], label: 'ÁREA VIRTUAL →' },
  'three:left': { keys: ['win', 'ctrl', 'left'], label: '← ÁREA VIRTUAL' },
};

function handleControl(e: ControlEvent) {
  const now = performance.now();
  switch (e.type) {
    case 'stopAll':
      terminal.log('warn', '↳ duas palmas: parar tudo');
      voice.stop();
      if (nowPlaying?.playing) void handleMusic({ action: 'pause' }, true);
      if (mouseMode) {
        mouseMode = false;
        mousePressed = false;
      }
      learning = null;
      pendingProject = null;
      pendingRoutine = null;
      showToast('TUDO PARADO', 'red');
      updateButtons();
      break;
    case 'shush':
      setSilent(true);
      break;
    case 'wave':
      if (standby) wakeFromStandby();
      else enterStandby();
      break;
    case 'raise':
      if (standby) wakeFromStandby();
      else if (mic.active) {
        // Ouvir sem dizer "Jarvis": bipe curto e o núcleo em "ouvindo"
        wake();
        beepShort();
        terminal.log('info', '↳ mão levantada: pode falar sem dizer "Jarvis"');
      }
      break;
    case 'ear':
      if (!lastSpoken) void voice.say(L().nothingToRepeat);
      else if (silent) voice.showCaption(lastSpoken, 1500 + lastSpoken.length * 70);
      else void voice.say(lastSpoken);
      break;
    case 'daySummary':
      terminal.log('cmd', '↳ polegar no peito: resumo do dia');
      void handleDaySummary();
      break;
    case 'pose': {
      const s = shortcuts.poses[e.pose];
      if (s) runShortcut(s);
      break;
    }
    case 'learned':
      terminal.log('cmd', `↳ gesto aprendido: "${e.gesture.phrase}"`);
      showToast(e.gesture.phrase.toUpperCase(), 'hot');
      handleUtterance(e.gesture.phrase);
      break;
    case 'palmHold':
      if (voice.isSpeaking || voice.busy) {
        terminal.log('cmd', '↳ palma aberta: silêncio');
        voice.stop();
      } else if (musicVisible() && inRect(e.at, panels.rects.music)) {
        terminal.log('cmd', '↳ palma aberta sobre o visor: música');
        pressMusicButton('toggle');
      } else if (shortcuts.handMenu.length) {
        control.openMenu(e.at, shortcuts.handMenu.length, e.hand, now);
      }
      break;
    case 'menuPick': {
      const s = shortcuts.handMenu[e.index];
      if (s) runShortcut(s);
      break;
    }
    case 'menuClose':
      break;
    case 'palmSwipe':
      if (e.overMusic && musicVisible()) pressMusicButton(e.dir === 'right' ? 'next' : 'previous');
      else cycleFocus(e.dir === 'right' ? 1 : -1);
      break;
    case 'windowSwipe': {
      const k = WINDOW_KEYS[`${e.pose}:${e.dir}`];
      if (!k || !requireFace('Atalhos do Windows')) break;
      showToast(k.label, 'hot');
      terminal.log('cmd', `↳ ${k.label}`);
      void sendInput([{ keys: k.keys }]);
      break;
    }
    case 'zoom':
      if (e.phase === 'start') zoomBase = uiScale;
      else if (e.phase === 'move') setUiScale(zoomBase * e.ratio, false);
      else setUiScale(uiScale);
      break;
    case 'volume':
      if (e.phase === 'start') {
        volumeAt = e.at;
        void startVolume();
      } else if (e.phase === 'move') {
        volumeAt = e.at;
        if (volumeBase === null) break;
        volumeValue = Math.min(1, Math.max(0, volumeBase + e.dy / VOLUME_PX));
        if (now - volumeSentAt > 80) {
          volumeSentAt = now;
          void sendInput([{ volume: volumeValue }]);
        }
      } else {
        if (volumeValue !== null && volumeBase !== null) void sendInput([{ volume: volumeValue }]);
        volumeBase = null;
        volumeValue = null;
        volumeAt = null;
      }
      break;
    case 'mouseMove':
      pendingMove = [cursorFilter.x.filter(e.x, now), cursorFilter.y.filter(e.y, now)].map((v) => Math.min(1, Math.max(0, v))) as [number, number];
      break;
    case 'mouseButton':
      mousePressed = e.down;
      if (pendingMove) {
        void sendInput([{ move: pendingMove }, { button: e.down ? 'down' : 'up' }]);
        pendingMove = null;
      } else void sendInput([{ button: e.down ? 'down' : 'up' }]);
      break;
    case 'mouseScroll':
      void sendInput([{ scroll: e.steps }]);
      break;
    case 'mouseExit':
      setMouseMode(false);
      break;
  }
}

/** Bipe curto de "pode falar" (mão levantada). */
function beepShort() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
    setTimeout(() => void ctx.close(), 400);
  } catch {
    /* sem som */
  }
}

/** Lista do painel de ajuda (tecla G / "quais gestos você conhece?"). */
function helpRows(): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['"Jarvis, …"', 'qualquer pedido por voz'],
    ['☝ Apontar', 'cursor; parado num botão, aperta'],
    ['🤏 Pinça', 'arrastar painel · no vazio: volume'],
    ['🤏🤏 Duas pinças', 'ampliar / reduzir a interface'],
    ['✋ Palma parada', 'menu na mão (ou calar o JARVIS)'],
    ['✋✋ Duas palmas', 'parar tudo'],
    ['🤫 Dedo nos lábios', 'modo silencioso (joinha volta)'],
    ['👂 Mão na orelha', 'repetir a última frase'],
    ['👋 Acenar', 'modo espera / acordar'],
    ['🙋 Mão levantada', 'ouvir sem dizer "Jarvis"'],
    ['👍 Polegar no peito', 'resumo do dia'],
    ['✌ Deslizar', '← → janelas · ↑ todas · ↓ área de trabalho'],
    ['3 dedos deslizar', 'trocar de área de trabalho virtual'],
    ['M', 'mouse no ar (punho por 1 s sai)'],
  ];
  for (const [pose, s] of Object.entries(shortcuts.poses) as Array<[ShortcutPose, Shortcut]>) {
    rows.push([pose === 'rock' ? '🤘 Rock' : '🤙 Telefone', s.label]);
  }
  for (const g of learned) rows.push(['✳ Aprendido', g.phrase]);
  return rows;
}

function handUi(now: number): HandUiFrame {
  const toastAge = toast ? now - toast.at : Infinity;
  if (toastAge > TOAST_MS) toast = null;
  return {
    time: now,
    progress: control.progress,
    menu: control.menu ? { ...control.menu, labels: shortcuts.handMenu.map((s) => s.label) } : null,
    volume: volumeAt && volumeValue !== null ? { at: volumeAt, value: volumeValue } : null,
    toast: toast ? { text: toast.text, tone: toast.tone, age: toastAge } : null,
    mouse: mouseMode && mouseAt ? { at: mouseAt, pressed: mousePressed } : null,
    learning: learning ? { at: learning.at, progress: Math.max(0, Math.min(1, (now - learning.startAt) / LEARN_MS)) } : null,
    help: now < helpUntil ? helpRows() : null,
  };
}

// ---------- Loop ----------
/**
 * Leitura facial na tela: varredura com os pontos do rosto enquanto identifica ou cadastra,
 * animação de "identidade confirmada" e, enquanto o senhor fala, a malha discreta com a expressão.
 */
function faceScan(now: number): FaceScanFrame | null {
  const b = face.box;
  // Só com o rosto visto há pouco (senão a moldura ficaria parada no ar)
  if (!b || !cameraOn || face.absentFor(now) > 2500) return null;
  const sinceConfirmed = now - face.confirmedAt;
  const talking = now < awakeUntil || now - interimAt < 1500;
  let mode: FaceScanMode;
  if (face.state === 'enrolling') mode = 'enrolling';
  else if (face.state === 'identifying') mode = 'scanning';
  else if (face.state === 'unknown') mode = 'unknown';
  else if (face.state === 'verified' && sinceConfirmed < CONFIRM_ANIMATION_MS) mode = 'confirmed';
  else if (talking && (face.state === 'verified' || face.state === 'unenrolled')) mode = 'reading';
  else return null;

  const p1 = toScreen({ x: b.x, y: b.y }, videoSize(), view);
  const p2 = toScreen({ x: b.x + b.w, y: b.y + b.h }, videoSize(), view);
  const points = now - face.landmarksAt < 2500 ? face.landmarks.map((p) => toScreen(p, videoSize(), view)) : [];
  const m = mood.recent(MOOD_WINDOW_MS, now);
  const expression = m ? MOOD_LABEL[m.expression] + (m.strong || m.expression === 'neutral' ? '' : ' (LEVE)') : '—';
  const distance = face.lastDistance === null ? '—' : `${face.lastDistance.toFixed(2)} / 0.50`;
  const data: Array<[string, string]> =
    mode === 'reading'
      ? [['EXPRESSÃO', expression]]
      : mode === 'enrolling'
        ? [['PONTOS FACIAIS', '68'], ['AMOSTRAS', `${face.enrollProgress}/${face.enrollTotal}`], ['DICA', 'VIRE DEVAGAR']]
        : [
            ['PONTOS FACIAIS', points.length ? '68' : '—'],
            ['DESCRITOR', '128-D'],
            ['DISTÂNCIA', distance],
            ['EXPRESSÃO', expression],
            ['RESULTADO', mode === 'confirmed' ? 'DONO' : mode === 'unknown' ? 'DESCONHECIDO' : 'COMPARANDO'],
          ];
  return {
    mode,
    box: { x: Math.min(p1.x, p2.x), y: p1.y, w: Math.abs(p2.x - p1.x), h: p2.y - p1.y },
    points,
    data,
    progress: face.enrollProgress / face.enrollTotal,
    elapsed: sinceConfirmed,
    time: now,
  };
}

/** "Mãos detectadas" no máximo a cada 5 minutos: mais que isso cansa. */
const HANDS_ANNOUNCE_EVERY_MS = 5 * 60_000;

/** Números por trás do gesto, mostrados no modo de depuração. */
function debugLines(h: Hand): string[] {
  const m = gestureMetrics(h.world);
  const names = ['IND', 'MÉD', 'ANE', 'MÍN'];
  return [
    `${h.key}${h.stale ? ' (perdida)' : ''}  pinça ${m.pinch.toFixed(2)}`,
    m.curls.map((c, i) => `${names[i]} ${Math.round(c)}°`).join(' '),
    `POLEGAR fora ${m.thumbOut.toFixed(2)}  dobra ${Math.round(m.thumbBend)}°  dir ${m.thumbDir.toFixed(2)}`,
  ];
}

function panelsData(now: number): PanelsData {
  if (finance && performance.now() > finance.until) finance = null;
  return {
    now,
    system,
    projects,
    weather,
    reminders,
    music: musicView(performance.now()),
    finance: finance?.summary ?? null,
    news,
    privacy,
    focus,
    grabbed: grab?.id ?? null,
  };
}

function coreState(now: number): { state: CoreState; level: number } {
  if (standby) return { state: 'standby', level: 0 };
  if (claudeThinking || looking) return { state: 'thinking', level: 0.15 };
  if (voice.isSpeaking) return { state: 'speaking', level: voice.outputLevel(now) };
  if (!mic.active) return { state: 'idle', level: 0 };
  const level = micLevel.level();
  const talking = now - interimAt < 1200 && stripWake(interim) !== null;
  if (now < awakeUntil || talking) return { state: 'hearing', level };
  return { state: 'listening', level: level * 0.35 };
}

function statusLine(): Array<{ text: string; color?: string }> {
  const out: Array<{ text: string; color?: string }> = [];
  const idColor = face.state === 'verified' ? '#7cffb2' : face.state === 'unknown' ? '#ff6b6b' : undefined;
  out.push({ text: face.state === 'identifying' ? FACE_STATE_LABEL.identifying : `IDENTIDADE ${FACE_STATE_LABEL[face.state]}`, color: idColor });
  if (presence.away) out.push({ text: 'AUSENTE', color: '#ffb347' });
  if (standby) out.push({ text: 'EM ESPERA', color: '#ffb347' });
  if (mouseMode) out.push({ text: 'MOUSE NO AR', color: '#ffb347' });
  if (silent) out.push({ text: 'SILENCIOSO', color: '#ffb347' });
  const m = face.absentFor() < 5000 ? mood.recent(MOOD_WINDOW_MS) : null;
  if (m && !privacy) out.push({ text: `HUMOR ${MOOD_LABEL[m.expression]}` });
  if (privacy) out.push({ text: 'MODO PRIVADO', color: '#ffb347' });
  out.push({ text: claudeAvailable ? `CLAUDE ${claudeOn ? 'ON' : 'OFF'}` : 'CLAUDE INDISPONÍVEL' });
  if (!cameraOn) out.push({ text: 'SEM CÂMERA', color: '#ff6b6b' });
  return out;
}

const HINTS = ['"JARVIS, …" + pedido', 'APONTAR: cursor', 'PALMA PARADA: menu', 'DUAS PALMAS: parar tudo', '✌ DESLIZAR: janelas', 'G: todos os gestos'];
const MOUSE_HINTS = ['"JARVIS, …" + pedido', 'T: terminal', 'ARRASTAR: mover painel', 'CLIQUE NO TÍTULO: destaque', 'R: reorganizar'];

/** Última vez que o mouse ou o teclado foram usados: a interface precisa responder rápido. */
let lastInputAt = -Infinity;
for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel']) {
  window.addEventListener(type, () => (lastInputAt = performance.now()), { passive: true });
}

/** O que está acontecendo agora, para o orçamento de CPU/GPU (ver budget.ts). */
function activity(now: number): Activity {
  return {
    hands: stableHands.length > 0,
    sinceHandsMs: now - lastHandsSeenAt,
    interacting: mouseMode || control.zooming || Boolean(control.menu) || now - lastInputAt < 2000,
    standby,
    away: presence.away,
    hidden: document.hidden,
  };
}

let lastFrameAt = -Infinity;

function frame(now: number) {
  // Parado, em espera ou ausente: redesenha menos para poupar CPU/GPU
  const act = activity(now);
  if (now - lastFrameAt < frameInterval(act) - 2) {
    requestAnimationFrame(frame);
    return;
  }
  lastFrameAt = now;
  face.idle = standby || presence.away || act.hidden;
  const hands = readHands(now);
  if (hands.length > 0) {
    // Anuncia as mãos só quando elas voltam depois de um tempo sumidas
    if (now - lastHandsSeenAt > 20000 && now - handsAnnouncedAt > HANDS_ANNOUNCE_EVERY_MS && !voice.busy && !claudeThinking) {
      void voice.say(pick(L().hands));
      handsAnnouncedAt = now;
    }
    lastHandsSeenAt = now;
  }
  if (mic.active) terminal.setLevel(micLevel.level());
  if (cameraOn) face.tick(video, now);
  updatePresence(now);
  pollNowPlaying(now);
  updateGestures(hands, now);
  interact(hands);
  if (!mouseMode && !standby && !control.menu) updatePointer(hands, now);
  else {
    cursor = null;
    dwell = null;
  }
  updateThumbs(hands);

  // Enquanto ele responde, a janela para continuar a conversa sem "Jarvis" vai sendo empurrada
  if (conversation && (voice.busy || claudeThinking)) awakeUntil = Math.max(awakeUntil, now + FOLLOW_UP_MS);
  else if (conversation && now > awakeUntil) conversation = false;

  const transcript = now - interimAt < 1500 && interim ? interim : now - heardAt < 4000 ? heard : '';
  const core = coreState(now);
  const caption = voice.captionAt(now);
  const status = statusLine();
  broadcast(now, { core, caption, transcript, status });
  targets = hud.draw({
    time: now,
    cameraOn,
    boot,
    status,
    hands: hands.map((h) => ({
      points: h.points,
      gesture: h.gesture,
      pinch: h.pinch,
      stale: h.stale,
      debug: debug ? debugLines(h) : null,
    })),
    core,
    caption,
    transcript,
    panels: panelsData(Date.now()),
    faceScan: faceScan(now),
    objects: objectsOnScreen(now),
    cursor,
    hints: cameraOn ? HINTS : MOUSE_HINTS,
    scale: uiScale,
    standby,
    handUi: handUi(now),
  });

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

