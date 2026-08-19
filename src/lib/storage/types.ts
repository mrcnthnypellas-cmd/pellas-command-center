/**
 * Storage adapter interface — business logic must depend only on this, never on
 * `fs` or a local path directly, so swapping to S3-compatible storage later is a
 * matter of adding an adapter, not touching every module that uploads a file.
 */
export interface StorageAdapter {
  /** Persist a buffer under a company-namespaced key; returns the storage key to save in the DB. */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  /** Retrieve a stored object's bytes. */
  get(key: string): Promise<Buffer>;
  /** Permanently delete a stored object. */
  delete(key: string): Promise<void>;
  /** Whether an object exists at the given key. */
  exists(key: string): Promise<boolean>;
}

export function buildStorageKey(companyId: string, category: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${companyId}/${category}/${unique}-${safeName}`;
}
