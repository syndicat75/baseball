/**
 * @file parseMyKboSchedule.ts
 * @description MyKBOStats 주간 일정 페이지를 가져와 특정 날짜의 경기를 정밀 파싱하고 경기 상세 링크를 추출하는 모듈입니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';
import { normaliseTeamName } from './parseOfficialStandings';

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
  detailUrl: string | null; // 선발투수 정보 수집을 위한 상세 페이지 경로
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
 * @description YYYY-MM-DD 문자열을 기반으로 MyKBOStats HTML의 요일/일자 섹션 헤더에 매칭될 수 있는 다양한 영문 날짜 문자열 패턴 리스트를 생성합니다.
 * @param {string} dateStr - YYYY-MM-DD 형식의 날짜 문자열
 * @returns {string[]} 매칭 후보 문자열 배열
 */
export function generateDatePatterns(dateStr: string): string[] {
  console.log(`[parseMyKboSchedule] [CALL] generateDatePatterns - dateStr: "${dateStr}"`);
  const [year, month, day] = dateStr.split('-').map(Number);
  const mIdx = month - 1;
  const mName = MONTH_NAMES[mIdx];
  const mShort = MONTH_SHORT[mIdx];
  
  // 시차 노이즈가 없는 UTC 기준으로 요일을 정확하게 도출
  const d = new Date(Date.UTC(year, mIdx, day));
  const dayName = DAY_NAMES[d.getUTCDay()];
  
  const patterns = [
    `${dayName}, ${mName} ${day}, ${year}`, // Wednesday, July 1, 2026
    `${dayName} ${mName} ${day}, ${year}`,  // Wednesday July 1, 2026
    `${dayName}, ${mShort} ${day}, ${year}`, // Wednesday, Jul 1, 2026
    `${dayName} ${mShort} ${day}, ${year}`,  // Wednesday Jul 1, 2026
    `${mName} ${day}, ${year}`,             // July 1, 2026
    `${mShort} ${day}, ${year}`,            // Jul 1, 2026
    `${mName} ${day}`,                      // July 1
    `${mShort} ${day}`,                     // Jul 1
    dateStr                                 // 2026-07-01
  ];
  
  console.log(`[parseMyKboSchedule] [RESULT] generateDatePatterns -> ${JSON.stringify(patterns)}`);
  return patterns;
}

/**
 * @function parseMyKboSchedule
 * @description MyKBOStats 주간 일정(https://mykbostats.com/schedule/week_of/YYYY-MM-DD)을 스크래핑하여,
 * 선택한 날짜에 속하는 경기 목록과 각 경기의 상세 링크(Detail URL)를 정확하게 파싱합니다.
 * @param {string} dateStr - 조회 대상 날짜 문자열 (YYYY-MM-DD)
 * @returns {Promise<MyKboGame[]>} 파싱된 주간 일정 내 타겟 날짜의 경기 목록 배열
 */
