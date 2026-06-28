/**
 * @file loadKboStaticData.ts
 * @description 브라우저에서 KBO 최신 수집 정적 JSON 데이터를 비동기 fetch 방식으로 로드하고,
 * 로드 실패 시 내장된 fallback 데이터셋으로 안전하게 전환하는 정적 데이터 관리 레이어입니다.
 * 로그는 모든 함수 호출마다 남기며, 각 함수에는 javadoc 스타일의 docstring을 추가합니다.
 */

import { fallbackKboData } from '../../data/fallbackKboData';

export interface LoadKboStaticDataResult {
  data: any;
  source: string;
  sourceLabel: string;
  isFallback: boolean;
  warnings: string[];
  fetchedAt: string | null;
}

/**
 * @function loadKboStaticData
 * @description 브라우저가 직접 /data/kbo-latest.json 또는 날짜별 JSON을 fetch하여 최신 수집된 데이터를 로드합니다.
 * 만약 네트워크 장애 또는 파일 부재로 로드에 실패하면, bundled fallback 데이터를 반환합니다.
 * @param {string} [targetDate] 특정 수집 기준일 (YYYY-MM-DD)
 * @returns {Promise<LoadKboStaticDataResult>} 로드 성공 정보와 데이터 구조체
 */
export async function loadKboStaticData(targetDate?: string): Promise<LoadKboStaticDataResult> {
  console.log(`[loadKboStaticData] [CALL] loadKboStaticData has been invoked with targetDate: "${targetDate || 'latest'}"`);
  const ts = Date.now();
  
  // 1. 날짜가 지정된 경우 해당 일자의 JSON 파일 먼저 fetch 시도
  if (targetDate) {
    try {
      const dateUrl = `/data/kbo-${targetDate}.json?ts=${ts}`;
      console.log(`[loadKboStaticData] Trying date-specific JSON: ${dateUrl}`);
      const dateResponse = await fetch(dateUrl);
      if (dateResponse.ok) {
        const data = await dateResponse.json();
        console.log(`[loadKboStaticData] Successfully loaded date-specific JSON: ${dateUrl}`);
        return {
          data,
          source: data.primarySource || 'static-json',
          sourceLabel: data.sourceLabel || `예약 수집 JSON 데이터 (${targetDate})`,
          isFallback: false,
          warnings: data.warnings || [],
          fetchedAt: data.fetchedAt || null,
        };
      } else {
        console.log(`[loadKboStaticData] Date-specific JSON not found or returned error (${dateResponse.status}). Falling back to latest JSON.`);
      }
    } catch (err) {
      console.warn('[loadKboStaticData] Error fetching date-specific JSON, trying latest.', err);
    }
  }

  // 2. 최신 수집 데이터 fetch 시도
  try {
    const latestUrl = `/data/kbo-latest.json?ts=${ts}`;
    console.log(`[loadKboStaticData] Fetching latest static JSON: ${latestUrl}`);
    
    const response = await fetch(latestUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[loadKboStaticData] Successfully loaded latest static JSON data.', {
      asOfDate: data.asOfDate,
      sourceLabel: data.sourceLabel,
      fetchedAt: data.fetchedAt,
    });
    
    return {
      data,
      source: data.primarySource || 'static-json',
      sourceLabel: data.sourceLabel || '예약 수집 JSON 데이터',
      isFallback: false,
      warnings: data.warnings || [],
      fetchedAt: data.fetchedAt || null,
    };
  } catch (error: any) {
    console.warn('[loadKboStaticData] Failed to load static KBO JSON. Switching to bundled fallback.', error);
    return {
      data: fallbackKboData,
      source: 'bundled-fallback',
      sourceLabel: '내장 fallback 데이터',
      isFallback: true,
      warnings: ['예약 수집 JSON 데이터를 읽지 못해 내장 데이터로 계산합니다.'],
      fetchedAt: fallbackKboData.fetchedAt,
    };
  }
}
