/**
 * @file normalizeTeamName.ts
 * @description Standardizes KBO team names from different crawler formats (Korean, English, abbreviations, historical names) into standard internal uppercase team codes.
 */

import { CONFIG } from '../../config';

/**
 * Normalizes a team name string into a standard KBO team code (e.g. "LG", "SAMSUNG").
 * Logs every execution and matches various spellings, full names, and historical names.
 * 
 * @param name - Raw team name string from the crawler (Korean or English)
 * @returns Standard uppercase team code, or "UNKNOWN" if no match is found
 */
export function normalizeTeamName(name: string | null | undefined): string {
  console.log(`[normalizeTeamName] Called with input: "${name}"`);
  
  if (!name) {
    console.log(`[normalizeTeamName] Input is empty. Returning "UNKNOWN"`);
    return 'UNKNOWN';
  }

  const cleanName = name.trim().toUpperCase();

  // 1. Direct matches in CONFIG
  if (CONFIG.TEAMS[cleanName]) {
    console.log(`[normalizeTeamName] Direct config match found: "${cleanName}"`);
    return cleanName;
  }

  // 2. Korean keyword matches
  if (cleanName.includes('삼성') || cleanName.includes('SAMSUNG') || cleanName.includes('LIONS') || cleanName.includes('라이온즈')) {
    console.log(`[normalizeTeamName] Resolved to SAMSUNG`);
    return 'SAMSUNG';
  }
  if (cleanName.includes('두산') || cleanName.includes('DOOSAN') || cleanName.includes('BEARS') || cleanName.includes('베어스')) {
    console.log(`[normalizeTeamName] Resolved to DOOSAN`);
    return 'DOOSAN';
  }
  if (cleanName.includes('롯데') || cleanName.includes('LOTTE') || cleanName.includes('GIANTS') || cleanName.includes('자이언츠')) {
    console.log(`[normalizeTeamName] Resolved to LOTTE`);
    return 'LOTTE';
  }
  if (cleanName.includes('기아') || cleanName.includes('KIA') || cleanName.includes('TIGERS') || cleanName.includes('타이거즈')) {
    console.log(`[normalizeTeamName] Resolved to KIA`);
    return 'KIA';
  }
  if (cleanName.includes('한화') || cleanName.includes('HANWHA') || cleanName.includes('EAGLES') || cleanName.includes('이글스')) {
    console.log(`[normalizeTeamName] Resolved to HANWHA`);
    return 'HANWHA';
  }
  if (cleanName.includes('키움') || cleanName.includes('KIWOOM') || cleanName.includes('HEROES') || cleanName.includes('히어로즈') || cleanName.includes('넥센') || cleanName.includes('우리')) {
    console.log(`[normalizeTeamName] Resolved to KIWOOM`);
    return 'KIWOOM';
  }
  if (cleanName.includes('엔씨') || cleanName.includes('NC') || cleanName.includes('DINOS') || cleanName.includes('다이노스')) {
    console.log(`[normalizeTeamName] Resolved to NC`);
    return 'NC';
  }
  if (cleanName.includes('에스에스지') || cleanName.includes('SSG') || cleanName.includes('LANDERS') || cleanName.includes('랜더스') || cleanName.includes('SK') || cleanName.includes('에스케이')) {
    console.log(`[normalizeTeamName] Resolved to SSG`);
    return 'SSG';
  }
  if (cleanName.includes('엘지') || cleanName.includes('LG') || cleanName.includes('TWINS') || cleanName.includes('트윈스')) {
    console.log(`[normalizeTeamName] Resolved to LG`);
    return 'LG';
  }
  if (cleanName.includes('케이티') || cleanName.includes('KT') || cleanName.includes('WIZ') || cleanName.includes('위즈')) {
    console.log(`[normalizeTeamName] Resolved to KT`);
    return 'KT';
  }

  // 3. Fallback english substrings
  if (/S.*M.*S.*G/i.test(cleanName) || /L.*N/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to SAMSUNG`);
    return 'SAMSUNG';
  }
  if (/D.*O.*S.*N/i.test(cleanName) || /B.*R/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to DOOSAN`);
    return 'DOOSAN';
  }
  if (/L.*T.*T/i.test(cleanName) || /G.*N.*T/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to LOTTE`);
    return 'LOTTE';
  }
  if (/K.*I.*A/i.test(cleanName) || /T.*G.*R/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to KIA`);
    return 'KIA';
  }
  if (/H.*N.*W.*H/i.test(cleanName) || /E.*G.*L/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to HANWHA`);
    return 'HANWHA';
  }
  if (/K.*W.*O.*M/i.test(cleanName) || /H.*R.*O/i.test(cleanName) || /N.*X.*N/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to KIWOOM`);
    return 'KIWOOM';
  }
  if (/N.*C/i.test(cleanName) || /D.*N.*O/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to NC`);
    return 'NC';
  }
  if (/S.*S.*G/i.test(cleanName) || /L.*N.*D/i.test(cleanName) || /S.*K/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to SSG`);
    return 'SSG';
  }
  if (/L.*G/i.test(cleanName) || /T.*W.*N/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to LG`);
    return 'LG';
  }
  if (/K.*T/i.test(cleanName) || /W.*Z/i.test(cleanName)) {
    console.log(`[normalizeTeamName] Regex match to KT`);
    return 'KT';
  }

  console.log(`[normalizeTeamName] Could not normalize team: "${name}". Returning "UNKNOWN"`);
  return 'UNKNOWN';
}
