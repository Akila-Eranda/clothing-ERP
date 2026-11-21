import { ServiceUnavailableException } from '@nestjs/common';

export function assertWhatsappConnectAllowed(environment: string | undefined): void {
  if (environment === 'test') {
    throw new ServiceUnavailableException('WhatsApp connections and sends are disabled in test mode.');
  }
}
