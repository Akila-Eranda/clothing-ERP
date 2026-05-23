export interface IJwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  branchId?: string;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface IRefreshTokenPayload {
  sub: string;
  family: string;
  iat?: number;
  exp?: number;
}
