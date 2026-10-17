/** "uk" = estilo do filme (inglês britânico); "br" = português. */
export type VoiceStyle = 'uk' | 'br';

export function greeting(date = new Date(), style: VoiceStyle = 'br'): string {
  const h = date.getHours();
  const period = h < 5 || h >= 18 ? 2 : h < 12 ? 0 : 1;
  return (style === 'uk' ? ['Good morning', 'Good afternoon', 'Good evening'] : ['Bom dia', 'Boa tarde', 'Boa noite'])[period];
}

export interface Lines {
  online: (g: string) => string;
  hello: (g: string) => string;
  wakeAck: string[];
  hands: string[];
  who: string;
  study: string[];
  mute: string;
  unmute: string;
  micOn: string;
  micOff: string;
  styleChanged: string;
  statusError: string;
  weatherError: string;
  timerSet: (duration: string) => string;
  reminderSet: (text: string, when: string) => string;
  timerDone: string;
  reminderDue: (text: string) => string;
  reminderPrivate: string;
  timerCancelled: string;
  reminderCancelled: (text: string) => string;
  nothingToCancel: string;
  remindersError: string;
  lookStart: string[];
  lookFound: (label: string) => string;
  lookMany: (labels: string) => string;
  lookNothing: string;
  lookUnavailable: string;
  moodRead: (word: string) => string;
  moodUnseen: string;
  screensTaking: string;
  mouseOn: string;
  mouseOff: string;
  standbyOn: string;
  standbyOff: string;
  nothingToRepeat: string;
  learnStart: string;
  learnDone: (phrase: string) => string;
  learnKnown: (pose: string) => string;
  learnFail: string;
  gesturesList: (learned: string[]) => string;
  gestureForgotten: (n: number) => string;
  gestureNotFound: string;
  screensTaken: (n: number) => string;
  screensNone: string;
  screensReleased: string;
  welcomeBackMissed: (n: number) => string;
  visitor: string;
  privateNow: string;
  claudeOn: string;
  claudeOff: string;
  claudeThinking: string[];
  claudeBusy: string;
  claudeError: string;
  claudeUnavailable: string;
  unknownNoClaude: string;
  identifying: string;
  welcomeBack: string;
  faceUnknown: string;
  notEnrolled: string;
  enrollStart: string;
  enrollDone: string;
  enrollFail: string;
  enrollDenied: string;
  faceForgotten: string;
  locked: string;
  lockedNotEnrolled: string;
  opening: (name: string) => string;
  focusing: (name: string) => string;
  confirmRun: (name: string) => string;
  runningProject: (name: string) => string;
  cancelled: string;
  actionFailed: string;
  spotifyPlaying: (name: string, artist: string) => string;
  spotifyNow: (name: string, artist: string) => string;
  spotifyPaused: string;
  spotifyResumed: string;
  spotifyNext: string;
  spotifyPrevious: string;
  spotifyVolume: (volume: number) => string;
  spotifyNothing: string;
  spotifyNotConfigured: string;
  spotifyNotConnected: string;
  spotifyNotFound: (query: string) => string;
  spotifyNoDevice: string;
  spotifyPremium: string;
  janusOffline: string;
  janusError: string;
  newsError: string;
  newsNone: string;
  windowOp: (op: 'left' | 'right' | 'maximize' | 'minimize', name: string) => string;
  windowNotFound: string;
}

