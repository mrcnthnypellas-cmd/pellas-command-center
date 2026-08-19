import path from 'path';
import { LocalStorageAdapter } from './local';
import { S3StorageAdapter } from './s3';
import type { StorageAdapter } from './types';

export type { StorageAdapter } from './types';
export { buildStorageKey } from './types';

let adapter: StorageAdapter | null = null;

/**
 * Driver selection point, controlled by STORAGE_DRIVER:
 *  - "local": filesystem, single-machine dev only.
 *  - "s3": S3-compatible (AWS S3, Cloudflare R2, etc.) — required for the Vercel
 *    deployment, since serverless functions there have no persistent local disk.
 */
export function storage(): StorageAdapter {
  if (adapter) return adapter;

  const driver = process.env.STORAGE_DRIVER ?? 'local';

  if (driver === 's3') {
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3');
    }
    adapter = new S3StorageAdapter(
      bucket,
      process.env.S3_ENDPOINT ?? '',
      process.env.S3_REGION ?? 'auto',
      accessKeyId,
      secretAccessKey,
    );
    return adapter;
  }

  const root = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_ROOT ?? './storage/uploads');
  adapter = new LocalStorageAdapter(root);
  return adapter;
}
