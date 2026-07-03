/**
 * @file getTodayGamesOnly.ts
 * @description KBO 공식 영문 Daily Schedule 페이지를 수집하여 지정된 날짜의 경기 일정 데이터만 반환하는 전용 함수입니다.
 */

import { fetchHtml, parseOfficialDailyScheduleText } from './sources/parseOfficialDailySchedule';

export async function getTodayGamesOnly(date: string) {
  const sourceUrl = "https://eng.koreabaseball.com/Schedule/DailySchedule.aspx";

  const html = await fetchHtml(sourceUrl, 4000);

  if (!html.ok) {
    return {
      success: false,
      date,
      games: [],
      emptyReason: "FETCH_OR_PARSE_FAILED",
      error: "KBO_DAILY_SCHEDULE_FETCH_FAILED",
      message: `KBO 공식 일정 페이지 요청 실패: ${html.status}`,
      rawPreview: html.rawPreview,
      updatedAt: new Date().toISOString()
    };
  }

  const parsed = parseOfficialDailyScheduleText(html.text, date);

  if (!parsed.success) {
    return {
      success: false,
      date,
      games: [],
      emptyReason: "FETCH_OR_PARSE_FAILED",
      error: parsed.error || "KBO_DAILY_SCHEDULE_PARSE_FAILED",
      message: "KBO 공식 일정 페이지에서 경기 일정을 파싱하지 못했습니다.",
      parserNote: parsed.parserNote,
      sectionPreview: parsed.sectionPreview,
      rawPreview: html.rawPreview,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    success: true,
    date,
    source: "KBO_OFFICIAL_DAILY_SCHEDULE",
    sourceLabel: "KBO 공식 영문 Daily Schedule",
    updatedAt: new Date().toISOString(),
    games: parsed.games,
    emptyReason: parsed.emptyReason
  };
}
