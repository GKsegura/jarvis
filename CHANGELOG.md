# [0.8.0](https://github.com/GKsegura/jarvis/compare/v0.7.0...v0.8.0) (2026-10-17)


### Features

* **alertas:** avisos proativos de bateria, CPU, projeto e chuva ([e180f60](https://github.com/GKsegura/jarvis/commit/e180f60d9faba1a50d6be1ea2ca0eff21de39cd3))

# [0.7.0](https://github.com/GKsegura/jarvis/compare/v0.6.2...v0.7.0) (2026-10-17)


### Features

* **notícias:** comandos de voz e painel de notícias ([b467b14](https://github.com/GKsegura/jarvis/commit/b467b14da64363934a45a150f575d25bbe73f07e))
* **notícias:** manchetes no resumo do dia ([bb16ce8](https://github.com/GKsegura/jarvis/commit/bb16ce8c1d9ed9758103286a927cd612c31db139))
* **notícias:** servidor de notícias por RSS ([700b90b](https://github.com/GKsegura/jarvis/commit/700b90b61505ee40c19232f8a3288661a9afeadf))
* **rotinas:** detecção de hábitos e armazenamento local ([58a85bf](https://github.com/GKsegura/jarvis/commit/58a85bff635b41423ea5e676ca3f421272577e80))
* **rotinas:** perguntas, execução automática e comandos de voz ([aef5862](https://github.com/GKsegura/jarvis/commit/aef58623dfb1c97712e44c1ad310e04ef8cb0068))

## [0.6.2](https://github.com/GKsegura/jarvis/compare/v0.6.1...v0.6.2) (2026-10-17)


### Performance Improvements

* polling adaptativo e dashboard a 30 fps ([527442a](https://github.com/GKsegura/jarvis/commit/527442a9ff74ebd3ed73eb6ead4d72e4783a74a1))
* **servidor:** um tasklist só para checar todos os projetos ([e070bd5](https://github.com/GKsegura/jarvis/commit/e070bd5b2e668676f65a656167bd5ccbee353856))

## [0.6.1](https://github.com/GKsegura/jarvis/compare/v0.6.0...v0.6.1) (2026-10-16)


### Performance Improvements

* **servidor:** PowerShell residente para bateria e rede ([d4c52d6](https://github.com/GKsegura/jarvis/commit/d4c52d61ecbd8ebc64838ebf0b5bac909a7cad95))

# [0.6.0](https://github.com/GKsegura/jarvis/compare/v0.5.1...v0.6.0) (2026-10-16)


### Features

* **desempenho:** política de orçamento de CPU/GPU ([7e27361](https://github.com/GKsegura/jarvis/commit/7e273616e56c09251bcbbe5cf3d31247bc19237b))


### Performance Improvements

* câmera a 30 fps e detecção e redesenho adaptativos ([e14a214](https://github.com/GKsegura/jarvis/commit/e14a21469aace372d92eb77473423ac960e08011))
* **servidor:** cache do jarvis.config.json por data de modificação ([ac43c2f](https://github.com/GKsegura/jarvis/commit/ac43c2f5e9660bedf6056d35ed5cec3854f296e4))

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
