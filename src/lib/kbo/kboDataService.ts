/**
 * @file kboDataService.ts
 * @description KBO 공식 영문 데이터 소스와 MyKBOStats 보조 소스를 통합하여,
 * 실시간 순위표 및 상세 경기 승률 예측 정보(선발투수 포함)를 수집, 검증, 영구 보존하는 통합 데이터 서비스 모듈입니다.
 */

import { parseOfficialStandings, OfficialTeamStanding } from './sources/parseOfficialStandings';
import { parseOfficialScoreboard, ScoreboardGame } from './sources/parseOfficialScoreboard';
import { parseMyKboSchedule, MyKboGame } from './sources/parseMyKboSchedule';
import { parseMyKboGameDetail, DetailPitcherStats } from './sources/parseMyKboGameDetail';
import { validateStandingsData, detectDataDegradation } from './sources/validateKboData';
import { getCache, setCache, deleteCache } from './cache';
import { getKoreaTodayString, toKboDate } from './dateUtils';
import { fallbackSchedule2026 } from '../../data/fallbackSchedule2026';

export interface StandingsResult {
  success: boolean;
  source: string;
  sourceLabel: string;
  asOfDate: string;
  updatedAt: string;
  stale: boolean;
  fallbackUsed: boolean;
  standings: OfficialTeamStanding[];
  warnings?: string[];
  error?: string;
  message?: string;
}

export interface TodayGamesResult {
  success: boolean;
  date: string;
  kboDate: string;
  source: string;
  sourceLabel: string;
  fallbackUsed: boolean;
  updatedAt: string;
  games: any[];
  emptyReason: 'NO_SCHEDULED_GAMES' | 'FETCH_OR_PARSE_FAILED' | null;
  error?: string;
  warnings?: string[];
  message?: string;
}

/**
 * @function getStandingsData
 * @description KBO 공식 영문 페이지를 우선으로 순위표를 조회하며, 장애 시 마지막 성공 캐시를 반환합니다.
 * @param {boolean} [forceRefresh=false] - 캐시를 무효화하고 실시간으로 다시 긁어올지 여부
 * @returns {Promise<StandingsResult>} 수집/가공 완료된 순위 데이터 세트
 */
