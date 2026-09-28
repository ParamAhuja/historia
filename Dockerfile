FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# Update Node.js to 22.x LTS as required by @supabase/supabase-js
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs

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
