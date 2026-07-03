/**
 * @file officialKboKoreanSource.ts
 * @description KBO 공식 국문 사이트(koreabaseball.com)의 팀 순위 데이터를 실시간 수집 및 파싱하는 최우선순위 데이터 소스입니다.
 * 
 * 주요 특징:
 * 1. KBO 공식 국문 페이지 (https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx) 연동
 * 2. 가장 신속하고 정확한 당일 경기 결과 반영
 * 3. 철저한 데이터 무결성 검증 (games = wins + losses + draws 검증 및 10개 팀 존재 여부 확인)
 * 4. 예외 발생 시 상세 로그 출력을 통해 원인 진단 지원
 */

import * as cheerio from 'cheerio';
import { KboDataSource, KBOStanding } from './index';
import { KBOGame } from '../../../types';
import { fetchWithTimeout } from './fetchWithTimeout';
import { CONFIG } from '../../../config';

/**
 * @constant TEAM_ALIASES
 * @description 다양한 팀명 표기법을 표준 영문 키(e.g., 'LG', 'SAMSUNG')로 매핑하기 위한 유연한 별칭 사전입니다.
 */
const TEAM_ALIASES: Record<string, string[]> = {
  "LG": ["LG", "LG Twins", "LG 트윈스", "엘지", "LGTwins"],
  "두산": ["두산", "Doosan", "Doosan Bears", "두산 베어스", "DoosanBears"],
  "KIA": ["KIA", "KIA Tigers", "KIA 타이거즈", "기아", "KIATigers"],
  "삼성": ["삼성", "Samsung", "Samsung Lions", "삼성 라이온즈", "SamsungLions"],
  "SSG": ["SSG", "SSG Landers", "SSG 랜더스", "쓱", "SSGLanders"],
  "KT": ["KT", "KT Wiz", "KT 위즈", "케이티", "KTWiz"],
  "롯데": ["롯데", "Lotte", "Lotte Giants", "롯데 자이언츠", "LotteGiants"],
  "한화": ["한화", "Hanwha", "Hanwha Eagles", "한화 이글스", "HanwhaEagles"],
  "NC": ["NC", "NC Dinos", "NC 다이노스", "엔씨", "NCDinos"],
  "키움": ["키움", "Kiwoom", "Kiwoom Heroes", "키움 히어로즈", "KiwoomHeroes"]
};

/**
 * @function normaliseKoreanTeamCode
 * @description 입력된 팀명 문자열을 사전 정의된 별칭 목록과 비교하여 표준 영문 팀 코드로 변환합니다.
 * @param {string} name - 수집된 원본 팀명
 * @returns {string | null} 매핑된 표준 팀 코드 (매핑 실패 시 null)
 */
export function normaliseKoreanTeamCode(name: string): string | null {
  console.log(`[officialKboKoreanSource] [CALL] normaliseKoreanTeamCode - name: "${name}"`);
  if (!name) return null;
  const cleanName = name.trim().toUpperCase().replace(/[\s\-_]/g, '');

  for (const [standardCode, aliases] of Object.entries(TEAM_ALIASES)) {
    if (standardCode.toUpperCase() === cleanName) {
      console.log(`[officialKboKoreanSource] [MATCH] Exact match standard code: ${standardCode}`);
      return standardCode;
    }
    for (const alias of aliases) {
      const cleanAlias = alias.toUpperCase().replace(/[\s\-_]/g, '');
      if (cleanName.includes(cleanAlias) || cleanAlias.includes(cleanName)) {
        console.log(`[officialKboKoreanSource] [MATCH] Alias match found: "${name}" -> "${standardCode}"`);
        return standardCode;
      }
    }
  }

  console.warn(`[officialKboKoreanSource] [WARN] Failed to normalise team code for: "${name}"`);
  return null;
}

