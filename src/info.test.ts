import { describe, expect, it } from 'vitest';
import { daySummarySpeech, type Reminder, type WeatherInfo } from './info';

const NOW = new Date(2026, 9, 12, 14, 0);
const weather: WeatherInfo = { place: 'Bauru', temp: 29.6, feels: 31, humidity: 50, wind: 5, code: 2, isDay: true, max: 31, min: 19, rainChance: 70, hours: [] };
const reminder = (text: string, h: number, day = 12): Reminder => ({
  id: text,
  text,
  dueAt: new Date(2026, 9, day, h, 0).getTime(),
  kind: 'reminder',
  done: false,
  createdAt: 0,
});

describe('daySummarySpeech', () => {
  it('junta hora, clima, lembretes de hoje e projetos', () => {
    const text = daySummarySpeech({
      now: NOW,
      greeting: 'Boa tarde',
      weather,
      reminders: [reminder('Estudar', 19), reminder('Dentista', 9, 13)],
      projects: [
        { id: 'janus', name: 'janus', running: true },
        { id: 'cronos', name: 'CRONOS', running: false },
      ],
      personal: true,
    });
    expect(text).toContain('Boa tarde, senhor. São 14:00.');
    expect(text).toContain('Em Bauru, 30 graus e parcialmente nublado');
    expect(text).toContain('70 por cento de chance de chuva');
    expect(text).toContain('Ainda hoje: Estudar às 19:00.');
    // Lembrete de amanhã não entra no resumo de hoje
    expect(text).not.toContain('Dentista');
    expect(text).toContain('janus está no ar');
  });

  it('com visita na câmera, deixa os lembretes de fora', () => {
    const text = daySummarySpeech({ now: NOW, greeting: 'Boa tarde', weather: null, reminders: [reminder('Estudar', 19)], projects: null, personal: false });
    expect(text).toBe('Boa tarde, senhor. São 14:00.');
  });
});

describe('daySummarySpeech com notícias', () => {
  const base = { now: new Date(2026, 9, 12, 8, 0), greeting: 'Bom dia', weather: null, reminders: null, projects: null, personal: false };

  it('fecha o resumo com as duas primeiras manchetes', () => {
    const text = daySummarySpeech({ ...base, news: [{ title: 'Primeira - G1' }, { title: 'Segunda' }, { title: 'Terceira' }] });
    expect(text).toContain('Nas notícias: Primeira. Segunda.');
    expect(text).not.toContain('Terceira');
  });

  it('não menciona notícias quando não há', () => {
    expect(daySummarySpeech({ ...base, news: [] })).not.toContain('notícias');
    expect(daySummarySpeech(base)).not.toContain('notícias');
  });
});
