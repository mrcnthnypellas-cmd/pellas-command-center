import { promises as fs } from 'fs';
import path from 'path';
import type { StorageAdapter } from './types';

/**
 * Dev/local filesystem adapter. Files are stored OUTSIDE the Next.js public web root
 * (spec §6) and are only ever served back through an authorization-checked API route
 * (see src/app/api/documents/[id]/download/route.ts) — never as static public files.
 */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const resolved = path.resolve(this.root, key);
    const rootResolved = path.resolve(this.root);
    if (!resolved.startsWith(rootResolved)) {
      throw new Error('Invalid storage key: path traversal detected');
    }
    return resolved;
  }

  async put(key: string, data: Buffer): Promise<string> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
