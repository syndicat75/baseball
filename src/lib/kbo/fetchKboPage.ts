/**
 * @file fetchKboPage.ts
 * @description Robust HTTP fetching utility for official KBO pages with custom headers, timeouts, and automatic retry.
 */

import { CONFIG } from '../../config';

/**
 * Custom fetch option interface.
 */
interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
}

/**
 * Fetches an HTML page from KBO with realistic browser headers, timeout, and a single retry fallback.
 * 
 * @param url - The target KBO URL to fetch.
 * @param options - Custom timeout and retry configurations.
 * @returns The raw HTML text response.
 */
export async function fetchKboPage(url: string, options: FetchOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const retries = options.retries ?? 1;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Referer': 'https://www.koreabaseball.com/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    console.log(`[fetchKboPage] Fetching URL (Attempt ${attempt + 1}/${retries + 1}): "${url}" with timeout ${timeoutMs}ms`);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      console.log(`[fetchKboPage] Response: status=${response.status}, contentType="${contentType}"`);

      if (!response.ok) {
        throw new Error(`HTTP status error: ${response.status} ${response.statusText}`);
      }

      const body = await response.text();
      const bodyLen = body.length;
      console.log(`[fetchKboPage] Body length: ${bodyLen} characters.`);

      // Sanity checks on HTML body
      if (bodyLen < 500) {
        throw new Error(`HTML body is unexpectedly short (${bodyLen} chars). May be blocked or rate-limited.`);
      }

      if (body.includes('ip-block') || body.includes('접속제한') || body.includes('Access Denied') || body.includes('ip_block_notice')) {
        throw new Error('Access to KBO page was blocked or denied by security filters.');
      }

      return body;
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.warn(`[fetchKboPage] Attempt ${attempt + 1} failed. Error: ${error.message || error}`);

      if (attempt === retries) {
        throw error; // throw on final attempt
      }
      attempt++;
      // Wait briefly before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error('Unexpected fallthrough in fetchKboPage retry loop.');
}
