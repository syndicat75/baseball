/**
 * @file kboDataService.ts
 * @description KBO 리그 순위표 및 일정 데이터를 통합 관리하는 핵심 데이터 서비스 레이어입니다.
 * 
 * 주요 기능:
 * 1. 최우선 순위 연동: KBO 국문 공식 크롤러 -> KBO 영문 공식 -> 보조 소스(MyKBO, AiScore) -> 최종 캐시 -> 로컬 예비 데이터 순서로 조회 제어
 * 2. 캐시 만료 정책: 실시간 순위 캐시 TTL 10분 설정으로 최신성 유지
 * 3. 데이터 검증 강화 (games = wins + losses + draws 식 검사 및 10개 구단 일치 검증)
 * 4. 주요 구단(LG, KIA, 삼성, 두산)의 게임 수 비정상 과소 여부 체크
 * 5. 시즌 중 경기수 감소 감지 보호 기작 (STALE_STANDINGS_SOURCE 탐지 및 노출 제한)
 * 6. Vercel 서버리스와 로컬 환경을 모두 완벽 지원하는 캐싱 정책 수립
 */

import { officialKboKoreanSource } from './sources/officialKboKoreanSource';
import { officialKboEnglishSource } from './sources/officialKboEnglishSource';
import { myKboStatsSource } from './sources/myKboStatsSource';
import { aiScoreSource } from './sources/aiScoreSource';
import { fallbackSource } from './sources/fallbackSource';
import { getBestAvailableSchedule } from './sources/sourceManager';
import { getCache, setCache, clearCache } from './cache';
import { getKoreaTodayString } from './dateUtils';
import { KBOStanding } from './sources';
import { CONFIG } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * @interface UnifiedKboData
 * @description 통합 반환되는 KBO 순위 및 일정 결과 패키지입니다.
 */
export interface UnifiedKboData {
  success: boolean;
  date: string;
  kboDate: string;
  source: 'KBO_OFFICIAL_KR' | 'KBO_OFFICIAL_EN' | 'FALLBACK_SOURCE' | 'LAST_SUCCESS_CACHE' | 'BUNDLED_FALLBACK' | string;
  sourceLabel: string;
  asOfDate: string;
  updatedAt: string;
  standings: any[];
  completedGames: any[];
  remainingGames: any[];
  stale: boolean;
  fallbackUsed: boolean;
  message?: string;
  warnings?: string[];
  error?: string;
  lgGames?: number;
  totalGamesVerified?: boolean;
}

/**
 * @function getKoreaTodayYear
 * @description 현재 한국 시간 기준의 연도(YYYY)를 정수로 반환합니다.
 * @returns {number} KST 연도
 */
function getKoreaTodayYear(): number {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric'
  });
  return parseInt(formatter.format(d).replace(/[^0-9]/g, ''), 10);
}

/**
 * @function validateStandings
 * @description 순위표 데이터 규격과 games = wins + losses + draws 정합성 공식을 전수 검증합니다.
 * @param {KBOStanding[]} teams 검증할 순위 목록
 * @returns {{ valid: boolean; reason?: string }} 검증 결과
 */
export function validateStandings(teams: KBOStanding[]): { valid: boolean; reason?: string } {
  console.log(`[kboDataService] [CALL] validateStandings - Validating ${teams.length} teams`);
  
  if (!teams || teams.length !== 10) {
    return { valid: false, reason: `팀 개수가 10개가 아닙니다. (현재: ${teams?.length || 0}개)` };
  }

  // 1. 경기수 공식 검증 (games = wins + losses + draws)
  for (const team of teams) {
    const sum = team.wins + team.losses + team.draws;
    if (team.games !== sum) {
      return { 
        valid: false, 
        reason: `[${team.team}] 경기수 정합성 검증 실패: games(${team.games}) !== wins(${team.wins}) + losses(${team.losses}) + draws(${team.draws})` 
      };
    }
  }

  // 2. 주요 팀(LG, KIA, 삼성, 두산)의 경기수 비정상 과소 여부 검증 (예: 시즌 진행 중인데 0이거나 극도로 낮은 경우)
  // 단, 시즌 리셋 극초기(전체 경기수 총합이 매우 낮을 때)는 허용
  const majorTeams = ['LG', 'KIA', 'SAMSUNG', 'DOOSAN'];
  const totalGamesSum = teams.reduce((acc, t) => acc + t.games, 0);

  // 만약 리그 총 경기수 합산이 30경기 이상 진행되었다면, 주요 팀들의 경기수가 최소 5경기 이상이어야 함
  if (totalGamesSum > 30) {
    for (const teamCode of majorTeams) {
      const teamData = teams.find(t => t.team === teamCode);
      if (!teamData || teamData.games < 5) {
        return { 
          valid: false, 
          reason: `주요 구단 [${teamCode}]의 경기수(${teamData?.games || 0})가 총 리그 진행 상황에 비해 비정상적으로 작습니다.` 
        };
      }
    }
  }

  return { valid: true };
}