export async function getStandingsData(forceRefresh = false): Promise<StandingsResult> {
  const todayStr = getKoreaTodayString();
  const cacheKey = 'kbo:standings:latest';
  const ttlMs = 10 * 60 * 1000; // 10분 TTL

  console.log(`[kboDataService] [CALL] getStandingsData - forceRefresh: ${forceRefresh}`);

  if (forceRefresh) {
    console.log(`[kboDataService] Force refresh active. Invalidating standings cache key: "${cacheKey}"`);
    await deleteCache(cacheKey);
  } else {
    const cached = await getCache<StandingsResult>(cacheKey, ttlMs);
    if (cached && cached.success && cached.standings && cached.standings.length === 10) {
      console.log(`[kboDataService] [SUCCESS] Standings cache hit! Key: "${cacheKey}"`);
      return {
        ...cached,
        stale: false,
        message: '정상 보존 중인 최신 캐시 데이터입니다.'
      };
    }
  }

  const nowStr = new Date().toISOString();

  try {
    // 1. KBO 공식 영문 순위표 직접 수집 시도
    console.log('[kboDataService] Crawling fresh standings from KBO Official English Website.');
    const standings = await parseOfficialStandings();

    // 2. 파싱 및 비즈니스 데이터 무결성 전수 검증
    validateStandingsData(standings);

    // 3. 데이터 역전/퇴화(경기수 감소) 방지 장치 가동
    // 오래된 캐시가 최신 데이터를 덮어쓰거나, 데이터가 과거로 밀리는 것을 막습니다.
    const lastGoodCacheKey = 'kbo:standings:latest_good_v2';
    const previousGood = await getCache<{ standings: OfficialTeamStanding[] }>(lastGoodCacheKey, 365 * 24 * 3600 * 1000);

    if (previousGood && previousGood.standings) {
      const isDegraded = detectDataDegradation(standings, previousGood.standings);
      if (isDegraded) {
        console.warn('[kboDataService] Newly crawled standings total games is less than previously cached good standings. Treating as Stale.');
        
        // 퇴화된 데이터를 캐시에 오버라이트하지 않고, 마지막 좋은 캐시를 stale 마킹하여 반환
        const response: StandingsResult = {
          success: true,
          source: 'KBO_OFFICIAL_EN_STALE',
          sourceLabel: 'KBO 공식 영문 (이전 데이터 캐시)',
          asOfDate: todayStr,
          updatedAt: nowStr,
          stale: true,
          fallbackUsed: true,
          standings: previousGood.standings,
          warnings: ['새로 수집된 공식 데이터가 기존의 누적 경기수보다 줄어든 과거 데이터(Stale)로 탐지되어 최신 캐시본으로 보존 처리했습니다.']
        };
        await setCache(cacheKey, response);
        return response;
      }
    }

    // 4. 수집 성공 데이터 영구 백업용 저장
    await setCache(lastGoodCacheKey, { standings });

    const result: StandingsResult = {
      success: true,
      source: 'KBO_OFFICIAL_EN',
      sourceLabel: 'KBO 공식 영문 데이터',
      asOfDate: todayStr,
      updatedAt: nowStr,
      stale: false,
      fallbackUsed: false,
      standings
    };

    // 실시간 캐시 10분 TTL 저장
    await setCache(cacheKey, result);
    console.log('[kboDataService] [SUCCESS] Standings saved to cache successfully.');
    return result;

  } catch (error: any) {
    console.error('[kboDataService] [ERROR] Failed to fetch live standings', error);

    // 5. 실시간 수집 실패 시 마지막으로 성공 보관했던 캐시를 비상 복구 수단으로 사용
    const lastGoodCacheKey = 'kbo:standings:latest_good_v2';
    const previousGood = await getCache<{ standings: OfficialTeamStanding[] }>(lastGoodCacheKey, 365 * 24 * 3600 * 1000);

    if (previousGood && previousGood.standings && previousGood.standings.length === 10) {
      console.log('[kboDataService] [FALLBACK] Successfully recovered last known good standings cache.');
      const fallbackResult: StandingsResult = {
        success: true,
        source: 'LAST_SUCCESS_CACHE',
        sourceLabel: '마지막 성공 캐시 데이터 (실시간 복구)',
        asOfDate: todayStr,
        updatedAt: nowStr,
        stale: true,
        fallbackUsed: true,
        standings: previousGood.standings,
        warnings: [`실시간 공식 순위표 수집에 실패하여 이전 성공 캐시본을 활용해 응답을 재구성했습니다. (오류: ${error.message || error})`]
      };
      return fallbackResult;
    }

    // 6. 최후의 비상 캐시까지 소실된 경우 success: false 반환
    const failResult: StandingsResult = {
      success: false,
      source: 'NONE',
      sourceLabel: '수집 실패',
      asOfDate: todayStr,
      updatedAt: nowStr,
      stale: true,
      fallbackUsed: true,
      standings: [],
      error: 'STANDINGS_FETCH_FAILED',
      message: `순위표를 불러오는 데 완전히 실패했습니다. (세부 정보: ${error.message || error})`
    };
    return failResult;
  }
}

/**
 * @function getTodayGamesData
 * @description 해당 날짜의 일정을 KBO 공식 스코어보드를 최우선으로 수집하고, 실패 혹은 오늘 외 날짜 조회 시 MyKBOStats 주간 일정을 fallback 삼아 수집합니다.
 * @param {string} dateStr - 조회 대상 날짜 문자열 (YYYY-MM-DD)
 * @param {boolean} [forceRefresh=false] - 캐시 강제 삭제 후 최신 정보 수집 여부
 * @returns {Promise<TodayGamesResult>} 수집/가공 완료된 당일 경기 일정 정보 패키지
 */
