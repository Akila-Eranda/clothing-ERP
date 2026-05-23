import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '@/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  session: { create: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
  passwordReset: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  activityLog: { create: jest.fn() },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-token'),
  signAsync: jest.fn().mockResolvedValue('mock-token'),
  verify: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      'jwt.accessSecret': 'test-access-secret',
      'jwt.refreshSecret': 'test-refresh-secret',
      'jwt.accessExpiry': '15m',
      'jwt.refreshExpiry': '7d',
    };
    return config[key];
  }),
};

const mockEventEmitter = { emit: jest.fn() };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('login', () => {
    const loginDto = { email: 'test@example.com', password: 'Test@123' };
    const tenantId = 'tenant-1';

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.login(loginDto, '127.0.0.1', 'test-agent')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        passwordHash: await bcrypt.hash('different-password', 10),
        status: 'ACTIVE',
        lockedUntil: null,
        failedLoginAttempts: 0,
        twoFactorEnabled: false,
        roles: [{ role: { name: 'Admin', type: 'TENANT_ADMIN', permissions: [] } }],
      });
      await expect(service.login(loginDto, '127.0.0.1', 'test-agent')).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens for valid credentials', async () => {
      const passwordHash = await bcrypt.hash(loginDto.password, 10);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        tenantId,
        email: loginDto.email,
        firstName: 'Test',
        lastName: 'User',
        passwordHash,
        status: 'ACTIVE',
        lockedUntil: null,
        failedLoginAttempts: 0,
        twoFactorEnabled: false,
        roles: [{ role: { name: 'Admin', type: 'TENANT_ADMIN', permissions: [{ permission: { action: 'read', resource: 'products' } }] } }],
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });
      mockPrisma.session.create.mockResolvedValue({});
      mockPrisma.activityLog.create.mockResolvedValue({});

      const result = await service.login(loginDto, '127.0.0.1', 'test-agent');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      if ('user' in result) {
        expect(result.user.email).toBe(loginDto.email);
      }
    });
  });

  describe('logout', () => {
    it('should invalidate refresh token on logout', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout('user-1', 'refresh-token-1');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });
});
