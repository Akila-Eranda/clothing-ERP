import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthModule } from '@/modules/auth/auth.module'
import { WhatsappModule } from '@/modules/whatsapp/whatsapp.module'
import { PlatformOpsController } from './platform-ops.controller'
import { PlatformOpsService } from './platform-ops.service'
import { PlatformOpsW3Service } from './platform-ops-w3.service'
import { FeatureSuggestionsTenantController } from './feature-suggestions-tenant.controller'
import { AnnouncementsTenantController } from './announcements-tenant.controller'
import { SecurityScanService } from './security-scan.service'

@Module({
  imports: [
    AuthModule,
    WhatsappModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.accessSecret'),
      }),
    }),
  ],
  controllers: [PlatformOpsController, FeatureSuggestionsTenantController, AnnouncementsTenantController],
  providers: [PlatformOpsService, PlatformOpsW3Service, SecurityScanService],
  exports: [PlatformOpsService, PlatformOpsW3Service, SecurityScanService],
})
export class PlatformOpsModule {}
