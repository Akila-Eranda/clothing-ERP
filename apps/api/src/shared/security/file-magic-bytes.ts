const SIGNATURES: Array<{ mime: string; check: (buf: Buffer) => boolean }> = [
  {
    mime: 'image/jpeg',
    check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    mime: 'image/gif',
    check: (b) =>
      b.length >= 6 &&
      b.subarray(0, 3).toString('ascii') === 'GIF' &&
      (b.subarray(3, 6).toString('ascii') === '87a' ||
        b.subarray(3, 6).toString('ascii') === '89a'),
  },
  {
    mime: 'application/pdf',
    check: (b) => b.length >= 4 && b.subarray(0, 4).toString('ascii') === '%PDF',
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    check: (b) =>
      b.length >= 4 &&
      b[0] === 0x50 &&
      b[1] === 0x4b &&
      b[2] === 0x03 &&
      b[3] === 0x04,
  },
  {
    mime: 'application/vnd.ms-excel',
    check: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
];

/** Validates file content matches declared MIME type using magic bytes. */
export function validateFileMagicBytes(mimeType: string, buffer: Buffer): boolean {
  if (mimeType === 'text/csv') {
    if (!buffer.length) return false;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
    return !sample.includes('\0');
  }

  const rule = SIGNATURES.find((s) => s.mime === mimeType);
  if (!rule) return false;
  return rule.check(buffer);
}
