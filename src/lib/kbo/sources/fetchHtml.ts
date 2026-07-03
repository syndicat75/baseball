/**
 * @file fetchHtml.ts
 * @description 외부 HTML 소스를 안전하고 일관된 헤더와 타임아웃 설정을 사용하여 가져오는 공통 유틸리티 파일입니다.
 */

/**
 * @function fetchHtml
 * @description 외부 URL에서 HTML을 가져오는 비동기 함수입니다. 타임아웃과 표준 User-Agent 헤더를 설정하여 차단이나 지연을 최소화합니다.
 * @param {string} url - 가져올 타겟 URL
 * @param {RequestInit} [options] - 추가 fetch 옵션
 * @returns {Promise<{ ok: boolean; status: number; contentType: string; text: string; rawPreview: string; url: string; }>} HTML 수집 응답 객체
 */
export async function fetchHtml(url: string, options?: RequestInit) {
  console.log(`[fetchHtml] [CALL] url: "${url}"`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 KBO-Viewer/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        ...(options?.headers || {}),
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    console.log(`[fetchHtml] [SUCCESS] url: "${url}", status: ${response.status}, textLength: ${text.length}`);
    return {
      ok: response.ok,
      status: response.status,
      contentType,
      text,
      rawPreview: text.slice(0, 500),
      url,
    };
  } catch (error) {
    console.error(`[fetchHtml] [ERROR] url: "${url}" failed`, error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
