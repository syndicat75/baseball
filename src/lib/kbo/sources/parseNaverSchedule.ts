/**
 * @file parseNaverSchedule.ts
 * @description 네이버 스포츠 일정 페이지를 파싱하여 백업 일정을 수집하는 모듈입니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';
import { normaliseTeamName } from './parseOfficialStandings';

export interface NaverScheduleGame {
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

const KOREAN_TEAMS = ['LG', '두산', 'KIA', '삼성', 'SSG', 'KT', '롯데', '한화', 'NC', '키움'];

const STADIUMS_KO = {
  '잠실': 'JAMSIL',
  '문학': 'MUNHAK',
  '광주': 'GWANGJU',
  '수원': 'SUWON',
  '고척': 'GOCHEOKSKY',
  '대구': 'DAEGU',
  '사직': 'SAJIK',
  '대전': 'DAEJEON',
  '창원': 'CHANGWON',
  '울산': 'ULSAN',
  '포항': 'POHANG',
  '청주': 'CHEONGJU'
};

/**
 * @function parseNaverSchedule
 * @description 입력된 날짜(YYYY-MM-DD)의 KBO 경기를 네이버 스포츠에서 수집하는 백업 파서입니다.
 * @param {string} dateStr - 조회할 날짜 (예: "2026-07-03")
 * @returns {Promise<NaverScheduleGame[]>} 파싱된 네이버 경기 목록
 */