export const LINES: Record<VoiceStyle, Lines> = {
  uk: {
    online: () => 'Welcome home, sir. All systems online.',
    hello: (g) => `${g}, sir. How may I help?`,
    wakeAck: ['Yes, sir?', 'At your service.', 'Sir?'],
    hands: ['Hands detected.', 'Hand tracking online, sir.'],
    who: 'I am JARVIS. Just A Rather Very Intelligent System. At your service, sir.',
    study: [
      'Studying for Unesp, sir. Natural Sciences and Mathematics, if I may.',
      "If I may, sir: a Cramer's rule exercise would be most welcome right now.",
      'Linear systems and meiosis, sir. Shall I set a 25 minute timer?',
    ],
    mute: 'As you wish. Going silent.',
    unmute: 'Voice restored, sir.',
    micOn: 'Listening, sir. Say "Jarvis" before each request.',
    micOff: 'Microphone off.',
    styleChanged: 'Very well, sir. Back to my usual voice.',
    statusError: "I couldn't read the system status, sir.",
    weatherError: "I couldn't get the weather forecast, sir.",
    timerSet: (d) => `Timer set for ${d}, sir.`,
    reminderSet: (text, when) => `Very well. I'll remind you to ${text} ${when}.`,
    timerDone: 'Sir, your timer is done.',
    reminderDue: (text) => `Sir, a reminder: ${text}.`,
    reminderPrivate: 'Sir, one of your reminders is due.',
    timerCancelled: 'Timer cancelled, sir.',
    reminderCancelled: (text) => `Reminder "${text}" cancelled.`,
    nothingToCancel: 'There is nothing to cancel, sir.',
    remindersError: "I couldn't reach the reminders, sir.",
    lookStart: ['Let me take a look.', 'One moment, sir.'],
    lookFound: (label) => `That appears to be ${label}, sir.`,
    lookMany: (labels) => `I can see ${labels}.`,
    lookNothing: "I can't make it out, sir. Try holding it closer to the camera.",
    lookUnavailable: "Object recognition didn't load, sir.",
    moodRead: (w) => `Judging by your expression, sir, you look ${w}.`,
    moodUnseen: "I can't see your face right now, sir.",
    screensTaking: 'Taking over the other screens, sir.',
    mouseOn: 'Air mouse engaged. Close your fist to stop, sir.',
    mouseOff: 'Air mouse off.',
    standbyOn: 'Goodbye for now, sir.',
    standbyOff: 'Welcome back, sir.',
    nothingToRepeat: "I haven't said anything yet, sir.",
    learnStart: 'Show me the gesture and hold it still, sir.',
    learnDone: (p) => `Gesture learned. When I see it, I'll ${p}.`,
    learnKnown: (pose) => `I already know that one, sir: it's ${pose}. Try another pose.`,
    learnFail: "I couldn't see your hand clearly, sir. Let's try again.",
    gesturesList: (l) =>
      `I know: point, pinch, thumbs up, open palm, two palms to stop everything, finger on lips for silence, hand behind the ear, waving, thumb on the chest, rock and call signs, two fingers and three fingers swipes${l.length ? `, plus the ones you taught me: ${l.join(', ')}` : ''}.`,
    gestureForgotten: (n) => (n === 1 ? 'Gesture forgotten, sir.' : `${n} gestures forgotten, sir.`),
    gestureNotFound: "I don't know that gesture, sir.",
    screensTaken: (n) => (n === 1 ? 'The control panel is up on the other monitor.' : `The control panel is up on ${n} monitors.`),
    screensNone: "There's only one monitor connected, sir.",
    screensReleased: 'Screens released, sir.',
    welcomeBackMissed: (n) => `Welcome back, sir. ${n === 1 ? 'One reminder' : `${n} reminders`} went off while you were away.`,
    visitor: 'I see someone else, sir. Personal data hidden.',
    privateNow: "There's someone else here, sir. I'd rather not discuss that right now.",
    claudeOn: 'Connection to Claude established, sir.',
    claudeOff: 'Claude disconnected. Running on local commands only.',
    claudeThinking: ['One moment, sir.', 'Processing, sir.', 'Let me think, sir.'],
    claudeBusy: 'Still working on your previous question, sir.',
    claudeError: "I couldn't reach Claude, sir.",
    claudeUnavailable: "Claude Code isn't installed on this computer, sir.",
    unknownNoClaude: "I didn't catch that, sir. Claude is disconnected, so I only know my basic commands.",
    identifying: 'All systems online. Identifying, sir.',
    welcomeBack: 'Welcome home, sir.',
    faceUnknown: 'Face not recognised. Restricted access.',
    notEnrolled: "Welcome, sir. I don't know your face yet: say 'cadastrar meu rosto' to enable recognition.",
    enrollStart: 'Look at the camera and slowly turn your head from side to side, sir.',
    enrollDone: 'Face registered, sir. From now on, only you unlock the sensitive features.',
    enrollFail: "I couldn't see your face clearly, sir. Please try again with more light.",
    enrollDenied: 'Only the owner can replace the registered face, sir.',
    faceForgotten: 'Facial profile deleted, sir.',
    locked: 'Access restricted, sir. I need to confirm your identity first.',
    lockedNotEnrolled: "Access restricted, sir. Register your face first: say 'cadastrar meu rosto'.",
    opening: (name) => `Opening ${name}, sir.`,
    focusing: (name) => `Bringing up ${name}.`,
    confirmRun: (name) => `Shall I start ${name}, sir?`,
    runningProject: (name) => `Starting ${name}. The terminal window is open.`,
    cancelled: 'Cancelled, sir.',
    actionFailed: "I'm afraid that didn't work, sir.",
    spotifyPlaying: (name, artist) => `Playing ${name}, by ${artist}.`,
    spotifyNow: (name, artist) => `This is ${name}, by ${artist}.`,
    spotifyPaused: 'Paused, sir.',
    spotifyResumed: 'Resuming.',
    spotifyNext: 'Next track.',
    spotifyPrevious: 'Going back one track.',
    spotifyVolume: (v) => `Volume at ${v} percent.`,
    spotifyNothing: "Nothing's playing right now, sir.",
    spotifyNotConfigured: "Spotify isn't set up yet, sir. The instructions are in the terminal.",
    spotifyNotConnected: 'Please connect your Spotify account first, sir: the Spotify button, in the corner.',
    spotifyNotFound: (q) => `I couldn't find ${q}, sir.`,
    spotifyNoDevice: "I couldn't find Spotify open on any device, sir.",
    spotifyPremium: 'Spotify requires a Premium account for that, sir.',
    janusOffline: 'janus is offline, sir. Shall I start it?',
    janusError: "I couldn't read the finances from janus, sir.",
    newsError: "I couldn't fetch the news, sir.",
    newsNone: 'I found no news on that, sir.',
    windowOp: (op, name) =>
      ({
        left: `Moving ${name} to the left monitor.`,
        right: `Moving ${name} to the other monitor.`,
        maximize: `Maximising ${name}.`,
        minimize: `Minimising ${name}.`,
      })[op],
    windowNotFound: "I couldn't find that window open, sir.",
  },
  br: {
    online: () => 'Bem-vindo, senhor. Todos os sistemas online.',
    hello: (g) => `${g}, senhor. Em que posso ajudar?`,
    wakeAck: ['Pois não, senhor?', 'Sim, senhor?', 'Às ordens.'],
    hands: ['Mãos detectadas.', 'Rastreamento das mãos ativo, senhor.'],
    who: 'Eu sou o JARVIS. Just A Rather Very Intelligent System. Ao seu dispor, senhor.',
    study: [
      'Estudando para a Unesp, senhor. Ciências da Natureza e Matemática, se me permite a sugestão.',
      'Se me permite, senhor: uma questão de regra de Cramer cairia muito bem agora.',
      'Sistemas lineares e meiose, senhor. Quer que eu marque um timer de 25 minutos?',
    ],
    mute: 'Como quiser. Modo silencioso.',
    unmute: 'Voz reativada, senhor.',
    micOn: 'Estou ouvindo, senhor. Diga "Jarvis" antes de cada pedido.',
    micOff: 'Microfone desligado.',
    styleChanged: 'Como quiser, senhor. Falando em português.',
    statusError: 'Não consegui ler o estado do computador, senhor.',
    weatherError: 'Não consegui a previsão do tempo, senhor.',
    timerSet: (d) => `Timer de ${d} iniciado, senhor.`,
    reminderSet: (text, when) => `Combinado. Vou lembrar o senhor de ${text} ${when}.`,
    timerDone: 'Senhor, o timer terminou.',
    reminderDue: (text) => `Senhor, lembrete: ${text}.`,
    reminderPrivate: 'Senhor, um dos seus lembretes venceu.',
    timerCancelled: 'Timer cancelado, senhor.',
    reminderCancelled: (text) => `Lembrete "${text}" cancelado.`,
    nothingToCancel: 'Não há nada para cancelar, senhor.',
    remindersError: 'Não consegui acessar os lembretes, senhor.',
    lookStart: ['Deixe-me ver.', 'Um momento, senhor.'],
    lookFound: (label) => `Parece ser ${label}, senhor.`,
    lookMany: (labels) => `Estou vendo ${labels}.`,
    lookNothing: 'Não consegui identificar, senhor. Aproxime o objeto da câmera.',
    lookUnavailable: 'O reconhecimento de objetos não carregou, senhor.',
    moodRead: (w) => `Pela sua expressão, o senhor parece ${w}.`,
    moodUnseen: 'Não consigo ver seu rosto agora, senhor.',
    screensTaking: 'Assumindo as outras telas, senhor.',
    mouseOn: 'Mouse no ar ativado. Feche a mão para sair, senhor.',
    mouseOff: 'Mouse no ar desligado.',
    standbyOn: 'Até logo, senhor.',
    standbyOff: 'De volta, senhor.',
    nothingToRepeat: 'Ainda não falei nada, senhor.',
    learnStart: 'Mostre o gesto e segure parado, senhor.',
    learnDone: (p) => `Gesto aprendido. Quando eu vir esse gesto, vou ${p}.`,
    learnKnown: (pose) => `Essa eu já conheço, senhor: é ${pose}. Tente outra pose.`,
    learnFail: 'Não vi sua mão direito, senhor. Vamos tentar de novo.',
    gesturesList: (l) =>
      `Conheço: apontar, pinça, joinha, palma aberta, duas palmas para parar tudo, dedo nos lábios para silêncio, mão na orelha, aceno, polegar no peito, rock, telefone, e deslizar com dois ou três dedos${l.length ? `. E os que o senhor me ensinou: ${l.join(', ')}` : ''}.`,
    gestureForgotten: (n) => (n === 1 ? 'Gesto esquecido, senhor.' : `${n} gestos esquecidos, senhor.`),
    gestureNotFound: 'Não conheço esse gesto, senhor.',
    screensTaken: (n) => (n === 1 ? 'Painel de controle no outro monitor.' : `Painel de controle em ${n} monitores.`),
    screensNone: 'Só há um monitor conectado, senhor.',
    screensReleased: 'Telas liberadas, senhor.',
    welcomeBackMissed: (n) => `Bem-vindo de volta, senhor. ${n === 1 ? 'Um lembrete venceu' : `${n} lembretes venceram`} enquanto o senhor estava fora.`,
    visitor: 'Detectei outra pessoa, senhor. Ocultei os dados pessoais.',
    privateNow: 'Há outra pessoa aqui, senhor. Prefiro não falar disso agora.',
    claudeOn: 'Conexão com o Claude estabelecida, senhor.',
    claudeOff: 'Claude desconectado. Operando apenas com comandos locais.',
    claudeThinking: ['Um momento, senhor.', 'Processando, senhor.', 'Deixe-me pensar, senhor.'],
    claudeBusy: 'Ainda estou processando a pergunta anterior, senhor.',
    claudeError: 'Não consegui falar com o Claude, senhor.',
    claudeUnavailable: 'O Claude Code não está instalado neste computador, senhor.',
    unknownNoClaude: 'Não entendi, senhor. O Claude está desligado, então só conheço meus comandos básicos.',
    identifying: 'Sistemas online. Identificando, senhor.',
    welcomeBack: 'Bem-vindo de volta, senhor.',
    faceUnknown: 'Rosto não identificado. Recursos restritos.',
    notEnrolled: 'Bem-vindo, senhor. Ainda não conheço seu rosto: diga "cadastrar meu rosto" para ativar o reconhecimento.',
    enrollStart: 'Olhe para a câmera e vire o rosto devagar para os lados, senhor.',
    enrollDone: 'Rosto registrado, senhor. A partir de agora, só o senhor libera os recursos sensíveis.',
    enrollFail: 'Não consegui ver seu rosto direito, senhor. Tente de novo com mais luz.',
    enrollDenied: 'Apenas o dono pode trocar o rosto cadastrado, senhor.',
    faceForgotten: 'Perfil facial apagado, senhor.',
    locked: 'Recurso bloqueado, senhor. Preciso confirmar sua identidade primeiro.',
    lockedNotEnrolled: 'Recurso bloqueado, senhor. Primeiro cadastre seu rosto: diga "cadastrar meu rosto".',
    opening: (name) => `Abrindo o ${name}, senhor.`,
    focusing: (name) => `Trazendo o ${name} para a frente.`,
    confirmRun: (name) => `Devo iniciar o ${name}, senhor?`,
    runningProject: (name) => `Iniciando o ${name}. A janela do terminal já está aberta.`,
    cancelled: 'Cancelado, senhor.',
    actionFailed: 'Não consegui fazer isso, senhor.',
    spotifyPlaying: (name, artist) => `Tocando ${name}, de ${artist}.`,
    spotifyNow: (name, artist) => `Está tocando ${name}, de ${artist}.`,
    spotifyPaused: 'Pausado, senhor.',
    spotifyResumed: 'Retomando.',
    spotifyNext: 'Próxima.',
    spotifyPrevious: 'Voltando uma música.',
    spotifyVolume: (v) => `Volume em ${v} por cento.`,
    spotifyNothing: 'Não há nada tocando agora, senhor.',
    spotifyNotConfigured: 'O Spotify ainda não está configurado, senhor. As instruções estão no terminal.',
    spotifyNotConnected: 'Conecte sua conta do Spotify primeiro, senhor: botão Spotify, no canto da tela.',
    spotifyNotFound: (q) => `Não encontrei ${q}, senhor.`,
    spotifyNoDevice: 'Não encontrei o Spotify aberto em nenhum aparelho, senhor.',
    spotifyPremium: 'O Spotify exige conta Premium para isso, senhor.',
    janusOffline: 'O janus está desligado, senhor. Quer que eu o inicie?',
    janusError: 'Não consegui ler as finanças do janus, senhor.',
    newsError: 'Não consegui buscar as notícias, senhor.',
    newsNone: 'Não encontrei notícias sobre isso, senhor.',
    windowOp: (op, name) =>
      ({
        left: `Movendo o ${name} para o monitor da esquerda.`,
        right: `Movendo o ${name} para o outro monitor.`,
        maximize: `Maximizando o ${name}.`,
        minimize: `Minimizando o ${name}.`,
      })[op],
    windowNotFound: 'Não encontrei essa janela aberta, senhor.',
  },
};
