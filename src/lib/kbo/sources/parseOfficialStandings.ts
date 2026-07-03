/**
 * @file parseOfficialStandings.ts
 * @description KBO 공식 영문 팀 순위 페이지에서 실시간 순위표 및 세부 경기 지표를 완벽히 스크래핑 및 파싱하는 모듈입니다.
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetchHtml';
import { CONFIG } from '../../../config';

// 구단 식별을 위한 별칭 매핑 정의
export const TEAM_ALIASES: Record<string, string[]> = {
  "LG": ["LG", "LG Twins", "LG 트윈스", "엘지"],
  "두산": ["DOOSAN", "Doosan", "Doosan Bears", "두산", "두산 베어스"],
  "KIA": ["KIA", "Kia", "Kia Tigers", "KIA Tigers", "KIA 타이거즈"],
  "삼성": ["SAMSUNG", "Samsung", "Samsung Lions", "삼성", "삼성 라이온즈"],
  "SSG": ["SSG", "SSG Landers", "SSG 랜더스"],
  "KT": ["KT", "KT Wiz", "KT 위즈"],
  "롯데": ["LOTTE", "Lotte", "Lotte Giants", "롯데", "롯데 자이언츠"],
  "한화": ["HANWHA", "Hanwha", "Hanwha Eagles", "한화", "한화 이글스"],
  "NC": ["NC", "NC Dinos", "NC 다이노스"],
  "키움": ["KIWOOM", "Kiwoom", "Kiwoom Heroes", "키움", "키움 히어로즈"]
};

/**
 * @function normaliseTeamName
 * @description 크롤링해 온 임의의 한글/영문 팀명을 표준 내부 한글 코드(예: "LG", "두산")로 정규화합니다.
 * @param {string} name - 정규화할 원본 팀 이름
 * @returns {string} 표준 팀 이름
 */
export function normaliseTeamName(name: string): string {
  console.log(`[parseOfficialStandings] [CALL] normaliseTeamName - name: "${name}"`);
  const cleanName = name ? name.trim() : '';
  if (!cleanName) {
    console.log(`[parseOfficialStandings] [RESULT] normaliseTeamName -> "" (empty input)`);
    return '';
  }
  for (const [standardName, aliases] of Object.entries(TEAM_ALIASES)) {
    if (
      aliases.some(alias => 
        cleanName.toLowerCase() === alias.toLowerCase() || 
        cleanName.toLowerCase().includes(alias.toLowerCase()) || 
        (cleanName.length >= 2 && alias.toLowerCase().includes(cleanName.toLowerCase()))
      )
    ) {
      console.log(`[parseOfficialStandings] [RESULT] normaliseTeamName -> "${standardName}" (matched from "${name}")`);
      return standardName;
    }
  }
  console.log(`[parseOfficialStandings] [RESULT] normaliseTeamName -> "${cleanName}" (No match, return clean input)`);
  return cleanName;
}

export interface OfficialTeamStanding {
  rank: number;
  teamName: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winningPct: number;
  gamesBehind: string;
  streak: string;
  home?: string;
  away?: string;
  battingAvg: number;
  era: number;
  runs: number;
  runsAllowed: number;
  homeRuns: number;
  source: string;
  updatedAt: string;
}

/**
 * @function parseOfficialStandings
 * @description KBO 공식 영문 standings 페이지를 fetch하고 파싱하여 완벽한 TeamStanding 구조체 목록을 구성하고 무결성을 확인합니다.
 * @returns {Promise<OfficialTeamStanding[]>} 파싱 및 전수 정합성 검증이 완료된 팀 순위 데이터 배열
 */
