/**
 * @file parseOfficialDailySchedule.ts
 * @description KBO 공식 영문 Daily Schedule 페이지에서 경기 일정을 가장 안정적으로 파싱하는 모듈입니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';
import { normaliseTeamName } from './parseOfficialStandings';

export interface DailyScheduleGame {
  gameId: string;
  date: string;
  time: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
  status: '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연';
  stadium: string;
  source: string;
  sourceUrl: string;
}

const STADIUMS = [
  'JAMSIL', 'MUNHAK', 'GWANGJU', 'SUWON', 'GOCHEOKSKY', 'GOCHEOK',
  'DAEGU', 'SAJIK', 'DAEJEON', 'CHANGWON', 'POHANG', 'ULSAN', 'CHEONGJU'
];

/**
 * @function parseOfficialDailySchedule
 * @description KBO 공식 영문 Daily Schedule 페이지를 fetch하여 입력한 날짜(YYYY-MM-DD)의 경기를 수집합니다.
 * @param {string} dateStr - 조회할 날짜 (예: "2026-07-03")
 * @returns {Promise<{ games: DailyScheduleGame[]; sectionFound: boolean }>} 파싱 결과 (경기 목록 및 해당 날짜 섹션 매칭 여부)
 */
export async function parseOfficialDailySchedule(dateStr: string): Promise<{ games: DailyScheduleGame[]; sectionFound: boolean }> {
  console.log(`[parseOfficialDailySchedule] [CALL] dateStr: "${dateStr}"`);

  // dateStr에서 년도와 월 추출
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`[parseOfficialDailySchedule] Invalid date format: ${dateStr}`);
  }
  const year = parts[0];
  const month = parts[1]; // '07'
  const day = parts[2]; // '03'

  // KBO 공식 영문 스케줄 페이지는 searchMonth 매개변수로 월별 조회가 가능합니다.
  const url = `https://eng.koreabaseball.com/Schedule/DailySchedule.aspx?searchMonth=${month}`;
  console.log(`[parseOfficialDailySchedule] Fetching URL: "${url}"`);

  const response = await fetchHtml(url);
  if (!response.ok) {
    throw new Error(`KBO 공식 영문 Daily Schedule 페이지 연동 실패. HTTP Status: ${response.status}`);
  }

  const $ = cheerio.load(response.text);
  const games: DailyScheduleGame[] = [];
  let sectionFound = false;

  // target date format in DailySchedule.aspx text: "07.03" or "7.3" or "07.03(FRI)"
  const targetMmDd = `${month}.${day}`; // "07.03"
  const targetMmDdAlt = `${parseInt(month, 10)}.${parseInt(day, 10)}`; // "7.3"

  console.log(`[parseOfficialDailySchedule] Target search tags: "${targetMmDd}", "${targetMmDdAlt}"`);

  // 1. Cheerio Table-based HTML 파서 시도
  try {
    let currentHtmlDate = '';
    
    $('table tbody tr').each((_, tr) => {
      const $tr = $(tr);
      const tds = $tr.find('td');
      if (tds.length === 0) return;

      // 만약 첫 번째 셀에 날짜 텍스트가 존재하면 날짜 업데이트
      const firstCellText = $(tds[0]).text().trim();
      const dateMatch = firstCellText.match(/(\d{1,2})\.(\d{1,2})/);
      
      if (dateMatch) {
        const m = dateMatch[1].padStart(2, '0');
        const d = dateMatch[2].padStart(2, '0');
        currentHtmlDate = `${year}-${m}-${d}`;
        if (currentHtmlDate === dateStr) {
          sectionFound = true;
        }
      }

      // 현재 행의 날짜가 우리가 찾는 날짜인지 확인
      if (currentHtmlDate === dateStr) {
        sectionFound = true;
        // 테이블 우측 정렬 기준 인덱싱을 통해 rowspan 구조에 완벽 대응
        // 7개 셀: Date, Play, Time, Game, TV, Stadium, Note
        // 5개 셀: Time, Game, TV, Stadium, Note (rowspan 적용 시)
        const note = $(tds[tds.length - 1]).text().trim();
        const stadiumRaw = $(tds[tds.length - 2]).text().trim().toUpperCase();
        const tv = $(tds[tds.length - 3]).text().trim();
        const gameRaw = $(tds[tds.length - 4]).text().trim();
        const time = $(tds[tds.length - 5]).text().trim();

        if (gameRaw && time) {
          // Game 문자열 파싱 (예: "LOTTE 5:2 DOOSAN" 또는 "HANWHA : LG")
          const gameMatch = gameRaw.match(/([A-Za-z\s]+)\s*(\d*)\s*:\s*(\d*)\s*([A-Za-z\s]+)/);
          if (gameMatch) {
            const rawAway = gameMatch[1].trim();
            const rawAwayScore = gameMatch[2].trim();
            const rawHomeScore = gameMatch[3].trim();
            const rawHome = gameMatch[4].trim();

            const awayTeam = normaliseTeamName(rawAway);
            const homeTeam = normaliseTeamName(rawHome);

            if (awayTeam && homeTeam && awayTeam !== homeTeam) {
              const awayScore = rawAwayScore ? parseInt(rawAwayScore, 10) : null;
              const homeScore = rawHomeScore ? parseInt(rawHomeScore, 10) : null;

              let status: DailyScheduleGame['status'] = '예정';
              if (rawAwayScore !== '' && rawHomeScore !== '') {
                status = '종료';
              }
              if (note.toLowerCase().includes('cancel') || note.toLowerCase().includes('postponed') || note.includes('우천취소')) {
                status = '우천취소';
              } else if (note.toLowerCase().includes('live') || note.toLowerCase().includes('playing')) {
                status = '진행중';
              }

              let stadium = stadiumRaw;
              const matchedStadium = STADIUMS.find(s => stadiumRaw.includes(s));
              if (matchedStadium) {
                stadium = matchedStadium;
              }

              const gameId = `${year}${month}${day}_${awayTeam}_${homeTeam}`;
              
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
                  stadium,
                  source: 'KBO_OFFICIAL_DAILY_SCHEDULE_HTML',
                  sourceUrl: url
                });
              }
            }
          }
        }
      }
    });

    if (games.length > 0) {
      console.log(`[parseOfficialDailySchedule] Successfully parsed ${games.length} games using HTML table parser.`);
      return { games, sectionFound };
    }
  } catch (htmlErr: any) {
    console.warn(`[parseOfficialDailySchedule] HTML table parser warning:`, htmlErr);
  }

  // 2. Cheerio 기반 파서 실패 혹은 누락 시 정밀 텍스트 기반 정규식 파서 기동 (Supplementary / Fallback)
  console.log(`[parseOfficialDailySchedule] HTML table yielded 0 games. Running regex-based text block parser.`);
  const bodyText = $('body').text();
  const compact = bodyText.replace(/\s+/g, ' ').trim();

  // 날짜 헤더 인덱스 찾기
  // 예: "07.03(FRI)" 혹은 "7.3(FRI)"
  const dateRegex = new RegExp(`(${month}\\.${day}|${parseInt(month, 10)}\\.${parseInt(day, 10)})\\s*\\([A-Z]{3,4}\\)`, 'i');
  const dateMatch = compact.match(dateRegex);

  if (!dateMatch) {
    console.log(`[parseOfficialDailySchedule] No date header matched for target: "${targetMmDd}" or "${targetMmDdAlt}"`);
    return { games: [], sectionFound: false };
  }

  sectionFound = true;
  const startIndex = dateMatch.index || 0;
  // 다음 날짜 헤더 시작점을 찾아 그 사이 텍스트만 추출
  const nextDateRegex = /\b(\d{1,2}\.\d{1,2})\s*\([A-Z]{3,4}\)/gi;
  nextDateRegex.lastIndex = startIndex + dateMatch[0].length;
  
  const nextMatch = nextDateRegex.exec(compact);
  const endIndex = nextMatch ? nextMatch.index : compact.length;

  const targetDateBlock = compact.substring(startIndex, endIndex);
  console.log(`[parseOfficialDailySchedule] Extracted target date text block: "${targetDateBlock}"`);

  // 경기 정보 파싱 정규식
  // 18:30 HANWHA : LG K-2T JAMSIL - 또는 18:30 LOTTE 5:2 DOOSAN KN-T JAMSIL -
  const gamePattern = /(\d{1,2}:\d{2})\s+([A-Za-z]+)\s+(\d*)\s*:\s*(\d*)\s+([A-Za-z]+)/g;
  let match;
  
  while ((match = gamePattern.exec(targetDateBlock)) !== null) {
    const time = match[1];
    const rawAway = match[2];
    const rawAwayScore = match[3];
    const rawHomeScore = match[4];
    const rawHome = match[5];

    const awayTeam = normaliseTeamName(rawAway);
    const homeTeam = normaliseTeamName(rawHome);

    if (awayTeam && homeTeam && awayTeam !== homeTeam) {
      const awayScore = rawAwayScore ? parseInt(rawAwayScore, 10) : null;
      const homeScore = rawHomeScore ? parseInt(rawHomeScore, 10) : null;

      let status: DailyScheduleGame['status'] = '예정';
      if (rawAwayScore !== '' && rawHomeScore !== '') {
        status = '종료';
      }

      // 구장 정보 찾기
      const lookAheadText = targetDateBlock.substring(gamePattern.lastIndex, gamePattern.lastIndex + 100).toUpperCase();
      let stadium = '구장';
      for (const s of STADIUMS) {
        if (lookAheadText.includes(s)) {
          stadium = s;
          break;
        }
      }

      // 상태 보강 (우천취소 등)
      if (lookAheadText.includes('CANCEL') || lookAheadText.includes('POSTPONED') || lookAheadText.includes('RAIN')) {
        status = '우천취소';
      } else if (lookAheadText.includes('LIVE') || lookAheadText.includes('PLAYING')) {
        status = '진행중';
      }

      const gameId = `${year}${month}${day}_${awayTeam}_${homeTeam}`;
      if (!games.some(g => g.gameId === gameId)) {
        console.log(`[parseOfficialDailySchedule] Regex text matched game: ${awayTeam} vs ${homeTeam} at ${stadium} (${time})`);
        games.push({
          gameId,
          date: dateStr,
          time,
          awayTeam,
          homeTeam,
          awayScore,
          homeScore,
          status,
          stadium,
          source: 'KBO_OFFICIAL_DAILY_SCHEDULE_TEXT',
          sourceUrl: url
        });
      }
    }
  }

  console.log(`[parseOfficialDailySchedule] [SUCCESS] Scraped ${games.length} games for date: "${dateStr}"`);
  return { games, sectionFound };
}
