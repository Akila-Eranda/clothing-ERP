import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  provider: process.env.STORAGE_PROVIDER || 'local', // 's3' | 'r2' | 'local'
  local: {
    uploadDir: process.env.UPLOAD_DIR || process.env.LOCAL_UPLOAD_DIR || './uploads',
    baseUrl: process.env.LOCAL_BASE_URL || 'http://localhost:4000/uploads',
  },
  s3: {
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.AWS_S3_BUCKET,
    cdnUrl: process.env.AWS_CDN_URL,
  },
  r2: {
    accountId: process.env.CF_R2_ACCOUNT_ID,
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
    bucket: process.env.CF_R2_BUCKET,
    publicUrl: process.env.CF_R2_PUBLIC_URL,
  },
}));
