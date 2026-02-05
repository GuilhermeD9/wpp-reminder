FROM node:22-slim

RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates procps libxss1 \
    libasound2 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libnss3 \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

CMD ["node", "index.js"]