export async function getTodayGamesData(dateStr: string, forceRefresh = false, includeDetails = false): Promise<TodayGamesResult> {
  console.log(`[kboDataService] [CALL] getTodayGamesData - dateStr: "${dateStr}", forceRefresh: ${forceRefresh}, includeDetails: ${includeDetails}`);
  const cacheKey = `kbo:schedule:${dateStr}:${includeDetails ? 'detailed' : 'basic'}`;

  if (forceRefresh) {
    console.log(`[kboDataService] Force refresh active. Invalidating schedule cache key: "${cacheKey}"`);
    await deleteCache(cacheKey);
  } else {
    const cached = await getCache<TodayGamesResult>(cacheKey, 5 * 60 * 1000);
    if (cached && cached.success) {
      console.log(`[kboDataService] [SUCCESS] Schedule cache hit! Key: "${cacheKey}"`);
      return cached;
    }
  }

  const kboDateStr = toKboDate(dateStr);
  const nowStr = new Date().toISOString();

  let parsedGames: any[] = [];
  let selectedSource = 'KBO_OFFICIAL_KO';
  let sourceLabel = 'KBO 공식 스코어보드';
  let fallbackUsed = false;

  // 1. KBO 공식 한국어 스코어보드 수집 최우선 시도
  try {
    console.log(`[kboDataService] Attempting KBO official scoreboard parse for date: "${dateStr}"`);
    const scoreboardGames = await parseOfficialScoreboard(dateStr);
    
    if (scoreboardGames) {
      if (scoreboardGames.length > 0) {
        parsedGames = scoreboardGames;
        console.log(`[kboDataService] Successfully parsed ${parsedGames.length} games from official KBO scoreboard.`);
      } else {
        // 공식 스코어보드 페이지는 성공적으로 로딩되었으나 경기가 0건인 경우 -> 진짜 경기 없는 날 (예: 월요일)
        console.log(`[kboDataService] Official KBO scoreboard successfully returned 0 games for date: "${dateStr}". Confirmed genuine off-day.`);
        const emptyResponse: TodayGamesResult = {
          success: true,
          date: dateStr,
          kboDate: kboDateStr,
          source: 'KBO_OFFICIAL_KO',
          sourceLabel: 'KBO 공식 스코어보드',
          fallbackUsed: false,
          updatedAt: nowStr,
          games: [],
          emptyReason: 'NO_SCHEDULED_GAMES'
        };
        await setCache(cacheKey, emptyResponse);
        return emptyResponse;
      }
    }
  } catch (error: any) {
    // 2. KBO 공식 실패 시, MyKBOStats 주간 일정 fallback 기동
    console.log(`[kboDataService] Official scoreboard failed: ${error.message || error}. Running MyKBOStats week schedule parser.`);
    selectedSource = 'MYKBO_UNOFFICIAL';
    sourceLabel = 'MyKBOStats 보조 데이터';
    fallbackUsed = true;

    try {
      const myKboGames = await parseMyKboSchedule(dateStr);
      if (myKboGames) {
        if (myKboGames.length > 0) {
          parsedGames = myKboGames;
          console.log(`[kboDataService] Successfully fallback parsed ${parsedGames.length} games from MyKBOStats week schedule.`);
        } else {
          // MyKBOStats도 에러 없이 성공적으로 돌았으나 0건인 경우 역시 진짜 경기 없는 날
          console.log(`[kboDataService] MyKBOStats successfully confirmed 0 scheduled games for date: "${dateStr}".`);
          const emptyResponse: TodayGamesResult = {
            success: true,
            date: dateStr,
            kboDate: kboDateStr,
            source: 'MYKBO_UNOFFICIAL',
            sourceLabel: 'MyKBOStats 보조 데이터',
            fallbackUsed: true,
            updatedAt: nowStr,
            games: [],
            emptyReason: 'NO_SCHEDULED_GAMES'
          };
          await setCache(cacheKey, emptyResponse);
          return emptyResponse;
        }
      }
    } catch (fallbackError: any) {
      console.error('[kboDataService] [FATAL] Both official scoreboard and MyKBOStats fallback failed!', fallbackError);
      
      // 실시간 수집 에러 발생 시 fallbackSchedule2026을 사용해 실시간 일정을 채우지 않고 에러 반환 (경기 없음 오기입 차단)
      const failResponse: TodayGamesResult = {
        success: false,
        date: dateStr,
        kboDate: kboDateStr,
        source: 'NONE',
        sourceLabel: '수집 실패',
        fallbackUsed: false,
        updatedAt: nowStr,
        games: [],
        emptyReason: 'FETCH_OR_PARSE_FAILED',
        error: 'SCHEDULE_FETCH_FAILED',
        message: `KBO 공식 및 보조 일정 데이터 수집에 전면 실패했습니다. (공식에러: ${error.message || error}, 보조에러: ${fallbackError.message || fallbackError})`
      };
      return failResponse;
    }
  }

  // 3. 실제 잡힌 경기가 없는 경우 (예: 월요일 무경기)
  if (parsedGames.length === 0) {
    console.log(`[kboDataService] No scheduled games found for "${dateStr}". Returning empty schedule response.`);
    const emptyResponse: TodayGamesResult = {
      success: true,
      date: dateStr,
      kboDate: kboDateStr,
      source: selectedSource,
      sourceLabel,
      fallbackUsed,
      updatedAt: nowStr,
      games: [],
      emptyReason: 'NO_SCHEDULED_GAMES'
    };
    await setCache(cacheKey, emptyResponse);
    return emptyResponse;
  }

  // 4. 각 경기 카드별 선발투수 정보 상세 크롤링 병렬 수행 여부 제어
  let detailedGames: any[] = [];
  
  if (includeDetails) {
    console.log(`[kboDataService] Performing detail pitcher stats parsing for ${parsedGames.length} games.`);
    detailedGames = await Promise.all(
      parsedGames.map(async (g) => {
        const updatedGame = {
          gameId: g.gameId,
          date: g.date,
          time: g.time,
          awayTeam: g.awayTeam,
          homeTeam: g.homeTeam,
          awayScore: g.awayScore,
          homeScore: g.homeScore,
          status: g.status === '종료' ? '종료' : g.status === '진행중' ? '진행중' : g.status === '우천취소' ? '우천취소' : '예정',
          stadium: g.stadium,
          source: g.source,
          sourceUrl: g.sourceUrl,
          awayStarter: null as DetailPitcherStats | null,
          homeStarter: null as DetailPitcherStats | null,
          prediction: null as any
        };

        if (g.detailUrl) {
          try {
            console.log(`[kboDataService] Crawling game detail pitcher for game: "${g.gameId}" via: "${g.detailUrl}"`);
            const detailCacheKey = `kbo:game-detail:${g.gameId}`;
            let detail = await getCache<any>(detailCacheKey, 10 * 60 * 1000);
            
            if (!detail) {
              detail = await parseMyKboGameDetail(g.detailUrl);
              await setCache(detailCacheKey, detail);
            }
            
            if (detail) {
              updatedGame.awayStarter = detail.awayStarter;
              updatedGame.homeStarter = detail.homeStarter;
            }
          } catch (detailErr) {
            console.warn(`[kboDataService] Non-blocking warning: Failed to fetch starter pitcher for game ${g.gameId}:`, detailErr);
          }
        }

        return updatedGame;
      })
    );
  } else {
    console.log(`[kboDataService] Skipping detail pitcher stats parsing as requested (includeDetails is false).`);
    detailedGames = parsedGames.map((g) => ({
      gameId: g.gameId,
      date: g.date,
      time: g.time,
      awayTeam: g.awayTeam,
      homeTeam: g.homeTeam,
      awayScore: g.awayScore,
      homeScore: g.homeScore,
      status: g.status === '종료' ? '종료' : g.status === '진행중' ? '진행중' : g.status === '우천취소' ? '우천취소' : '예정',
      stadium: g.stadium,
      source: g.source,
      sourceUrl: g.sourceUrl,
      awayStarter: null,
      homeStarter: null,
      prediction: null
    }));
  }

  // 5. 최종 구성 일정 패키지 완성 및 캐시 보관
  const finalResponse: TodayGamesResult = {
    success: true,
    date: dateStr,
    kboDate: kboDateStr,
    source: selectedSource,
    sourceLabel,
    fallbackUsed,
    updatedAt: nowStr,
    games: detailedGames,
    emptyReason: null
  };

  // 종료된 경기가 있으면 캐시를 길게(30분), 모두 예정인 경우 5분 TTL 세팅
  const hasUnfinishedGames = detailedGames.some(g => g.status === '예정' || g.status === '진행중');
  const finalTtl = hasUnfinishedGames ? 5 * 60 * 1000 : 30 * 60 * 1000;
  
  await setCache(cacheKey, finalResponse);
  console.log(`[kboDataService] [SUCCESS] getTodayGamesData saved to cache successfully. TTL: ${finalTtl / 60000} minutes.`);
  return finalResponse;
}
