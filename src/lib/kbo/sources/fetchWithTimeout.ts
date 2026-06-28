/**
 * @file fetchWithTimeout.ts
 * @description Centralised fetch helper with custom timeouts, browser user agents, and environment-aware retry policies.
 */

interface FetchWithTimeoutOptions {
  timeoutMs?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchWithTimeoutResult {
  ok: boolean;
  data?: string;
  status?: number;
  error?: string;
}

/**
 * Performs a fetch with timeout and realistic headers.
 * 
 * @param url The URL to request.
 * @param options Custom request configurations.
 * @returns Structured FetchWithTimeoutResult.
 */
export async function fetchWithTimeout(url: string, options: FetchWithTimeoutOptions = {}): Promise<FetchWithTimeoutResult> {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  const timeoutMs = options.timeoutMs ?? 5000;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...options.headers
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  console.log(`[fetchWithTimeout] [CALL] url="${url}" timeout=${timeoutMs}ms prod=${isProd}`);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP status error: ${response.status} ${response.statusText}`,
      };
    }

    const text = await response.text();
    return {
      ok: true,
      status: response.status,
      data: text,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const errorMsg = err.name === 'AbortError' ? 'Timeout exceeded' : (err.message || String(err));
    console.warn(`[fetchWithTimeout] Failed for URL "${url}": ${errorMsg}`);
    return {
      ok: false,
      error: errorMsg,
    };
  }
}
