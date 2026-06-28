/**
 * @file fetchKboPage.ts
 * @description Robust HTTP fetching utility for official KBO pages with custom headers, timeouts, and environment-aware failsafes.
 * Returns structured results rather than throwing unhandled exceptions to enable seamless failovers.
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
 * Structured fetch result representing either success or graceful failure.
 */
export interface FetchResult {
  ok: boolean;
  data?: string;
  errorType?: 'KBO fetch 실패' | 'HTML parser 실패';
  errorMessage?: string;
}

/**
 * Fetches an HTML page from KBO with realistic browser headers, environment-aware timeout, and retries.
 * 
 * @param url - The target KBO URL to fetch.
 * @param options - Custom timeout and retry configurations.
 * @returns Structured FetchResult.
 */
export async function fetchKboPage(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  
  // Production / Vercel limits: under 3000ms timeout (set to 2500ms) and 0 retries to prevent gateway timeout
  const timeoutMs = options.timeoutMs ?? (isProd ? 2500 : 8000);
  const retries = options.retries ?? (isProd ? 0 : 1);

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

    console.log(`[fetchKboPage] [CALL] fetchKboPage - Attempt ${attempt + 1}/${retries + 1} - URL: "${url}", timeout: ${timeoutMs}ms, env: ${isProd ? 'production' : 'development'}`);

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

      if (bodyLen < 500) {
        throw new Error(`HTML body is unexpectedly short (${bodyLen} chars). Page may be blocked.`);
      }

      if (body.includes('ip-block') || body.includes('접속제한') || body.includes('Access Denied') || body.includes('ip_block_notice')) {
        throw new Error('Access to KBO page was blocked or denied by security filters.');
      }

      return {
        ok: true,
        data: body,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.warn(`[fetchKboPage] Attempt ${attempt + 1} failed. Error: ${error.name === 'AbortError' ? 'Timeout exceeded' : (error.message || error)}`);

      if (attempt === retries) {
        return {
          ok: false,
          errorType: 'KBO fetch 실패',
          errorMessage: error.name === 'AbortError' 
            ? `KBO 서버 연결 시간 초과 (${timeoutMs}ms)`
            : `KBO 수집 중 오류가 발생했습니다 (${error.message || error})`,
        };
      }
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return {
    ok: false,
    errorType: 'KBO fetch 실패',
    errorMessage: 'Unexpected fallthrough in fetchKboPage retry loop.',
  };
}
