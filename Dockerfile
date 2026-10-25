FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
USER node
ENV NODE_ENV=production
CMD ["node", "scripts/portfolio-server.cjs"]
