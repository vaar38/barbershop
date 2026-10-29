# Сборка: устанавливаем зависимости и собираем статику
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Отдаём собранный сайт через nginx (конфиг подключается из docker-compose)
FROM nginx:1.29-alpine
COPY --from=build /app/dist /usr/share/nginx/html
