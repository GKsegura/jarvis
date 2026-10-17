# CLAUDE.md

Assistente pessoal estilo JARVIS no navegador (TypeScript + Vite). O servidor de desenvolvimento do Vite também é o backend local: cada arquivo de `server/` é um plugin do Vite registrado em `vite.config.ts`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala as dependências |
| `npm run jarvis` | Sobe o servidor e abre o Chrome em modo app (`scripts/jarvis.mjs`, o mesmo que o `JARVIS.bat`) |
| `npm run dev` | Só o servidor em `http://127.0.0.1:5173` |
| `npm run type-check` | `tsc --noEmit` (cobre `src/`) |
| `npm test` | Vitest (testes ao lado do código: `*.test.ts`) |
| `npm run build` | Type-check + build em `dist/` |

## Estrutura

- `src/`: front-end (núcleo de voz, HUD, painéis, voz, gestos, rosto). `src/main.ts` junta tudo.
- `server/`: plugins do Vite (sistema, clima, lembretes, telas, ações, Spotify, janus, Claude, rosto, gestos, mouse/teclado).
- `scripts/jarvis.mjs`: launcher do Chrome em modo app.
- `jarvis.config.json`: configuração **pessoal** (gitignored) de apps, projetos, clima, menu da mão e poses. O repositório traz só o `jarvis.config.example.json`, usado quando o pessoal não existe (`server/config-file.ts`). Ver `.claude/docs/jarvis-config.md`.
- `.env`: chaves e opções (ver `.claude/docs/env.md`). Modelo em `.env.example`.

## Configurar para um usuário

Use a skill **configurar-jarvis** (`.claude/skills/configurar-jarvis/SKILL.md`): ela guia requisitos, `.env`, `jarvis.config.json`, voz, Spotify e Claude.

## Regras

- **Nunca** imprima, cole em resposta nem commite o conteúdo de `.env`, `jarvis.config.json`, `.spotify-token.json`, `.face-profile.json`, `.jarvis-*.json` ou `.chrome-profile/`. Para conferir o `.env`, mostre só os nomes das variáveis, nunca os valores.
- O servidor só aceita pedidos locais e **nunca executa comando livre**: apps, projetos e atalhos vêm só do `jarvis.config.json` e de listas fixas.
- Windows primeiro: janelas, mouse, volume e telas usam PowerShell e atalhos do Windows.
- Commits seguem Conventional Commits em português (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`); `feat!:` ou `BREAKING CHANGE:` gera major. Versões e `CHANGELOG.md` saem do `semantic-release` no CI (push na `main`). Não altere a versão à mão.
- Testes ficam ao lado do código; novo comportamento precisa de teste.

## Alertas proativos

`src/alerts.ts` (`AlertEngine`, puro e testado) decide quando avisar de bateria, CPU, projeto que caiu e chuva, com tempo de espera por alerta. O `src/main.ts` chama `checkAlerts` a cada 5 s e fala com `sayWhenFree`. Para criar outro alerta, acrescente a regra em `check()` e o tempo em `COOLDOWN`.

## Rotinas aprendidas

Lógica pura em `src/routines.ts` (detecção de hábitos, janela de sugestão, rotinas devidas), armazenamento em `server/usage.ts` (`.jarvis-usage.json`, gitignored) e fluxo no `src/main.ts` (`logUsage`, `routineTick`, `answerRoutine`). Regras: só registra com rosto verificado e sem visita; só pergunta, nunca ativa sozinho; rotinas aceitas só executam o que está em `AUTO_COMMANDS`, apps da lista e música; o histórico guarda tipo, nome curto e hora, nunca texto da conversa.
