FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install --workspace=@whistle/shared --workspace=@whistle/api
RUN npm run build -w @whistle/shared && npm run build -w @whistle/api
WORKDIR /app/apps/api
ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/index.js"]
