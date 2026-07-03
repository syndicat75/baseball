/**
 * @file cache.ts
 * @description Provides a persistent filesystem-based cache for KBO standings and schedules when running locally,
 * and an ephemeral in-memory cache adapter when running in serverless environments like Vercel.
 * Designed to be easily swappable with durable remote stores like Vercel KV or Upstash Redis.
 */

import fs from 'fs';
import path from 'path';
import { CONFIG } from '../../config';

const CACHE_DIR = path.join(process.cwd(), CONFIG.CACHE.dir);

/**
 * Interface representing a generic Cache Adapter.
 * Any future remote cache implementations (e.g., Vercel KV, Upstash Redis) must conform to this interface.
 */
export interface CacheAdapter {
  /**
   * Retrieves a value from the cache if it exists and has not expired.
   * @param key Unique cache key identifier
   * @param ttlMs Time-to-live in milliseconds
   * @returns The cached data or null if not found or expired
   */
  get<T>(key: string, ttlMs: number): Promise<T | null>;

  /**
   * Saves a value into the cache.
   * @param key Unique cache key identifier
   * @param data The JSON-serializable data to store
   */
  set(key: string, data: any): Promise<void>;

  /**
   * Deletes a specific value from the cache.
   * @param key Unique cache key identifier
   */
  delete(key: string): Promise<void>;

  /**
   * Clears all stored cache items.
   */
  clear(): Promise<void>;
}

/**
 * Memory-based cache implementation for serverless/Vercel environments.
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private store: Map<string, { data: any; timestamp: number }> = new Map();

  /**
   * Retrieves data from the in-memory store.
   * Logs every call and handles TTL checks.
   */
  async get<T>(key: string, ttlMs: number): Promise<T | null> {
    console.log(`[MemoryCacheAdapter] get called for key: "${key}" with TTL: ${ttlMs}ms`);
    const cached = this.store.get(key);
    if (!cached) {
      console.log(`[MemoryCacheAdapter] Cache miss for key: "${key}"`);
      return null;
    }
    const age = Date.now() - cached.timestamp;
    if (age > ttlMs) {
      console.log(`[MemoryCacheAdapter] Cache expired for key: "${key}" (Age: ${age}ms, TTL: ${ttlMs}ms)`);
      this.store.delete(key);
      return null;
    }
    console.log(`[MemoryCacheAdapter] Cache hit for key: "${key}" (Age: ${age}ms)`);
    return cached.data as T;
  }

  /**
   * Saves data to the in-memory store.
   * Logs every call.
   */
  async set(key: string, data: any): Promise<void> {
    console.log(`[MemoryCacheAdapter] set called for key: "${key}"`);
    this.store.set(key, {
      data,
      timestamp: Date.now(),
    });
    console.log(`[MemoryCacheAdapter] Successfully saved data to in-memory cache for key: "${key}"`);
  }

  /**
   * Deletes a specific value from the in-memory cache.
   */
  async delete(key: string): Promise<void> {
    console.log(`[MemoryCacheAdapter] delete called for key: "${key}"`);
    this.store.delete(key);
    console.log(`[MemoryCacheAdapter] Deleted key: "${key}" from in-memory cache.`);
  }

  /**
   * Clears all stored in-memory cache items.
   * Logs every call.
   */
  async clear(): Promise<void> {
    console.log(`[MemoryCacheAdapter] clear called. Clearing memory cache.`);
    this.store.clear();
    console.log(`[MemoryCacheAdapter] Memory cache cleared successfully.`);
  }
}

/**
 * Local File System cache implementation for local development environments.
 */
