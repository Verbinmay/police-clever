# Один сервис — бот + админка в одном процессе. Паттерн 1:1 из bots-platform.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src src
COPY tsconfig.json tsconfig.json

ENV NODE_ENV=production
CMD ["npm", "run", "start"]