export async function parseMyKboSchedule(dateStr: string): Promise<MyKboGame[]> {
  console.log(`[parseMyKboSchedule] [CALL] parseMyKboSchedule - dateStr: "${dateStr}"`);
  
  // MyKBOStats 주간 일정 주소 구성
  const url = `https://mykbostats.com/schedule/week_of/${dateStr}`;
  const result = await fetchHtml(url);
  
  if (!result.ok) {
    throw new Error(`MyKBOStats 주간 일정 수집 실패 (HTTP status: ${result.status})`);
  }

  const $ = cheerio.load(result.text);
  const games: MyKboGame[] = [];
  
  const patterns = generateDatePatterns(dateStr);
  
  // MyKBOStats 페이지는 요일별로 h3 혹은 h4 또는 특정 클래스로 날짜 섹션을 구분합니다.
  // 이 헤더들 중 우리가 원하는 날짜 패턴을 가진 노드를 검색합니다.
  let targetHeader: any = null;
  
  $('h1, h2, h3, h4, h5, .date-header, .day-header').each((_, elem) => {
    const text = $(elem).text().trim();
    // 여러 패턴 중 하나라도 완벽히 포함되는지 검사
    const isMatched = patterns.some(p => text.toLowerCase().includes(p.toLowerCase()));
    if (isMatched) {
      targetHeader = $(elem);
      console.log(`[parseMyKboSchedule] Found target date section header: "${text}"`);
      return false; // 루프 즉시 종료
    }
  });

  if (!targetHeader) {
    console.log(`[parseMyKboSchedule] Warning: Date section for "${dateStr}" not found on MyKBOStats page. This might mean no games are scheduled.`);
    return []; // 해당 날짜 섹션 자체가 없으면 경기가 없는 것으로 처리 (혹은 월요일)
  }

  // 매칭된 헤더 아래에 위치한 첫 번째 테이블을 찾습니다.
  // cheerio의 nextAll을 이용하여 뒤따라오는 첫 번째 table 태그를 타겟팅합니다.
  const $table = (targetHeader as any).nextAll('table').first();
  if ($table.length === 0) {
    console.log('[parseMyKboSchedule] Warning: Table not found under the matched header. Returning empty array.');
    return [];
  }

  const kboDateParam = dateStr.replaceAll('-', '');

  $table.find('tbody tr').each((rowIdx, trElem) => {
    try {
      const $tr = $(trElem);
      const tds = $tr.find('td');
      if (tds.length < 3) return; // 불완전한 로우 스킵
      
      // MyKBOStats 주간 일정 테이블 컬럼 대략적인 매핑:
      // td[0]: Time (예: "6:30 PM", "Final" 등)
      // td[1]: Away Team (예: "LG" 혹은 로고 이미지)
      // td[2]: Away Score (예: 5)
      // td[3]: VS/At 문자
      // td[4]: Home Score (예: 2)
      // td[5]: Home Team (예: "Hanwha" 혹은 로고 이미지)
      // td[6]: Game Detail Button/Link
      
      let rawTime = $(tds[0]).text().trim();
      
      // 원정팀, 홈팀 찾기
      // 텍스트를 우선 추출하고 표준 팀명으로 변환합니다.
      let rawAway = '';
      let rawHome = '';
      
      // td 구조가 유동적일 수 있으므로 td 전체의 텍스트와 a 태그 안의 텍스트 등을 고도로 검출
      const cellsText = tds.map((_, td) => $(td).text().trim()).get();
      
      // MyKBOStats 테이블은 7개 안팎의 셀을 지닙니다.
      // 보통 구조: [Time, Away, Score, VS, Score, Home, Details]
      // 혹은 [Time, Away, vs, Home, Stadium, Details] 등
      
      let awayIdx = 1;
      let homeIdx = 5;
      let awayScoreIdx = 2;
      let homeScoreIdx = 4;
      
      if (cellsText.length < 6) {
        // 셀이 더 적은 단순 구조인 경우
        awayIdx = 1;
        homeIdx = 3;
        awayScoreIdx = -1;
        homeScoreIdx = -1;
      }
      
      rawAway = cellsText[awayIdx] || '';
      rawHome = cellsText[homeIdx] || '';
      
      // 혹시 셀 텍스트가 비어 있다면 자식 이미지의 alt 등에서 가져옴
      if (!rawAway) {
        rawAway = $(tds[awayIdx]).find('img').attr('alt')?.trim() || '';
      }
      if (!rawHome) {
        rawHome = $(tds[homeIdx]).find('img').attr('alt')?.trim() || '';
      }
      
      const awayTeam = normaliseTeamName(rawAway);
      const homeTeam = normaliseTeamName(rawHome);
      
      if (!awayTeam || !homeTeam || awayTeam === homeTeam) {
        console.warn(`[parseMyKboSchedule] Skipping invalid game: away="${awayTeam}", home="${homeTeam}"`);
        return; // 팀 파싱 실패 또는 원정/홈 동일 시 스킵
      }
      
      // 점수 파싱
      let awayScore: number | null = null;
      let homeScore: number | null = null;
      
      if (awayScoreIdx !== -1) {
        const rawAwayScore = cellsText[awayScoreIdx];
        const rawHomeScore = cellsText[homeScoreIdx];
        if (rawAwayScore && rawAwayScore !== '-' && !isNaN(parseInt(rawAwayScore, 10))) {
          awayScore = parseInt(rawAwayScore, 10);
        }
        if (rawHomeScore && rawHomeScore !== '-' && !isNaN(parseInt(rawHomeScore, 10))) {
          homeScore = parseInt(rawHomeScore, 10);
        }
      }
      
      // 상태(status) 및 경기 시간 가공
      let status: '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연' = '예정';
      let cleanTime = '18:30';
      
      const timeLower = rawTime.toLowerCase();
      if (timeLower.includes('final') || timeLower.includes('F/')) {
        status = '종료';
        cleanTime = '종료';
      } else if (timeLower.includes('cancelled') || timeLower.includes('postponed') || timeLower.includes('rain')) {
        status = '우천취소';
        cleanTime = '취소';
      } else if (timeLower.includes('live') || timeLower.includes('active') || /^\d+th|\d+rd|\d+nd|\d+st/.test(timeLower)) {
        status = '진행중';
        cleanTime = '진행중';
      } else {
        // "6:30 PM" 등의 시간 형식에서 "18:30" 같은 24시간 표기로 정밀 가공
        const timeMatch = rawTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const minutes = timeMatch[2];
          const ampm = timeMatch[3].toUpperCase();
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          cleanTime = `${String(hours).padStart(2, '0')}:${minutes}`;
        } else {
          // 예비 패턴
          cleanTime = rawTime || '18:30';
        }
      }
      
      // 경기 상세 링크(detailUrl) 추출
      // 보통 테이블의 마지막 셀이나 상세 링크 텍스트가 포함된 'a' 태그의 href를 가져옵니다.
      let detailUrl: string | null = null;
      $tr.find('a').each((_, aElem) => {
        const href = $(aElem).attr('href');
        if (href && (href.includes('/games/') || href.includes('/boxscores/'))) {
          // 상대 경로일 경우 절대 경로로 합쳐서 활용할 수 있게 가공
          detailUrl = href.startsWith('http') ? href : `https://mykbostats.com${href}`;
          return false; // 첫 번째 일치 링크 찾으면 중단
        }
      });
      
      const gameId = `${kboDateParam}_${awayTeam}_${homeTeam}`;
      
      if (games.some(g => g.gameId === gameId)) {
        console.warn(`[parseMyKboSchedule] Skipping duplicate gameId: "${gameId}"`);
        return;
      }
      
      games.push({
        gameId,
        date: dateStr,
        time: cleanTime,
        awayTeam,
        homeTeam,
        awayScore,
        homeScore,
        status,
        stadium: null, // 주간 일정에는 구장이 명시되지 않는 경우가 많아 기본 null 처리
        source: 'MYKBO_UNOFFICIAL',
        sourceUrl: url,
        detailUrl
      });
    } catch (innerErr) {
      console.warn(`[parseMyKboSchedule] Error parsing MyKBO row ${rowIdx}:`, innerErr);
    }
  });

  console.log(`[parseMyKboSchedule] [SUCCESS] parseMyKboSchedule complete for date ${dateStr}. Parsed games: ${games.length}`);
  return games;
}
