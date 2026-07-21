export type WhatsappConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'logged_out'
  | 'error';

export type WhatsappStatusResponse = {
  status: WhatsappConnectionStatus;
  phone?: string | null;
  displayName?: string | null;
  qrDataUrl?: string | null;
  lastError?: string | null;
  connectedAt?: string | null;
  provider: 'web-qr' | 'cloud-api' | 'none';
};
