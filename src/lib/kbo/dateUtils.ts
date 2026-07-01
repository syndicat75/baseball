/**
 * @file dateUtils.ts
 * @description KBO 리그 웹 애플리케이션의 모든 날짜 연산, 한국 표준시(KST) 변환, 포맷팅 및 형식 검증을 집약 관리하는 유틸리티 파일입니다.
 * 사용자 브라우저 및 서버리스 노드 실행 환경의 타임존 편차(KST vs UTC)를 완벽히 격리하기 위해 Intl API를 사용합니다.
 */

/**
 * @function getKoreaTodayString
 * @description 현재 서버/클라이언트 시간을 바탕으로 한국 표준시(Asia/Seoul) 기준의 "YYYY-MM-DD" 형태의 문자열 날짜를 반환합니다.
 * @returns {string} Asia/Seoul 기준의 "YYYY-MM-DD" 문자열
 */
export function getKoreaTodayString(): string {
  console.log('[dateUtils] [CALL] getKoreaTodayString');
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const result = `${year}-${month}-${day}`;
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
  const result = dateString.replace(/-/g, '');
  console.log(`[dateUtils] [RESULT] toKboDate -> "${result}"`);
  return result;
}

/**
 * @function isValidDateString
 * @description 전달된 문자열이 유효한 "YYYY-MM-DD" 형식이고 실제로 존재하는 날짜인지 엄격히 검증합니다.
 * @param {string} dateString 검증할 날짜 문자열
 * @returns {boolean} 유효성 만족 여부
 */
export function isValidDateString(dateString: string): boolean {
  console.log(`[dateUtils] [CALL] isValidDateString - dateString: "${dateString}"`);
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    console.log('[dateUtils] [RESULT] isValidDateString -> false (정규식 검증 실패)');
    return false;
  }
  
  const parts = dateString.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  if (month < 1 || month > 12) {
    console.log('[dateUtils] [RESULT] isValidDateString -> false (월 범위 초과)');
    return false;
  }
  
  // 해당 월의 실제 마지막 날짜를 구함
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const result = day >= 1 && day <= lastDayOfMonth;
  console.log(`[dateUtils] [RESULT] isValidDateString -> ${result} (일 범위 검증 완료)`);
  return result;
}
