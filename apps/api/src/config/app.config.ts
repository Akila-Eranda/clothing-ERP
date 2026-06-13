import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV || 'development',
  name: process.env.APP_NAME || 'HexaOne API',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10), // 10MB
  /** Internal company tenant — only users here may use platform-login / admin3 */
  platformTenantSubdomain: process.env.PLATFORM_TENANT_SUBDOMAIN || 'platform',
}));
