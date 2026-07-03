/**
 * @file parseOfficialScoreboard.ts
 * @description KBO 공식 영문 홈페이지 스코어보드 페이지에서 실시간 당일 경기 일정 및 점수, 진행 상태를 수집하는 파서 모듈입니다.
 * 웹페이지 테이블 및 텍스트 블록 기반 파싱을 통해 견고함을 보장합니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';
import { normaliseTeamName, TEAM_ALIASES } from './parseOfficialStandings';

export interface ScoreboardGame {
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
}

/**
 * @function parseOfficialScoreboard
 * @description 지정된 날짜(YYYY-MM-DD)의 KBO 공식 영문 스코어보드 페이지를 수집 및 파싱합니다.
 * @param {string} dateStr - 조회 대상 날짜 문자열 (YYYY-MM-DD 형식)
 * @returns {Promise<ScoreboardGame[]>} 파싱된 경기 목록 배열
 */
export async function parseOfficialScoreboard(dateStr: string): Promise<ScoreboardGame[]> {
  console.log(`[parseOfficialScoreboard] [CALL] parseOfficialScoreboard - dateStr: "${dateStr}"`);
  
  // 영문 공식 스코어보드 URL (searchDate 매개변수를 통해 날짜를 검색합니다.)
  const url = `https://eng.koreabaseball.com/Schedule/Scoreboard.aspx?searchDate=${dateStr}`;
  
  const result = await fetchHtml(url);
  if (!result.ok) {
    throw new Error(`KBO 공식 영문 스코어보드 수집 실패 (HTTP status: ${result.status})`);
  }

  const $ = cheerio.load(result.text);
  const games: ScoreboardGame[] = [];
  const kboDateParam = dateStr.replaceAll('-', '');

  // 1. 표준 Cheerio 엘리먼트/테이블 파싱 시도
  const gameContainers = $('div.smsScore, .scoreboard .score_wrap, table.tbl, div.scoreboard_list_wrap');
  console.log(`[parseOfficialScoreboard] Found ${gameContainers.length} game container nodes via cheerio standard selectors.`);

  gameContainers.each((idx, elem) => {
    try {
      const $elem = $(elem);
      
      // 테이블 구조 또는 div 구조에서 팀명 및 정보 추출
      let rawAwayTeam = '';
      let rawHomeTeam = '';
      let time = '18:30';
      let stadium: string | null = null;
      let rawAwayScore = '';
      let rawHomeScore = '';
      let stateText = '';

      if ($elem.is('table')) {
        // 테이블 행 파싱
        const rows = $elem.find('tbody tr');
        if (rows.length >= 2) {
          const $awayRow = $(rows[0]);
          const $homeRow = $(rows[1]);

          rawAwayTeam = $awayRow.find('td:first-child, th:first-child').text().trim();
          rawHomeTeam = $homeRow.find('td:first-child, th:first-child').text().trim();

          rawAwayScore = $awayRow.find('td.score, td:last-child').text().trim();
          rawHomeScore = $homeRow.find('td.score, td:last-child').text().trim();
        }
      } else {
        // Div 구조 파싱
        const $awayNode = $elem.find('.team_away, .away, .team:first-child');
        const $homeNode = $elem.find('.team_home, .home, .team:last-child');
        
        rawAwayTeam = $awayNode.find('.team_name, span').text().trim() || $awayNode.text().trim();
        rawHomeTeam = $homeNode.find('.team_name, span').text().trim() || $homeNode.text().trim();

        rawAwayScore = $awayNode.find('.score, .num').text().trim();
        rawHomeScore = $homeNode.find('.score, .num').text().trim();
      }

      const timePlaceText = $elem.find('.time_place, .time, li:contains(":"), .place').text().trim();
      if (timePlaceText) {
        const parts = timePlaceText.split(/\s+/);
        time = parts[0] || '18:30';
        stadium = parts[1] || null;
      }

      stateText = $elem.find('.state, .status, .playing, .end, .state_wrap').text().trim();

      const awayTeam = normaliseTeamName(rawAwayTeam);
      const homeTeam = normaliseTeamName(rawHomeTeam);

      if (awayTeam && homeTeam && awayTeam !== homeTeam) {
        const awayScore = rawAwayScore !== '' && !isNaN(parseInt(rawAwayScore, 10)) ? parseInt(rawAwayScore, 10) : null;
        const homeScore = rawHomeScore !== '' && !isNaN(parseInt(rawHomeScore, 10)) ? parseInt(rawHomeScore, 10) : null;

        let status: '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연' = '예정';
        if (stateText.includes('종료') || stateText.includes('Final') || stateText.includes('경기종료')) {
          status = '종료';
        } else if (stateText.includes('취소') || stateText.includes('우천취소') || stateText.includes('Postponed')) {
          status = '우천취소';
        } else if (stateText.includes('진행') || stateText.includes('회') || stateText.includes('LIVE')) {
          status = '진행중';
        } else if (stateText.includes('지연')) {
          status = '지연';
        }

        const gameId = `${kboDateParam}_${awayTeam}_${homeTeam}`;
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
            source: 'KBO_OFFICIAL_EN_CHEERIO',
            sourceUrl: url,
          });
        }
      }
    } catch (innerErr) {
      console.warn(`[parseOfficialScoreboard] Cheerio node parse failed:`, innerErr);
    }
  });

  // 2. 텍스트 블록 및 정규식 기반 파서 작동 (표준 선택자가 실패했거나 미래 예정 경기를 완벽히 보완)
  console.log(`[parseOfficialScoreboard] Running text-based regex parser to supplement games.`);
  
  const bodyText = $('body').text();
  const compact = bodyText.replace(/\s+/g, ' ').trim();

  const TEAM_CODES = [
    'LG', 'DOOSAN', 'KIA', 'SAMSUNG', 'SSG', 'KT', 'LOTTE', 'HANWHA', 'NC', 'KIWOOM',
    'TWINS', 'BEARS', 'TIGERS', 'LIONS', 'LANDERS', 'WIZ', 'GIANTS', 'EAGLES', 'DINOS', 'HEROES'
  ];

  const STADIUMS = [
    'JAMSIL', 'MUNHAK', 'GWANGJU', 'SUWON', 'GOCHEOKSKY', 'GOCHEOK',
    'DAEGU', 'SAJIK', 'DAEJEON', 'CHANGWON', 'POHANG', 'ULSAN', 'CHEONGJU'
  ];

  const teamPattern = TEAM_CODES.join('|');
  const stadiumPattern = STADIUMS.join('|');

  // A. 정밀 일치 패턴: Team Time Team Stadium Time (예: HANWHA 18:30 LG JAMSIL 18:30)
  const regexExact = new RegExp(
    `\\b(${teamPattern})\\s+(\\d{1,2}:\\d{2})\\s+(${teamPattern})\\s+(${stadiumPattern})\\s+\\d{1,2}:\\d{2}`,
    'gi'
  );

  let match;
  while ((match = regexExact.exec(compact)) !== null) {
    const awayTeam = normaliseTeamName(match[1]);
    const time = match[2];
    const homeTeam = normaliseTeamName(match[3]);
    const stadium = match[4].toUpperCase();

    if (!awayTeam || !homeTeam || awayTeam === homeTeam) continue;

    const gameId = `${kboDateParam}_${awayTeam}_${homeTeam}`;
    if (!games.some(g => g.gameId === gameId)) {
      console.log(`[parseOfficialScoreboard] Exact text match found: ${awayTeam} vs ${homeTeam} at ${stadium} (${time})`);
      games.push({
        gameId,
        date: dateStr,
        time,
        awayTeam,
        homeTeam,
        awayScore: null,
        homeScore: null,
        status: '예정',
        stadium,
        source: 'KBO_OFFICIAL_EN_TEXT',
        sourceUrl: url,
      });
    }
  }

  // B. 광역 일치 패턴: Team Time Team (stadium은 인근 80글자 안에서 검색)
  const regexBroad = new RegExp(
    `\\b(${teamPattern})\\s+(\\d{1,2}:\\d{2})\\s+(${teamPattern})`,
    'gi'
  );
  
  let matchBroad;
  while ((matchBroad = regexBroad.exec(compact)) !== null) {
    const awayTeam = normaliseTeamName(matchBroad[1]);
    const time = matchBroad[2];
    const homeTeam = normaliseTeamName(matchBroad[3]);

    if (!awayTeam || !homeTeam || awayTeam === homeTeam) continue;

    const gameId = `${kboDateParam}_${awayTeam}_${homeTeam}`;
    if (!games.some(g => g.gameId === gameId)) {
      const lookAheadIndex = regexBroad.lastIndex;
      const lookAheadText = compact.substring(lookAheadIndex, lookAheadIndex + 80).toUpperCase();
      let stadium = '구장';
      for (const s of STADIUMS) {
        if (lookAheadText.includes(s)) {
          stadium = s;
          break;
        }
      }

      console.log(`[parseOfficialScoreboard] Broad text match found: ${awayTeam} vs ${homeTeam} at ${stadium} (${time})`);
      games.push({
        gameId,
        date: dateStr,
        time,
        awayTeam,
        homeTeam,
        awayScore: null,
        homeScore: null,
        status: '예정',
        stadium,
        source: 'KBO_OFFICIAL_EN_TEXT_BROAD',
        sourceUrl: url,
      });
    }
  }

  // C. 기존 줄 단위 순차 탐색 파서 백업 구동 (추가 보험)
  if (games.length < 5) {
    const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchLine = line.match(/([A-Za-z\s]{2,})\s+(\d{1,2}:\d{2})\s+([A-Za-z\s]{2,})/);
      if (matchLine) {
        const rawAway = matchLine[1].trim();
        const time = matchLine[2].trim();
        const rawHome = matchLine[3].trim();

        const awayTeam = normaliseTeamName(rawAway);
        const homeTeam = normaliseTeamName(rawHome);

        if (awayTeam && homeTeam && awayTeam !== homeTeam && TEAM_ALIASES[awayTeam] && TEAM_ALIASES[homeTeam]) {
          const gameId = `${kboDateParam}_${awayTeam}_${homeTeam}`;
          if (!games.some(g => g.gameId === gameId)) {
            let stadium = '구장';
            let awayScore: number | null = null;
            let homeScore: number | null = null;
            let status: '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연' = '예정';

            const subLines = lines.slice(i, i + 15);
            const subText = subLines.join('\n');

            for (const s of STADIUMS) {
              if (subText.toUpperCase().includes(s)) {
                stadium = s;
                break;
              }
            }

            if (subText.toLowerCase().includes('final') || subText.toLowerCase().includes('종료')) {
              status = '종료';
            } else if (subText.toLowerCase().includes('postponed') || subText.toLowerCase().includes('cancel') || subText.toLowerCase().includes('취소')) {
              status = '우천취소';
            } else if (subText.toLowerCase().includes('live') || subText.toLowerCase().includes('진행')) {
              status = '진행중';
            }

            console.log(`[parseOfficialScoreboard] Line fallback match: ${awayTeam} vs ${homeTeam} at ${stadium} (${time})`);
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
              source: 'KBO_OFFICIAL_EN_TEXT_LINE',
              sourceUrl: url,
            });
          }
        }
      }
    }
  }

  console.log(`[parseOfficialScoreboard] [SUCCESS] parseOfficialScoreboard completed. Mapped ${games.length} games for date: "${dateStr}"`);
  return games;
}
