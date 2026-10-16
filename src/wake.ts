/**
 * Palavra de ativação. O reconhecimento de voz do Chrome escreve "Jarvis" de vários jeitos:
 * "jarvis", "jarves", "jarbas", "javis", "jervis"...
 */
const WAKE = /^\s*(?:(?:ei|hey|oi|ok|o|e)[\s,]+)?(?:jarvis|jarves|jarvas|jarbas|javis|jervis|jarviz|djarvis|giavis|jarbis)\b[\s,.!?:;-]*/i;

/**
 * Se a frase começa com "Jarvis", devolve o resto (pode ser "" quando ele só foi chamado).
 * Se não começa, devolve null.
 */
export function stripWake(text: string): string | null {
  const m = text.match(WAKE);
  return m ? text.slice(m[0].length).trim() : null;
}

/** Depois de cada resposta, por quanto tempo dá para continuar falando sem repetir "Jarvis". */
export const FOLLOW_UP_MS = 8000;
