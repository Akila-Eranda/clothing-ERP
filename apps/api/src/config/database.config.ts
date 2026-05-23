import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
  queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10),
  logQueries: process.env.DB_LOG_QUERIES === 'true',
}));
