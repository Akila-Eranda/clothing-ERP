import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { KeycloakAuthService } from './keycloak-auth.service';
import { KeycloakAdminService } from './keycloak-admin.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.accessSecret'),
        signOptions: {
          expiresIn: config.get('jwt.accessExpiry'),
          issuer: config.get('jwt.issuer'),
          audience: config.get('jwt.audience'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, KeycloakAuthService, KeycloakAdminService],
  exports: [AuthService, JwtModule, KeycloakAuthService, KeycloakAdminService],
})
export class AuthModule {}
