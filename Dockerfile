FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production DB_FILE=/data/peterusso.db
VOLUME ["/data"]
EXPOSE 3000
USER node
CMD ["node", "--no-warnings", "src/server.js"]
