import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { createPublicKey } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { IJwtPayload } from '@/common/interfaces/jwt-payload.interface';
import { IAuthUser } from '@/common/decorators/current-user.decorator';
import { UserStatus } from '@prisma/client';
import { enforceTenantSubscriptionActive } from '@/shared/tenant-subscription.helper';

// ── JWKS cache (30 min TTL) ────────────────────────────────────────────────
interface JwkKey { kid: string; kty: string; n: string; e: string; use: string; alg: string }
let jwksCache: { keys: JwkKey[]; expiresAt: number } | null = null;

async function getKcPublicKey(kid: string, jwksUri: string): Promise<string> {
  if (!jwksCache || Date.now() > jwksCache.expiresAt) {
    const res = await fetch(jwksUri);
    const data = await res.json() as { keys: JwkKey[] };
    jwksCache = { keys: data.keys ?? [], expiresAt: Date.now() + 30 * 60 * 1000 };
  }
  const jwk = jwksCache.keys.find(k => k.kid === kid);
  if (!jwk) throw new Error(`KC public key not found for kid: ${kid}`);
  const pubKey = createPublicKey({ key: jwk as any, format: 'jwk' });
  return pubKey.export({ format: 'pem', type: 'spki' }) as string;
}

// ── KC token payload ───────────────────────────────────────────────────────
interface KcTokenPayload {
  sub: string;
  email: string;
  db_user_id?: string;
  tenant_id?: string;
  user_role?: string;
  given_name?: string;
  family_name?: string;
  iss?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const kcEnabled = configService.get<boolean>('keycloak.authEnabled');
    const kcUrl = configService.get<string>('keycloak.url') ?? 'https://auth.hexalyte.com';
    const kcRealm = configService.get<string>('keycloak.realm') ?? 'fashion-erp';
    const jwksUri = `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/certs`;

    const options: StrategyOptionsWithRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      ...(kcEnabled
        ? {
            // KC mode: secretOrKeyProvider resolves the RSA public key via JWKS
            secretOrKeyProvider: async (_req: any, rawToken: string, done: any) => {
              try {
                const [headerB64] = rawToken.split('.');
                const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
                if (!header?.kid) return done(new Error('Malformed token: missing kid'));
                const pem = await getKcPublicKey(header.kid as string, jwksUri);
                done(null, pem);
              } catch (err) {
                done(err);
              }
            },
          }
        : {
            // Local mode: HMAC secret
            secretOrKey: configService.get<string>('jwt.accessSecret') ?? '',
            issuer: configService.get<string>('jwt.issuer'),
            audience: configService.get<string>('jwt.audience'),
          }),
    };

    super(options);
  }

  async validate(_req: any, payload: IJwtPayload | KcTokenPayload): Promise<IAuthUser> {
    const kcEnabled = this.configService.get<boolean>('keycloak.authEnabled');

    if (kcEnabled) {
      return this.validateKcPayload(payload as KcTokenPayload);
    }
    return this.validateLocalPayload(payload as IJwtPayload);
  }

  // ── Keycloak token: uses db_user_id + tenant_id + user_role claims ────────
  private async validateKcPayload(payload: KcTokenPayload): Promise<IAuthUser> {
    const dbUserId = payload.db_user_id ?? payload.sub;

    const user = await this.prisma.user.findFirst({
      where: { id: dbUserId, status: UserStatus.ACTIVE },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });

    if (!user) throw new UnauthorizedException('User not found or inactive');

    const roles = user.roles.map((ur) => ur.role.type);
    await enforceTenantSubscriptionActive(this.prisma, user.tenantId, roles);

    const permissions = user.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`),
    );

    return {
      id: user.id,
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      branchId: user.branchId ?? undefined,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions: [...new Set(permissions)],
    };
  }

  // ── Local JWT token: uses sub + tenantId + roles claims ───────────────────
  private async validateLocalPayload(payload: IJwtPayload): Promise<IAuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId, status: UserStatus.ACTIVE },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });

    if (!user) throw new UnauthorizedException('User not found or inactive');

    const roles = user.roles.map((ur) => ur.role.type);
    await enforceTenantSubscriptionActive(this.prisma, user.tenantId, roles);

    const permissions = user.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`),
    );

    return {
      id: user.id,
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      branchId: user.branchId ?? undefined,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions: [...new Set(permissions)],
    };
  }
}
