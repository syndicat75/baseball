/**
 * @file parseMyKboGameDetail.ts
 * @description MyKBOStats의 개별 경기 상세 페이지를 스크래핑하여 양 팀의 선발투수(이름, 시즌 승패, ERA) 및 부가 팀 성적을 정밀 추출하는 모듈입니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';

export interface DetailPitcherStats {
  name: string;
  wins: number;
  losses: number;
  era: number;
  rawStatsString?: string;
}

export interface GameDetailInfo {
  awayStarter: DetailPitcherStats | null;
  homeStarter: DetailPitcherStats | null;
  awayTeamStats?: {
    wins: number;
    losses: number;
    draws: number;
    battingAvg: number;
    era: number;
    homeRuns: number;
  };
  homeTeamStats?: {
    wins: number;
    losses: number;
    draws: number;
    battingAvg: number;
    era: number;
    homeRuns: number;
  };
  headToHead?: string; // 상대전적 정보 (예: "LG 우세 5승 3패")
}

/**
 * @function parseSeasonRecord
 * @description "Season: 4-4, 3.24" 또는 "4-4, 3.24"와 같은 형태의 문자열에서 승, 패, 평균자책점(ERA) 값을 정밀 검출합니다.
 * @param {string} text - 파싱할 성적 텍스트
 * @returns {{ wins: number; losses: number; era: number } | null} 승, 패, ERA 객체 (추출 실패 시 null)
 */
export function parseSeasonRecord(text: string): { wins: number; losses: number; era: number } | null {
  console.log(`[parseMyKboGameDetail] [CALL] parseSeasonRecord - text: "${text}"`);
  
  // "wins-losses, era" 형태 매칭 정규식 (예: 5-2, 2.88)
  const regex = /(\d+)\s*-\s*(\d+)\s*,\s*(\d+\.\d+)/;
  const match = text.match(regex);
  if (match) {
    const wins = parseInt(match[1], 10);
    const losses = parseInt(match[2], 10);
    const era = parseFloat(match[3]);
    console.log(`[parseMyKboGameDetail] [RESULT] parseSeasonRecord -> Wins: ${wins}, Losses: ${losses}, ERA: ${era}`);
    return { wins, losses, era };
  }
  
  console.log('[parseMyKboGameDetail] [RESULT] parseSeasonRecord -> null (Pattern not matched)');
  return null;
}

/**
 * @function parseMyKboGameDetail
 * @description 제공된 경기 상세 URL을 fetch하고 파싱하여, 양 팀의 선발투수 정보 및 부가 성적 데이터를 안전하게 반환합니다.
 * 실패 시 경기 전체에 영향을 주지 않도록 기본 안전 장치가 내장되어 있습니다.
 * @param {string} detailUrl - MyKBOStats 경기 상세 절대 URL
 * @returns {Promise<GameDetailInfo>} 파싱 완료된 경기 세부 정보 객체
 */
