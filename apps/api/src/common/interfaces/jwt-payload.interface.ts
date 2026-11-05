export interface IJwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  branchId?: string;
  roles: string[];
  permissions: string[];
  impersonation?: boolean;
  /** Unique token id (set via jwtid when signing). Optional: tokens issued before it existed stay valid. */
  jti?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface IRefreshTokenPayload {
  sub: string;
  family: string;
  jti?: string;
  iat?: number;
  exp?: number;
}
