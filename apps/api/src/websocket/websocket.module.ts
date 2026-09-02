import { Module } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PrismaService } from '@/prisma/prisma.service';
import { PrismaModule } from '@/prisma/prisma.module';

function resolveWsCorsOrigins(): string[] | boolean {
  const configured = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return configured.length ? configured : false;
}

@WebSocketGateway({
  cors: { origin: resolveWsCorsOrigins(), credentials: true },
  namespace: '/ws',
  transports: ['websocket', 'polling'],
})
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppGateway.name);
  private readonly connectedClients = new Map<string, { socket: Socket; userId: string; tenantId: string; branchId?: string }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) { client.disconnect(); return; }

    try {
      const payload = this.jwtService.verify<{ sub: string; tenantId: string; branchId?: string }>(token, {
        secret: this.configService.get('jwt.accessSecret'),
      });

      this.connectedClients.set(client.id, {
        socket: client,
        userId: payload.sub,
        tenantId: payload.tenantId,
        branchId: payload.branchId,
      });

      void client.join(`tenant:${payload.tenantId}`);
      if (payload.branchId) void client.join(`branch:${payload.branchId}`);
      void client.join(`user:${payload.sub}`);

      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-branch')
  async handleJoinBranch(@ConnectedSocket() client: Socket, @MessageBody() branchId: string): Promise<void> {
    const clientInfo = this.connectedClients.get(client.id);
    if (!clientInfo?.tenantId || !branchId) return;

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: clientInfo.tenantId, isActive: true },
      select: { id: true },
    });
    if (!branch) {
      this.logger.warn(`Rejected join-branch ${branchId} for client ${client.id}`);
      return;
    }

    void client.join(`branch:${branch.id}`);
  }

  // ── Event handlers ────────────────────────────────────────

  @OnEvent('pos.sale.completed')
  handleSaleCompleted(payload: { saleId: string; tenantId: string; branchId: string; total: number }): void {
    this.server.to(`branch:${payload.branchId}`).emit('sale:completed', payload);
    this.server.to(`tenant:${payload.tenantId}`).emit('stats:update', { type: 'sale', data: payload });
  }

  @OnEvent('inventory.low-stock')
  handleLowStock(payload: { tenantId: string; variantId: string; quantity: number }): void {
    this.server.to(`tenant:${payload.tenantId}`).emit('inventory:low-stock', payload);
  }

  @OnEvent('auth.login')
  handleLogin(payload: { userId: string; tenantId: string; ip: string }): void {
    this.server.to(`tenant:${payload.tenantId}`).emit('user:login', { userId: payload.userId });
  }

  emitToTenant(tenantId: string, event: string, data: unknown): void {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToBranch(branchId: string, event: string, data: unknown): void {
    this.server.to(`branch:${branchId}`).emit(event, data);
  }
}

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [AppGateway],
  exports: [AppGateway],
})
export class WebsocketModule {}
