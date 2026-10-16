## [0.5.1](https://github.com/GKsegura/jarvis/compare/v0.5.0...v0.5.1) (2026-10-16)


### Bug Fixes

* **actions:** resolve o cwd do projeto com win32.resolve ([3a40784](https://github.com/GKsegura/jarvis/commit/3a407844867ec25f541aae3c53f8639a5d685e6a))

# Changelog

As versões abaixo de 0.5.0 foram escritas à mão; as seguintes são geradas pelo `semantic-release`.

## 0.5.0

- Launcher `JARVIS.bat` e abertura no Chrome em modo app.
- CI com testes e `semantic-release`.
- Documentação: requisitos, instalação, configuração, voz do Jarvis (fish.audio) e configuração assistida por IA (`.claude`).
- `jarvis.config.json` passa a ser pessoal (fora do git), com `jarvis.config.example.json` como modelo.
- A voz do fish.audio só liga com `FISH_AUDIO_API_KEY` e `FISH_AUDIO_VOICE_ID`; não há mais voz padrão no código.

## 0.4.0

- Integrações: Spotify (PKCE), finanças do janus (somente leitura) e Claude Code com memória e contexto real.
- Painéis de sistema, clima, lembretes, timers, todas as telas e ações em apps e janelas.

## 0.3.0

- Reconhecimento facial do dono, leitura de humor e detecção de objetos na câmera.
- Modo privado quando há outra pessoa na câmera e presença (ausente/de volta).

## 0.2.0

- Rastreamento de mãos, gestos, menu na mão, mouse no ar e controle do Windows por gestos.
- Gestos que ele aprende.

## 0.1.0

- Núcleo de voz, HUD e painéis arrastáveis.
- Reconhecimento de voz com a palavra "Jarvis", comandos e fala.
