# Use official Playwright image which includes Chromium and all OS dependencies
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# Update Node.js to 22.x LTS as required by @supabase/supabase-js
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

# Copy package definitions
COPY package*.json ./

# Install dependencies (production) and ensure browser binary matches
RUN npm install --omit=dev && npx playwright install chromium

# Copy application code
COPY . .

# Render exposes the port via the PORT environment variable
ENV PORT=8080
EXPOSE 8080

# Start Express server
CMD ["node", "src/server.js"]
