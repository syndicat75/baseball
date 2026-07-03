/**
 * @file safeFetchJson.ts
 * @description HTTP API 호출 시 서버 에러나 비정상적인 HTML/텍스트 응답을 사전에 감지하고
 * 안전하게 예외 및 포맷을 핸들링하여 JSON 파싱 크래시를 원천 차단하는 안전 fetch 유틸리티입니다.
 */

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  error?: string;
  message?: string;
  rawPreview?: string;
  data?: T;
}

/**
 * @function safeFetchJson
 * @description 서버 응답 헤더 및 바디를 사전 검증한 후 안전하게 JSON을 파싱하는 비동기 함수입니다.
 * @param {string} url - 요청 대상 API 엔드포인트 URL
 * @param {RequestInit} [options] - fetch 추가 옵션
 * @returns {Promise<SafeFetchResult>} 안전 처리된 응답 결과 패키지
 */
export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<SafeFetchResult<T>> {
  console.log(`[safeFetchJson] [CALL] url: "${url}"`);
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    let data: any = null;

    if (
      contentType.includes("application/json") ||
      rawText.trim().startsWith("{") ||
      rawText.trim().startsWith("[")
    ) {
      try {
        data = JSON.parse(rawText);
      } catch {
        console.error(`[safeFetchJson] [ERROR] JSON parsing failed for raw body:`, rawText.slice(0, 200));
        return {
          ok: false,
          status: response.status,
          error: "INVALID_JSON_RESPONSE",
          message: "서버 응답이 유효한 JSON 형식이 아닙니다.",
          rawPreview: rawText.slice(0, 500),
        };
      }
    } else {
      console.warn(`[safeFetchJson] [WARNING] Received non-JSON response from: "${url}"`);
      return {
        ok: false,
        status: response.status,
        error: "NON_JSON_RESPONSE",
        message: "서버가 JSON이 아닌 응답을 반환했습니다.",
        rawPreview: rawText.slice(0, 500),
      };
    }

    if (!response.ok || data?.success === false) {
      console.error(`[safeFetchJson] [ERROR] Server returned bad status or logical success is false:`, data);
      return {
        ok: false,
        status: response.status,
        error: data?.error || "API_ERROR",
        message: data?.message || data?.error || `서버 응답 오류: ${response.status}`,
        data,
      };
    }

    console.log(`[safeFetchJson] [SUCCESS] Successfully fetched and parsed JSON from "${url}"`);
    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch (error: any) {
    console.error(`[safeFetchJson] [FATAL] Exception occurred during fetch:`, error);
    return {
      ok: false,
      status: 0,
      error: "FETCH_EXCEPTION",
      message: `네트워크 또는 서버 연결 실패: ${error.message || error}`,
    };
  }
}
