/**
 * @file parseOfficialScoreboard.ts
 * @description KBO 공식 한국어 홈페이지 스코어보드 페이지에서 실시간 당일 경기 일정 및 점수, 진행 상태를 수집하는 파서 모듈입니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';
import { normaliseTeamName } from './parseOfficialStandings';
import { getKoreaTodayString } from '../dateUtils';

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
 * @description 지정된 날짜(YYYY-MM-DD)의 KBO 공식 스코어보드 페이지를 수집 및 파싱합니다.
 * 오늘 날짜가 아니거나 공식 페이지 파싱에 에러가 있으면 예외를 던져 MyKBOStats fallback 소스를 활용하도록 설계되었습니다.
 * @param {string} dateStr - 조회 대상 날짜 문자열 (YYYY-MM-DD 형식)
 * @returns {Promise<ScoreboardGame[]>} 파싱된 경기 목록 배열
 */
export async function parseOfficialScoreboard(dateStr: string): Promise<ScoreboardGame[]> {
  console.log(`[parseOfficialScoreboard] [CALL] parseOfficialScoreboard - dateStr: "${dateStr}"`);
  
  const todayStr = getKoreaTodayString();
  
  // 공식 스코어보드는 날짜 조회가 불안정하거나 현재 당일 데이터만 제대로 내려주는 경우가 잦으므로,
  // 오늘 날짜가 아니면 안전하게 예외를 격발하여 즉각 MyKBOStats fallback 파서로 전환하게 유도합니다.
  if (dateStr !== todayStr) {
    console.log(`[parseOfficialScoreboard] Selected date "${dateStr}" is not today ("${todayStr}"). Auto-routing to fallback source.`);
    throw new Error(`KBO 공식 스코어보드는 당일 외 날짜 조회 시 신뢰성이 저하되므로 fallback 소스를 실행합니다.`);
  }

  // 날짜 파라미터를 KBO 방식인 YYYYMMDD로 변환하여 쿼리 스트링에 실어 요청합니다.
  const kboDateParam = dateStr.replaceAll('-', '');
  const url = `https://www.koreabaseball.com/schedule/scoreboard.aspx?date=${kboDateParam}`;
  
  const result = await fetchHtml(url);
  if (!result.ok) {
    throw new Error(`KBO 공식 스코어보드 수집 실패 (HTTP status: ${result.status})`);
  }

  const $ = cheerio.load(result.text);
  const games: ScoreboardGame[] = [];
  
  // KBO 스코어보드는 각 경기가 보통 div.smsScore 또는 .score_wrap, 또는 table 태그 형태로 렌더링됩니다.
  // 실제 사용되는 대표 선택자인 'div.smsScore' 및 '.scoreboard .score_wrap' 등 다각도 탐색을 지원합니다.
  const gameContainers = $('div.smsScore, .scoreboard .score_wrap');
  
  console.log(`[parseOfficialScoreboard] Found ${gameContainers.length} game container nodes via cheerio.`);
  
  if (gameContainers.length === 0) {
    // 혹시 KBO 점검 등으로 인해 아무 경기 노드도 잡히지 않으면 오류로 간주하여 fallback으로 빠지게 합니다.
    throw new Error('KBO 공식 스코어보드 파서: 경기 컨테이너를 찾을 수 없습니다.');
  }

  gameContainers.each((idx, elem) => {
    try {
      const $elem = $(elem);
      
      // 1. 경기 시간 & 장소 추출
      // 보통 .time_place 이나 span 또는 li 태그 내부에 들어있습니다.
      let time = '18:30';
      let stadium: string | null = null;
      
      const timePlaceText = $elem.find('.time_place, .time, li:contains(":")').text().trim();
      if (timePlaceText) {
        // "18:30 잠실" 과 같은 형식의 문자열 분해
        const parts = timePlaceText.split(/\s+/);
        time = parts[0] || '18:30';
        stadium = parts[1] || null;
      }
      
      // 2. 팀 정보 및 현재 점수 파싱
      // 원정팀, 홈팀 엘리먼트 추출
      const $awayNode = $elem.find('.team_away, .away, .team:first-child');
      const $homeNode = $elem.find('.team_home, .home, .team:last-child');
      
      const rawAwayTeam = $awayNode.find('.team_name, span').text().trim() || $awayNode.text().trim();
      const rawHomeTeam = $homeNode.find('.team_name, span').text().trim() || $homeNode.text().trim();
      
      const awayTeam = normaliseTeamName(rawAwayTeam);
      const homeTeam = normaliseTeamName(rawHomeTeam);
      
      if (!awayTeam || !homeTeam || awayTeam === homeTeam) {
        console.warn(`[parseOfficialScoreboard] Skipping invalid game: away="${awayTeam}", home="${homeTeam}"`);
        return; // 팀이 제대로 파싱 안되거나 두 팀이 같으면 스킵
      }
      
      // 3. 점수 파싱
      const rawAwayScore = $awayNode.find('.score, .num').text().trim();
      const rawHomeScore = $homeNode.find('.score, .num').text().trim();
      
      const awayScore = rawAwayScore !== '' ? parseInt(rawAwayScore, 10) : null;
      const homeScore = rawHomeScore !== '' ? parseInt(rawHomeScore, 10) : null;
      
      // 4. 경기 상태(status) 판별
      // "예정", "진행중", "종료", "우천취소" 등
      let status: '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연' = '예정';
      const stateText = $elem.find('.state, .status, .playing, .end').text().trim();
      
      if (stateText.includes('종료') || stateText.includes('Final') || stateText.includes('경기종료')) {
        status = '종료';
      } else if (stateText.includes('취소') || stateText.includes('우천취소')) {
        status = '우천취소';
      } else if (stateText.includes('진행') || stateText.includes('회') || stateText.includes('LIVE')) {
        status = '진행중';
      } else if (stateText.includes('지연')) {
        status = '지연';
      }
      
      // 고유 gameId 생성
      const gameId = `${kboDateParam}_${awayTeam}_${homeTeam}`;
      
      if (games.some(g => g.gameId === gameId)) {
        console.warn(`[parseOfficialScoreboard] Skipping duplicate gameId: "${gameId}"`);
        return;
      }
      
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
        source: 'KBO_OFFICIAL_KO',
        sourceUrl: url,
      });
    } catch (innerErr) {
      console.warn(`[parseOfficialScoreboard] Error parsing individual game row at index ${idx}:`, innerErr);
    }
  });

  console.log(`[parseOfficialScoreboard] [SUCCESS] parseOfficialScoreboard complete. Total games parsed: ${games.length}`);
  return games;
}
