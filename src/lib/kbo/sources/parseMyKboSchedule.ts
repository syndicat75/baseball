/**
 * @file parseMyKboSchedule.ts
 * @description MyKBOStats 주간 일정 페이지에서 특정 날짜 헤더 아래의 매치업 링크들을 직접 수집하여 일정을 파싱하는 모듈입니다.
 * 테이블 없이 링크 자체의 텍스트 구조를 분석하여 일정을 복구합니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';
import { normaliseTeamName, TEAM_ALIASES } from './parseOfficialStandings';

export interface MyKboGame {
  gameId: string;
  date: string;
  time: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
  status: '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연';
  stadium: string | null;
  source: string;
  sourceUrl: string;
  detailUrl: string | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

/**
 * @function generateDatePatterns
 * @description YYYY-MM-DD 날짜를 기반으로 MyKBOStats 헤더에 일치될 수 있는 다각적인 날짜 패턴을 도출합니다.
 * @param {string} dateStr - YYYY-MM-DD 형식 날짜
 * @returns {string[]} 헤더 일치 검증용 패턴 배열
 */
export function generateDatePatterns(dateStr: string): string[] {
  console.log(`[parseMyKboSchedule] [CALL] generateDatePatterns - dateStr: "${dateStr}"`);
  const [year, month, day] = dateStr.split('-').map(Number);
  const mIdx = month - 1;
  const mName = MONTH_NAMES[mIdx];
  const mShort = MONTH_SHORT[mIdx];
  
  const d = new Date(Date.UTC(year, mIdx, day));
  const dayName = DAY_NAMES[d.getUTCDay()];
  
  const patterns = [
    `${dayName}, ${mName} ${day}, ${year}`,
    `${dayName} ${mName} ${day}, ${year}`,
    `${dayName}, ${mShort} ${day}, ${year}`,
    `${dayName} ${mShort} ${day}, ${year}`,
    `${mName} ${day}, ${year}`,
    `${mShort} ${day}, ${year}`,
    `${mName} ${day}`,
    `${mShort} ${day}`,
    dateStr
  ];
  
  console.log(`[parseMyKboSchedule] [RESULT] generateDatePatterns -> ${JSON.stringify(patterns)}`);
  return patterns;
}

/**
 * @function parseMyKboSchedule
 * @description MyKBOStats 주간 일정에서 특정 날짜 헤더 아래의 모든 a 태그를 수집해 경기 상태, 스코어, 일정을 파싱합니다.
 * @param {string} dateStr - 대상 날짜 문자열 (YYYY-MM-DD)
 * @returns {Promise<MyKboGame[]>} 파싱 완료된 경기 목록 배열
 */
