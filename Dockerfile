# Stage 1: build client
FROM node:18-alpine AS build-client
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json ./client/package.json
RUN cd client && npm install --production=false && npm run build

# Stage 2: production image
FROM node:18-alpine
WORKDIR /app

# Copy server files
COPY package.json package-lock.json* ./
COPY . .

# Copy client build from previous stage
COPY --from=build-client /app/client/build ./client/build

RUN npm install --production

ENV NODE_ENV=production
ENV PORT=5001

EXPOSE 5001

CMD ["node", "server.js"]
