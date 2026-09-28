FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app

# Copy backend package definitions
COPY backend/package*.json ./

# Install dependencies (production)
RUN npm install --omit=dev

# Copy backend application code
COPY backend/ .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.js"]
