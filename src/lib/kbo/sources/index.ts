/**
 * @file index.ts
 * @description KBO 데이터 소스 패키지의 메인 엔트리 포인트입니다.
 * 모든 소스 어댑터 및 통합 관리자(Source Manager)의 API를 외부로 재수출합니다.
 */

export * from './sourceManager';
export { myKboStatsSource } from './myKboStatsSource';
export { officialKboEnglishSource } from './officialKboEnglishSource';
export { theSportsDbSource } from './theSportsDbSource';
export { fallbackSource } from './fallbackSource';
export { fetchWithTimeout } from './fetchWithTimeout';
