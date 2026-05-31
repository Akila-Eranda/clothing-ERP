import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Public } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/prisma/prisma.service';

@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Application health check (database, redis, api)' })
  async check() {
    const [dbOk, redisOk] = await Promise.all([
      this.prisma.healthCheck(),
      this.checkRedis(),
    ]);
    const allOk = dbOk && redisOk;

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      services: {
        database: dbOk ? 'healthy' : 'unhealthy',
        redis: redisOk ? 'healthy' : 'unhealthy',
        api: 'healthy',
      },
    };
  }

  private async checkRedis(): Promise<boolean> {
    const host = this.config.get<string>('redis.host');
    if (!host) return true;

    const client = new Redis({
      host,
      port: this.config.get<number>('redis.port', 6379),
      password: this.config.get<string>('redis.password') || undefined,
      db: this.config.get<number>('redis.db', 0),
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      await client.quit();
      return pong === 'PONG';
    } catch {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
      return false;
    }
  }
}

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
