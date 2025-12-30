FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production || npm install --only=production

# Copy source
COPY . .

# Expose port (default app uses 3333)
EXPOSE 3333

# Ensure data folder exists
RUN mkdir -p ./data

ENV NODE_ENV=production

CMD ["node", "server.js"]
FROM node:18-alpine
WORKDIR /srv/app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production --silent

# Copy source
COPY . ./

ENV PORT=3333
EXPOSE 3333

CMD ["node", "server.js"]
