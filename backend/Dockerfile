# Use official Playwright image which includes Chromium and all OS dependencies
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app

# Copy package definitions
COPY package*.json ./

# Install dependencies (production)
RUN npm install --omit=dev

# Copy application code
COPY . .

# Render exposes the port via the PORT environment variable
ENV PORT=8080
EXPOSE 8080

# Start Express server
CMD ["node", "src/server.js"]
