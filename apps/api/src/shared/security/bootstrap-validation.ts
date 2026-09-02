const WEAK_SECRET_PATTERN = /change.?me|secret|password|123456|fashionerp/i;

export function isWeakJwtSecret(secret: string): boolean {
  return secret.length < 32 || WEAK_SECRET_PATTERN.test(secret);
}

/**
 * Fail fast in production when JWT secrets are missing or weak.
 * Prevents accidental deployment with default signing keys.
 */
export function validateSecurityConfig(): void {
  const env = process.env.NODE_ENV || 'development';
  if (env !== 'production') return;

  const access = process.env.JWT_ACCESS_SECRET || '';
  const refresh = process.env.JWT_REFRESH_SECRET || '';

  const problems: string[] = [];
  if (!access) problems.push('JWT_ACCESS_SECRET is not set');
  else if (isWeakJwtSecret(access)) problems.push('JWT_ACCESS_SECRET is too weak or uses a default value');

  if (!refresh) problems.push('JWT_REFRESH_SECRET is not set');
  else if (isWeakJwtSecret(refresh)) problems.push('JWT_REFRESH_SECRET is too weak or uses a default value');

  if (process.env.REDIS_PASSWORD === 'redis_secret') {
    problems.push('REDIS_PASSWORD uses the default docker-compose placeholder');
  }

  if (problems.length > 0) {
    throw new Error(
      `Security configuration invalid for production:\n- ${problems.join('\n- ')}\n` +
        'Set strong random secrets via environment variables before starting the API.',
    );
  }
}
