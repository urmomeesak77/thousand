# Thousand — production image. No build step; just runtime deps + source.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install only runtime dependencies (the lockfile pins `ws`).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src ./src

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
