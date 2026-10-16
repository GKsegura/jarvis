# `jarvis.config.json`

Arquivo **pessoal e gitignored**: crie com `copy jarvis.config.example.json jarvis.config.json` e adapte à máquina da pessoa (sem ele, vale o `.example`). Lido a cada pedido: dá para editar sem reiniciar. Só o que está aqui pode ser aberto ou executado. Nunca versionar o `jarvis.config.json`; mudanças de padrão vão para o `.example`.

## `weather`
```json
{ "name": "São Paulo", "latitude": -23.5505, "longitude": -46.6333 }
```
Local do clima (Open-Meteo). Troque pelos dados da cidade do usuário.

## `apps[]`
```json
{
  "id": "vscode",
  "name": "VS Code",
  "aliases": ["vs code", "vscode", "editor"],
  "open": { "exe": "%LOCALAPPDATA%/Programs/Microsoft VS Code/Code.exe" },
  "window": { "process": "Code" }
}
```
- `open`: `{ "uri": "spotify:" }` ou `{ "exe": "<caminho>", "args": [...] }`. Aceita `%VARIAVEL%`. Confira se o caminho existe na máquina do usuário.
- `window`: como achar a janela (nome do processo e, opcionalmente, `titleIncludes` / `titleExcludes`). Veja o processo no Gerenciador de Tarefas.
- `aliases`: como o usuário fala o nome ("abre o editor").

## `projects[]`
```json
{
  "id": "meuprojeto",
  "name": "Meu Projeto",
  "aliases": ["meu projeto"],
  "cwd": "../meu-projeto",
  "command": ["npm", "run", "dev"],
  "check": { "port": 5174 }
}
```
- `cwd`: relativo à pasta do JARVIS. `command`: lista de argumentos (sem shell livre). O JARVIS sempre pergunta "Devo iniciar…?" antes de rodar.
- `check`: está no ar? `{ "port": 5174 }` ou `{ "process": "electron", "titleIncludes": "MeuApp" }`.
- O exemplo traz um projeto de mentira (`meu-projeto`): troque pelos projetos reais da pessoa.

## `handMenu[]` e `poses`
```json
"handMenu": [{ "label": "Spotify", "action": "focus:spotify" }],
"poses": { "rock": { "label": "Back in Black", "action": "play:Back in Black" } }
```
Ações: `focus:<appId>`, `open:<appId>`, `play:<música>`, `timer:<minutos>`, `command:<nome>` (ex.: `weather`, `status`, `takeScreens`), `mouse`. Poses disponíveis: `rock` (🤘) e `call` (🤙).
