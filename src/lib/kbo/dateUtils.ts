/**
 * @file dateUtils.ts
 * @description KBO 리그 웹 애플리케이션의 모든 날짜 연산, 한국 표준시(KST) 변환, 포맷팅 및 형식 검증을 집약 관리하는 유틸리티 파일입니다.
 */

/**
 * @function getKoreaTodayString
 * @description 현재 서버/클라이언트 시간을 바탕으로 한국 표준시(Asia/Seoul) 기준의 "YYYY-MM-DD" 형태의 문자열 날짜를 반환합니다.
 * @returns {string} Asia/Seoul 기준의 "YYYY-MM-DD" 문자열
 */
export function getKoreaTodayString(): string {
  console.log('[dateUtils] [CALL] getKoreaTodayString');
  const result = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  console.log(`[dateUtils] [RESULT] getKoreaTodayString -> "${result}"`);
  return result;
}

/**
 * @function toKboDate
 * @description 하이픈이 포함된 날짜 문자열을 KBO 데이터 조회 포맷인 하이픈 없는 날짜 문자열로 변환합니다.
 * @param {string} dateString 하이픈이 있는 날짜 문자열 (예: "2026-07-01")
 * @returns {string} 하이픈이 제외된 날짜 문자열 (예: "20260701")
 */
export function toKboDate(dateString: string): string {
  console.log(`[dateUtils] [CALL] toKboDate - dateString: "${dateString}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date string: ${dateString}`);
  }
  const result = dateString.replaceAll("-", "");
  console.log(`[dateUtils] [RESULT] toKboDate -> "${result}"`);
  return result;
}

/**
 * @function isValidDateString
 * @description 전달된 문자열이 유효한 "YYYY-MM-DD" 형식인지 엄격히 검증합니다.
 * @param {string} dateString 검증할 날짜 문자열
 * @returns {boolean} 유효성 만족 여부
 */
export function isValidDateString(dateString: string): boolean {
  console.log(`[dateUtils] [CALL] isValidDateString - dateString: "${dateString}"`);
  const result = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  console.log(`[dateUtils] [RESULT] isValidDateString -> ${result}`);
  return result;
}

