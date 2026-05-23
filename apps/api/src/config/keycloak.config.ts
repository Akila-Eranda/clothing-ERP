import { registerAs } from '@nestjs/config';

export default registerAs('keycloak', () => ({
  url: process.env.KEYCLOAK_URL || 'https://auth.hexalyte.com',
  realm: process.env.KC_REALM || 'fashion-erp',
  clientId: process.env.KC_CLIENT_ID || 'fashion-erp-api',
  clientSecret: process.env.KC_CLIENT_SECRET || '',
  authEnabled: process.env.KEYCLOAK_AUTH_ENABLED === 'true',
}));
