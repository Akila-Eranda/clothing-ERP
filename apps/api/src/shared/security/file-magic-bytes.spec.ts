import { validateFileMagicBytes } from './file-magic-bytes';

describe('validateFileMagicBytes', () => {
  it('accepts valid JPEG', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(validateFileMagicBytes('image/jpeg', buf)).toBe(true);
  });

  it('rejects JPEG mime with PNG bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]);
    expect(validateFileMagicBytes('image/jpeg', buf)).toBe(false);
  });

  it('accepts valid PDF', () => {
    const buf = Buffer.from('%PDF-1.4', 'ascii');
    expect(validateFileMagicBytes('application/pdf', buf)).toBe(true);
  });

  it('accepts CSV without null bytes', () => {
    const buf = Buffer.from('name,sku\nProduct A,SKU1\n', 'utf8');
    expect(validateFileMagicBytes('text/csv', buf)).toBe(true);
  });

  it('rejects CSV with embedded null bytes', () => {
    const buf = Buffer.from([0x61, 0x00, 0x62]);
    expect(validateFileMagicBytes('text/csv', buf)).toBe(false);
  });
});
