# Variáveis do `.env`

Copie `.env.example` para `.env`. Todas são opcionais: sem nada, o JARVIS roda com a voz do navegador, sem Spotify e sem finanças. Nunca versionar o `.env`.

| Variável | Para quê | Como obter |
| --- | --- | --- |
| `FISH_AUDIO_API_KEY` | Chave da API do fish.audio (voz do Jarvis dublado) | fish.audio → API Keys |
| `FISH_AUDIO_VOICE_ID` | ID da voz a usar. **Sem ele a voz do fish.audio não liga** | Página da voz no fish.audio: o código na URL |
| `FISH_AUDIO_MODEL` | Motor. Padrão `s2.1-pro-free` (sem crédito); `s1`, `s2-pro`, `s2.1-pro` podem pedir crédito | |
| `JARVIS_CLAUDE_MODEL` | Modelo do Claude: `haiku` (padrão), `sonnet`, `opus` | |
| `JARVIS_CLAUDE_PATH` | Caminho do executável do Claude Code, se não for achado sozinho | `where claude` |
| `SPOTIFY_CLIENT_ID` | Client ID do app Spotify (PKCE, sem secret) | developer.spotify.com/dashboard, Redirect URI `http://127.0.0.1:5173/api/spotify/callback` |
| `SPOTIFY_MARKET` | País das buscas (padrão `BR`) | |
| `JANUS_API_URL` | API do janus (padrão `http://127.0.0.1:8082/api`) | |
