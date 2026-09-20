# Image du front (PWA). nginx sert le build statique ET reverse-proxie /api vers
# le service api → tout est servi en same-origin (pas de CORS, pas d'URL d'API à
# embarquer : VITE_API_URL="" => le client appelle des chemins relatifs /api/...).

FROM node:24-alpine AS build
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
# Version du build (écran Réglages « À propos » + /version.json) : déclarées ici,
# APRÈS les tests et Storybook, pour ne pas invalider leur cache à chaque release.
# « dev » / vide quand l'image est construite hors pipeline.
ARG APP_VERSION=dev
ARG APP_COMMIT=
ENV VITE_API_URL="" \
    VITE_APP_VERSION=$APP_VERSION \
    VITE_APP_COMMIT=$APP_COMMIT
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