export const officialKboKoreanSource: KboDataSource = {
  id: 'official-kbo-kr',
  label: 'KBO 공식 국문 데이터',
  priority: 1, // KBO 공식 국문 사이트가 1순위

  /**
   * @function getStandings
   * @description KBO 공식 한국어 웹사이트에서 실시간으로 순위표 테이블 데이터를 스크래핑 및 파싱합니다.
   * @returns {Promise<KBOStanding[]>} 파싱 및 정밀 검증이 완료된 10개 구단 순위 리스트
   */
  async getStandings(): Promise<KBOStanding[]> {
    console.log('[officialKboKoreanSource] [CALL] getStandings');
    const url = CONFIG.KBO_URLS.standings || 'https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx';
    const res = await fetchWithTimeout(url, { timeoutMs: 6000 });

    if (!res.ok || !res.data) {
      console.error(`[officialKboKoreanSource] [ERROR] HTTP request failed for standings: ${res.error || 'Unknown'}`);
      throw new Error(res.error || `KBO 국문 순위 페이지 호출 실패 (상태: ${res.status})`);
    }

    const $ = cheerio.load(res.data);
    const teams: KBOStanding[] = [];

    // KBO 공식 사이트는 class="tData" 테이블 구조를 취하고 있습니다.
    const tableElement = $('.tData, table.tData');
    if (tableElement.length === 0) {
      console.error('[officialKboKoreanSource] [ERROR] "tData" class table element not found in HTML response');
      throw new Error('KBO 공식 순위 테이블 구조를 찾을 수 없습니다.');
    }

    tableElement.find('tbody tr').each((idx, elem) => {
      const tds = $(elem).find('td');
      if (tds.length >= 7) {
        const rankText = $(tds[0]).text().trim();
        const rank = parseInt(rankText) || (idx + 1);
        const nameText = $(tds[1]).text().trim();
        const teamCode = normaliseKoreanTeamCode(nameText);

        const games = parseInt($(tds[2]).text().trim()) || 0;
        const wins = parseInt($(tds[3]).text().trim()) || 0;
        const losses = parseInt($(tds[4]).text().trim()) || 0;
        const draws = parseInt($(tds[5]).text().trim()) || 0;
        const winRate = parseFloat($(tds[6]).text().trim()) || 0.0;

        // 경기수 검증: games = wins + losses + draws
        const expectedGames = wins + losses + draws;
        if (games !== expectedGames) {
          console.error(`[officialKboKoreanSource] [ERROR] Data validation error for team "${nameText}": games(${games}) !== wins(${wins}) + losses(${losses}) + draws(${draws})`);
          throw new Error(`데이터 정합성 오류: ${nameText} 구단의 경기수(${games})와 승패무 합계(${expectedGames})가 일치하지 않습니다.`);
        }

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

    console.log(`[officialKboKoreanSource] [RESULT] Parsed ${teams.length} teams from official Korean web.`);

    if (teams.length !== 10) {
      console.error(`[officialKboKoreanSource] [ERROR] Parsing failed. Team count: ${teams.length} (Expected: 10)`);
      throw new Error(`KBO 공식 팀 순위 파싱 규격 오류 (수집된 팀 수: ${teams.length}개)`);
    }

    // 순위 오름차순 정렬
    teams.sort((a, b) => a.rank - b.rank);
    return teams;
  },

  /**
   * @function getSchedule
   * @description KBO 공식 사이트는 경기 스케줄을 달력 형태로 비동기 수집하므로, 공식 영문이나 fallback 스케줄 소스를 병용하도록 유도합니다.
   */
  async getSchedule(): Promise<{ completedGames: KBOGame[]; remainingGames: KBOGame[] }> {
    console.log('[officialKboKoreanSource] [CALL] getSchedule');
    throw new Error('KBO 공식 국문 사이트에서 직접 실시간 일정을 조회하려면 추가적인 질의 폼 가공이 필요하여, 스케줄 수집은 다른 우선순위 소스에 위임합니다.');
  }
};
