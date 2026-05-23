import { Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

export const QUEUES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  REPORTS: 'reports',
  INVENTORY: 'inventory',
  EXPORTS: 'exports',
} as const;

// ── Email Processor ───────────────────────────────────────
@Processor(QUEUES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: any): Promise<void> {
    this.logger.log(`Processing email job: ${job.name}`);

    switch (job.name) {
      case 'send-password-reset':
        await this.sendPasswordResetEmail(job.data);
        break;
      case 'send-invoice':
        await this.sendInvoiceEmail(job.data);
        break;
      case 'send-low-stock-alert':
        await this.sendLowStockAlert(job.data);
        break;
      default:
        this.logger.warn(`Unknown email job: ${job.name}`);
    }
  }

  private async sendPasswordResetEmail(data: { email: string; token: string; name: string }): Promise<void> {
    this.logger.log(`Sending password reset email to ${data.email}`);
    // nodemailer / resend integration here
  }

  private async sendInvoiceEmail(data: { email: string; invoiceNumber: string; saleId: string }): Promise<void> {
    this.logger.log(`Sending invoice ${data.invoiceNumber} to ${data.email}`);
    // PDF generation + email send
  }

  private async sendLowStockAlert(data: { email: string; items: unknown[] }): Promise<void> {
    this.logger.log(`Sending low stock alert to ${data.email}`);
  }
}

// ── Report Processor ───────────────────────────────────────
@Processor(QUEUES.REPORTS)
export class ReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportProcessor.name);

  async process(job: any): Promise<void> {
    this.logger.log(`Processing report job: ${job.name}`);
    switch (job.name) {
      case 'generate-sales-report':
        await this.generateSalesReport(job.data);
        break;
      case 'generate-inventory-report':
        await this.generateInventoryReport(job.data);
        break;
    }
  }

  private async generateSalesReport(data: unknown): Promise<void> {
    this.logger.log('Generating sales report...');
    // CSV / XLSX generation
  }

  private async generateInventoryReport(data: unknown): Promise<void> {
    this.logger.log('Generating inventory report...');
  }
}

// ── Inventory Processor ────────────────────────────────────
@Processor(QUEUES.INVENTORY)
export class InventoryProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryProcessor.name);

  async process(job: any): Promise<void> {
    this.logger.log(`Processing inventory job: ${job.name}`);
    switch (job.name) {
      case 'recalculate-stock':
        this.logger.log(`Recalculating stock for variant: ${(job.data as { variantId: string }).variantId}`);
        break;
      case 'sync-inventory':
        this.logger.log('Syncing inventory across branches...');
        break;
    }
  }
}

// ── Queue Service ──────────────────────────────────────────
@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUES.REPORTS) private readonly reportsQueue: Queue,
    @InjectQueue(QUEUES.INVENTORY) private readonly inventoryQueue: Queue,
  ) {}

  async sendPasswordResetEmail(data: { email: string; token: string; name: string }) {
    return this.emailQueue.add('send-password-reset', data, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  }

  async sendInvoiceEmail(data: { email: string; invoiceNumber: string; saleId: string }) {
    return this.emailQueue.add('send-invoice', data, { attempts: 3, delay: 1000 });
  }

  async generateReport(type: string, data: unknown) {
    return this.reportsQueue.add(`generate-${type}-report`, data, { attempts: 2 });
  }

  async scheduleInventorySync() {
    return this.inventoryQueue.add('sync-inventory', {}, {
      repeat: { pattern: '0 2 * * *' },
    });
  }

  @OnEvent('auth.password-reset-requested')
  async handlePasswordReset(payload: { email: string; token: string; name: string }) {
    await this.sendPasswordResetEmail(payload);
  }
}

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          db: config.get<number>('redis.db', 1),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUES.EMAIL },
      { name: QUEUES.NOTIFICATIONS },
      { name: QUEUES.REPORTS },
      { name: QUEUES.INVENTORY },
      { name: QUEUES.EXPORTS },
    ),
  ],
  providers: [QueuesService, EmailProcessor, ReportProcessor, InventoryProcessor],
  exports: [QueuesService, BullModule],
})
export class QueuesModule {}
