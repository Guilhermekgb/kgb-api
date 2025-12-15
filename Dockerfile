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
