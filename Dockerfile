# Local development only. Vercel builds this app natively from source and does not use this file.
FROM node:22-bookworm-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
