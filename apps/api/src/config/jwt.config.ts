import { registerAs } from '@nestjs/config';

const isProd = (process.env.NODE_ENV || 'development') === 'production';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET || (isProd ? '' : 'dev-only-access-secret-min-32-chars!!'),
  refreshSecret: process.env.JWT_REFRESH_SECRET || (isProd ? '' : 'dev-only-refresh-secret-min-32-chars!'),
  accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  issuer: process.env.JWT_ISSUER || 'fashion-erp',
  audience: process.env.JWT_AUDIENCE || 'fashion-erp-clients',
}));
