---
name: configurar-jarvis
description: Guia a instalação e a configuração do J.A.R.V.I.S. (requisitos, .env, jarvis.config.json, voz do fish.audio, Spotify, Claude, janus). Use quando o usuário pedir para configurar, instalar, trocar a voz ou adaptar o JARVIS à própria máquina.
---

# Configurar o JARVIS

Referências: `.claude/docs/env.md` (variáveis) e `.claude/docs/jarvis-config.md` (apps, projetos, clima, gestos). **Nunca mostre valores do `.env` ou tokens**; para conferir, liste só os nomes das variáveis. Se o usuário colar uma chave no chat, grave no `.env` e não a repita.

## 1. Requisitos
Verifique e informe o que faltar:
- Windows 10/11, Node >= 20 (`node -v`), Google Chrome instalado (Opera, Brave e o navegador do VS Code não fazem reconhecimento de voz).
- Webcam e microfone funcionando.
- Opcional: Claude Code logado (`claude --version`), conta Spotify Premium, conta fish.audio.

## 2. Instalar e criar o `.env`
1. `npm install`
2. Se não existir `.env`, copie `.env.example` para `.env`. Crie também o `jarvis.config.json` (passo 6).
3. Pergunte quais recursos opcionais o usuário quer (voz do Jarvis, Spotify, Claude, finanças do janus) e configure só esses.

## 3. Voz do Jarvis (fish.audio)
1. Conta em fish.audio e chave em **API Keys** → `FISH_AUDIO_API_KEY`.
2. Na biblioteca de vozes, buscar "Jarvis" (o autor usa "Jarvis (UCM) - Português Brasileiro") ou escolher/clonar outra voz. Abrir a página da voz e copiar o código no final da URL → `FISH_AUDIO_VOICE_ID`.
3. Deixar `FISH_AUDIO_MODEL=s2.1-pro-free` (funciona sem crédito).
4. Reiniciar o JARVIS. O botão de voz passa a mostrar "Jarvis dublado (fish.audio)". Sem chave **ou** sem ID, ele usa a voz do navegador.
5. Avise: voz clonada de pessoa real é só para uso pessoal; não publicar nem redistribuir o áudio gerado.

## 4. Spotify (Premium)
Criar app em developer.spotify.com/dashboard (Web API), Redirect URI exata `http://127.0.0.1:5173/api/spotify/callback`, copiar o Client ID para `SPOTIFY_CLIENT_ID`, reabrir e clicar em **SPOTIFY: CONECTAR** uma vez.

## 5. Claude
Precisa do Claude Code instalado e logado. Se não for achado, defina `JARVIS_CLAUDE_PATH` com o resultado de `where claude`. Modelo em `JARVIS_CLAUDE_MODEL` (padrão haiku). Usa a cota do plano do usuário.

## 6. `jarvis.config.json` (pessoal)
Se não existir, crie a partir do exemplo (`copy jarvis.config.example.json jarvis.config.json`); ele é gitignored e é só da pessoa. Edite com ela, nesta ordem:
1. `weather`: nome, latitude e longitude da cidade dele.
2. `apps`: confirme que cada `exe` existe (`Test-Path`); remova os que ele não tem (ex.: Opera GX) e acrescente os que quiser.
3. `projects`: o exemplo traz só um projeto de mentira (`meu-projeto`). Troque pelos projetos reais do usuário (`cwd`, `command`, `check`) ou deixe `[]`.
4. `handMenu` e `poses`: ajuste às ações dele.
Valide o JSON depois de editar.

## 7. Validar
- `npm run type-check` e `npm test` passam.
- `npm run jarvis` (ou `JARVIS.bat`) abre o Chrome em modo app; permitir câmera e microfone; dizer "Jarvis, que horas são?".

## Problemas comuns
- **Não ouve a voz:** use o Chrome; microfone ligado (tecla `V`); permissão do microfone no Chrome.
- **Câmera pausa ao trocar de janela:** abra pelo `JARVIS.bat`/`npm run jarvis`, que liga as opções certas.
- **Porta 5173 ocupada:** feche o outro processo (por exemplo, outro projeto Vite).
- **Spotify "redirect inválido":** a URI precisa ser exatamente `http://127.0.0.1:5173/api/spotify/callback` (127.0.0.1, não localhost).
- **fish.audio 402:** o modelo exige crédito; use `s2.1-pro-free`.
- **Claude não responde:** confira o login (`claude`) e `JARVIS_CLAUDE_PATH`.
