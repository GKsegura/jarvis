# J.A.R.V.I.S.

Assistente pessoal estilo JARVIS no navegador, com dados reais do seu computador. No centro fica o **núcleo de voz**, que reage quando você fala e quando ele responde. Nas laterais ficam painéis com o estado do PC, o clima, os seus projetos, os lembretes e o Spotify. A webcam rastreia as mãos e o rosto (MediaPipe e face-api), e o JARVIS fala com você, obedece comandos de voz e, com o Claude, conversa sabendo o que está acontecendo.

> Projeto pessoal, feito para **Windows**. Roda 100% no seu computador. Licença [MIT](LICENSE).

## Sumário

[Requisitos](#requisitos) • [Instalação](#instalação) • [Como abrir](#como-abrir) • [Configuração](#configuração) • [Funcionalidades](#o-que-funciona-sem-configurar-nada) • [Voz do Jarvis](#voz-do-jarvis-dublado-fishaudio) • [Privacidade](#presença-e-privacidade) • [Problemas comuns](#problemas-comuns) • [Versões](#versões-e-contribuição)

## Requisitos

| Item | Detalhe |
| --- | --- |
| Sistema | **Windows 10 ou 11**. Janelas, mouse, volume e telas usam PowerShell e atalhos do Windows |
| Node.js | **20 ou superior** (`node -v`) |
| Navegador | **Google Chrome** (Opera, Brave e o navegador do VS Code não fazem reconhecimento de voz) |
| Hardware | Webcam e microfone. Mais de um monitor é opcional (recurso "todas as telas") |
| Internet | Reconhecimento de voz do Chrome (o áudio passa pelo Google), clima (Open-Meteo) e download único dos modelos de mãos, rosto e objetos |

Opcionais, cada um liga um recurso (veja [Configuração](#configuração)):

| Recurso | Precisa de |
| --- | --- |
| Conversar com o Claude | [Claude Code](https://claude.com/claude-code) instalado e logado (usa a cota do seu plano, sem chave de API) |
| Voz do Jarvis dublado | Conta no [fish.audio](https://fish.audio) (chave de API + ID da voz) |
| Spotify | Conta **Premium** e um app grátis no Spotify for Developers (Client ID) |
| Finanças | O [janus](https://github.com/GKsegura/janus) (app de finanças do autor) rodando; o JARVIS só lê |

## Instalação

```powershell
git clone https://github.com/GKsegura/jarvis.git
cd jarvis
npm install
copy .env.example .env
copy jarvis.config.example.json jarvis.config.json
```

O `.env` e o `jarvis.config.json` são **seus**: ficam fora do git. Edite o `jarvis.config.json` com a sua cidade, seus apps e seus projetos (veja [Configuração](#configuração)); sem ele, o JARVIS usa o `jarvis.config.example.json`. O `.env` começa vazio e tudo nele é opcional: sem preencher nada, o JARVIS já funciona com a voz do navegador, gestos, rosto, painéis, timers e lembretes.

## Como abrir

**Dois cliques no `JARVIS.bat`.** Ele sobe o servidor e abre o JARVIS no Google Chrome em modo app (janela própria, sem barra de endereço, com som liberado). Na primeira vez, permita a câmera e o microfone.

Pelo terminal: `npm run jarvis`, ou `npm run dev` e abrir `http://127.0.0.1:5173` (no Chrome).

> Use o **Google Chrome**. Opera, Brave e o navegador do VS Code não fazem reconhecimento de voz.

## Configuração

### Variáveis do `.env`

| Variável | Para quê |
| --- | --- |
| `FISH_AUDIO_API_KEY` e `FISH_AUDIO_VOICE_ID` | Voz do Jarvis dublado. **As duas** são necessárias ([passo a passo](#voz-do-jarvis-dublado-fishaudio)) |
| `FISH_AUDIO_MODEL` | Motor da voz. Padrão `s2.1-pro-free` (sem crédito) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_MARKET` | Spotify ([passo a passo](#spotify-premium)). Mercado padrão `BR` |
| `JARVIS_CLAUDE_MODEL` | `haiku` (padrão), `sonnet` ou `opus` |
| `JARVIS_CLAUDE_PATH` | Caminho do `claude.exe`, se o JARVIS não achar sozinho |
| `JANUS_API_URL` | API do janus (padrão `http://127.0.0.1:8082/api`) |

### `jarvis.config.json`

Arquivo **pessoal** (fora do git): copie o `jarvis.config.example.json` e adapte à sua máquina. Define o que o JARVIS pode abrir e rodar. Pode ser editado sem reiniciar.

| Chave | O que é |
| --- | --- |
| `weather` | Nome, latitude e longitude do clima. O exemplo vem com São Paulo: troque pela sua cidade |
| `apps` | Aplicativos que ele abre/foca (`open` com `exe` ou `uri`, `window` para achar a janela, `aliases` para como você fala) |
| `projects` | Projetos que ele sobe com confirmação (`cwd`, `command`, `check` por porta ou processo). O exemplo traz um projeto de mentira (`meu-projeto`): troque pelos seus |
| `handMenu` | Itens do menu circular da palma parada |
| `poses` | Ações das poses 🤘 (`rock`) e 🤙 (`call`) |

Ações aceitas em `handMenu` e `poses`: `focus:<app>`, `open:<app>`, `play:<música>`, `timer:<minutos>`, `command:<nome>` (`weather`, `status`, `takeScreens`…) e `mouse`.

### Configurar com IA

Abra a pasta no Claude Code e peça "configura o JARVIS para mim". A skill [`configurar-jarvis`](.claude/skills/configurar-jarvis/SKILL.md) confere os requisitos, cria o `.env`, adapta o `jarvis.config.json` à sua máquina e guia voz, Spotify e Claude, sem expor suas chaves. Referências em [`.claude/docs`](.claude/docs).

## O que funciona sem configurar nada

| Funciona direto | Precisa de configuração |
| --- | --- |
| Núcleo de voz, comandos de voz, hora e data | Voz do Jarvis dublado: `FISH_AUDIO_*` |
| Painéis de sistema, clima, lembretes e timers | Clima na sua cidade: `weather` no seu `jarvis.config.json` |
| Rastreamento de mãos, gestos, menu na mão, mouse no ar | Apps e projetos seus: `apps`, `projects` |
| Reconhecimento facial, humor, objetos na câmera | Spotify: `SPOTIFY_CLIENT_ID` |
| Controle do Windows por gestos, todas as telas | Finanças: janus rodando |
| Modo silencioso, modo espera, modo privado | Conversa com o Claude: Claude Code logado |

## Palavra "Jarvis"

O microfone já liga sozinho ao abrir, mas o JARVIS só obedece frases que **começam com "Jarvis"**: "Jarvis, que horas são?", "Jarvis, toca Back in Black". Depois de cada resposta, dá para continuar falando sem repetir o nome por uns 8 segundos. Dizer só "Jarvis" faz ele perguntar "Pois não, senhor?".

- Botão **MICROFONE** ou tecla `V` liga e desliga (ele lembra da escolha).
- O que é digitado no terminal (tecla `T`) não precisa do "Jarvis".
- O reconhecimento de voz é o do Google Chrome: o áudio passa pelos servidores do Google enquanto o microfone está ligado.

## Núcleo de voz

| Estado | O que aparece |
| --- | --- |
| Diga "Jarvis" | Anéis respirando devagar: esperando ser chamado |
| Ouvindo | As barras seguem o volume da sua voz |
| Processando | Arco roxo girando (Claude pensando ou olhando um objeto) |
| Falando | As barras seguem a voz do JARVIS |

Embaixo do núcleo aparecem o que ele ouviu e o que ele está falando.

## Painéis (dados reais)

| Painel | De onde vem |
| --- | --- |
| **Sistema** | CPU, memória, disco C:, rede (download/upload) e bateria, lidos pelo servidor local (Node + Windows) |
| **Projetos** | Quais projetos do `jarvis.config.json` estão no ar, pela porta (`"check": { "port": 8082 }`) ou pelo processo (`"check": { "process": "electron", "titleIncludes": "MeuApp" }`) |
| **Clima** | [Open-Meteo](https://open-meteo.com) (grátis, sem chave). O local fica em `jarvis.config.json` → `"weather"` (o exemplo vem com São Paulo) |
| **Lembretes** | Timers e lembretes, salvos em `.jarvis-reminders.json` (sobrevivem a reiniciar) |
| **Spotify** | Música tocando, com ⏮ ⏯ ⏭ |
| **Finanças** | Aparece por 30 s depois do resumo do janus |

- **Arrastar:** pinça (ou mouse) num painel. A posição fica salva; tecla `R` devolve tudo para as colunas.
- **Destaque:** deslize a mão aberta para os lados (ou clique no título) para expandir um painel com mais detalhes (horas da previsão, tempo ligado, mais lembretes).

## Todas as telas

"Jarvis, assume as telas" abre o **painel de controle** em tela cheia em cada monitor que não tem a janela principal. "Jarvis, libera as telas" fecha.

- **Gráficos dos últimos 5 minutos:** CPU, memória e rede (download e upload), mais disco, tempo ligado e bateria.
- **Clima** com a previsão das próximas 12 horas (temperatura e chance de chuva por hora), **lembretes**, **projetos** e **Spotify**.
- **Núcleo de voz sincronizado:** quando o JARVIS ouve, pensa ou fala, o núcleo do painel reage junto, e a fala aparece ao lado.
- Lembretes e música só aparecem com o seu rosto confirmado na tela principal e sem visita na câmera.
- O painel não tem câmera nem microfone: quem ouve e fala é só a janela principal.
- Funciona melhor aberto pelo `JARVIS.bat`. Os painéis usam o mesmo perfil do Chrome, que é o que permite as janelas conversarem entre si.

## Comandos de voz

Sempre começando com "Jarvis":

- **Horas e data:** "que horas são?", "que dia é hoje?"
- **Clima:** "como está o tempo?", "vai chover?"
- **PC e projetos:** "status", "como está o PC?", "quais projetos estão rodando?"
- **Timers e lembretes:** "timer de 25 minutos", "me lembra de estudar às 19h", "me avisa daqui a 10 minutos para tirar o bolo", "lembrete amanhã às 8 de pagar a conta", "quais são meus lembretes?", "cancela o timer"
- **Objetos:** "o que é isso?", "o que eu estou segurando?" (ou tecla `O`)
- **Humor:** "como eu estou?", "qual é o meu humor?"
- **Telas:** "assume as telas", "libera as telas"
- **Gestos e interface:** "mouse no ar", "desliga o mouse", "pode falar", "resumo do dia", "aumenta a interface", "diminui a interface", "modo espera", "quais gestos você conhece?", "aprende este gesto para …", "esquece o gesto …"
- **Música, apps, janelas, projetos e finanças:** veja as seções abaixo
- **Outros:** "quem é você", "olá", "silêncio", "voz do filme", "português", "o que eu deveria estar fazendo?", "ligar/desligar o Claude", "cadastrar meu rosto"

Quando um timer ou lembrete vence, o JARVIS bipa e avisa em voz alta.

## Gestos

Tecla `G` ou "Jarvis, quais gestos você conhece?" mostra a lista na tela.

### Básicos

| Gesto | O que faz |
| --- | --- |
| **Apontar** (só o indicador) | Cursor na ponta do dedo. Parado 0,8 s sobre um botão (⏯, × de um lembrete, título de painel), aperta |
| **Pinça** (polegar + indicador) | Sobre um painel: arrasta. Num botão: aperta. **No vazio: volume do Windows** (sobe e desce a mão) |
| **Duas pinças** | Afastar amplia a interface do JARVIS, aproximar reduz (80% a 160%). `R` volta a 100% |
| **Joinha / polegar para baixo** | "Sim" / "não" quando o JARVIS pergunta "Devo iniciar…?". Sem pergunta, o joinha tira do modo silencioso |
| **Palma aberta parada (1 s)** | Se ele estiver falando, cala. Sobre o visor do Spotify, pausa/retoma. No resto: abre o **menu na mão** |
| **Deslizar a mão aberta** | Sobre o visor: próxima/anterior. No resto da tela: troca o painel em destaque |

### Menu na mão

A palma parada abre um menu circular em volta da mão. Leve a mão até um item e segure um instante para escolher; o punho fecha. Os itens ficam no `jarvis.config.json` → `"handMenu"` (padrão: Spotify, VS Code, Timer 25, Clima, Telas e Mouse no ar).

### Controlar o Windows

| Gesto | O que faz |
| --- | --- |
| **✌ deslizar → / ←** | Troca de janela (Alt+Tab / Alt+Shift+Tab) |
| **✌ deslizar ↑** | Mostra todas as janelas (Win+Tab) |
| **✌ deslizar ↓** | Mostra a área de trabalho (Win+D) |
| **3 dedos deslizar → / ←** | Troca de área de trabalho virtual (Win+Ctrl+→/←) |
| **Mouse no ar** | Liga com "Jarvis, mouse no ar", tecla `M` ou pelo menu. A mão move o cursor nos dois monitores, a **pinça clica** (segurar arrasta) e o **✌ subindo ou descendo rola** a página. **Punho por 1 s** sai (também `Esc`, ou sozinho se a mão sumir por 3 s) |

Mexer no mouse, no teclado e no volume exige o rosto do dono confirmado. Só atalhos de uma lista fixa podem ser apertados: nada de texto livre. Para a câmera não pausar enquanto você usa outra janela, abra o JARVIS pelo `JARVIS.bat` (ele liga as opções certas do Chrome).

### Atalhos e gestos inteligentes

| Gesto | O que faz |
| --- | --- |
| **✋✋ Duas palmas paradas (1 s)** | **Parar tudo**: o JARVIS cala, a música pausa, o mouse no ar desliga e o menu fecha. Vale em qualquer modo |
| **🤫 Indicador nos lábios** | **Modo silencioso**: ele para de falar e responde só com legenda. Joinha, "Jarvis, pode falar" ou `S` devolvem a voz |
| **👂 Mão em concha na orelha** | Repete a última coisa que ele disse |
| **👋 Acenar** | **Modo espera**: ele se despede, desliga o microfone e apaga os painéis. Acenar de novo, levantar a mão ou `V` acordam |
| **🙋 Mão levantada (acima da cabeça)** | Ouve sem precisar dizer "Jarvis" (bipe curto) |
| **👍 Polegar de lado, na frente do peito** | Resumo do dia: hora, clima, lembretes de hoje e projetos no ar (também "Jarvis, resumo do dia") |
| **🤘 Rock / 🤙 Telefone (segurar)** | Poses-atalho do `jarvis.config.json` → `"poses"` (padrão: 🤘 toca Back in Black, 🤙 fala o status do PC) |

### Gestos que ele aprende

"Jarvis, aprende este gesto para abrir o Spotify": ele pede para mostrar a pose, grava por 2 segundos e, dali em diante, segurar essa pose executa a frase como se você tivesse falado. Funciona com qualquer pedido, inclusive os que vão para o Claude. Poses que já são gestos fixos (mão aberta, punho, ✌…) são recusadas. "Jarvis, esquece o gesto do Spotify" apaga ("esquece todos os gestos" apaga todos). Ficam salvos em `.jarvis-gestures.json` (fora do git).

### Rastreamento

As mãos têm identidade estável, suavização (filtro One Euro) e uma tolerância de 250 ms quando o detector perde a mão por um instante. Os gestos são medidos pelo ângulo das articulações, então funcionam com a mão girada. Se algum gesto falhar, aperte `D` (modo de depuração): aparecem perto de cada mão a razão da pinça, a dobra de cada dedo e o polegar. Os limiares ficam em `src/gestures.ts` e os tempos de cada gesto em `src/handcontrol.ts`.

## Objetos na câmera

"Jarvis, o que é isso?": ele olha alguns frames com o detector de objetos do MediaPipe (EfficientDet-Lite0, 80 tipos de objeto do dia a dia: celular, garrafa, caneca, livro, mouse, teclado, tesoura…), desenha as caixas na tela e fala o nome em português. Se tiver mão na câmera, ele prefere o objeto que está perto dela. O modelo só é baixado no primeiro pedido. O último objeto visto vai junto para o Claude.

## Presença e privacidade

- **Saiu da frente do PC** (sem rosto por 1 minuto): fica "AUSENTE" e pausa o Spotify, se estiver tocando.
- **Voltou:** "Bem-vindo de volta, senhor", retoma a música e avisa quantos lembretes venceram enquanto você estava fora.
- **Outra pessoa na câmera** (2 rostos ou mais): **modo privado**. Os painéis de finanças, lembretes e Spotify somem, o JARVIS não lê finanças nem o texto dos lembretes, e o Claude é avisado para não falar de assuntos pessoais.

## Leitura facial e humor

- **Identificando:** em volta do rosto aparecem os 68 pontos faciais com o contorno (olhos, sobrancelhas, nariz, boca, mandíbula), uma linha de varredura e um painel com os dados da comparação: pontos, descritor de 128 números, distância até o perfil cadastrado (o limite é 0,50), expressão e resultado.
- **Identidade confirmada:** a moldura trava, fica verde, os pontos acendem em sequência e aparece "IDENTIDADE CONFIRMADA · BEM-VINDO, SENHOR".
- **Cadastrando:** em laranja, com a barra de amostras.
- **Humor:** o modelo de expressões do face-api lê o seu rosto (neutro, feliz, triste, irritado, apreensivo, incomodado ou surpreso). Enquanto você fala com o JARVIS, ele lê o rosto a cada meio segundo e guarda a expressão **durante a frase**. Um sorriso rápido no meio da frase já conta. A expressão aparece no topo ("HUMOR FELIZ") e numa malha discreta em volta do rosto enquanto você fala.
- O Claude recebe a expressão junto com a pergunta e ajusta o tom: mais leve se você estiver feliz, mais cuidadoso se parecer triste ou irritado. Ele comenta só de vez em quando.
- "Jarvis, como eu estou?" / "qual é o meu humor?": ele diz o que leu.
- A leitura é estimativa da câmera e pode errar com pouca luz ou rosto de lado. Com outra pessoa na câmera, a expressão não vai para o Claude. Nada sai do computador além do rótulo ("feliz") que vai junto da pergunta ao Claude.

## Reconhecimento facial (segurança)

O JARVIS reconhece o dono e só libera os recursos sensíveis (**Claude, apps, projetos, Spotify e finanças**) quando vê o rosto dele. Gestos, painéis, timers e comandos básicos funcionam para qualquer um.

- **Cadastrar:** diga "Jarvis, cadastrar meu rosto" (ou digite no terminal) e vire o rosto devagar para os lados por uns segundos.
- **Ao abrir:** "Sistemas online. Identificando…" e, ao reconhecer, "Bem-vindo de volta, senhor".
- Se ele não vir o dono por 2 minutos, volta a bloquear. Só o dono (rosto verificado) pode trocar ou apagar o cadastro ("apagar meu rosto").
- O perfil fica só neste computador, em `.face-profile.json` (fora do git). Quem compara o rosto é o servidor local, que emite um token de acesso temporário.

## Voz do Jarvis dublado (fish.audio)

Sem configurar nada, o JARVIS fala com a voz pt-BR do navegador. Para usar a voz do Jarvis dublado você precisa de **dois** valores no `.env`: a chave de API e o ID da voz.

1. Crie uma conta em [fish.audio](https://fish.audio) e gere uma chave em **API Keys**.
2. Na biblioteca de vozes do fish.audio, busque por **"Jarvis"**. A voz que o autor usa se chama **"Jarvis (UCM) - Português Brasileiro"**. Também dá para escolher qualquer outra voz ou clonar a sua.
3. Abra a página da voz e copie o **ID**: é o código de 32 caracteres no final do endereço (`fish.audio/m/<ID>`).
4. No `.env`, preencha:
   ```
   FISH_AUDIO_API_KEY=sua-chave
   FISH_AUDIO_VOICE_ID=id-da-voz
   FISH_AUDIO_MODEL=s2.1-pro-free
   ```
5. Feche e abra o JARVIS de novo. O botão de voz passa a mostrar "Jarvis dublado (fish.audio)". Com chave **ou** ID faltando, ele continua com a voz do navegador.

O motor `s2.1-pro-free` funciona sem crédito de API (os outros devolvem erro 402 sem crédito). A chave fica só no servidor local (nunca vai para o navegador nem para o git). Cada frase nova gasta crédito; frases repetidas vêm do cache do navegador. Com essa voz, as barras do núcleo seguem o som de verdade.

> As vozes da biblioteca podem ser clones da voz de pessoas reais. Este repositório não inclui nenhuma delas: use por sua conta, só para diversão pessoal, e não publique nem redistribua o áudio gerado.

## Aplicativos e projetos

Só o que está no `jarvis.config.json` (dá para editar sem reiniciar). Nada de comando livre.

- "abrir o Spotify", "abre o VS Code", "abrir o explorador de arquivos"
- "trocar para o VS Code", "mostra o Chrome", "volta pro JARVIS": traz a janela para a frente (abre se não estiver aberto)
- "mover o VS Code para o outro monitor", "manda o Spotify pro monitor da esquerda": usa o atalho do Windows (Win+Shift+seta), que dá a volta entre os monitores
- "maximizar o Chrome", "minimizar o Spotify"
- **Qualquer janela aberta**, não só as da lista: "manda o Discord pro outro monitor", "traz a janela do YouTube"
- **"essa janela"** = a janela em foco: "manda essa janela pro outro monitor", "maximiza essa janela"
- "rodar o meu projeto", "inicia o janus" (o nome que você deu em `projects`): o JARVIS pergunta **"Devo iniciar…?"** e só roda depois do "sim" (ou do joinha). Cada projeto abre numa janela de terminal própria.

> Cuidado com portas: o JARVIS usa a 5173. Projetos que também usam essa porta vão brigar com ele.

## Spotify (Premium)

1. Crie um app grátis em [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) (marque **Web API**).
2. Em **Redirect URIs**, coloque exatamente `http://127.0.0.1:5173/api/spotify/callback`.
3. Copie o **Client ID** para `SPOTIFY_CLIENT_ID=` no `.env` (não precisa do Client Secret) e reabra o JARVIS.
4. Clique no botão **SPOTIFY: CONECTAR** e faça o login uma vez (o token fica em `.spotify-token.json`, fora do git).

Por voz: "tocar Back in Black", "coloca Legião Urbana", "pausa", "continua a música", "próxima", "volta a música", "que música é essa?", "volume 30". Se o Spotify não estiver aberto, ele abre o app. Também dá para pedir junto: "toque Amor e Sexo com 10% do volume".

## Finanças (janus)

"Como estão minhas finanças?" / "resumo financeiro" / "quanto sobrou?": o JARVIS lê o mês atual do janus (entradas, saídas, quanto sobra, pendências, dívidas em aberto e quem ainda deve) e mostra o cartão FINANÇAS por 30 segundos. **Só leitura:** nunca altera nada no janus.

- Usa a versão Docker do janus, com os dados reais: `http://127.0.0.1:8082/api` (para mudar, `JANUS_API_URL` no `.env`).
- Se o janus estiver desligado, ele pergunta se deve iniciá-lo.
- Com o Claude ligado, perguntas sobre dinheiro ("quanto gastei este mês?") levam os números reais do janus junto (menos no modo privado).

## Claude no JARVIS

O que não for comando vai para o Claude, que responde como JARVIS. Funciona pelo **Claude Code instalado no computador, com o login do seu plano**: sem chave de API, mas **usa a cota do plano**. Ele começa **ligado**; se você desligar, o JARVIS lembra.

- Ligar/desligar: botão **CLAUDE**, tecla `C`, ou por voz: "ligar o Claude" / "desligar o Claude".
- **Contexto real em cada pergunta:** data e hora, estado do PC, clima, projetos no ar, lembretes pendentes, música tocando, último objeto visto e se há outra pessoa na câmera. Então dá para perguntar "como está meu PC?", "preciso de guarda-chuva hoje?" ou "o que eu tenho para hoje?".
- **Memória entre sessões:** "Jarvis, lembra que minha prova é dia 15" fica salvo em `.jarvis-memory.json` (fora do git) e ele usa nas próximas conversas. "Esquece da prova" apaga.
- **Ações:** ele pode tocar música, abrir apps, mexer em janelas, pedir para rodar projetos (sempre com a sua confirmação), ler as finanças, criar timers e lembretes ("me lembra de ligar para o dentista amanhã de manhã") e olhar a câmera.
- A conversa continua depois de reiniciar o JARVIS e recomeça do zero a cada dia (`.jarvis-claude-session.json`).
- Cada resposta leva uns 8 a 10 segundos. O Claude roda sem ferramentas e sem acesso a arquivos: só conversa. Só pedidos vindos do próprio JARVIS são aceitos.
- Modelo: Haiku (mais rápido e econômico). Para trocar, `JARVIS_CLAUDE_MODEL=sonnet` no `.env`.

## Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| Não me ouve | Use o Google Chrome, deixe o microfone ligado (tecla `V`) e permita o microfone no Chrome |
| A câmera pausa quando troco de janela | Abra pelo `JARVIS.bat` ou `npm run jarvis`, que ligam as opções certas do Chrome |
| Porta 5173 ocupada | Feche o outro servidor que usa a porta |
| Spotify: "redirect inválido" | A Redirect URI precisa ser exatamente `http://127.0.0.1:5173/api/spotify/callback` (127.0.0.1, não localhost) |
| fish.audio erro 402 | O motor pede crédito: use `FISH_AUDIO_MODEL=s2.1-pro-free` |
| Continua com a voz do navegador | Faltou a chave **ou** o ID da voz no `.env` |
| O Claude não responde | Confira se o Claude Code está logado; se não for achado, defina `JARVIS_CLAUDE_PATH` |
| Um app/projeto não abre | Confira os caminhos no seu `jarvis.config.json` |

## Teclado e mouse

`V` microfone • `M` mouse no ar • `G` gestos • `T` terminal • `C` Claude • `L` voz (PT-BR / filme UK) • `S` fala • `O` o que é isso • `R` reorganizar painéis • `D` depuração das mãos • arrastar move painéis • clique no título de um painel = destaque

## Scripts

- `npm run jarvis`: servidor + Chrome em modo app
- `npm run dev`: só o servidor de desenvolvimento
- `npm test`: testes (gestos, rastreamento, rosto, palavra "Jarvis", horários, lembretes, objetos, sistema, clima, ações, Spotify, finanças, Claude, comandos de voz)
- `npm run build`: checagem de tipos + build de produção em `dist/`

## Versões e contribuição

Versionamento semântico automático (`semantic-release`) a partir de [Conventional Commits](https://www.conventionalcommits.org/): `feat:` sobe a versão minor, `fix:` a patch, `feat!:` a major. O histórico de versões está no [CHANGELOG](CHANGELOG.md). Rode `npm run type-check` e `npm test` antes de abrir um pull request.

## Licença

[MIT](LICENSE) © José Antônio Segura Marques da Silva.

## Stack

TypeScript, Vite, Canvas 2D, MediaPipe (mãos e objetos), face-api (@vladmandic), Web Speech API, Open-Meteo, Spotify Web API (PKCE), fish.audio TTS e Claude Code. O servidor do Vite também é o backend local (`server/`): sistema, clima, lembretes, rosto, ações, Spotify, janus, voz e Claude.