export async function parseMyKboSchedule(dateStr: string): Promise<MyKboGame[]> {
  console.log(`[parseMyKboSchedule] [CALL] parseMyKboSchedule - dateStr: "${dateStr}"`);
  
  const url = `https://mykbostats.com/schedule/week_of/${dateStr}`;
  const result = await fetchHtml(url);
  
  if (!result.ok) {
    throw new Error(`MyKBOStats 주간 일정 수집 실패 (HTTP status: ${result.status})`);
  }

  const $ = cheerio.load(result.text);
  const games: MyKboGame[] = [];
  const patterns = generateDatePatterns(dateStr);
  const kboDateParam = dateStr.replaceAll('-', '');

  // 1. h3 날짜 헤더를 찾습니다.
  let targetHeader: any = null;
  $('h3, h4, h2, h5, h1').each((_, elem) => {
    const text = $(elem).text().trim();
    if (patterns.some(p => text.toLowerCase().includes(p.toLowerCase()))) {
      targetHeader = $(elem);
      return false; // break loop
    }
  });

  if (!targetHeader) {
    console.log(`[parseMyKboSchedule] Warning: Date section for "${dateStr}" not found. No games today.`);
    return [];
  }

  // 2. 해당 h3 다음부터 다음 h3 전까지의 모든 a 링크를 수집합니다.
  const aLinks: any[] = [];
  const siblings = (targetHeader as any).nextUntil('h3, h2, h4, h1, hr');
  
  siblings.find('a').each((_, aElem) => {
    aLinks.push(aElem);
  });
  siblings.filter('a').each((_, aElem) => {
    aLinks.push(aElem);
  });

  console.log(`[parseMyKboSchedule] Found ${aLinks.length} matchup raw link nodes under date header.`);

  // 3. 각 링크에서 매치업 정보 파싱
  aLinks.forEach((aElem) => {
    const $a = $(aElem);
    const href = $a.attr('href') || '';
    const text = $a.text().trim().replace(/\s+/g, ' ');
    if (!text) return;

    let awayTeam = '';
    let homeTeam = '';
    let awayScore: number | null = null;
    let homeScore: number | null = null;
    let status: '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연' = '예정';
    let stadium: string | null = null;
    let time = '18:30';

    // A. 종료 경기 판비 구조: "KT Wiz 7 : 4 Final Hanwha Eagles"
    const finalMatch = text.match(/^(.+?)\s+(\d+)\s*:\s*(\d+)\s+Final(?:\/\d+)?\s+(.+)$/i);

    if (finalMatch) {
      const rawAway = finalMatch[1].trim();
      awayScore = parseInt(finalMatch[2], 10);
      homeScore = parseInt(finalMatch[3], 10);
      const rawHome = finalMatch[4].trim();

      awayTeam = normaliseTeamName(rawAway);
      homeTeam = normaliseTeamName(rawHome);
      status = '종료';
      time = 'Final';
    } else {
      // B. 예정 경기 판비 구조: "Hanwha Eagles 6:30pm Seoul-Jamsil LG Twins"
      const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:pm|am|PM|AM)?)/i);
      if (timeMatch) {
        time = timeMatch[1].trim();
        const timeIdx = text.indexOf(time);
        const leftSide = text.slice(0, timeIdx).trim();
        const rightSide = text.slice(timeIdx + time.length).trim();

        awayTeam = normaliseTeamName(leftSide);

        // 우측 구문에서 가장 긴 일치 팀명 alias를 찾아 홈팀 식별
        let matchedHome = '';
        let bestScore = 0;
        for (const [stdName, aliases] of Object.entries(TEAM_ALIASES)) {
          for (const alias of aliases) {
            if (rightSide.toLowerCase().endsWith(alias.toLowerCase())) {
              if (alias.length > bestScore) {
                bestScore = alias.length;
                matchedHome = stdName;
              }
            }
          }
        }

        if (matchedHome) {
          homeTeam = matchedHome;
          const homeAliasUsed = rightSide.toLowerCase().slice(-bestScore);
          const rawStadium = rightSide.slice(0, rightSide.toLowerCase().lastIndexOf(homeAliasUsed)).trim();
          stadium = rawStadium || '구장';
        } else {
          for (const [stdName, aliases] of Object.entries(TEAM_ALIASES)) {
            if (aliases.some(alias => rightSide.toLowerCase().includes(alias.toLowerCase()))) {
              homeTeam = stdName;
              break;
            }
          }
          stadium = '구장';
        }
        status = '예정';
      }
    }

    if (awayTeam && homeTeam && awayTeam !== homeTeam) {
      // 링크 href가 /games/ 또는 /boxscores/ 이면 detailUrl로 저장
      let detailUrl: string | null = null;
      if (href.includes('/games/') || href.includes('/boxscores/') || href.includes('/games') || href.includes('/boxscores')) {
        detailUrl = href.startsWith('http') ? href : `https://mykbostats.com${href}`;
      }

      const gameId = `${kboDateParam}_${awayTeam}_${homeTeam}`;
      
      // 중복 수집 및 타겟 일치 방지
      if (!games.some(g => g.gameId === gameId)) {
        games.push({
          gameId,
          date: dateStr,
          time,
          awayTeam,
          homeTeam,
          awayScore,
          homeScore,
          status,
          stadium: stadium || '구장',
          source: 'MYKBO_UNOFFICIAL_LINK',
          sourceUrl: url,
          detailUrl
        });
      }
    }
  });

  console.log(`[parseMyKboSchedule] [SUCCESS] parseMyKboSchedule complete. Total unique games parsed: ${games.length}`);
  return games;
}
