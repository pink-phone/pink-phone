# Image du front (PWA). nginx sert le build statique ET reverse-proxie /api vers
# le service api → tout est servi en same-origin (pas de CORS, pas d'URL d'API à
# embarquer : VITE_API_URL="" => le client appelle des chemins relatifs /api/...).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_API_URL=""
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
