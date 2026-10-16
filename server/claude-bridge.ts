import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { diskPercent, formatGb, memPercent, type ProjectStatus, type Reminder, type SystemInfo, type WeatherInfo, weatherLabel } from '../src/info';
import { loadConfig, projectsStatus } from './actions';
import { hasFaceToken } from './face-store';
import { readConfigText } from './config-file';
import { isLocalRequest, readBody, sendJson } from './http';
import { fetchJanusSummary, janusUrl } from './janus';
import { reminderStore } from './reminders';
import { systemSnapshot } from './system';
import { getWeather } from './weather';

/** Ações do JARVIS que o Claude pode pedir no fim da resposta, como [acao:pause] ou [acao:play:nome]. */
export const CLAUDE_ACTIONS = [
  'play', 'pause', 'resume', 'next', 'previous', 'open', 'focus', 'run', 'finance',
  'monitor', 'maximize', 'minimize', 'timer', 'reminder', 'remember', 'forget', 'look',
] as const;
/** Ações que precisam de um parâmetro depois do nome. */
const WITH_ARG = new Set<string>(['play', 'open', 'focus', 'run', 'monitor', 'maximize', 'minimize', 'timer', 'reminder', 'remember', 'forget']);

/** Perguntas sobre dinheiro: o servidor anexa os números reais do janus ao pedido. */
export const FINANCE_QUESTION = /financ|dinheiro|saldo|gast|sobr|d[ií]vida|janus|contas|grana|or[cç]amento|pagar|receb/i;

export function systemPrompt(apps: string[], projects: string[], memory: string[] = []): string {
  const facts = memory.length ? `\nO que você já sabe sobre o senhor (sua memória): ${memory.map((f) => `"${f}"`).join('; ')}.` : '';
  return `Você é o J.A.R.V.I.S., o assistente pessoal do usuário, rodando no computador dele com câmera, microfone e voz.
Fale sempre em português do Brasil, com o tom calmo, educado e levemente irônico do JARVIS, chamando o usuário de "senhor".
Sua resposta será falada em voz alta: nada de markdown, listas, emojis, código ou símbolos. Seja breve: no máximo três frases, a não ser que ele peça uma explicação.
O senhor está se preparando para o vestibular da Unesp (Sistemas de Informação). Se ele perguntar alguma matéria, explique passo a passo, de forma simples e sem jargão.
Cada mensagem começa com um bloco "Contexto agora" com a data, a hora, o estado real do PC, o clima, os projetos no ar, os lembretes e o que a câmera viu. Use esses dados para responder e nunca invente números. Não leia o contexto em voz alta se ele não perguntou.
O contexto pode trazer a expressão do senhor enquanto falava (feliz, triste, irritado...). Use isso para ajustar o tom, como um assistente atento faria: mais leve se ele estiver feliz, mais cuidadoso se parecer triste ou irritado. Só comente a expressão de vez em quando e com naturalidade (nunca em toda resposta), e lembre que a leitura da câmera pode errar.
Você controla algumas coisas do computador. Se o pedido corresponder a uma destas ações, escreva a tag no fim da resposta (pode usar mais de uma):
[acao:play:nome da música ou artista] toca no Spotify; [acao:pause], [acao:resume], [acao:next] e [acao:previous] controlam a música.
[acao:open:ID] abre um aplicativo e [acao:focus:ID] traz a janela dele para a frente; [acao:monitor:ID] manda a janela para o outro monitor; [acao:maximize:ID] e [acao:minimize:ID] maximizam e minimizam. IDs de aplicativos: ${apps.join(', ') || 'nenhum'}.
[acao:run:ID] roda um projeto (o JARVIS pede confirmação ao senhor antes). IDs de projetos: ${projects.join(', ') || 'nenhum'}.
[acao:finance] lê em voz alta o resumo financeiro do mês, vindo do janus: nesse caso responda só uma frase curta de introdução, sem números.
[acao:timer:minutos] cria um timer (ex.: [acao:timer:25]). [acao:reminder:AAAA-MM-DDTHH:MM|texto] cria um lembrete na data e hora local, calculadas a partir do contexto (ex.: [acao:reminder:2026-10-12T19:00|estudar matemática]).
[acao:remember:fato curto] guarda um fato sobre o senhor na sua memória permanente, quando ele pedir para você lembrar de algo ou contar algo importante sobre ele (provas, preferências, pessoas, metas). [acao:forget:fato] apaga um fato da memória.
[acao:look] olha pela câmera para identificar o objeto que o senhor está mostrando: responda só uma frase curta, o JARVIS fala o que viu.
Quando a mensagem trouxer "Dados reais do janus", use esses números para responder. Nunca use IDs que não estão nas listas.${facts}`;
}

