/**
 * @file cache.ts
 * @description Provides a persistent filesystem-based cache for KBO standings and schedules, with customizable TTLs depending on the target date.
 */

import fs from 'fs';
import path from 'path';
import { CONFIG } from '../../config';

const CACHE_DIR = path.join(process.cwd(), CONFIG.CACHE.dir);

/**
 * Ensures the cache directory exists on disk.
 * Logs each check/creation.
 */
function ensureCacheDirExists(): void {
  console.log(`[cache] Ensuring cache directory exists: "${CACHE_DIR}"`);
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      console.log(`[cache] Created cache directory successfully.`);
    }
  } catch (error) {
    console.error(`[cache] Failed to create cache directory:`, error);
  }
}

/**
 * Retrieves cached JSON data if it exists and hasn't expired.
 * 
 * @param key - The cache identifier (filename, e.g., "standings_2026-06-28")
 * @param ttlMs - Time-to-live in milliseconds
 * @returns The parsed cached object, or null if expired or not found
 */
export async function getCache<T>(key: string, ttlMs: number): Promise<T | null> {
  console.log(`[cache] getCache called with key: "${key}", TTL: ${ttlMs}ms`);
  ensureCacheDirExists();

  const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.json';
  const filePath = path.join(CACHE_DIR, safeKey);

  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[cache] Cache miss (file does not exist): "${filePath}"`);
      return null;
    }

    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtimeMs;

    if (ageMs > ttlMs) {
      console.log(`[cache] Cache expired (Age: ${ageMs}ms, TTL: ${ttlMs}ms): "${filePath}"`);
      return null;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(rawData) as T;
    console.log(`[cache] Cache hit (Age: ${ageMs}ms): "${filePath}"`);
    return data;
  } catch (error) {
    console.error(`[cache] Error reading cache key "${key}":`, error);
    return null;
  }
}

/**
 * Stores data into the filesystem cache as JSON.
 * 
 * @param key - The cache identifier (filename)
 * @param data - The serializable data to store
 */
export async function setCache<T>(key: string, data: T): Promise<void> {
  console.log(`[cache] setCache called with key: "${key}"`);
  ensureCacheDirExists();

  const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.json';
  const filePath = path.join(CACHE_DIR, safeKey);

  try {
    const rawData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, rawData, 'utf-8');
    console.log(`[cache] Successfully stored data to cache: "${filePath}"`);
  } catch (error) {
    console.error(`[cache] Error writing cache key "${key}":`, error);
  }
}

/**
 * Clears all cached items in the cache directory.
 */
export async function clearCache(): Promise<void> {
  console.log(`[cache] clearCache called. Deleting all cached files...`);
  ensureCacheDirExists();

  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(CACHE_DIR, file);
        fs.unlinkSync(filePath);
        console.log(`[cache] Deleted cache file: "${filePath}"`);
      }
    }
    console.log(`[cache] All JSON caches cleared.`);
  } catch (error) {
    console.error(`[cache] Error clearing cache directory:`, error);
  }
}
