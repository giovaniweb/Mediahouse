# Worker de transcodificação NuFlow — Node 20 + ffmpeg
FROM node:20-slim

# ffmpeg + ffprobe
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Sem dependências externas — só Node nativo
COPY package.json ./
COPY index.mjs ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.mjs"]