/** IDs de apps e projetos do jarvis.config.json, para o Claude saber o que pode pedir. */
function catalogIds(root: string): { apps: string[]; projects: string[] } {
  try {
    const config = JSON.parse(readConfigText(root)) as {
      apps?: Array<{ id: string }>;
      projects?: Array<{ id: string }>;
    };
    return { apps: (config.apps ?? []).map((a) => a.id), projects: (config.projects ?? []).map((p) => p.id) };
  } catch {
    return { apps: [], projects: [] };
  }
}

const TIMEOUT_MS = 90_000;
const MAX_TEXT = 1000;

export interface ClaudeAction {
  name: (typeof CLAUDE_ACTIONS)[number];
  arg?: string;
}

export interface ClaudeReply {
  reply: string;
  actions: ClaudeAction[];
}

/** Separa as tags [acao:...] (com parâmetro opcional) do texto que vai ser falado. */
export function parseReply(raw: string): ClaudeReply {
  const actions: ClaudeAction[] = [];
  const reply = raw
    .replace(/\[a[cç][aã]o:\s*([\w-]+)\s*(?::\s*([^\]]{1,200}))?\]/gi, (_, name: string, arg?: string) => {
      const action = CLAUDE_ACTIONS.find((a) => a.toLowerCase() === name.toLowerCase());
      const value = arg?.trim();
      // Ação desconhecida, parâmetro faltando ou repetida: ignora
      if (!action || (WITH_ARG.has(action) && !value) || actions.some((a) => a.name === action && a.arg === value)) return '';
      actions.push(WITH_ARG.has(action) ? { name: action, arg: value } : { name: action });
      return '';
    })
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { reply, actions };
}

/** O que só o navegador sabe (música, câmera, visitante, expressão do rosto). */
export interface ClientContext {
  music?: string;
  object?: string;
  visitor?: boolean;
  /** Expressão do senhor enquanto falava, lida pela câmera ("feliz (80% de confiança)"). */
  mood?: string;
}

export interface ContextParts {
  now: Date;
  system?: SystemInfo | null;
  weather?: WeatherInfo | null;
  projects?: ProjectStatus[] | null;
  reminders?: Reminder[] | null;
  client?: ClientContext;
}

