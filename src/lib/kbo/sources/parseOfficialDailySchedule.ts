/**
 * @file parseOfficialDailySchedule.ts
 * @description KBO 공식 영문 Daily Schedule 페이지를 fetch 및 텍스트 기반 정규식으로 안전하게 파싱하는 모듈입니다.
 */

const TEAM_CODES = [
  "LG", "DOOSAN", "KIA", "SAMSUNG", "SSG",
  "KT", "LOTTE", "HANWHA", "NC", "KIWOOM"
];

const TEAM_NAME_MAP: Record<string, string> = {
  LG: "LG",
  DOOSAN: "두산",
  KIA: "KIA",
  SAMSUNG: "삼성",
  SSG: "SSG",
  KT: "KT",
  LOTTE: "롯데",
  HANWHA: "한화",
  NC: "NC",
  KIWOOM: "키움"
};

const STADIUMS = [
  "JAMSIL", "MUNHAK", "GWANGJU", "SUWON", "GOCHEOKSKY",
  "DAEGU", "SAJIK", "DAEJEON", "CHANGWON", "POHANG",
  "ULSAN", "CHEONGJU"
];

export interface DailyScheduleGame {
  gameId: string;
  date: string;
  time: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
  status: string;
  stadium: string;
  source: string;
  sourceUrl: string;
}

/**
 * @function parseOfficialDailySchedule
 * @description 기존 kboDataService와의 하위 호환성을 위한 래퍼 함수입니다.
 */
export async function parseOfficialDailySchedule(dateStr: string): Promise<{ games: DailyScheduleGame[]; sectionFound: boolean }> {
  console.log(`[parseOfficialDailySchedule] [WRAPPER] dateStr: "${dateStr}"`);
  const url = "https://eng.koreabaseball.com/Schedule/DailySchedule.aspx";
  const html = await fetchHtml(url, 4000);
  if (!html.ok) {
    throw new Error(`KBO 공식 일정 페이지 요청 실패: ${html.status}`);
  }
  const parsed = parseOfficialDailyScheduleText(html.text, dateStr);
  return {
    games: parsed.games as DailyScheduleGame[],
    sectionFound: parsed.emptyReason !== "NO_SCHEDULED_GAMES" || parsed.games.length > 0
  };
}

/**
 * @function fetchHtml
 * @description 외부 URL에서 HTML을 가져오는 비동기 함수입니다. 타임아웃과 표준 User-Agent 헤더를 설정합니다.
 */
export async function fetchHtml(url: string, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 KBO-Viewer/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      cache: "no-store"
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text,
      rawPreview: text.slice(0, 500),
      url
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @function parseOfficialDailyScheduleText
 * @description KBO 공식 영문 Daily Schedule HTML 텍스트를 파싱하여 지정한 날짜의 경기 리스트를 추출합니다.
 */
export function parseOfficialDailyScheduleText(htmlText: string, dateStr: string) {
  const [, month, day] = dateStr.split("-");
  const mmdd = `${month}.${day}`;

  const bodyText = htmlText
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const dateHeaderRegex = new RegExp(`${mmdd}\\([A-Z]{3}\\)\\s+REGULAR\\s+`, "i");
  const startMatch = dateHeaderRegex.exec(bodyText);

  if (!startMatch || startMatch.index === undefined) {
    return {
      success: true,
      games: [],
      emptyReason: "NO_SCHEDULED_GAMES",
      parserNote: "선택 날짜 섹션을 찾지 못했습니다."
    };
  }

  const sectionStart = startMatch.index + startMatch[0].length;
  const rest = bodyText.slice(sectionStart);

  const nextDateMatch = /\d{2}\.\d{2}\([A-Z]{3}\)\s+/.exec(rest);
  const sectionText =
    nextDateMatch && nextDateMatch.index > 0
      ? rest.slice(0, nextDateMatch.index)
      : rest;

  const teamPattern = TEAM_CODES.join("|");
  const stadiumPattern = STADIUMS.join("|");

  const gameRegex = new RegExp(
    `(\\d{1,2}:\\d{2})\\s+(${teamPattern})\\s+(:|\\d+:\\d+)\\s+(${teamPattern})(?:\\s+[A-Z0-9\\-]+)*\\s+(${stadiumPattern})`,
    "g"
  );

  const games = [];
  let match;

  while ((match = gameRegex.exec(sectionText)) !== null) {
    const time = match[1];
    const awayRaw = match[2];
    const scoreOrColon = match[3];
    const homeRaw = match[4];
    const stadium = match[5];

    const scoreMatch = scoreOrColon.match(/^(\d+):(\d+)$/);
    const isScheduled = scoreOrColon === ":";

    games.push({
      gameId: `${dateStr.replaceAll("-", "")}_${awayRaw}_${homeRaw}`,
      date: dateStr,
      time,
      awayTeam: TEAM_NAME_MAP[awayRaw] || awayRaw,
      homeTeam: TEAM_NAME_MAP[homeRaw] || homeRaw,
      awayScore: scoreMatch ? Number(scoreMatch[1]) : null,
      homeScore: scoreMatch ? Number(scoreMatch[2]) : null,
      status: isScheduled ? "scheduled" : "final",
      stadium,
      source: "KBO_OFFICIAL_DAILY_SCHEDULE",
      sourceUrl: "https://eng.koreabaseball.com/Schedule/DailySchedule.aspx"
    });
  }

  if (games.length === 0) {
    return {
      success: false,
      games: [],
      emptyReason: "FETCH_OR_PARSE_FAILED",
      error: "DAILY_SCHEDULE_PARSE_FAILED",
      parserNote: "선택 날짜 섹션은 찾았으나 경기 라인을 파싱하지 못했습니다.",
      sectionPreview: sectionText.slice(0, 1000)
    };
  }

  return {
    success: true,
    games,
    emptyReason: null
  };
}
