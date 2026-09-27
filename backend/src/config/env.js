const dotenv = require('dotenv');

dotenv.config();

function parseIntEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseCsvEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV || 'development';

module.exports = {
  NODE_ENV,
  PORT: parseIntEnv('PORT', 8080),
  CORS_ORIGINS: parseCsvEnv('CORS_ORIGINS', ['http://localhost:5173']),
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  STORE_BASE_URL: process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com',
  CRON_SECRET: required('CRON_SECRET'),
  SCRAPER_HEADLESS: parseBooleanEnv('SCRAPER_HEADLESS', NODE_ENV === 'production'),
  SCRAPER_MAX_ATTEMPTS: parseIntEnv('SCRAPER_MAX_ATTEMPTS', 3),
  SCRAPER_BACKOFF_BASE_MS: parseIntEnv('SCRAPER_BACKOFF_BASE_MS', 1000),
  SCRAPER_BACKOFF_MAX_MS: parseIntEnv('SCRAPER_BACKOFF_MAX_MS', 10000),
  SCRAPER_NAV_TIMEOUT_MS: parseIntEnv('SCRAPER_NAV_TIMEOUT_MS', 15000),
  SCRAPER_CONTENT_WAIT_MS: parseIntEnv('SCRAPER_CONTENT_WAIT_MS', 2500),
  SCRAPER_CONCURRENCY: parseIntEnv('SCRAPER_CONCURRENCY', 3),
  SCRAPER_LOCK_STALE_MINUTES: parseIntEnv('SCRAPER_LOCK_STALE_MINUTES', 180),
};