const clip = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Bloco "Contexto agora" que vai antes de cada pergunta ao Claude. */
export function buildContext({ now, system, weather, projects, reminders, client = {} }: ContextParts): string {
  const time = (ms: number) =>
    new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const lines = [
    `Data e hora: ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
  ];
  if (system) {
    const disk = diskPercent(system);
    const parts = [`CPU ${system.cpu}%`, `memória ${memPercent(system)}% de ${formatGb(system.memTotal)}`];
    if (disk !== null) parts.push(`disco C: ${disk}% usado`);
    if (system.battery !== null) parts.push(`bateria ${system.battery}%${system.charging ? ' carregando' : ''}`);
    if (system.online !== null) parts.push(system.online ? 'internet ok' : 'sem internet');
    lines.push(`PC: ${parts.join(', ')}`);
  }
  if (weather) {
    lines.push(
      `Clima em ${weather.place}: ${Math.round(weather.temp)}°C, ${weatherLabel(weather.code)}, máxima ${Math.round(weather.max)}, mínima ${Math.round(weather.min)}, chance de chuva ${weather.rainChance}%`,
    );
  }
  if (projects?.length) {
    const on = projects.filter((p) => p.running).map((p) => p.name);
    const off = projects.filter((p) => p.running === false).map((p) => p.name);
    lines.push(`Projetos no ar: ${on.join(', ') || 'nenhum'}. Desligados: ${off.join(', ') || 'nenhum'}`);
  }
  if (reminders) {
    const pending = reminders.filter((r) => !r.done).slice(0, 8);
    const list = pending.map((r) => (r.kind === 'timer' ? `timer até ${time(r.dueAt)}` : `${r.text} (${time(r.dueAt)})`));
    lines.push(`Lembretes pendentes: ${list.join('; ') || 'nenhum'}`);
  }
  if (clip(client.music)) lines.push(`Tocando no Spotify: ${clip(client.music)}`);
  if (clip(client.object)) lines.push(`Último objeto visto na câmera: ${clip(client.object)}`);
  if (clip(client.mood)) lines.push(`Expressão do senhor enquanto falava (lida pela câmera): ${clip(client.mood)}`);
  if (client.visitor) lines.push('Há outra pessoa na frente da câmera: não fale de finanças nem de assuntos pessoais.');
  return `Contexto agora:\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

const MAX_FACTS = 60;
const MAX_FACT = 200;

/** Memória permanente do JARVIS (.jarvis-memory.json, fora do git): fatos curtos sobre o senhor. */
export class MemoryStore {
  facts: string[] = [];

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as { facts?: unknown };
        this.facts = Array.isArray(data.facts) ? data.facts.filter((f): f is string => typeof f === 'string').slice(-MAX_FACTS) : [];
      } catch {
        this.facts = [];
      }
    }
  }

  remember(fact: string): boolean {
    const f = clip(fact, MAX_FACT);
    if (!f || this.facts.some((x) => x.toLowerCase() === f.toLowerCase())) return false;
    this.facts = [...this.facts, f].slice(-MAX_FACTS);
    this.save();
    return true;
  }

  /** Apaga os fatos que contêm o trecho (sem diferenciar maiúsculas). */
  forget(fact: string): number {
    const key = clip(fact, MAX_FACT).toLowerCase();
    if (!key) return 0;
    const before = this.facts.length;
    this.facts = this.facts.filter((f) => !f.toLowerCase().includes(key) && !key.includes(f.toLowerCase()));
    if (this.facts.length !== before) this.save();
    return before - this.facts.length;
  }

  private save(): void {
    if (this.file) writeFileSync(this.file, JSON.stringify({ facts: this.facts }, null, 2));
  }
}

/** "2026-10-12T19:00|estudar" → lembrete; devolve null se a data não fizer sentido. */
export function parseReminderArg(arg: string): { dueAt: number; text: string } | null {
  const [when, ...rest] = arg.split('|');
  const m = when.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  const text = rest.join('|').trim();
  if (!m || !text) return null;
  const dueAt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  return Number.isFinite(dueAt) ? { dueAt, text } : null;
}

function findClaude(env: Record<string, string>): string | null {
  const candidates = [
    env.JARVIS_CLAUDE_PATH,
    process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    process.env.HOME && join(process.env.HOME, '.local', 'bin', 'claude'),
  ];
  return candidates.find((p): p is string => Boolean(p) && existsSync(p!)) ?? null;
}

/**
 * Ponte local para o Claude Code em modo não interativo (`claude -p`), usando o login do plano
 * do próprio usuário. Sem ferramentas, sem MCP, numa pasta vazia: o Claude só conversa.
 */
