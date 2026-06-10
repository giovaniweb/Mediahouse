# NuFlow — Worker de Transcodificação de Vídeo

Converte vídeos `.mov`/HEVC (iPhone) para **MP4 H.264**, que toca em **qualquer navegador e dispositivo**.
Roda separado do NuFlow (que está na Vercel e não tem ffmpeg). O NuFlow aciona este worker por HTTP;
ele baixa o vídeo do Supabase, converte com `ffmpeg` e devolve a URL do MP4 por callback.

**Regra automática:**
- vídeo **HEVC** → re-encoda para H.264 + AAC
- vídeo **H.264 dentro de .mov** → só reembala para .mp4 (rápido, sem perda)
- já **MP4/H.264** → ignora (não reprocessa)

---

## Deploy no Railway (recomendado, ~US$5/mês)

1. Acesse [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → escolha este repositório (`Mediahouse`).
2. Em **Settings → Root Directory**, defina: `worker-transcode`
   (assim o Railway usa o `Dockerfile` desta pasta e ignora o app Next.js).
3. Em **Variables**, adicione as 4 variáveis:

   | Variável | Valor |
   |---|---|
   | `TRANSCODE_SECRET` | `7e9627d4f1aa43f650d9e5aa5b269ac72ea5d26b30586e78` |
   | `SUPABASE_URL` | o mesmo valor de `NEXT_PUBLIC_SUPABASE_URL` da Vercel (ex: `https://sddsqdzcfueajsvgocaa.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | o mesmo valor da Vercel |
   | `NUFLOW_CALLBACK_URL` | `https://nuflow.space/api/transcode/callback` |

4. Deploy. Quando subir, o Railway dá uma URL pública (ex: `https://nuflow-transcode-production.up.railway.app`).
   Confira em `SUA_URL/health` → deve responder `{"ok":true}`.

> **Render** funciona igual: New → Web Service → repo → Root Directory `worker-transcode` → Docker → mesmas variáveis.

---

## Depois: configurar a Vercel (NuFlow)

No projeto da Vercel, adicione 2 variáveis de ambiente e faça **redeploy**:

| Variável | Valor |
|---|---|
| `TRANSCODE_WORKER_URL` | a URL pública do worker (ex: `https://nuflow-transcode-production.up.railway.app`) |
| `TRANSCODE_SECRET` | `7e9627d4f1aa43f650d9e5aa5b269ac72ea5d26b30586e78` (mesmo valor do worker) |

Pronto. A partir daí, todo vídeo `.mov` enviado é convertido automaticamente, e há um botão
**"Reconverter p/ MP4"** para os vídeos antigos.

---

## Rodar local (teste)

```bash
cd worker-transcode
TRANSCODE_SECRET=teste \
SUPABASE_URL=https://sddsqdzcfueajsvgocaa.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
NUFLOW_CALLBACK_URL=http://localhost:3000/api/transcode/callback \
PORT=8080 node index.mjs
```

Precisa de `ffmpeg` e `ffprobe` instalados (`brew install ffmpeg` no Mac).
