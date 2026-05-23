import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from '@/modules/auth/auth.module';

@Module({
  imports: [AuthModule],       // KeycloakAdminService is exported from AuthModule
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
