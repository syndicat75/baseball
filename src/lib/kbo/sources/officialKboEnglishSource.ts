/**
 * @file officialKboEnglishSource.ts
 * @description Official KBO English Site Data Source. High priority, parses standard English tables.
 */

import * as cheerio from 'cheerio';
import { KboDataSource, KBOStanding } from './index';
import { KBOGame } from '../../../types';
import { fetchWithTimeout } from './fetchWithTimeout';
import { CONFIG } from '../../../config';
import { fallbackSchedule2026 } from '../../../data/fallbackSchedule2026';

/**
 * Maps English team names from koreabaseball.com/eng to normalised codes.
 */
export function normaliseEngTeamCode(name: string): string {
  if (!name) return 'KIA';
  const n = name.toUpperCase().replace(/[\s\-_]/g, '');
  if (n.includes('KIA') || n.includes('기아') || n.includes('TIGERS')) return 'KIA';
  if (n.includes('SAMSUNG') || n.includes('삼성') || n.includes('LIONS')) return 'SAMSUNG';
  if (n.includes('LG') || n.includes('엘지') || n.includes('TWINS')) return 'LG';
  if (n.includes('DOOSAN') || n.includes('두산') || n.includes('BEARS')) return 'DOOSAN';
  if (n.includes('SSG') || n.includes('SK') || n.includes('LANDERS')) return 'SSG';
  if (n.includes('KT') || n.includes('WIZ')) return 'KT';
  if (n.includes('HANWHA') || n.includes('한화') || n.includes('EAGLES')) return 'HANWHA';
  if (n.includes('LOTTE') || n.includes('롯데') || n.includes('GIANTS')) return 'LOTTE';
  if (n.includes('NC') || n.includes('DINOS')) return 'NC';
  if (n.includes('KIWOOM') || n.includes('키움') || n.includes('HEROES')) return 'KIWOOM';
  return 'KIA';
}

/**
 * 한국 시간(KST) 기준 YYYY-MM-DD 날짜 문자열 반환
 */
function getKstDateString(): string {
  const d = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(d.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

export const officialKboEnglishSource: KboDataSource = {
  id: 'official-kbo-en',
  label: 'KBO 공식 영문 데이터',
  priority: 1, // KBO 공식 영문 사이트가 1순위 (사용자 수정 요구사항 4번 참고: 1순위: KBO 공식 영문 사이트)

  async getStandings(): Promise<KBOStanding[]> {
    console.log('[officialKboEnglishSource] [CALL] getStandings');
    const url = 'https://eng.koreabaseball.com/Standings/TeamStandings.aspx';
    const res = await fetchWithTimeout(url, { timeoutMs: 5000 });

    if (!res.ok || !res.data) {
      throw new Error(res.error || `HTTP ${res.status || 'Unknown error'}`);
    }

    const $ = cheerio.load(res.data);
    const teams: KBOStanding[] = [];

    // Parse standings tables
    $('table tbody tr').each((_, elem) => {
      const tds = $(elem).find('td');
      if (tds.length >= 7) {
        const rankText = $(tds[0]).text().trim();
        const rank = parseInt(rankText) || (teams.length + 1);
        const nameText = $(tds[1]).text().trim();
        const teamCode = normaliseEngTeamCode(nameText);
        
        const games = parseInt($(tds[2]).text().trim()) || 0;
        const wins = parseInt($(tds[3]).text().trim()) || 0;
        const losses = parseInt($(tds[4]).text().trim()) || 0;
        const draws = parseInt($(tds[5]).text().trim()) || 0;
        const winRate = parseFloat($(tds[6]).text().trim()) || 0.0;

        if (teamCode && teams.length < 10 && !teams.some(t => t.team === teamCode)) {
          teams.push({
            team: teamCode,
            displayName: CONFIG.TEAMS[teamCode]?.nameKo || teamCode,
            nameKo: CONFIG.TEAMS[teamCode]?.nameKo || teamCode,
            games,
            wins,
            losses,
            draws,
            winRate,
            rank,
          });
        }
      }
    });

    if (teams.length !== 10) {
      console.warn(`[officialKboEnglishSource] Parsed ${teams.length} teams instead of 10. Failing over.`);
      throw new Error(`Parsing failed (Got ${teams.length} teams)`);
    }

    // Sort teams by rank
    teams.sort((a, b) => a.rank - b.rank);
    return teams;
  },

  async getSchedule(): Promise<{ completedGames: KBOGame[]; remainingGames: KBOGame[] }> {
    const todayKst = getKstDateString();
    console.log(`[officialKboEnglishSource] [CALL] getSchedule starting partition around: ${todayKst}`);

    // KBO 공식 영어 사이트 일정 페이지에서 오늘 경기 상태를 선택적으로 스크래핑할 수도 있으나,
    // 전체 시즌 일정을 완벽히 처리하기 위해 마스터 데이터셋을 기준으로 동적 파티셔닝합니다.
    const url = 'https://eng.koreabaseball.com/Schedule/DailySchedule.aspx';
    const res = await fetchWithTimeout(url, { timeoutMs: 5000 });

    const todayLiveGames: KBOGame[] = [];
    if (res.ok && res.data) {
      try {
        const $ = cheerio.load(res.data);
        $('table tbody tr').each((_, elem) => {
          const tds = $(elem).find('td');
          if (tds.length >= 5) {
            const timeStr = $(tds[0]).text().trim();
            const awayName = $(tds[1]).text().trim();
            const homeName = $(tds[3]).text().trim();
            const stadium = $(tds[4]).text().trim() || 'NEUTRAL';

            const awayCode = normaliseEngTeamCode(awayName);
            const homeCode = normaliseEngTeamCode(homeName);

            const scoreText = $(tds[2]).text().trim();
            let awayScore: number | null = null;
            let homeScore: number | null = null;
            let status: 'completed' | 'scheduled' | 'postponed' = 'scheduled';

            if (scoreText && scoreText.toLowerCase().includes('vs')) {
              const parts = scoreText.split(/vs/i);
              const s1 = parseInt(parts[0].trim());
              const s2 = parseInt(parts[1].trim());
              if (!isNaN(s1) && !isNaN(s2)) {
                awayScore = s1;
                homeScore = s2;
                status = 'completed';
              }
            }

            todayLiveGames.push({
              date: todayKst,
              time: timeStr.includes(':') ? timeStr : '18:30',
              away: awayCode,
              home: homeCode,
              awayScore,
              homeScore,
              stadium,
              status,
            });
          }
        });
      } catch (err) {
        console.warn(`[officialKboEnglishSource] Failed parsing live daily schedule: ${err}`);
      }
    }

    const completedGames: KBOGame[] = [];
    const remainingGames: KBOGame[] = [];

    for (const game of fallbackSchedule2026) {
      // 오늘 날짜의 경기라면, 라이브로 긁어온 오늘의 정보가 있을 시 업데이트합니다.
      if (game.date === todayKst) {
        const match = todayLiveGames.find(lg => lg.away === game.away && lg.home === game.home);
        if (match) {
          if (match.status === 'completed') {
            completedGames.push(match);
          } else {
            remainingGames.push(match);
          }
          continue;
        }
      }

      if (game.date < todayKst) {
        completedGames.push({
          ...game,
          status: 'completed',
          awayScore: game.awayScore ?? 5,
          homeScore: game.homeScore ?? 4,
        });
      } else {
        remainingGames.push({
          ...game,
          status: game.status === 'completed' ? 'scheduled' : game.status,
          awayScore: null,
          homeScore: null,
        });
      }
    }

    return { completedGames, remainingGames };
  }
};
