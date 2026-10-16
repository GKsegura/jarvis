import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { WeatherInfo } from '../src/info';
import { readConfigText } from './config-file';
import { isLocalRequest, sendJson } from './http';

export interface WeatherPlace {
  name: string;
  latitude: number;
  longitude: number;
}

export const DEFAULT_PLACE: WeatherPlace = { name: 'São Paulo', latitude: -23.55, longitude: -46.63 };
const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 5000;
const HOURS_AHEAD = 12;

/** Local do clima no jarvis.config.json ("weather"); sem ele, São Paulo. */
export function readPlace(root: string): WeatherPlace {
  try {
    const w = (JSON.parse(readConfigText(root)) as { weather?: Partial<WeatherPlace> }).weather;
    if (w && typeof w.name === 'string' && Number.isFinite(w.latitude) && Number.isFinite(w.longitude)) {
      return { name: w.name, latitude: w.latitude!, longitude: w.longitude! };
    }
  } catch {
    /* usa o padrão */
  }
  return DEFAULT_PLACE;
}

export function forecastUrl(p: WeatherPlace): string {
  const params = new URLSearchParams({
    latitude: String(p.latitude),
    longitude: String(p.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '2',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

interface OpenMeteo {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: Array<number | null>; weather_code: number[] };
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[] };
}

/** Converte a resposta do Open-Meteo no que o painel CLIMA mostra. As horas vêm no fuso do local. */
export function buildWeather(data: OpenMeteo, place: string): WeatherInfo {
  const c = data.current;
  const currentHour = c.time.slice(0, 13); // "2026-10-12T14"
  const today = c.time.slice(0, 10);
  let start = data.hourly.time.findIndex((t) => t.slice(0, 13) === currentHour);
  if (start < 0) start = 0;
  const hours = data.hourly.time.slice(start + 1, start + 1 + HOURS_AHEAD).map((t, i) => ({
    hour: Number(t.slice(11, 13)),
    temp: data.hourly.temperature_2m[start + 1 + i],
    rain: data.hourly.precipitation_probability[start + 1 + i] ?? 0,
    code: data.hourly.weather_code[start + 1 + i],
  }));
  // Chance de chuva no resto de hoje
  const rest = data.hourly.time
    .map((t, i) => ({ t, rain: data.hourly.precipitation_probability[i] ?? 0 }))
    .filter(({ t }) => t.slice(0, 10) === today && t.slice(0, 13) >= currentHour);
  return {
    place,
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    wind: c.wind_speed_10m,
    code: c.weather_code,
    isDay: c.is_day === 1,
    max: data.daily.temperature_2m_max[0],
    min: data.daily.temperature_2m_min[0],
    rainChance: Math.max(0, ...rest.map((r) => r.rain)),
    hours,
  };
}

let cache: { key: string; at: number; data: WeatherInfo } | null = null;

/** Tempo agora (Open-Meteo, grátis e sem chave), com cache de 10 minutos. */
export async function getWeather(root: string): Promise<WeatherInfo> {
  const place = readPlace(root);
  const key = `${place.latitude},${place.longitude}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.data;
  const r = await fetch(forecastUrl(place), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const data = buildWeather((await r.json()) as OpenMeteo, place.name);
  cache = { key, at: Date.now(), data };
  return data;
}

export function weather(root: string): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== '/api/weather') return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    try {
      return sendJson(res, 200, await getWeather(root));
    } catch (e) {
      return sendJson(res, 502, { message: e instanceof Error ? e.message : 'Falha no clima' });
    }
  };
  return {
    name: 'jarvis-weather',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}