export async function parseMyKboGameDetail(detailUrl: string): Promise<GameDetailInfo> {
  console.log(`[parseMyKboGameDetail] [CALL] parseMyKboGameDetail - detailUrl: "${detailUrl}"`);
  
  const defaultInfo: GameDetailInfo = {
    awayStarter: null,
    homeStarter: null
  };

  try {
    const result = await fetchHtml(detailUrl);
    if (!result.ok) {
      console.warn(`[parseMyKboGameDetail] Failed to fetch game detail page from: "${detailUrl}". Return empty details.`);
      return defaultInfo;
    }

    const $ = cheerio.load(result.text);
    
    // 1. 선발투수 정보 스크래핑
    // MyKBOStats의 경기 상세 페이지 구조는 보통 테이블 및 특정 박스 형태로 선발투수(Starting Pitchers)를 보여줍니다.
    // 텍스트 매칭 및 클래스 탐색을 복합적으로 병렬 수행합니다.
    let awayStarterName = '';
    let homeStarterName = '';
    let awayStarterStats = { wins: 0, losses: 0, era: 0.00 };
    let homeStarterStats = { wins: 0, losses: 0, era: 0.00 };
    
    // "Starting Pitcher"를 담은 텍스트 노드 탐색
    const startingHeader = $('h3:contains("Starting Pitcher"), h4:contains("Starting Pitcher"), td:contains("Starting Pitcher")');
    
    if (startingHeader.length > 0) {
      // 그 주변의 테이블이나 형제 요소를 돌며 투수 이름 및 성적 추출
      console.log('[parseMyKboGameDetail] Found Starting Pitcher header node. Analyzing structure...');
    }
    
    // 보편적으로 투수 정보가 있는 테이블이나 클래스 요소를 탐색합니다.
    // MyKBOStats 상세 페이지의 테이블 구조:
    // 원정 투수 행 / 홈 투수 행 또는 좌우 배치 카드
    $('table tr, div.pitcher, .pitchers').each((_, elem) => {
      const text = $(elem).text().trim();
      
      // "Away Starter:" 또는 "Home Starter:"와 같이 적힌 요소가 있는 경우
      if (text.includes('Away Starter') || text.includes('Away Pitcher')) {
        const parts = text.split('\n').map(p => p.trim()).filter(Boolean);
        // 첫 번째 라인에 이름, 그 아래 라인에 성적이 나오는 경우가 많음
        awayStarterName = parts[0]?.replace(/Away Starter:?/i, '').trim() || '';
        const statsStr = parts.find(p => p.toLowerCase().includes('season') || p.includes('-'));
        if (statsStr) {
          const parsed = parseSeasonRecord(statsStr);
          if (parsed) awayStarterStats = parsed;
        }
      }
      
      if (text.includes('Home Starter') || text.includes('Home Pitcher')) {
        const parts = text.split('\n').map(p => p.trim()).filter(Boolean);
        homeStarterName = parts[0]?.replace(/Home Starter:?/i, '').trim() || '';
        const statsStr = parts.find(p => p.toLowerCase().includes('season') || p.includes('-'));
        if (statsStr) {
          const parsed = parseSeasonRecord(statsStr);
          if (parsed) homeStarterStats = parsed;
        }
      }
    });

    // 위 방식에서 수집에 실패했을 경우를 대비해, 더 유연한 대안적 파싱 로직(텍스트 직접 매칭)도 수행합니다.
    if (!awayStarterName || !homeStarterName) {
      const pageText = $('body').text();
      
      // "Away Starter: [이름]" 혹은 "Starter: [이름]" 형태 정규식 매칭
      const awayMatch = pageText.match(/(?:Away Starter|Away Pitcher|Visitor Starter)\s*:\s*([A-Za-z\s]+)/i);
      const homeMatch = pageText.match(/(?:Home Starter|Home Pitcher)\s*:\s*([A-Za-z\s]+)/i);
      
      if (awayMatch) awayStarterName = awayMatch[1].trim();
      if (homeMatch) homeStarterName = homeMatch[1].trim();
      
      // "Season:" 패턴 검색하여 각각의 투수 성적을 매핑
      const seasonMatches = [...pageText.matchAll(/(?:Season|Record)\s*:\s*(\d+\s*-\s*\d+\s*,\s*\d+\.\d+)/gi)];
      if (seasonMatches.length >= 2) {
        const awayParsed = parseSeasonRecord(seasonMatches[0][1]);
        const homeParsed = parseSeasonRecord(seasonMatches[1][1]);
        if (awayParsed) awayStarterStats = awayParsed;
        if (homeParsed) homeStarterStats = homeParsed;
      }
    }

    // 최종 데이터 맵 구성
    const awayStarter: DetailPitcherStats | null = awayStarterName ? {
      name: awayStarterName,
      wins: awayStarterStats.wins,
      losses: awayStarterStats.losses,
      era: awayStarterStats.era
    } : null;

    const homeStarter: DetailPitcherStats | null = homeStarterName ? {
      name: homeStarterName,
      wins: homeStarterStats.wins,
      losses: homeStarterStats.losses,
      era: homeStarterStats.era
    } : null;

    console.log(`[parseMyKboGameDetail] [SUCCESS] Parsed Away Starter: ${JSON.stringify(awayStarter)}, Home Starter: ${JSON.stringify(homeStarter)}`);
    
    return {
      awayStarter,
      homeStarter
    };
  } catch (error) {
    console.error(`[parseMyKboGameDetail] [ERROR] Failed to parse game detail from URL: "${detailUrl}"`, error);
    return defaultInfo; // 실패해도 경기 수집 전체를 무너뜨리지 않음
  }
}
