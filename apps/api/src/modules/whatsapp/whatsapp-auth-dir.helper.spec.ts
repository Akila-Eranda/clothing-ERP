import * as path from 'path';
import { isInsideDir, publicExposureWarning, resolveWhatsappAuthRoot } from './whatsapp-auth-dir.helper';

describe('whatsapp-auth-dir.helper', () => {
  const cwd = path.resolve('/srv/api');

  it('uses the configured folder when set', () => {
    expect(resolveWhatsappAuthRoot({ configured: ' /app/private/wa ', cwd })).toBe(path.resolve('/app/private/wa'));
  });

  it('defaults to a folder that is NOT under uploads', () => {
    const root = resolveWhatsappAuthRoot({ configured: undefined, cwd });
    expect(root).toBe(path.resolve(cwd, 'private', 'whatsapp-sessions'));
    expect(isInsideDir(root, path.resolve(cwd, 'uploads'))).toBe(false);
  });

  it('detects a folder inside the public upload root (incl. traversal and equality)', () => {
    const uploads = path.resolve('/app/uploads');
    expect(isInsideDir(path.resolve('/app/uploads/whatsapp-sessions'), uploads)).toBe(true);
    expect(isInsideDir(uploads, uploads)).toBe(true);
    expect(isInsideDir(path.resolve('/app/uploads/../private/wa'), uploads)).toBe(false);
    expect(isInsideDir(path.resolve('/app/uploads-private/wa'), uploads)).toBe(false); // sibling with shared prefix
  });

  it('warns only for exposed folders', () => {
    expect(publicExposureWarning('/app/uploads/whatsapp-sessions', '/app/uploads')).toMatch(/public upload folder/);
    expect(publicExposureWarning('/app/private/whatsapp-sessions', '/app/uploads')).toBeNull();
  });
});
