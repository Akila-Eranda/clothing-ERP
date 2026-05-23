import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Application health check' })
  async check() {
    const dbStatus = await this.prisma.healthCheck();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      services: {
        database: dbStatus ? 'healthy' : 'unhealthy',
        api: 'healthy',
      },
    };
  }
}

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
