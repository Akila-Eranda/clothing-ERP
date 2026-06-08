import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import { enforceTenantSubscriptionActive } from '@/shared/tenant-subscription.helper';
import {
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/login.dto';
import { IJwtPayload, IRefreshTokenPayload } from '@/common/interfaces/jwt-payload.interface';

const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Login ──────────────────────────────────────────────────
  async login(dto: LoginDto, ip?: string, userAgent?: string, tenantSlug?: string) {
    // Resolve tenantId from slug when provided (multi-tenant isolation)
    let tenantId: string | undefined;
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { OR: [{ subdomain: tenantSlug }, { id: tenantSlug }] },
        select: { id: true },
      });
      if (tenant) tenantId = tenant.id;
    }

    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), ...(tenantId && { tenantId }) },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // ── Lockout check ────────────────────────────────────────
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account locked. Try again in ${remaining} minutes.`,
      );
    }

    // ── Status check ─────────────────────────────────────────
    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Account is disabled. Contact support.');
    }

    // ── Password verify ───────────────────────────────────────
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    const roles = user.roles.map((ur) => (ur.role as { type: string }).type);

    if (!isPasswordValid) {
      const attempts = user.loginAttempts + 1;
      const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: attempts, ...(lockedUntil && { lockedUntil }) },
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    await enforceTenantSubscriptionActive(this.prisma, user.tenantId, roles);

    // ── 2FA check ─────────────────────────────────────────────
    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        return { requiresTwoFactor: true, userId: user.id };
      }
      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token: dto.twoFactorCode,
        window: 2,
      });
      if (!isValid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    // ── Reset failed attempts + activate verified users on login ──
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        ...(user.emailVerified && user.status === UserStatus.PENDING_VERIFICATION
          ? { status: UserStatus.ACTIVE }
          : {}),
      },
    });

    const permissions = user.roles.flatMap((ur) =>
      (ur.role as { permissions: { permission: { resource: string; action: string } }[] }).permissions.map(
        (rp) => `${rp.permission.resource}:${rp.permission.action}`,
      ),
    );

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email, roles, permissions);

    // ── Create session ────────────────────────────────────────
    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: tokens.accessToken,
        ipAddress: ip,
        userAgent,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    this.eventEmitter.emit('auth.login', { userId: user.id, tenantId: user.tenantId, ip });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        branchId: user.branchId,
        roles,
      },
      ...tokens,
    };
  }

  /** Company platform console — only users in the platform tenant with SUPER_ADMIN */
  async platformLogin(dto: LoginDto, ip?: string, userAgent?: string) {
    const platformSlug =
      this.configService.get<string>('app.platformTenantSubdomain') ?? 'platform';

    const platformTenant = await this.prisma.tenant.findUnique({
      where: { subdomain: platformSlug },
      select: { id: true },
    });

    if (!platformTenant) {
      throw new ForbiddenException(
        'Platform admin is not configured. Contact your system administrator.',
      );
    }

    const result = await this.login(dto, ip, userAgent, platformSlug);

    if ('requiresTwoFactor' in result) return result;

    const roles = result.user.roles ?? [];
    if (!roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException(
        'This account cannot access the company admin console.',
      );
    }

    return result;
  }

  // ── Refresh ───────────────────────────────────────────────
  async refreshToken(token: string) {
    let payload: IRefreshTokenPayload;
    try {
      payload = this.jwtService.verify<IRefreshTokenPayload>(token, {
        secret: this.configService.get('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!storedToken || storedToken.isRevoked) {
      // Token reuse — revoke entire family
      await this.prisma.refreshToken.updateMany({
        where: { family: payload.family },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException('Refresh token reuse detected. Please login again.');
    }

    if (storedToken.isUsed) {
      throw new UnauthorizedException('Refresh token already used');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const userWithRoles = await this.prisma.user.findUnique({
      where: { id: storedToken.userId },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (
      !userWithRoles ||
      userWithRoles.status === UserStatus.INACTIVE ||
      userWithRoles.status === UserStatus.SUSPENDED
    ) {
      throw new UnauthorizedException('User inactive');
    }

    // Mark current as used only after validation passes
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isUsed: true },
    });

    const roles = userWithRoles.roles.map((ur) => (ur.role as { type: string }).type);
    const permissions = userWithRoles.roles.flatMap((ur) =>
      (ur.role as { permissions: { permission: { resource: string; action: string } }[] }).permissions.map(
        (rp) => `${rp.permission.resource}:${rp.permission.action}`,
      ),
    );

    return this.generateTokens(
      userWithRoles.id,
      userWithRoles.tenantId,
      userWithRoles.email,
      roles,
      permissions,
      payload.family,
    );
  }

  // ── Logout ────────────────────────────────────────────────
  async logout(userId: string, accessToken: string): Promise<void> {
    await Promise.all([
      this.prisma.session.updateMany({
        where: { userId, token: accessToken },
        data: { isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { isRevoked: true },
      }),
    ]);
    this.eventEmitter.emit('auth.logout', { userId });
  }

  // ── Forgot Password ───────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) return; // Silent fail for security

    const token = uuidv4();
    await this.prisma.passwordReset.create({
      data: {
        email: dto.email.toLowerCase(),
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    this.eventEmitter.emit('auth.password-reset-requested', {
      email: dto.email,
      token,
      name: `${user.firstName} ${user.lastName}`,
    });
  }

  // ── Reset Password ────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const resetRecord = await this.prisma.passwordReset.findUnique({
      where: { token: dto.token },
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      throw new BadRequestException('Password reset token is invalid or expired');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    const userToUpdate = await this.prisma.user.findFirst({ where: { email: resetRecord.email } });
    if (!userToUpdate) throw new BadRequestException('User not found');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userToUpdate.id },
        data: { passwordHash, passwordChangedAt: new Date(), loginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    this.eventEmitter.emit('auth.password-reset', { email: resetRecord.email });
  }

  // ── Change Password ───────────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });
  }

  // ── 2FA Setup ─────────────────────────────────────────────
  async setup2FA(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const secret = speakeasy.generateSecret({
      name: `FashionERP (${user.email})`,
      length: 20,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    return { secret: secret.base32, qrCode: qrCodeUrl };
  }

  // ── 2FA Enable ────────────────────────────────────────────
  async enable2FA(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.twoFactorSecret) throw new BadRequestException('Setup 2FA first');

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) throw new BadRequestException('Invalid verification code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  // ── 2FA Disable ───────────────────────────────────────────
  async disable2FA(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.twoFactorEnabled) throw new BadRequestException('2FA is not enabled');

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) throw new BadRequestException('Invalid 2FA code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  }

  // ── Token generation ──────────────────────────────────────
  private async generateTokens(
    userId: string,
    tenantId: string,
    email: string,
    roles: string[],
    permissions: string[],
    existingFamily?: string,
  ) {
    const family = existingFamily || uuidv4();

    const accessPayload: IJwtPayload = {
      sub: userId,
      email,
      tenantId,
      roles,
      permissions,
    };

    const refreshPayload: IRefreshTokenPayload = { sub: userId, family };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.get('jwt.accessSecret'),
        expiresIn: this.configService.get('jwt.accessExpiry'),
        issuer: this.configService.get('jwt.issuer'),
        audience: this.configService.get('jwt.audience'),
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get('jwt.refreshSecret'),
        expiresIn: this.configService.get('jwt.refreshExpiry'),
      }),
    ]);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }
}
