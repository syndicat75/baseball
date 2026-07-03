/**
 * @file parseMyKboGameDetails.ts
 * @description MyKBOStats 경기 상세 페이지 또는 대체 데이터를 이용해 양 팀 선발투수 정보를 수집 및 파싱합니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';

export interface DetailStarter {
  name: string;
  teamName: string;
  wins: number;
  losses: number;
  era: number;
  whip: number | null;
  innings: number | null;
  strikeouts: number | null;
  source: string;
}

export interface ParsedGameDetail {
  awayStarter: DetailStarter | null;
  homeStarter: DetailStarter | null;
  missingData: string[];
}

/**
 * @function parseSeasonRecord
 * @description "Season: 4-4, 3.24" 또는 "4-4, 3.24"와 같은 문자열에서 승, 패, 평균자책점(ERA)을 파싱합니다.
 */
function parseSeasonRecord(text: string): { wins: number; losses: number; era: number } | null {
  const regex = /(\d+)\s*-\s*(\d+)\s*,\s*(\d+\.\d+)/;
  const match = text.match(regex);
  if (match) {
    const wins = parseInt(match[1], 10);
    const losses = parseInt(match[2], 10);
    const era = parseFloat(match[3]);
    return { wins, losses, era };
  }
  return null;
}

/**
 * @function parseMyKboGameDetails
 * @description 경기 상세 URL에서 선발투수명, 시즌 기록을 파싱합니다.
 */
export async function parseMyKboGameDetails(
  detailUrl: string,
  awayTeam: string,
  homeTeam: string
): Promise<ParsedGameDetail> {
  console.log(`[parseMyKboGameDetails] [CALL] detailUrl: "${detailUrl}" (Away: ${awayTeam}, Home: ${homeTeam})`);
  
  const result: ParsedGameDetail = {
    awayStarter: null,
    homeStarter: null,
    missingData: []
  };

  try {
    // 3000ms timeout을 위한 AbortController 구성
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const fetchResult = await fetchHtml(detailUrl, {
      signal: controller.signal
    }).catch(err => {
      console.warn(`[parseMyKboGameDetails] Fetch timed out or failed for "${detailUrl}":`, err.message || err);
      return null;
    });

    clearTimeout(timeoutId);

    if (!fetchResult || !fetchResult.ok) {
      console.warn(`[parseMyKboGameDetails] Failed to fetch. URL: "${detailUrl}". Marking as 수집 실패.`);
      result.missingData.push("선발투수 수집 실패");
      return result;
    }

    const $ = cheerio.load(fetchResult.text);
    const pageText = $('body').text();

    const hasStartingPitcherHeader = pageText.toLowerCase().includes('starting pitcher') || 
                                     pageText.toLowerCase().includes('starter') || 
                                     pageText.toLowerCase().includes('probable pitcher');

    let awayStarterName = '';
    let homeStarterName = '';
    let awayStarterStats = { wins: 0, losses: 0, era: 0.00 };
    let homeStarterStats = { wins: 0, losses: 0, era: 0.00 };

    // 1. Table, div 등 주요 투수 정보 엘리먼트 순회 파싱
    $('table tr, div.pitcher, .pitchers, div.starter').each((_, elem) => {
      const text = $(elem).text().trim().replace(/\s+/g, ' ');
      if (text.includes('Away Starter') || text.includes('Away Pitcher') || text.includes('Visitor Starter')) {
        const parts = text.split(':');
        if (parts.length > 1) {
          const content = parts.slice(1).join(':').trim();
          const namePart = content.split('(')[0].trim();
          if (namePart && !awayStarterName) {
            awayStarterName = namePart;
          }
          const recordMatch = content.match(/(\d+)\s*-\s*(\d+)\s*,\s*(\d+\.\d+)/);
          if (recordMatch) {
            awayStarterStats = {
              wins: parseInt(recordMatch[1], 10),
              losses: parseInt(recordMatch[2], 10),
              era: parseFloat(recordMatch[3])
            };
          }
        }
      }
      if (text.includes('Home Starter') || text.includes('Home Pitcher')) {
        const parts = text.split(':');
        if (parts.length > 1) {
          const content = parts.slice(1).join(':').trim();
          const namePart = content.split('(')[0].trim();
          if (namePart && !homeStarterName) {
            homeStarterName = namePart;
          }
          const recordMatch = content.match(/(\d+)\s*-\s*(\d+)\s*,\s*(\d+\.\d+)/);
          if (recordMatch) {
            homeStarterStats = {
              wins: parseInt(recordMatch[1], 10),
              losses: parseInt(recordMatch[2], 10),
              era: parseFloat(recordMatch[3])
            };
          }
        }
      }
    });

    // 2. 전체 텍스트 기반 정규식 백업
    if (!awayStarterName || !homeStarterName) {
      const awayMatch = pageText.match(/(?:Away Starter|Away Pitcher|Visitor Starter)\s*:\s*([A-Za-z\s.\-]+)/i);
      const homeMatch = pageText.match(/(?:Home Starter|Home Pitcher)\s*:\s*([A-Za-z\s.\-]+)/i);

      if (awayMatch && !awayStarterName) {
        awayStarterName = awayMatch[1].split('(')[0].trim();
      }
      if (homeMatch && !homeStarterName) {
        homeStarterName = homeMatch[1].split('(')[0].trim();
      }

      const seasonMatches = [...pageText.matchAll(/(?:Season|Record)\s*:\s*(\d+\s*-\s*\d+\s*,\s*\d+\.\d+)/gi)];
      if (seasonMatches.length >= 2) {
        const awayParsed = parseSeasonRecord(seasonMatches[0][1]);
        const homeParsed = parseSeasonRecord(seasonMatches[1][1]);
        if (awayParsed && awayStarterStats.wins === 0 && awayStarterStats.losses === 0) awayStarterStats = awayParsed;
        if (homeParsed && homeStarterStats.wins === 0 && homeStarterStats.losses === 0) homeStarterStats = homeParsed;
      }
    }

    const isUnannounced = (name: string) => {
      const lower = name.toLowerCase();
      return !name || lower.includes('tbd') || lower.includes('tba') || lower.includes('to be announced') || lower.includes('unknown') || lower.includes('to be determined') || lower.includes('postponed');
    };

    if (awayStarterName && !isUnannounced(awayStarterName)) {
      result.awayStarter = {
        name: awayStarterName,
        teamName: awayTeam,
        wins: awayStarterStats.wins,
        losses: awayStarterStats.losses,
        era: awayStarterStats.era,
        whip: null,
        innings: null,
        strikeouts: null,
        source: "MYKBO_UNOFFICIAL"
      };
    } else {
      result.missingData.push("선발투수 미발표");
    }

    if (homeStarterName && !isUnannounced(homeStarterName)) {
      result.homeStarter = {
        name: homeStarterName,
        teamName: homeTeam,
        wins: homeStarterStats.wins,
        losses: homeStarterStats.losses,
        era: homeStarterStats.era,
        whip: null,
        innings: null,
        strikeouts: null,
        source: "MYKBO_UNOFFICIAL"
      };
    } else {
      if (!result.missingData.includes("선발투수 미발표")) {
        result.missingData.push("선발투수 미발표");
      }
    }

    if (!awayStarterName && !homeStarterName && !hasStartingPitcherHeader) {
      if (!result.missingData.includes("선발투수 미발표")) {
        result.missingData.push("선발투수 미발표");
      }
    }

  } catch (error: any) {
    console.error(`[parseMyKboGameDetails] Error parsing detail page "${detailUrl}":`, error);
    result.missingData.push("선발투수 수집 실패");
  }

  return result;
}
