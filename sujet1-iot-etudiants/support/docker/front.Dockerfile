FROM node:20-alpine AS deps
WORKDIR /build
COPY package*.json ./
RUN npm ci --omit=dev

FROM nginx:alpine
COPY front/ /usr/share/nginx/html/
COPY --from=deps /build/node_modules/mqtt/dist/mqtt.min.js /usr/share/nginx/html/mqtt.min.js
