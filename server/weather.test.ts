import { describe, expect, it } from 'vitest';
import { buildWeather, DEFAULT_PLACE, forecastUrl, readPlace } from './weather';

const hourly = (from: number, n: number) => Array.from({ length: n }, (_, i) => `2026-10-12T${String(from + i).padStart(2, '0')}:00`);

describe('buildWeather', () => {
  it('pega o tempo agora, as próximas horas e a maior chance de chuva do resto do dia', () => {
    const times = [...hourly(0, 24), '2026-10-13T00:00'];
    const w = buildWeather(
      {
        current: { time: '2026-10-12T14:15', temperature_2m: 24.4, apparent_temperature: 26, relative_humidity_2m: 60, weather_code: 2, wind_speed_10m: 9, is_day: 1 },
        hourly: {
          time: times,
          temperature_2m: times.map((_, i) => 10 + i),
          // Chuva de 90% às 10h (já passou) não conta; 40% às 18h conta; 100% amanhã não conta
          precipitation_probability: times.map((t) => (t.endsWith('T10:00') ? 90 : t.endsWith('T18:00') ? 40 : t.startsWith('2026-10-13') ? 100 : 5)),
          weather_code: times.map(() => 3),
        },
        daily: { temperature_2m_max: [28], temperature_2m_min: [17] },
      },
      'São Paulo',
    );
    expect(w).toMatchObject({ place: 'São Paulo', temp: 24.4, feels: 26, code: 2, isDay: true, max: 28, min: 17, rainChance: 40 });
    // Até 12 horas à frente (aqui o dado acaba à meia-noite)
    expect(w.hours.map((h) => h.hour)).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23, 0]);
    expect(w.hours[0].temp).toBe(25);
  });
});

describe('local do clima', () => {
  it('lê o jarvis.config.json e monta a URL do Open-Meteo', () => {
    const place = readPlace(process.cwd());
    expect(place.name).toBeTruthy();
    expect(forecastUrl(DEFAULT_PLACE)).toContain('latitude=-23.55');
    expect(readPlace('/pasta/que/nao/existe')).toEqual(DEFAULT_PLACE);
  });
});