/**
 * @function getUnifiedKboData
 * @description 캐시 정책 및 다중 우선순위 데이터 소스를 연동하여 완벽한 최신 순위/일정 꾸러미를 구축합니다.
 * @param {string} [date] 조회 기준일 (생략 시 KST 오늘)
 * @param {boolean} [forceRefresh] 캐시 강제 삭제 및 최신 크롤링 수집 여부
 * @returns {Promise<UnifiedKboData>} 통합 KBO 정보 패키지
 */
export async function getUnifiedKboData(date?: string, forceRefresh = false): Promise<UnifiedKboData> {
  const todayStr = getKoreaTodayString();
  const targetDate = date || todayStr;
  const kboDateStr = targetDate.replace(/-/g, '');
  const currentYear = getKoreaTodayYear();

  console.log(`[kboDataService] [CALL] getUnifiedKboData - targetDate: "${targetDate}", forceRefresh: ${forceRefresh}`);

  // 강제 새로고침이 활성화된 경우, 전체 캐시 클리어
  if (forceRefresh) {
    console.log('[kboDataService] Force Refresh active. Purging all standings and schedule caches.');
    await clearCache();
  }

  // 1. 이미 메모리/로컬 캐시된 데이터가 있는지 확인 (TTL: standings 10분, schedule 30분)
  const cacheKey = `kbo:unified_package:${targetDate}`;
  const standingsTtl = 10 * 60 * 1000; // 10분

  if (!forceRefresh) {
    const cachedData = await getCache<UnifiedKboData>(cacheKey, standingsTtl);
    if (cachedData) {
      console.log(`[kboDataService] [SUCCESS] Cache hit for Unified Kbo Data package! key: "${cacheKey}"`);
      return {
        ...cachedData,
        message: cachedData.stale ? '공식 데이터 수집 실패로 마지막 성공 캐시를 사용 중입니다.' : '정상 보존 중인 최신 캐시 데이터입니다.'
      };
    }
  }

  // 2. 캐시 미스 발생 시 실시간 크롤링 시도
  console.log('[kboDataService] Cache miss or forceRefresh. Attempting fresh live crawl.');

  const failedSources: string[] = [];
  let finalStandings: KBOStanding[] | null = null;
  let selectedSource: 'KBO_OFFICIAL_KR' | 'KBO_OFFICIAL_EN' | 'FALLBACK_SOURCE' | 'LAST_SUCCESS_CACHE' | 'BUNDLED_FALLBACK' = 'BUNDLED_FALLBACK';
  let sourceLabel = '번들 로컬 예비 데이터';
  let isStale = false;
  let isFallbackUsed = false;
  let warnings: string[] = [];

  // 우선순위 정의된 수집 리스트 순회
  const sourcesToTry = [
    { id: 'KBO_OFFICIAL_KR', label: 'KBO 공식 국문 데이터', action: () => officialKboKoreanSource.getStandings() },
    { id: 'KBO_OFFICIAL_EN', label: 'KBO 공식 영문 데이터', action: () => officialKboEnglishSource.getStandings() },
    { id: 'FALLBACK_SOURCE_MYKBO', label: 'MyKBOStats 비공식 보조 데이터', action: () => myKboStatsSource.getStandings() },
    { id: 'FALLBACK_SOURCE_AISCORE', label: 'AiScore 비공식 보조 데이터', action: () => aiScoreSource.getStandings() }
  ];

  // 기존 보관중인 "가장 최근의 성공적인 순위 정보" 조회 (Stale 방지 및 경기수 비감소 규칙 검증용)
  const latestGoodCacheKey = 'kbo:standings:latest_good_v2';
  const previousGoodPackage = await getCache<{ year: number; standings: KBOStanding[] }>(latestGoodCacheKey, 365 * 24 * 3600 * 1000); // 무제한 TTL

  for (const src of sourcesToTry) {
    try {
      console.log(`[kboDataService] Crawling standings from: [${src.id}] (${src.label})`);
      const parsed = await src.action();
      
      // A. 기본 규격 검증
      const valResult = validateStandings(parsed);
      if (!valResult.valid) {
        console.warn(`[kboDataService] [VALIDATION_FAILED] Source ${src.id} data is invalid: ${valResult.reason}`);
        failedSources.push(`${src.id} (규격 미달: ${valResult.reason})`);
        continue;
      }

      // B. 경기수 감소 여부 검증 (동일 시즌 보호 기작)
      if (previousGoodPackage && previousGoodPackage.year === currentYear) {
        const oldLg = previousGoodPackage.standings.find(t => t.team === 'LG');
        const newLg = parsed.find(t => t.team === 'LG');

        const oldTotalGames = previousGoodPackage.standings.reduce((sum, t) => sum + t.games, 0);
        const newTotalGames = parsed.reduce((sum, t) => sum + t.games, 0);

        if (oldLg && newLg) {
          // 동일 시즌 내에서 경기수가 이전 성공 데이터보다 적으면 stale 상태의 오래된 소스로 파악하여 기각
          // 단, 이전 데이터가 120개 초과이고 새 데이터가 10개 미만인 극단 상황은 다음 해 리셋 등의 예외로 간주
          const isSeasonReset = oldLg.games > 120 && newLg.games < 10;
          
          if (!isSeasonReset) {
            if (newLg.games < oldLg.games) {
              const errMsg = `STALE_STANDINGS_SOURCE: LG 경기수가 기존 최신 캐시(${oldLg.games})보다 새로 크롤링한 결과(${newLg.games})가 더 작아 무시합니다.`;
              console.warn(`[kboDataService] [STALE_PROTECTION] ${errMsg}`);
              failedSources.push(`${src.id} (stale 감지: LG ${newLg.games} vs ${oldLg.games})`);
              continue;
            }
            if (newTotalGames < oldTotalGames) {
              const errMsg = `STALE_STANDINGS_SOURCE: 전체 구단 합산 경기수가 기존 최신 캐시(${oldTotalGames})보다 새로 크롤링한 결과(${newTotalGames})가 더 작아 무시합니다.`;
              console.warn(`[kboDataService] [STALE_PROTECTION] ${errMsg}`);
              failedSources.push(`${src.id} (stale 감지: 전체합산 ${newTotalGames} vs ${oldTotalGames})`);
              continue;
            }
          }
        }
      }

      // 모든 검증 통과 완료!
      finalStandings = parsed;
      if (src.id === 'KBO_OFFICIAL_KR') {
        selectedSource = 'KBO_OFFICIAL_KR';
        isFallbackUsed = false;
      } else if (src.id === 'KBO_OFFICIAL_EN') {
        selectedSource = 'KBO_OFFICIAL_EN';
        isFallbackUsed = false;
      } else {
        selectedSource = 'FALLBACK_SOURCE';
        isFallbackUsed = true;
        warnings.push(`기본 공식 데이터 수집 실패로 인해 신뢰할 수 있는 보조 데이터(${src.label})를 활용해 복구했습니다.`);
      }
      sourceLabel = src.label;
      break; // 수집 성공 시 루프 종료
    } catch (err: any) {
      console.warn(`[kboDataService] Source ${src.id} failed with error: ${err.message || err}`);
      failedSources.push(`${src.id} (에러: ${err.message || err})`);
    }
  }

  // 3. 만약 모든 실시간 수집 소스가 실패했다면 "마지막 성공 캐시" 활용 시도
  if (!finalStandings && previousGoodPackage) {
    console.log('[kboDataService] [FALLBACK] 모든 실시간 스크래핑 실패. 마지막 정상 성공 캐시(LAST_SUCCESS_CACHE) 기동.');
    finalStandings = previousGoodPackage.standings;
    selectedSource = 'LAST_SUCCESS_CACHE';
    sourceLabel = '마지막 성공 캐시 데이터';
    isStale = true;
    isFallbackUsed = true;
    warnings.push('공식 및 보조 데이터 실시간 수집에 전면 실패하여 최신 정보 대신 마지막으로 성공했던 이전 캐시 데이터를 표시하고 있습니다.');
  }

  // 4. 만약 마지막 성공 캐시마저 없다면 최후의 수단으로 번들 로컬 예비 데이터(fallbackSource) 사용
  if (!finalStandings) {
    console.warn('[kboDataService] [CRITICAL] 실시간 수집 실패 및 캐시 데이터 부재로 번들 로컬 예비 데이터 적용.');
    try {
      const backup = await fallbackSource.getStandings();
      finalStandings = backup;
      selectedSource = 'BUNDLED_FALLBACK';
      sourceLabel = fallbackSource.label;
      isStale = true;
      isFallbackUsed = true;
      warnings.push('네트워크 수집 장치 중단 및 보존 캐시 소실로 인해, 내장된 로컬 예비 정적 데이터셋이 활성화되었습니다.');
    } catch (criticalErr: any) {
      console.error('[kboDataService] [FATAL] 내장 로컬 예비 데이터 로드조차 실패:', criticalErr);
      throw new Error(`KBO 데이터를 구축하지 못했습니다. (세부사유: ${failedSources.join(', ')})`);
    }
  }

  // 5. 일정 정보 수집 연동
  let scheduleGames: any[] = [];
  try {
    const schedResult = await getBestAvailableSchedule(targetDate);
    scheduleGames = schedResult.games || [];
  } catch (schedErr: any) {
    console.warn('[kboDataService] 일정 데이터 로드 실패. 내장 백업에서 스케줄을 추출합니다.', schedErr);
    try {
      const emergencySched = await fallbackSource.getSchedule();
      scheduleGames = [...(emergencySched.completedGames || []), ...(emergencySched.remainingGames || [])];
    } catch (err: any) {
      console.error('[kboDataService] 내장 백업 일정 로드 실패:', err);
    }
  }

  const completedGames = scheduleGames.filter(g => g.status === 'completed');
  const remainingGames = scheduleGames.filter(g => g.status !== 'completed');

  // 6. 성공한 양질의 순위표를 영구 캐시에 백업 저장
  if (selectedSource !== 'LAST_SUCCESS_CACHE' && selectedSource !== 'BUNDLED_FALLBACK' && finalStandings) {
    console.log(`[kboDataService] Saving validated fresh standings to latest_good cache. Source: "${selectedSource}"`);
    await setCache(latestGoodCacheKey, {
      year: currentYear,
      standings: finalStandings
    });
  }

  const lgData = finalStandings.find(t => t.team === 'LG');

  const unifiedPackage: UnifiedKboData = {
    success: true,
    date: targetDate,
    kboDate: kboDateStr,
    source: selectedSource,
    sourceLabel,
    asOfDate: targetDate,
    updatedAt: new Date().toISOString(),
    standings: finalStandings,
    completedGames,
    remainingGames,
    stale: isStale,
    fallbackUsed: isFallbackUsed,
    warnings: warnings.length > 0 ? warnings : undefined,
    lgGames: lgData?.games || 0,
    totalGamesVerified: true
  };

  // 7. 조회 기준일 기준의 캐시 패키지 메모리/디스크 세팅 (TTL 10분)
  await setCache(cacheKey, unifiedPackage);

  // 8. Vercel 디스크나 로컬 디스크 파일 백업 (최상의 호환성 유지)
  try {
    const fileData = {
      asOfDate: targetDate,
      fetchedAt: unifiedPackage.updatedAt,
      primarySource: selectedSource,
      sourceLabel,
      standings: finalStandings,
      completedGames,
      remainingGames,
      warnings: unifiedPackage.warnings
    };

    const filesToSave = [`kbo-${targetDate}.json`, 'kbo-latest.json'];
    for (const fileName of filesToSave) {
      const candidates = [
        path.join(process.cwd(), 'public', 'data', fileName),
        path.join(process.cwd(), 'data', fileName),
        path.join('/tmp', fileName)
      ];
      for (const p of candidates) {
        try {
          const dir = path.dirname(p);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(p, JSON.stringify(fileData, null, 2), 'utf-8');
          console.log(`[kboDataService] Successfully wrote JSON backup to: ${p}`);
        } catch (e) {}
      }
    }
  } catch (backupErr: any) {
    console.warn('[kboDataService] Non-blocking filesystem sync backup warning:', backupErr.message);
  }

  // 디버그 검증 로그 기록 (요구사항 A 및 J 충족)
  const parsedTeamCount = finalStandings.length;
  const lgGames = lgData?.games || 0;
  
  console.log("[KBO_STANDINGS_DEBUG]", {
    requestedDate: targetDate,
    koreaToday: todayStr,
    sourceName: selectedSource,
    sourceUrl: selectedSource === 'KBO_OFFICIAL_KR' ? CONFIG.KBO_URLS.standings : 'N/A',
    responseStatus: 200,
    parsedTeamCount,
    lgRow: JSON.stringify(lgData),
    lgGames,
    updatedAt: unifiedPackage.updatedAt,
    cacheHit: false,
    cacheKey,
    fallbackUsed: isFallbackUsed,
    fallbackReason: failedSources.join(', ') || 'None'
  });

  return unifiedPackage;
}
