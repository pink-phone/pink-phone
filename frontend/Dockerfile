# Image du front (PWA). nginx sert le build statique ET reverse-proxie /api vers
# le service api → tout est servi en same-origin (pas de CORS, pas d'URL d'API à
# embarquer : VITE_API_URL="" => le client appelle des chemins relatifs /api/...).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Tests + Storybook = portes de la CI (#65). Vitest et le build Storybook doivent
# passer avant le build de l'app (un échec fait échouer le build d'image → rien de
# cassé ne part en prod). `npm run build` fait déjà tsc --noEmit + vite ; le build
# Storybook valide en plus l'intégrité des stories (règle Storybook-first).
RUN npm run test
RUN npm run build-storybook
ENV VITE_API_URL=""
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
