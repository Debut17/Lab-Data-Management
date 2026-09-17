import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

import { createApp } from './src/app.js';
import { createMySqlResourceRepository } from './src/repositories/mysqlResourceRepository.js';
import { createMySqlUserRepository } from './src/repositories/mysqlUserRepository.js';
import { createAiGatewayService } from './src/services/aiGatewayService.js';
import { createPdfExtractionService } from './src/services/pdfExtractionService.js';
import { createResourceExtractionService } from './src/services/resourceExtractionService.js';

const port = Number(process.env.PORT ?? 3001);
const databasePassword = process.env.DB_PASSWORD;

if (databasePassword === undefined) {
  throw new Error('DB_PASSWORD must be configured.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'lab_app',
  password: databasePassword,
  database: process.env.DB_NAME ?? 'lab_data_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const authSecret = process.env.AUTH_SECRET ?? crypto.randomBytes(48).toString('base64url');
if (!process.env.AUTH_SECRET) {
  console.warn('AUTH_SECRET is not set; sessions will reset when the backend restarts.');
}

const aiGatewayUrl = process.env.AI_GATEWAY_URL?.trim();
const aiGatewayToken = process.env.AI_GATEWAY_TOKEN?.trim();
if (Boolean(aiGatewayUrl) !== Boolean(aiGatewayToken)) {
  throw new Error('AI_GATEWAY_URL and AI_GATEWAY_TOKEN must be configured together.');
}

let resourceExtractionService = null;
if (aiGatewayUrl && aiGatewayToken) {
  const aiGatewayService = createAiGatewayService({
    baseUrl: aiGatewayUrl,
    token: aiGatewayToken,
  });
  resourceExtractionService = createResourceExtractionService({
    pdfExtractionService: createPdfExtractionService({
      ocrService: aiGatewayService,
    }),
    aiGatewayService,
  });
}

const app = createApp({
  resourceRepository: createMySqlResourceRepository(pool),
  userRepository: createMySqlUserRepository(pool),
  resourceExtractionService,
  authSecret,
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === 'true',
  secureCookies: process.env.NODE_ENV === 'production',
});

const server = app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