export class FileSystemCacheAdapter implements CacheAdapter {
  /**
   * Ensures that the local cache directory exists on disk.
   */
  private ensureCacheDirExists(): void {
    console.log(`[FileSystemCacheAdapter] Ensuring cache directory exists: "${CACHE_DIR}"`);
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log(`[FileSystemCacheAdapter] Created cache directory successfully.`);
      }
    } catch (error) {
      console.error(`[FileSystemCacheAdapter] Failed to create cache directory:`, error);
    }
  }

  /**
   * Retrieves data from the local file system.
   * Logs every call and handles TTL and file existence checks.
   */
  async get<T>(key: string, ttlMs: number): Promise<T | null> {
    console.log(`[FileSystemCacheAdapter] get called for key: "${key}" with TTL: ${ttlMs}ms`);
    this.ensureCacheDirExists();

    const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.json';
    const filePath = path.join(CACHE_DIR, safeKey);

    try {
      if (!fs.existsSync(filePath)) {
        console.log(`[FileSystemCacheAdapter] Cache miss (file does not exist): "${filePath}"`);
        return null;
      }

      const stats = fs.statSync(filePath);
      const ageMs = Date.now() - stats.mtimeMs;

      if (ageMs > ttlMs) {
        console.log(`[FileSystemCacheAdapter] Cache expired (Age: ${ageMs}ms, TTL: ${ttlMs}ms): "${filePath}"`);
        return null;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      console.log(`[FileSystemCacheAdapter] Cache hit (Age: ${ageMs}ms): "${filePath}"`);
      return parsed as T;
    } catch (error) {
      console.error(`[FileSystemCacheAdapter] Error reading cache key "${key}":`, error);
      return null;
    }
  }

  /**
   * Saves data to the local file system.
   * Logs every call.
   */
  async set(key: string, data: any): Promise<void> {
    console.log(`[FileSystemCacheAdapter] set called for key: "${key}"`);
    this.ensureCacheDirExists();

    const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.json';
    const filePath = path.join(CACHE_DIR, safeKey);

    try {
      const rawData = JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, rawData, 'utf-8');
      console.log(`[FileSystemCacheAdapter] Successfully stored data to cache: "${filePath}"`);
    } catch (error) {
      console.error(`[FileSystemCacheAdapter] Error writing cache key "${key}":`, error);
    }
  }

  /**
   * Deletes a specific key from the local file system.
   */
  async delete(key: string): Promise<void> {
    console.log(`[FileSystemCacheAdapter] delete called for key: "${key}"`);
    this.ensureCacheDirExists();
    const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.json';
    const filePath = path.join(CACHE_DIR, safeKey);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[FileSystemCacheAdapter] Successfully deleted cache file: "${filePath}"`);
      } else {
        console.log(`[FileSystemCacheAdapter] Key "${key}" not found on disk. No action taken.`);
      }
    } catch (error) {
      console.error(`[FileSystemCacheAdapter] Error deleting cache file for key "${key}":`, error);
    }
  }

  /**
   * Deletes all cached files from the local file system.
   * Logs every call.
   */
  async clear(): Promise<void> {
    console.log(`[FileSystemCacheAdapter] clear called. Deleting all cached files...`);
    this.ensureCacheDirExists();

    try {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(CACHE_DIR, file);
          fs.unlinkSync(filePath);
          console.log(`[FileSystemCacheAdapter] Deleted cache file: "${filePath}"`);
        }
      }
      console.log(`[FileSystemCacheAdapter] All JSON caches cleared.`);
    } catch (error) {
      console.error(`[FileSystemCacheAdapter] Error clearing cache directory:`, error);
    }
  }
}

// Automatically choose cache adapter based on environment
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
console.log(`[cache] Environment status: isVercel=${isVercel}. Initializing active cache adapter.`);

export const activeCache: CacheAdapter = isVercel
  ? new MemoryCacheAdapter()
  : new FileSystemCacheAdapter();

/**
 * Standard public wrapper for fetching items from the active cache adapter.
 * @param key The unique cache key
 * @param ttlMs The time-to-live threshold in milliseconds
 * @returns The cached object or null
 */
export async function getCache<T>(key: string, ttlMs: number): Promise<T | null> {
  console.log(`[cache] getCache public wrapper called. Key: "${key}", TTL: ${ttlMs}ms`);
  return activeCache.get<T>(key, ttlMs);
}

/**
 * Standard public wrapper for storing items into the active cache adapter.
 * @param key The unique cache key
 * @param data The JSON serializable data to write
 */
export async function setCache(key: string, data: any): Promise<void> {
  console.log(`[cache] setCache public wrapper called. Key: "${key}"`);
  return activeCache.set(key, data);
}

/**
 * Standard public wrapper for deleting specific item from the active cache adapter.
 * @param key The unique cache key
 */
export async function deleteCache(key: string): Promise<void> {
  console.log(`[cache] deleteCache public wrapper called. Key: "${key}"`);
  return activeCache.delete(key);
}

/**
 * Standard public wrapper to purge all caches using the active cache adapter.
 */
export async function clearCache(): Promise<void> {
  console.log(`[cache] clearCache public wrapper called.`);
  return activeCache.clear();
}
