export type LogKind = 'info' | 'heard' | 'cmd' | 'warn' | 'error' | 'jarvis' | 'thinking';

const MAX_LINES = 60;

/** Terminal na tela com tudo o que o microfone ouviu e o que o JARVIS fez com isso. */
export class VoiceTerminal {
  private readonly list: HTMLUListElement;
  private readonly level: HTMLDivElement;
  private readonly state: HTMLSpanElement;
  private interimLine: HTMLLIElement | null = null;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <div class="term-head">
        <span class="term-state">MICROFONE DESLIGADO</span>
        <div class="term-meter"><div class="term-level"></div></div>
        <span class="term-hint">T: ocultar</span>
      </div>
      <ul class="term-lines"></ul>
      <form class="term-input">
        <span>&gt;</span>
        <input type="text" maxlength="500" placeholder="Digite para o JARVIS e aperte Enter" aria-label="Mensagem para o JARVIS" />
      </form>`;
    this.list = root.querySelector('.term-lines')!;
    this.level = root.querySelector('.term-level')!;
    this.state = root.querySelector('.term-state')!;
  }

  /** Chamado quando o usuário digita uma frase e aperta Enter. */
  onSubmit(handler: (text: string) => void): void {
    const form = this.root.querySelector('form')!;
    const input = form.querySelector('input')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      input.value = '';
      if (text) handler(text);
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  setVisible(value: boolean): void {
    this.root.hidden = !value;
  }

  setListening(on: boolean): void {
    this.root.classList.toggle('listening', on);
    this.state.textContent = on ? '● OUVINDO' : 'MICROFONE DESLIGADO';
    if (!on) {
      this.setLevel(0);
      this.clearInterim();
    }
  }

  /** Volume do microfone, de 0 a 1. */
  setLevel(value: number): void {
    this.level.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  }

  log(kind: LogKind, text: string): void {
    this.clearInterim();
    this.append(kind, text);
  }

  /** Texto parcial enquanto a pessoa ainda está falando (substitui a linha anterior). */
  interim(text: string): void {
    if (!this.interimLine) this.interimLine = this.append('interim', '');
    this.interimLine.querySelector('.term-text')!.textContent = `… ${text}`;
    this.scroll();
  }

  private clearInterim(): void {
    this.interimLine?.remove();
    this.interimLine = null;
  }

  private append(kind: LogKind | 'interim', text: string): HTMLLIElement {
    const li = document.createElement('li');
    li.className = kind;
    const time = document.createElement('span');
    time.className = 'term-time';
    time.textContent = new Date().toLocaleTimeString('pt-BR');
    const body = document.createElement('span');
    body.className = 'term-text';
    body.textContent = text;
    li.append(time, body);
    this.list.append(li);
    while (this.list.children.length > MAX_LINES) this.list.firstElementChild!.remove();
    this.scroll();
    return li;
  }

  private scroll(): void {
    this.list.scrollTop = this.list.scrollHeight;
  }
}

/** Mede o volume do microfone, para mostrar que ele está captando som. */
export class MicLevel {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Float32Array<ArrayBuffer> | null = null;

  /** Passa a medir o volume deste microfone (e passa a ser dono dele: `stop()` o desliga). */
  async start(stream: MediaStream): Promise<void> {
    this.stop();
    this.stream = stream;
    this.context = new AudioContext();
    // Criado fora de um clique, o AudioContext nasce suspenso e o medidor ficaria parado em zero
    await this.context.resume();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 512;
    this.context.createMediaStreamSource(this.stream).connect(this.analyser);
    this.data = new Float32Array(this.analyser.fftSize);
  }

  level(): number {
    if (!this.analyser || !this.data) return 0;
    this.analyser.getFloatTimeDomainData(this.data);
    let sum = 0;
    for (const v of this.data) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.data.length) * 6);
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.context?.close();
    this.stream = null;
    this.context = null;
    this.analyser = null;
    this.data = null;
  }
}