export function claudeBridge(env: Record<string, string>, root: string): Plugin {
  const exe = findClaude(env);
  const model = /^[\w.-]+$/.test(env.JARVIS_CLAUDE_MODEL ?? '') ? env.JARVIS_CLAUDE_MODEL : 'haiku';
  const workDir = join(tmpdir(), 'jarvis-hud-claude');
  // A conversa continua depois de reiniciar o servidor, mas começa do zero a cada dia (para não crescer para sempre)
  const sessionFile = join(root, '.jarvis-claude-session.json');
  const today = () => new Date().toLocaleDateString('en-CA');
  let sessionId: string | null = null;
  try {
    const saved = JSON.parse(readFileSync(sessionFile, 'utf8')) as { sessionId?: string; day?: string };
    if (saved.day === today() && typeof saved.sessionId === 'string') sessionId = saved.sessionId;
  } catch {
    /* sem sessão salva */
  }
  const saveSession = (id: string | null) => {
    sessionId = id;
    try {
      writeFileSync(sessionFile, JSON.stringify({ sessionId: id, day: today() }));
    } catch {
      /* ignora */
    }
  };
  const memory = new MemoryStore(join(root, '.jarvis-memory.json'));
  const reminderList = reminderStore(root);
  let busy = false;

  /** Estado real do PC, clima, projetos e lembretes; o que falhar fica de fora. */
  const context = async (client: ClientContext): Promise<string> => {
    const settled = <T>(p: Promise<T>) => p.catch(() => null);
    const [system, weather, projects] = await Promise.all([
      settled(systemSnapshot()),
      settled(getWeather(root)),
      settled(projectsStatus(loadConfig(root))),
    ]);
    return buildContext({ now: new Date(), system, weather, projects, reminders: reminderList.pending(), client });
  };

  /** Ações que o próprio servidor resolve: timer, lembrete e memória. As outras vão para o navegador. */
  const applyServerActions = (reply: ClaudeReply): ClaudeReply => {
    for (const a of reply.actions) {
      try {
        if (a.name === 'timer') {
          const minutes = Number(a.arg?.replace(',', '.'));
          if (minutes > 0 && minutes <= 24 * 60) reminderList.add({ text: 'Timer', dueAt: Date.now() + minutes * 60_000, kind: 'timer' });
        } else if (a.name === 'reminder') {
          const r = parseReminderArg(a.arg ?? '');
          if (r) reminderList.add({ ...r, kind: 'reminder' });
        } else if (a.name === 'remember') memory.remember(a.arg ?? '');
        else if (a.name === 'forget') memory.forget(a.arg ?? '');
      } catch (e) {
        console.warn('[claude] ação', a.name, e);
      }
    }
    return reply;
  };

  /** Pergunta sobre dinheiro: anexa os números reais do janus (se ele estiver ligado). */
  const withFinanceContext = async (text: string, visitor = false): Promise<string> => {
    // Com outra pessoa na frente da câmera, os números do janus não vão para o Claude
    if (visitor || !FINANCE_QUESTION.test(text)) return `O senhor disse: ${text}`;
    try {
      const summary = await fetchJanusSummary(janusUrl(env));
      return `Dados reais do janus deste mês (JSON, valores em reais): ${JSON.stringify(summary)}\n\nO senhor disse: ${text}`;
    } catch {
      return `(O janus está desligado: não há números disponíveis.)\n\nO senhor disse: ${text}`;
    }
  };

  const ask = (text: string): Promise<ClaudeReply> =>
    new Promise((resolve, reject) => {
      mkdirSync(workDir, { recursive: true });
      const args = [
        '-p',
        '--output-format', 'json',
        '--model', model,
        '--tools', '',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--system-prompt', systemPrompt(catalogIds(root).apps, catalogIds(root).projects, memory.facts),
      ];
      if (sessionId) args.push('--resume', sessionId);
      const child = spawn(exe!, args, { cwd: workDir, windowsHide: true });
      let out = '';
      let err = '';
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(out) as { result?: string; session_id?: string; is_error?: boolean };
          if (json.is_error || typeof json.result !== 'string') throw new Error(json.result ?? 'resposta vazia');
          if (json.session_id && json.session_id !== sessionId) saveSession(json.session_id);
          resolve(applyServerActions(parseReply(json.result)));
        } catch (e) {
          reject(new Error(`claude saiu com código ${code}: ${(err || out || String(e)).slice(0, 300)}`));
        }
      });
      child.stdin.end(text);
    });

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/claude')) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (req.url === '/api/claude/status') return sendJson(res, 200, { available: exe !== null, model });
    if (req.method !== 'POST') return next();
    if (req.url === '/api/claude/reset') {
      saveSession(null);
      return sendJson(res, 200, { ok: true });
    }
    if (req.url !== '/api/claude') return next();
    if (!exe) return sendJson(res, 503, { message: 'Claude Code não encontrado neste computador' });
    if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado', code: 'face' });
    if (busy) return sendJson(res, 429, { message: 'Ainda processando a pergunta anterior' });

    try {
      const { text, context: client } = JSON.parse(await readBody(req)) as { text?: unknown; context?: ClientContext };
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
        return sendJson(res, 400, { message: 'Texto inválido' });
      }
      busy = true;
      const safeClient: ClientContext = client && typeof client === 'object' ? client : {};
      const question = await withFinanceContext(text.trim(), safeClient.visitor === true);
      const ctx = await context(safeClient);
      sendJson(res, 200, await ask(`${ctx}\n\n${question}`));
    } catch (e) {
      console.warn('[claude]', e);
      sendJson(res, 502, { message: e instanceof Error ? e.message : 'Falha ao falar com o Claude' });
    } finally {
      busy = false;
    }
  };

  return {
    name: 'jarvis-claude-bridge',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}
