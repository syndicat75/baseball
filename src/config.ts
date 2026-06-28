/**
 * @file config.ts
 * @description KBO Postseason Probability Calculator Configuration File.
 * This file centralizes all settings including URLs, team mappings, colors, cache directories, and model defaults.
 */

export const CONFIG = {
  // Official KBO URL endpoints
  KBO_URLS: {
    standings: 'https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx',
    koreanSchedule: 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
    englishSchedule: 'https://eng.koreabaseball.com/Schedule/DailySchedule.aspx',
  },

  // Directory used for local caching of standings and schedule data
  CACHE: {
    dir: 'data/cache',
    ttlTodayMs: 10 * 60 * 1000,      // 10 minutes cache TTL for today's data
    ttlPastMs: 24 * 60 * 60 * 1000,  // 24 hours cache TTL for past days
  },

  // Team definitions mapping internal codes to Korean displays, full names, and Tailwind brand colors
  TEAMS: {
    LG: {
      code: 'LG',
      nameKo: 'LG',
      nameEn: 'LG Twins',
      color: 'bg-rose-700',
      textColor: 'text-rose-700',
      borderColor: 'border-rose-700',
      logoChar: 'L',
    },
    SAMSUNG: {
      code: 'SAMSUNG',
      nameKo: '삼성',
      nameEn: 'Samsung Lions',
      color: 'bg-blue-600',
      textColor: 'text-blue-600',
      borderColor: 'border-blue-600',
      logoChar: 'S',
    },
    KT: {
      code: 'KT',
      nameKo: 'KT',
      nameEn: 'KT Wiz',
      color: 'bg-slate-800',
      textColor: 'text-slate-800',
      borderColor: 'border-slate-800',
      logoChar: 'K',
    },
    KIA: {
      code: 'KIA',
      nameKo: 'KIA',
      nameEn: 'KIA Tigers',
      color: 'bg-red-600',
      textColor: 'text-red-600',
      borderColor: 'border-red-600',
      logoChar: 'K',
    },
    DOOSAN: {
      code: 'DOOSAN',
      nameKo: '두산',
      nameEn: 'Doosan Bears',
      color: 'bg-sky-900',
      textColor: 'text-sky-900',
      borderColor: 'border-sky-900',
      logoChar: 'D',
    },
    HANWHA: {
      code: 'HANWHA',
      nameKo: '한화',
      nameEn: 'Hanwha Eagles',
      color: 'bg-orange-500',
      textColor: 'text-orange-500',
      borderColor: 'border-orange-500',
      logoChar: 'H',
    },
    NC: {
      code: 'NC',
      nameKo: 'NC',
      nameEn: 'NC Dinos',
      color: 'bg-cyan-800',
      textColor: 'text-cyan-800',
      borderColor: 'border-cyan-800',
      logoChar: 'N',
    },
    LOTTE: {
      code: 'LOTTE',
      nameKo: '롯데',
      nameEn: 'Lotte Giants',
      color: 'bg-navy-600', // Note: we map to tailwind slate-700 or customized color
      textColor: 'text-slate-700',
      borderColor: 'border-slate-700',
      logoChar: 'L',
    },
    SSG: {
      code: 'SSG',
      nameKo: 'SSG',
      nameEn: 'SSG Landers',
      color: 'bg-red-700',
      textColor: 'text-red-700',
      borderColor: 'border-red-700',
      logoChar: 'S',
    },
    KIWOOM: {
      code: 'KIWOOM',
      nameKo: '키움',
      nameEn: 'Kiwoom Heroes',
      color: 'bg-red-900',
      textColor: 'text-red-900',
      borderColor: 'border-red-900',
      logoChar: 'K',
    },
  } as Record<string, {
    code: string;
    nameKo: string;
    nameEn: string;
    color: string;
    textColor: string;
    borderColor: string;
    logoChar: string;
  }>,

  // Default values for simulation
  SIMULATION: {
    defaultIterations: 50000,
    allowedIterations: [10000, 50000, 100000],
    defaultModel: 'winRate',
    unresolvedGameCorrectionBase: 16, // Total games between any two teams in KBO regular season is 16
  }
};
