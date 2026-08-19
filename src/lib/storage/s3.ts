import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import type { StorageAdapter } from './types';

/**
 * S3-compatible adapter. Works against AWS S3 as well as any S3-compatible service
 * (Cloudflare R2, Backblaze B2, MinIO) by pointing S3_ENDPOINT at that provider.
 * This is the production driver for the cloud deployment — the local disk adapter
 * only works for single-machine dev since Vercel's serverless functions don't
 * persist a local filesystem between requests.
 */
export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;

  constructor(
    private readonly bucket: string,
    endpoint: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      region: region || 'auto',
      endpoint: endpoint || undefined,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const byteArray = await result.Body?.transformToByteArray();
    if (!byteArray) throw new Error(`Object not found: ${key}`);
    return Buffer.from(byteArray);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