export async function parseOfficialStandings(): Promise<OfficialTeamStanding[]> {
  console.log('[parseOfficialStandings] [CALL] parseOfficialStandings');
  const url = 'https://eng.koreabaseball.com/Standings/TeamStandings.aspx';
  
  const result = await fetchHtml(url);
  if (!result.ok) {
    throw new Error(`KBO 공식 영문 순위 페이지 수집 실패. HTTP status: ${result.status}`);
  }

  const $ = cheerio.load(result.text);
  
  // 기본 데이터 구조 저장 맵 (팀명 -> 데이터)
  const basicDataMap: Record<string, Partial<OfficialTeamStanding>> = {};
  
  // 페이지 상의 모든 테이블들을 찾아서 헤더 종류에 맞게 파싱 진행
  $('table').each((tableIdx, tableElem) => {
    const $table = $(tableElem);
    const headers = $table.find('thead tr th').map((_, th) => $(th).text().trim().toUpperCase()).get();
    
    console.log(`[parseOfficialStandings] Table index ${tableIdx} headers: ${JSON.stringify(headers)}`);
    
    // 1. 기본 순위표 테이블 판별 (GAMES, W, L, D, PCT, GB 등이 컬럼에 포함됨)
    if (headers.includes('GAMES') && headers.includes('W') && headers.includes('L') && headers.includes('PCT')) {
      $table.find('tbody tr').each((_, trElem) => {
        const tds = $(trElem).find('td').map((_, td) => $(td).text().trim()).get();
        if (tds.length < 7) return; // 유효하지 않은 행 무시
        
        const rankVal = parseInt(tds[0], 10) || 0;
        const rawTeam = tds[1];
        const normalizedName = normaliseTeamName(rawTeam);
        
        if (!normalizedName) return;
        
        const gamesVal = parseInt(tds[2], 10) || 0;
        const winsVal = parseInt(tds[3], 10) || 0;
        const lossesVal = parseInt(tds[4], 10) || 0;
        const drawsVal = parseInt(tds[5], 10) || 0;
        const winningPctVal = parseFloat(tds[6]) || 0.0;
        const gamesBehindVal = tds[7] || '0';
        const streakVal = tds[8] || '-';
        const homeVal = tds[9] || '-';
        const awayVal = tds[10] || '-';
        
        basicDataMap[normalizedName] = {
          rank: rankVal,
          teamName: normalizedName,
          games: gamesVal,
          wins: winsVal,
          losses: lossesVal,
          draws: drawsVal,
          winningPct: winningPctVal,
          gamesBehind: gamesBehindVal,
          streak: streakVal,
          home: homeVal,
          away: awayVal
        };
      });
      console.log(`[parseOfficialStandings] Successfully parsed basic standings table. Total teams processed: ${Object.keys(basicDataMap).length}`);
    }
    
    // 2. 부가 지표 테이블 판별 (AVG, ERA, RUNS, RUNS ALLOWED, HR 이 컬럼에 포함됨)
    if (headers.includes('AVG') && headers.includes('ERA') && headers.includes('RUNS') && (headers.includes('RUNS ALLOWED') || headers.some(h => h.includes('ALLOW')))) {
      // "RUNS ALLOWED" 헤더의 인덱스 검색 (유동적인 컬럼명 대응)
      const avgIdx = headers.indexOf('AVG');
      const eraIdx = headers.indexOf('ERA');
      const runsIdx = headers.indexOf('RUNS');
      const runsAllowedIdx = headers.findIndex(h => h.includes('ALLOW') || h.includes('RUNS ALLOWED') || h.includes('R-A'));
      const hrIdx = headers.indexOf('HR');
      
      $table.find('tbody tr').each((_, trElem) => {
        const tds = $(trElem).find('td').map((_, td) => $(td).text().trim()).get();
        if (tds.length < 5) return;
        
        const rawTeam = tds[1];
        const normalizedName = normaliseTeamName(rawTeam);
        if (!normalizedName) return;
        
        const battingAvgVal = parseFloat(tds[avgIdx]) || 0.0;
        const eraVal = parseFloat(tds[eraIdx]) || 0.0;
        const runsVal = parseInt(tds[runsIdx], 10) || 0;
        const runsAllowedVal = parseInt(tds[runsAllowedIdx], 10) || 0;
        const homeRunsVal = parseInt(tds[hrIdx], 10) || 0;
        
        if (basicDataMap[normalizedName]) {
          basicDataMap[normalizedName].battingAvg = battingAvgVal;
          basicDataMap[normalizedName].era = eraVal;
          basicDataMap[normalizedName].runs = runsVal;
          basicDataMap[normalizedName].runsAllowed = runsAllowedVal;
          basicDataMap[normalizedName].homeRuns = homeRunsVal;
        } else {
          // 혹시 순위표에 없는데 부가지표에 있는 구단이 있다면 (정합성 보강)
          basicDataMap[normalizedName] = {
            teamName: normalizedName,
            battingAvg: battingAvgVal,
            era: eraVal,
            runs: runsVal,
            runsAllowed: runsAllowedVal,
            homeRuns: homeRunsVal
          };
        }
      });
      console.log(`[parseOfficialStandings] Successfully parsed additional indicators table.`);
    }
  });
  
  // Text-based fallback parser if some teams are missing or tables failed to parse
  if (Object.keys(basicDataMap).length < 10) {
    console.log('[parseOfficialStandings] Cheerio table parsing was incomplete or failed. Attempting text-based fallback parser.');
    const lines = result.text.split('\n');
    const teamRegex = /(LG\s*Twins|LG|Doosan\s*Bears|Doosan|Kia\s*Tigers|KIA\s*Tigers|KIA|Samsung\s*Lions|Samsung|SSG\s*Landers|SSG|KT\s*Wiz|KT|Lotte\s*Giants|Lotte|Hanwha\s*Eagles|Hanwha|NC\s*Dinos|NC|Kiwoom\s*Heroes|Kiwoom)/gi;
    
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;
      
      const matchedTeams = cleanLine.match(teamRegex);
      if (matchedTeams && matchedTeams.length > 0) {
        const numbers = cleanLine.match(/\b\d+(\.\d+)?\b/g);
        if (numbers && numbers.length >= 4) {
          // Let's look for any 3 or 4 numbers sequence where games = wins + losses + draws
          for (let i = 0; i <= numbers.length - 3; i++) {
            const possibleGames = parseInt(numbers[i], 10);
            const possibleWins = parseInt(numbers[i+1], 10);
            const possibleLosses = parseInt(numbers[i+2], 10);
            const possibleDraws = i + 3 < numbers.length ? parseInt(numbers[i+3], 10) : 0;
            
            if (possibleGames > 0 && possibleGames === possibleWins + possibleLosses + possibleDraws) {
              const rawTeam = matchedTeams[0];
              const normalized = normaliseTeamName(rawTeam);
              if (normalized && !basicDataMap[normalized]) {
                const pctCandidate = i + 4 < numbers.length ? parseFloat(numbers[i+4]) : (possibleWins / possibleGames);
                const rankCandidate = i > 0 ? parseInt(numbers[i-1], 10) : 99;
                console.log(`[parseOfficialStandings] Text-based fallback matched: Team: ${normalized}, Rank: ${rankCandidate}, G: ${possibleGames}, W: ${possibleWins}, L: ${possibleLosses}, D: ${possibleDraws}, PCT: ${pctCandidate}`);
                basicDataMap[normalized] = {
                  rank: rankCandidate,
                  teamName: normalized,
                  games: possibleGames,
                  wins: possibleWins,
                  losses: possibleLosses,
                  draws: possibleDraws,
                  winningPct: isNaN(pctCandidate) ? 0 : pctCandidate,
                  gamesBehind: '0',
                  streak: '-',
                  home: '-',
                  away: '-'
                };
                break;
              }
            }
          }
        }
      }
    }
  }
  
  // 3. 병합 결과 구조물 생성 및 엄격한 무결성 검증
  const standingsList: OfficialTeamStanding[] = [];
  const nowStr = new Date().toISOString();
  
  for (const [teamName, data] of Object.entries(basicDataMap)) {
    // 모든 필요 필드를 안전 기본값과 함께 채웁니다.
    const merged: OfficialTeamStanding = {
      rank: data.rank || 99,
      teamName: teamName,
      games: data.games || 0,
      wins: data.wins || 0,
      losses: data.losses || 0,
      draws: data.draws || 0,
      winningPct: data.winningPct || 0.0,
      gamesBehind: data.gamesBehind || '-',
      streak: data.streak || '-',
      home: data.home || '-',
      away: data.away || '-',
      battingAvg: data.battingAvg || 0.000,
      era: data.era || 0.00,
      runs: data.runs || 0,
      runsAllowed: data.runsAllowed || 0,
      homeRuns: data.homeRuns || 0,
      source: 'KBO_OFFICIAL_EN',
      updatedAt: nowStr
    };
    standingsList.push(merged);
  }
  
  // 검증: 10개 구단 전체가 수집되어야 함
  const teamCount = standingsList.length;
  console.log(`[parseOfficialStandings] [VALIDATION] Total parsed team count: ${teamCount}`);
  if (teamCount !== 10) {
    throw new Error(`KBO 공식 영문 순위 정합성 오류: 구단 개수가 ${teamCount}개입니다. 10개여야만 합니다.`);
  }
  
  // 검증: LG 트윈스 존재해야 함
  const hasLg = standingsList.some(t => t.teamName === 'LG');
  if (!hasLg) {
    throw new Error('KBO 공식 영문 순위 정합성 오류: LG 트윈스 순위 정보가 유실되었습니다.');
  }
  
  // 검증: 모든 구단 games === wins + losses + draws 수식 전수 합치 검사
  for (const team of standingsList) {
    const expectedSum = team.wins + team.losses + team.draws;
    if (team.games !== expectedSum) {
      throw new Error(`KBO 공식 영문 순위 전수 합치 정합성 오류: "${team.teamName}" 구단의 누적 경기수(${team.games})와 [승(${team.wins}) + 패(${team.losses}) + 무(${team.draws})] 합계(${expectedSum})가 불일치합니다.`);
    }
    
    if (isNaN(team.winningPct)) {
      throw new Error(`KBO 공식 영문 순위 정합성 오류: "${team.teamName}" 구단의 승률(${team.winningPct}) 값이 유효한 숫자가 아닙니다.`);
    }
  }
  
  // 순위 오름차순으로 정렬해서 반환
  standingsList.sort((a, b) => a.rank - b.rank);
  
  console.log(`[parseOfficialStandings] [SUCCESS] parseOfficialStandings complete. LG Games: ${standingsList.find(t => t.teamName === 'LG')?.games}`);
  return standingsList;
}
