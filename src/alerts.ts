import type { ProjectStatus, SystemInfo, WeatherInfo } from './info';
import type { VoiceStyle } from './lines';

/**
 * Alertas proativos: o JARVIS avisa sozinho de bateria baixa, CPU travada, projeto que caiu e chuva
 * chegando. Cada alerta tem um tempo de espera para não ficar repetindo. Puro, para poder testar.
 */

export interface AlertInput {
  system: SystemInfo | null;
  projects: ProjectStatus[] | null;
  weather: WeatherInfo | null;
  /** Date.now(). */
  now: number;
}

export interface Alert {
  id: string;
  /** Texto pronto para falar. */
  text: string;
}

const MIN = 60_000;

export const BATTERY_LOW = 20;
export const BATTERY_CRITICAL = 10;
export const CPU_HIGH = 90;
/** A CPU precisa ficar alta por todo esse tempo para avisar. */
export const CPU_HIGH_FOR_MS = MIN;
export const RAIN_HIGH = 70;

const COOLDOWN: Record<string, number> = {
  'battery-low': 30 * MIN,
  'battery-critical': 10 * MIN,
  'cpu-high': 15 * MIN,
  'rain-soon': 6 * 60 * MIN,
};
const PROJECT_COOLDOWN = 10 * MIN;

export class AlertEngine {
  private lastFired = new Map<string, number>();
  private cpuHighSince: number | null = null;
  private wasRunning = new Map<string, boolean>();

  constructor(private readonly style: () => VoiceStyle = () => 'br') {}

  private ready(id: string, now: number): boolean {
    const cooldown = id.startsWith('project-down:') ? PROJECT_COOLDOWN : COOLDOWN[id];
    const last = this.lastFired.get(id);
    return last === undefined || now - last >= cooldown;
  }

  private fire(out: Alert[], id: string, now: number, text: string): void {
    if (!this.ready(id, now)) return;
    this.lastFired.set(id, now);
    out.push({ id, text });
  }

  /** Chamado de tempos em tempos com o estado atual; devolve os alertas que devem ser falados agora. */
  check(input: AlertInput): Alert[] {
    const { system, projects, weather, now } = input;
    const uk = this.style() === 'uk';
    const out: Alert[] = [];

    if (system) {
      const { battery, charging, cpu } = system;
      if (battery !== null && charging === false) {
        if (battery <= BATTERY_CRITICAL) {
          this.fire(out, 'battery-critical', now, uk ? `Battery critical at ${battery} percent, sir. Please plug in the charger.` : `Bateria crítica, ${battery} por cento, senhor. Conecte o carregador.`);
        } else if (battery <= BATTERY_LOW) {
          this.fire(out, 'battery-low', now, uk ? `Battery at ${battery} percent, sir.` : `A bateria está em ${battery} por cento, senhor.`);
        }
      }
      if (cpu >= CPU_HIGH) {
        this.cpuHighSince ??= now;
        if (now - this.cpuHighSince >= CPU_HIGH_FOR_MS) {
          this.fire(out, 'cpu-high', now, uk ? `The processor has been at ${Math.round(cpu)} percent for a minute, sir.` : `O processador está em ${Math.round(cpu)} por cento há um minuto, senhor.`);
        }
      } else {
        this.cpuHighSince = null;
      }
    }

    if (projects) {
      for (const p of projects) {
        if (p.running === null) continue;
        // Só avisa se ele estava no ar e caiu: projeto que nunca subiu não é novidade
        if (this.wasRunning.get(p.id) === true && p.running === false) {
          this.fire(out, `project-down:${p.id}`, now, uk ? `${p.name} has gone offline, sir.` : `O ${p.name} saiu do ar, senhor.`);
        }
        this.wasRunning.set(p.id, p.running);
      }
    }

    if (weather && weather.rainChance >= RAIN_HIGH) {
      this.fire(out, 'rain-soon', now, uk ? `There's a ${weather.rainChance} percent chance of rain today, sir. You may want an umbrella.` : `Há ${weather.rainChance} por cento de chance de chuva hoje, senhor. Talvez seja bom levar um guarda-chuva.`);
    }
    return out;
  }
}