export async function parseNaverSchedule(dateStr: string): Promise<NaverScheduleGame[]> {
  console.log(`[parseNaverSchedule] [CALL] dateStr: "${dateStr}"`);

  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`[parseNaverSchedule] Invalid date format: ${dateStr}`);
  }
  const yyyy = parts[0];
  const mm = parts[1];
  const dd = parts[2];
  const yyyymmdd = `${yyyy}${mm}${dd}`;

  // 시도할 후보 URL 목록
  const urls = [
    `https://m.sports.naver.com/kbaseball/schedule/index?date=${dateStr}`,
    `https://sports.news.naver.com/kbaseball/schedule/index?date=${yyyymmdd}`,
    `https://sports.news.naver.com/kbaseball/schedule/index?year=${yyyy}&month=${mm}&date=${yyyymmdd}`
  ];

  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      console.log(`[parseNaverSchedule] Attempting fetch URL: "${url}"`);
      const response = await fetchHtml(url);
      if (!response.ok) {
        console.warn(`[parseNaverSchedule] Fetch failed for URL: ${url}, status: ${response.status}`);
        continue;
      }

      const $ = cheerio.load(response.text);
      const games: NaverScheduleGame[] = [];

      // 1. 네이버 스포츠 React Initial State 또는 NEXT_DATA JSON 스크립트 블록 스캔
      let jsonParsed = false;
      $('script').each((_, elem) => {
        const text = $(elem).html() || '';
        if (text.includes('__INITIAL_STATE__') || text.includes('__NEXT_DATA__') || text.includes('scheduleList')) {
          try {
            // 정규식을 통해 JSON 문자열을 정밀 추출
            const jsonMatch = text.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s) ||
                              text.match(/({.+})/s);
            if (jsonMatch) {
              const jsonData = JSON.parse(jsonMatch[1]);
              
              // 네이버 구조 내에서 일치하는 게임 탐색 (구조 파서 보장)
              // 예: jsonData.kbaseball.schedule.scheduleList 혹은 schedule 관련 배열
              const scheduleList = jsonData?.kbaseball?.schedule?.scheduleList || 
                                   jsonData?.scheduleList || 
                                   jsonData?.props?.pageProps?.scheduleList;

              if (Array.isArray(scheduleList)) {
                scheduleList.forEach((game: any) => {
                  const gameDateStr = game.gameDate || game.date; // YYYY-MM-DD
                  if (gameDateStr === dateStr) {
                    const rawAway = game.awayTeamName || game.awayTeam?.teamName || game.awayTeam;
                    const rawHome = game.homeTeamName || game.homeTeam?.teamName || game.homeTeam;
                    const awayTeam = normaliseTeamName(rawAway);
                    const homeTeam = normaliseTeamName(rawHome);

                    if (awayTeam && homeTeam && awayTeam !== homeTeam) {
                      const time = game.gameTime || game.time || '18:30';
                      const awayScore = typeof game.awayScore === 'number' ? game.awayScore : null;
                      const homeScore = typeof game.homeScore === 'number' ? game.homeScore : null;
                      
                      let status: NaverScheduleGame['status'] = '예정';
                      if (game.status === 'CANCEL' || game.isCancel || game.suspended || String(game.state).includes('취소')) {
                        status = '우천취소';
                      } else if (game.status === 'PLAYING' || game.isLive || String(game.state).includes('진행')) {
                        status = '진행중';
                      } else if (game.status === 'END' || awayScore !== null) {
                        status = '종료';
                      }

                      let stadium = '구장';
                      const stadiumKo = game.stadium || game.stadiumName || '';
                      for (const [ko, en] of Object.entries(STADIUMS_KO)) {
                        if (stadiumKo.includes(ko)) {
                          stadium = en;
                          break;
                        }
                      }

                      const gameId = `${yyyymmdd}_${awayTeam}_${homeTeam}`;
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
                        source: 'NAVER_SPORTS_JSON',
                        sourceUrl: url
                      });
                    }
                  }
                });
                if (games.length > 0) {
                  jsonParsed = true;
                }
              }
            }
          } catch (jsonErr) {
            console.warn(`[parseNaverSchedule] Script block JSON parsing failed:`, jsonErr);
          }
        }
      });

      if (jsonParsed && games.length > 0) {
        console.log(`[parseNaverSchedule] [SUCCESS] Parsed ${games.length} games via JSON from ${url}`);
        return games;
      }

      // 2. HTML 텍스트 및 Cheerio 요소를 기반으로 한 직접 텍스트 매칭 (Fallback)
      console.log(`[parseNaverSchedule] Script JSON yielded 0 games. Falling back to HTML text scanning on ${url}`);
      
      const bodyText = $('body').text();
      // "한화", "LG" 등 한국어 구단명 쌍이 출현하고 "18:30" 같은 시간, 점수 등이 인근에 위치하는지 분석
      const teamPattern = KOREAN_TEAMS.join('|');
      
      // 네이버 스케줄 텍스트 매치용 정규식 (예: "한화 VS LG", "한화 [점수] : [점수] LG" 등)
      // `\b(한화|LG|삼성|두산...)\s*(?:VS|\d+:\d+|\d+\s*:\s*\d+|:)\s*(한화|LG|삼성|두산...)`
      const matchesPattern = new RegExp(`(${teamPattern})\\s*(?:VS|\\d+\\s*:\\s*\\d+|:)\\s*(${teamPattern})`, 'g');
      let textMatch;
      
      while ((textMatch = matchesPattern.exec(bodyText)) !== null) {
        const rawAway = textMatch[1];
        const rawHome = textMatch[2];
        const awayTeam = normaliseTeamName(rawAway);
        const homeTeam = normaliseTeamName(rawHome);

        if (awayTeam && homeTeam && awayTeam !== homeTeam) {
          const gameId = `${yyyymmdd}_${awayTeam}_${homeTeam}`;
          if (!games.some(g => g.gameId === gameId)) {
            // 인근 100글자 안에서 야구 시간 포맷(18:30 등)과 구장 정보 검색
            const lookAround = bodyText.substring(Math.max(0, matchesPattern.lastIndex - 150), Math.min(bodyText.length, matchesPattern.lastIndex + 150));
            const timeMatch = lookAround.match(/(\d{1,2}:\d{2})/);
            const time = timeMatch ? timeMatch[1] : '18:30';

            let stadium = '구장';
            for (const [ko, en] of Object.entries(STADIUMS_KO)) {
              if (lookAround.includes(ko)) {
                stadium = en;
                break;
              }
            }

            // 스코어 검색
            const scoreMatch = lookAround.match(/(\d+)\s*:\s*(\d+)/);
            const awayScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
            const homeScore = scoreMatch ? parseInt(scoreMatch[2], 10) : null;
            
            let status: NaverScheduleGame['status'] = '예정';
            if (awayScore !== null && homeScore !== null) {
              status = '종료';
            }
            if (lookAround.includes('취소') || lookAround.includes('우천')) {
              status = '우천취소';
            }

            console.log(`[parseNaverSchedule] Text scan match: ${awayTeam} vs ${homeTeam} at ${stadium} (${time})`);
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
              source: 'NAVER_SPORTS_TEXT_SCAN',
              sourceUrl: url
            });
          }
        }
      }

      if (games.length > 0) {
        console.log(`[parseNaverSchedule] [SUCCESS] Scraped ${games.length} games via text-scanning on ${url}`);
        return games;
      }

    } catch (err: any) {
      console.warn(`[parseNaverSchedule] Failed parsing Naver Sports URL: ${url}`, err);
      lastError = err;
    }
  }

  // 모든 후보 네이버 URL 스크랩이 실패하였거나 데이터가 없을 때
  console.log(`[parseNaverSchedule] Bypassing Naver schedule parser. No games found.`);
  return [];
}
