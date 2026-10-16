import { describe, expect, it } from 'vitest';
import { parseClock, parseDuration, parseTimeRequest, reminderText } from './when';

// Segunda, 12/10/2026, 14:00 (hora local)
const NOW = new Date(2026, 9, 12, 14, 0, 0);
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m, 0).getTime();

describe('parseDuration', () => {
  it.each([
    ['25 minutos', 25 * 60_000],
    ['1 hora e 30 minutos', 90 * 60_000],
    ['meia hora', 30 * 60_000],
    ['uma hora e meia', 90 * 60_000],
    ['duas horas', 2 * 3_600_000],
    ['30 segundos', 30_000],
    ['dez minutos', 10 * 60_000],
  ])('"%s"', (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it('devolve null sem duração', () => {
    expect(parseDuration('timer')).toBeNull();
  });
});

describe('parseClock', () => {
  it.each([
    ['às 19h', at(12, 19)],
    ['às 19:30', at(12, 19, 30)],
    ['às 19h30', at(12, 19, 30)],
    ['às 7 da noite', at(12, 19)],
    ['às 7 e meia da noite', at(12, 19, 30)],
    ['amanhã às 8', at(13, 8)],
    ['às 9', at(13, 9)], // 9h já passou hoje: é amanhã
    ['ao meio-dia', at(13, 12)],
  ])('"%s"', (text, expected) => {
    expect(parseClock(text, NOW)).toBe(expected);
  });

  it('não lê "daqui a 10 minutos" como "às 10"', () => {
    expect(parseClock('daqui a 10 minutos', NOW)).toBeNull();
  });
});

describe('reminderText', () => {
  it.each([
    ['Jarvis, me lembra de beber água daqui a 10 minutos', 'beber água'],
    ['me lembra de estudar às 19h', 'estudar'],
    ['me avisa daqui a meia hora para tirar o bolo do forno', 'tirar o bolo do forno'],
    ['lembrete amanhã às 8 da manhã de pagar a conta de luz', 'pagar a conta de luz'],
  ])('"%s" → "%s"', (text, expected) => {
    expect(reminderText(text)).toBe(expected);
  });
});

describe('parseTimeRequest', () => {
  it('timer', () => {
    expect(parseTimeRequest('Jarvis, timer de 25 minutos', NOW)).toEqual({ kind: 'timer', ms: 25 * 60_000 });
    expect(parseTimeRequest('coloca um timer de 10 minutos para o bolo', NOW)).toEqual({ kind: 'timer', ms: 10 * 60_000 });
  });

  it('alarme com hora', () => {
    expect(parseTimeRequest('alarme às 7 da manhã', NOW)).toEqual({ kind: 'reminder', text: 'Alarme', dueAt: at(13, 7) });
  });

  it('lembretes com hora fixa e relativa', () => {
    expect(parseTimeRequest('me lembra de estudar às 19h', NOW)).toEqual({ kind: 'reminder', text: 'Estudar', dueAt: at(12, 19) });
    expect(parseTimeRequest('me lembra de beber água daqui a 10 minutos', NOW)).toEqual({
      kind: 'reminder',
      text: 'Beber água',
      dueAt: NOW.getTime() + 10 * 60_000,
    });
  });

  it('ignora pedidos sem hora, listas e cancelamentos', () => {
    expect(parseTimeRequest('me lembra de estudar', NOW)).toBeNull();
    expect(parseTimeRequest('quais são meus lembretes', NOW)).toBeNull();
    expect(parseTimeRequest('cancela o timer', NOW)).toBeNull();
    expect(parseTimeRequest('qual é a capital da França', NOW)).toBeNull();
  });
});
