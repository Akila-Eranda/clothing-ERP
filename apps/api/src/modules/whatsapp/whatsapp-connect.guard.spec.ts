import { ServiceUnavailableException } from '@nestjs/common';
import { assertWhatsappConnectAllowed } from './whatsapp-connect.guard';

describe('WhatsApp connection guard', () => {
  it('blocks connections in test mode', () => {
    expect(() => assertWhatsappConnectAllowed('test')).toThrow(ServiceUnavailableException);
  });

  it('keeps the existing non-test connection flow enabled', () => {
    expect(() => assertWhatsappConnectAllowed('development')).not.toThrow();
  });
});
