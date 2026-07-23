import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Headers,
  UseGuards,
  Delete,
  Redirect,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { KeycloakAuthService } from './keycloak-auth.service';
import { ConfigService } from '@nestjs/config';
import {
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  Verify2FADto,
} from './dto/login.dto';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { resolveLoginTenantSlug } from '@/shared/tenant-host.helper';

class KcLoginDto {
  @ApiProperty({ example: 'admin@demo.fashionerp.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin@123456' })
  @IsString()
  password: string;
}

class KcTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly kcAuthService: KeycloakAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'User login with email & password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string,
    @Headers('x-tenant-id') tenantSlug?: string,
    @Headers('origin') origin?: string,
    @Headers('referer') referer?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
  ) {
    const resolvedSlug = resolveLoginTenantSlug({
      headerSlug: tenantSlug,
      origin,
      referer,
      forwardedHost,
      host: req.headers.host,
    });
    return this.authService.login(dto, req.ip, userAgent, resolvedSlug);
  }

  @Public()
  @Post('platform-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Platform console login (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 403, description: 'Not a Super Admin account' })
  async platformLogin(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.platformLogin(dto, req.ip, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Delete('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout user and revoke tokens' })
  logout(
    @CurrentUser() user: IAuthUser,
    @Headers('authorization') authHeader: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string,
  ) {
    const token = authHeader?.replace('Bearer ', '') || '';
    return this.authService.logout(user.id, token, user.tenantId, req.ip, userAgent);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Request password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset password with token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change password when authenticated' })
  changePassword(@CurrentUser() user: IAuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user' })
  getMe(@CurrentUser() user: IAuthUser) {
    return user;
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Generate 2FA secret and QR code' })
  setup2FA(@CurrentUser() user: IAuthUser) {
    return this.authService.setup2FA(user.id);
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Enable 2FA by verifying code' })
  enable2FA(@CurrentUser() user: IAuthUser, @Body() dto: Verify2FADto) {
    return this.authService.enable2FA(user.id, dto.code);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Disable 2FA' })
  disable2FA(@CurrentUser() user: IAuthUser, @Body() dto: Verify2FADto) {
    return this.authService.disable2FA(user.id, dto.code);
  }

  // ── Keycloak SSO (auth.hexalyte.com) ──────────────────────────────────────

  @Public()
  @Post('kc-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login via Keycloak at auth.hexalyte.com' })
  @ApiResponse({ status: 200, description: 'Keycloak access_token + refresh_token' })
  kcLogin(@Body() dto: KcLoginDto) {
    return this.kcAuthService.kcLogin(dto.email, dto.password);
  }

  @Public()
  @Post('kc-refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Keycloak access token' })
  kcRefresh(@Body() dto: KcTokenDto) {
    return this.kcAuthService.kcRefresh(dto.refreshToken);
  }

  @Public()
  @Post('kc-logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout from Keycloak (revoke refresh token)' })
  kcLogout(@Body() dto: KcTokenDto) {
    return this.kcAuthService.kcLogout(dto.refreshToken);
  }

  @Public()
  @Get('kc-login-page')
  @Redirect()
  @ApiOperation({ summary: 'Redirect to Keycloak login page (Authorization Code flow)' })
  kcLoginPage(@Query('redirect_uri') redirectUri?: string) {
    const kcUrl = this.config.get<string>('keycloak.url') ?? 'https://auth.hexalyte.com';
    const realm = this.config.get<string>('keycloak.realm') ?? 'fashion-erp';
    const clientId = this.config.get<string>('keycloak.clientId') ?? '';
    const callbackUrl = redirectUri ?? `${this.config.get('app.url')}/auth/kc/callback`;
    const loginUrl = new URL(`${kcUrl}/realms/${realm}/protocol/openid-connect/auth`);
    loginUrl.searchParams.set('client_id', clientId);
    loginUrl.searchParams.set('redirect_uri', callbackUrl);
    loginUrl.searchParams.set('response_type', 'code');
    loginUrl.searchParams.set('scope', 'openid email profile');
    return { url: loginUrl.toString() };
  }
}
