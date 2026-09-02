import { validateSecurityConfig, isWeakJwtSecret } from './bootstrap-validation';

describe('bootstrap-validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isWeakJwtSecret', () => {
    it('rejects short secrets', () => {
      expect(isWeakJwtSecret('short')).toBe(true);
    });

    it('rejects default-like secrets', () => {
      expect(isWeakJwtSecret('change-me-access-secret-min-32-chars')).toBe(true);
    });

    it('accepts strong secrets', () => {
      expect(
        isWeakJwtSecret('xK9mP2vL8nQ4wR7tY1uI0oA3sD6fG5hJ8kZ2xC4vB7nM9qW1eR3tY5uI7oP'),
      ).toBe(false);
    });
  });

  describe('validateSecurityConfig', () => {
    it('does not throw in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.JWT_ACCESS_SECRET;
      expect(() => validateSecurityConfig()).not.toThrow();
    });

    it('throws in production with weak secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ACCESS_SECRET = 'change-me-access-secret-min-32-chars';
      process.env.JWT_REFRESH_SECRET = 'change-me-refresh-secret-min-32-chars';
      expect(() => validateSecurityConfig()).toThrow(/Security configuration invalid/);
    });

    it('passes in production with strong secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ACCESS_SECRET = 'xK9mP2vL8nQ4wR7tY1uI0oA3sD6fG5hJ8kZ2xC4vB7nM9qW1eR3tY5uI7oP';
      process.env.JWT_REFRESH_SECRET = 'yL0nQ5wR8tY2uI3oA4sD7fG6hJ9kZ3xC5vB8nM0qW2eR4tY6uI8oP1aS';
      process.env.REDIS_PASSWORD = 'strong-redis-password-here';
      expect(() => validateSecurityConfig()).not.toThrow();
    });
  });
});
