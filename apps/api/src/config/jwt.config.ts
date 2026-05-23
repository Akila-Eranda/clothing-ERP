import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret-min-32-chars',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret-min-32-chars',
  accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  issuer: process.env.JWT_ISSUER || 'fashion-erp',
  audience: process.env.JWT_AUDIENCE || 'fashion-erp-clients',
}));
