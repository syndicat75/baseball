/**
 * @file kboConfig.ts
 * @description KBO 예측 알고리즘 및 구단별 기본 스탯 프로필(타율, ERA, OPS 등) 설정값들을 관리하는 전용 설정 파일입니다.
 * 모든 예측 시 하드코딩을 방지하고 본 설정 파일의 기준치들을 참조하여 계산을 수행합니다.
 */

import { CONFIG } from './config';

export interface TeamProfile {
  teamCode: string;
  battingAvg: number;     // 시즌 기본 팀 타율
  era: number;            // 시즌 기본 팀 ERA
  ops: number;            // 시즌 기본 팀 OPS
  bullpenEra: number;     // 시즌 기본 불펜 ERA
  homeWinRate: number;    // 홈 경기 승률
  awayWinRate: number;    // 원정 경기 승률
  starters: Array<{
    name: string;
    era: number;
    wins: number;
    losses: number;
    innings: number;
    whip: number;
    strikeouts: number;
  }>;
  batters: Array<{
    name: string;
    position: string;
    battingAvg: number;
    obp: number;
    slg: number;
    ops: number;
  }>;
}

export const KBO_PREDICTION_WEIGHTS = {
  teamPower: 0.25,     // 시즌 팀 전력 가중치: 25%
  recentTrend: 0.20,   // 최근 흐름 가중치: 20%
  starter: 0.30,       // 선발투수 가중치: 30%
  lineup: 0.15,        // 타선/라인업 가중치: 15%
  bullpen: 0.10,       // 불펜/기타 가중치: 10%
};

export const KBO_TEAM_PROFILES: Record<string, TeamProfile> = {
  LG: {
    teamCode: 'LG',
    battingAvg: 0.282,
    era: 4.12,
    ops: 0.795,
    bullpenEra: 3.85,
    homeWinRate: 0.612,
    awayWinRate: 0.540,
    starters: [
      { name: '임찬규', era: 3.75, wins: 10, losses: 6, innings: 135, whip: 1.28, strikeouts: 110 },
      { name: '엔스', era: 4.10, wins: 12, losses: 7, innings: 150, whip: 1.32, strikeouts: 125 },
      { name: '최원태', era: 4.45, wins: 9, losses: 6, innings: 115, whip: 1.38, strikeouts: 95 },
    ],
    batters: [
      { name: '홍창기', position: 'RF', battingAvg: 0.312, obp: 0.435, slg: 0.395, ops: 0.830 },
      { name: '신민재', position: '2B', battingAvg: 0.278, obp: 0.365, slg: 0.330, ops: 0.695 },
      { name: '오스틴', position: '1B', battingAvg: 0.305, obp: 0.388, slg: 0.565, ops: 0.953 },
      { name: '문보경', position: '3B', battingAvg: 0.292, obp: 0.375, slg: 0.460, ops: 0.835 },
      { name: '박동원', position: 'C', battingAvg: 0.265, obp: 0.350, slg: 0.445, ops: 0.795 },
      { name: '김현수', position: 'LF', battingAvg: 0.285, obp: 0.355, slg: 0.410, ops: 0.765 },
      { name: '오지환', position: 'SS', battingAvg: 0.268, obp: 0.360, slg: 0.420, ops: 0.780 },
      { name: '박해민', position: 'CF', battingAvg: 0.262, obp: 0.325, slg: 0.350, ops: 0.675 },
      { name: '구본혁', position: 'DH', battingAvg: 0.258, obp: 0.320, slg: 0.340, ops: 0.660 },
    ],
  },
  SAMSUNG: {
    teamCode: 'SAMSUNG',
    battingAvg: 0.269,
    era: 4.35,
    ops: 0.772,
    bullpenEra: 4.25,
    homeWinRate: 0.585,
    awayWinRate: 0.512,
    starters: [
      { name: '원태인', era: 3.52, wins: 14, losses: 7, innings: 165, whip: 1.20, strikeouts: 130 },
      { name: '코너', era: 3.98, wins: 11, losses: 8, innings: 155, whip: 1.29, strikeouts: 140 },
      { name: '레예스', era: 4.15, wins: 10, losses: 9, innings: 148, whip: 1.31, strikeouts: 115 },
    ],
    batters: [
      { name: '김지찬', position: 'CF', battingAvg: 0.298, obp: 0.385, slg: 0.355, ops: 0.740 },
      { name: '이재현', position: 'SS', battingAvg: 0.265, obp: 0.342, slg: 0.425, ops: 0.767 },
      { name: '구자욱', position: 'LF', battingAvg: 0.315, obp: 0.395, slg: 0.540, ops: 0.935 },
      { name: '디아즈', position: '1B', battingAvg: 0.282, obp: 0.360, slg: 0.510, ops: 0.870 },
      { name: '박병호', position: 'DH', battingAvg: 0.245, obp: 0.325, slg: 0.480, ops: 0.805 },
      { name: '강민호', position: 'C', battingAvg: 0.275, obp: 0.345, slg: 0.450, ops: 0.795 },
      { name: '김영웅', position: '3B', battingAvg: 0.255, obp: 0.335, slg: 0.470, ops: 0.805 },
      { name: '이성규', position: 'RF', battingAvg: 0.242, obp: 0.318, slg: 0.440, ops: 0.758 },
      { name: '안주형', position: '2B', battingAvg: 0.252, obp: 0.310, slg: 0.315, ops: 0.625 },
    ],
  },
  KT: {
    teamCode: 'KT',
    battingAvg: 0.274,
    era: 4.42,
    ops: 0.768,
    bullpenEra: 4.52,
    homeWinRate: 0.550,
    awayWinRate: 0.525,
    starters: [
      { name: '고영표', era: 3.65, wins: 9, losses: 5, innings: 120, whip: 1.15, strikeouts: 92 },
      { name: '쿠에바스', era: 3.90, wins: 11, losses: 8, innings: 160, whip: 1.24, strikeouts: 135 },
      { name: '벤자민', era: 4.12, wins: 10, losses: 7, innings: 145, whip: 1.28, strikeouts: 128 },
    ],
    batters: [
      { name: '멜 로하스 주니어', position: 'RF', battingAvg: 0.310, obp: 0.415, slg: 0.555, ops: 0.970 },
      { name: '김민혁', position: 'LF', battingAvg: 0.292, obp: 0.365, slg: 0.355, ops: 0.720 },
      { name: '강백호', position: 'DH', battingAvg: 0.284, obp: 0.360, slg: 0.515, ops: 0.875 },
      { name: '장성우', position: 'C', battingAvg: 0.272, obp: 0.355, slg: 0.415, ops: 0.770 },
      { name: '오재일', position: '1B', battingAvg: 0.250, obp: 0.338, slg: 0.455, ops: 0.793 },
      { name: '황재균', position: '3B', battingAvg: 0.268, obp: 0.335, slg: 0.410, ops: 0.745 },
      { name: '배정대', position: 'CF', battingAvg: 0.262, obp: 0.328, slg: 0.370, ops: 0.698 },
      { name: '신본기', position: '2B', battingAvg: 0.254, obp: 0.320, slg: 0.350, ops: 0.670 },
      { name: '심우준', position: 'SS', battingAvg: 0.248, obp: 0.305, slg: 0.318, ops: 0.623 },
    ],
  },
  KIA: {
    teamCode: 'KIA',
    battingAvg: 0.291,
    era: 4.15,
    ops: 0.812,
    bullpenEra: 4.10,
    homeWinRate: 0.590,
    awayWinRate: 0.520,
    starters: [
      { name: '양현종', era: 3.82, wins: 11, losses: 8, innings: 162, whip: 1.25, strikeouts: 120 },
      { name: '네일', era: 3.12, wins: 12, losses: 5, innings: 148, whip: 1.16, strikeouts: 132 },
      { name: '라우어', era: 4.35, wins: 5, losses: 4, innings: 65, whip: 1.34, strikeouts: 58 },
    ],
    batters: [
      { name: '박찬호', position: 'SS', battingAvg: 0.295, obp: 0.352, slg: 0.375, ops: 0.727 },
      { name: '소크라테스', position: 'CF', battingAvg: 0.288, obp: 0.350, slg: 0.490, ops: 0.840 },
      { name: '김도영', position: '3B', battingAvg: 0.335, obp: 0.418, slg: 0.612, ops: 1.030 },
      { name: '최형우', position: 'DH', battingAvg: 0.286, obp: 0.372, slg: 0.515, ops: 0.887 },
      { name: '나성범', position: 'RF', battingAvg: 0.280, obp: 0.355, slg: 0.505, ops: 0.860 },
      { name: '김선빈', position: '2B', battingAvg: 0.290, obp: 0.355, slg: 0.380, ops: 0.735 },
      { name: '우성아', position: '1B', battingAvg: 0.282, obp: 0.348, slg: 0.405, ops: 0.753 },
      { name: '김태군', position: 'C', battingAvg: 0.255, obp: 0.312, slg: 0.335, ops: 0.647 },
      { name: '이창진', position: 'LF', battingAvg: 0.268, obp: 0.350, slg: 0.355, ops: 0.705 },
    ],
  },
  DOOSAN: {
    teamCode: 'DOOSAN',
    battingAvg: 0.276,
    era: 4.55,
    ops: 0.775,
    bullpenEra: 4.38,
    homeWinRate: 0.535,
    awayWinRate: 0.490,
    starters: [
      { name: '곽빈', era: 3.85, wins: 12, losses: 9, innings: 158, whip: 1.30, strikeouts: 142 },
      { name: '발라조빅', era: 3.92, wins: 6, losses: 5, innings: 85, whip: 1.25, strikeouts: 88 },
      { name: '최원준', era: 4.85, wins: 8, losses: 7, innings: 110, whip: 1.45, strikeouts: 72 },
    ],
    batters: [
      { name: '정수빈', position: 'CF', battingAvg: 0.292, obp: 0.380, slg: 0.365, ops: 0.745 },
      { name: '허경민', position: '3B', battingAvg: 0.298, obp: 0.365, slg: 0.412, ops: 0.777 },
      { name: '라모스', position: 'RF', battingAvg: 0.272, obp: 0.345, slg: 0.435, ops: 0.780 },
      { name: '양의지', position: 'C', battingAvg: 0.305, obp: 0.382, slg: 0.510, ops: 0.892 },
      { name: '양석환', position: '1B', battingAvg: 0.258, obp: 0.330, slg: 0.490, ops: 0.820 },
      { name: '김재환', position: 'LF', battingAvg: 0.252, obp: 0.348, slg: 0.475, ops: 0.823 },
      { name: '강승호', position: '2B', battingAvg: 0.274, obp: 0.325, slg: 0.445, ops: 0.770 },
      { name: '김기연', position: 'DH', battingAvg: 0.265, obp: 0.320, slg: 0.360, ops: 0.680 },
      { name: '전민재', position: 'SS', battingAvg: 0.258, obp: 0.315, slg: 0.335, ops: 0.650 },
    ],
  },
  HANWHA: {
    teamCode: 'HANWHA',
    battingAvg: 0.271,
    era: 4.62,
    ops: 0.762,
    bullpenEra: 4.45,
    homeWinRate: 0.512,
    awayWinRate: 0.468,
    starters: [
      { name: '류현진', era: 3.68, wins: 10, losses: 8, innings: 155, whip: 1.22, strikeouts: 118 },
      { name: '와이스', era: 3.85, wins: 6, losses: 5, innings: 90, whip: 1.24, strikeouts: 85 },
      { name: '바리아', era: 4.65, wins: 6, losses: 6, innings: 95, whip: 1.38, strikeouts: 78 },
    ],
    batters: [
      { name: '요나단 페라자', position: 'LF', battingAvg: 0.285, obp: 0.375, slg: 0.520, ops: 0.895 },
      { name: '이도윤', position: 'SS', battingAvg: 0.262, obp: 0.325, slg: 0.330, ops: 0.655 },
      { name: '노시환', position: '3B', battingAvg: 0.274, obp: 0.355, slg: 0.485, ops: 0.840 },
      { name: '안치홍', position: 'DH', battingAvg: 0.282, obp: 0.358, slg: 0.410, ops: 0.768 },
      { name: '채은성', position: '1B', battingAvg: 0.265, obp: 0.335, slg: 0.435, ops: 0.770 },
      { name: '이진영', position: 'RF', battingAvg: 0.258, obp: 0.330, slg: 0.370, ops: 0.700 },
      { name: '황영묵', position: '2B', battingAvg: 0.288, obp: 0.338, slg: 0.365, ops: 0.703 },
      { name: '최재훈', position: 'C', battingAvg: 0.252, obp: 0.362, slg: 0.315, ops: 0.677 },
      { name: '장진혁', position: 'CF', battingAvg: 0.255, obp: 0.320, slg: 0.360, ops: 0.680 },
    ],
  },
  NC: {
    teamCode: 'NC',
    battingAvg: 0.270,
    era: 4.68,
    ops: 0.760,
    bullpenEra: 4.60,
    homeWinRate: 0.485,
    awayWinRate: 0.450,
    starters: [
      { name: '하트', era: 2.45, wins: 13, losses: 3, innings: 152, whip: 1.05, strikeouts: 165 },
      { name: '요키시', era: 5.12, wins: 3, losses: 4, innings: 45, whip: 1.48, strikeouts: 32 },
      { name: '신민혁', era: 4.52, wins: 7, losses: 9, innings: 120, whip: 1.35, strikeouts: 85 },
    ],
    batters: [
      { name: '박민우', position: '2B', battingAvg: 0.308, obp: 0.395, slg: 0.415, ops: 0.810 },
      { name: '서호철', position: '3B', battingAvg: 0.285, obp: 0.342, slg: 0.390, ops: 0.732 },
      { name: '데이비슨', position: '1B', battingAvg: 0.282, obp: 0.365, slg: 0.585, ops: 0.950 },
      { name: '권희동', position: 'LF', battingAvg: 0.275, obp: 0.370, slg: 0.415, ops: 0.785 },
      { name: '김휘집', position: 'SS', battingAvg: 0.252, obp: 0.330, slg: 0.405, ops: 0.735 },
      { name: '천재환', position: 'CF', battingAvg: 0.262, obp: 0.318, slg: 0.380, ops: 0.698 },
      { name: '김성욱', position: 'RF', battingAvg: 0.235, obp: 0.305, slg: 0.410, ops: 0.715 },
      { name: '형준수', position: 'C', battingAvg: 0.245, obp: 0.308, slg: 0.355, ops: 0.663 },
      { name: '김주원', position: 'DH', battingAvg: 0.230, obp: 0.320, slg: 0.345, ops: 0.665 },
    ],
  },
  LOTTE: {
    teamCode: 'LOTTE',
    battingAvg: 0.280,
    era: 4.88,
    ops: 0.778,
    bullpenEra: 4.95,
    homeWinRate: 0.465,
    awayWinRate: 0.412,
    starters: [
      { name: '반즈', era: 3.15, wins: 9, losses: 6, innings: 135, whip: 1.18, strikeouts: 140 },
      { name: '윌커슨', era: 3.88, wins: 11, losses: 8, innings: 168, whip: 1.22, strikeouts: 135 },
      { name: '박세웅', era: 4.95, wins: 6, losses: 10, innings: 145, whip: 1.44, strikeouts: 112 },
    ],
    batters: [
      { name: '황성빈', position: 'LF', battingAvg: 0.302, obp: 0.365, slg: 0.385, ops: 0.750 },
      { name: '윤동희', position: 'CF', battingAvg: 0.290, obp: 0.368, slg: 0.420, ops: 0.788 },
      { name: '레이예스', position: 'RF', battingAvg: 0.325, obp: 0.382, slg: 0.485, ops: 0.867 },
      { name: '전준우', position: 'DH', battingAvg: 0.295, obp: 0.362, slg: 0.495, ops: 0.857 },
      { name: '나승엽', position: '1B', battingAvg: 0.288, obp: 0.380, slg: 0.415, ops: 0.795 },
      { name: '고승민', position: '2B', battingAvg: 0.292, obp: 0.355, slg: 0.435, ops: 0.790 },
      { name: '손호영', position: '3B', battingAvg: 0.305, obp: 0.348, slg: 0.515, ops: 0.863 },
      { name: '박승욱', position: 'SS', battingAvg: 0.258, obp: 0.332, slg: 0.370, ops: 0.702 },
      { name: '정보근', position: 'C', battingAvg: 0.240, obp: 0.325, slg: 0.295, ops: 0.620 },
    ],
  },
  SSG: {
    teamCode: 'SSG',
    battingAvg: 0.272,
    era: 5.12,
    ops: 0.765,
    bullpenEra: 5.25,
    homeWinRate: 0.430,
    awayWinRate: 0.385,
    starters: [
      { name: '광현김', era: 4.85, wins: 8, losses: 9, innings: 138, whip: 1.42, strikeouts: 115 },
      { name: '엘리아스', era: 4.25, wins: 6, losses: 7, innings: 112, whip: 1.34, strikeouts: 95 },
      { name: '송영진', era: 5.45, wins: 5, losses: 8, innings: 95, whip: 1.55, strikeouts: 62 },
    ],
    batters: [
      { name: '최지훈', position: 'CF', battingAvg: 0.274, obp: 0.335, slg: 0.395, ops: 0.730 },
      { name: '추신수', position: 'DH', battingAvg: 0.278, obp: 0.378, slg: 0.405, ops: 0.783 },
      { name: '최정', position: '3B', battingAvg: 0.282, obp: 0.385, slg: 0.545, ops: 0.930 },
      { name: '에레디아', position: 'LF', battingAvg: 0.318, obp: 0.375, slg: 0.485, ops: 0.860 },
      { name: '한유섬', position: 'RF', battingAvg: 0.245, obp: 0.332, slg: 0.465, ops: 0.797 },
      { name: '박성한', position: 'SS', battingAvg: 0.288, obp: 0.362, slg: 0.390, ops: 0.752 },
      { name: '이지영', position: 'C', battingAvg: 0.280, obp: 0.315, slg: 0.340, ops: 0.655 },
      { name: '고명준', position: '1B', battingAvg: 0.252, obp: 0.305, slg: 0.395, ops: 0.700 },
      { name: '안상현', position: '2B', battingAvg: 0.235, obp: 0.288, slg: 0.310, ops: 0.598 },
    ],
  },
  KIWOOM: {
    teamCode: 'KIWOOM',
    battingAvg: 0.265,
    era: 5.25,
    ops: 0.745,
    bullpenEra: 5.38,
    homeWinRate: 0.375,
    awayWinRate: 0.332,
    starters: [
      { name: '헤이수스', era: 3.42, wins: 11, losses: 9, innings: 152, whip: 1.21, strikeouts: 145 },
      { name: '후라도', era: 3.58, wins: 10, losses: 11, innings: 165, whip: 1.23, strikeouts: 138 },
      { name: '하영민', era: 4.82, wins: 8, losses: 6, innings: 118, whip: 1.42, strikeouts: 78 },
    ],
    batters: [
      { name: '이주형', position: 'CF', battingAvg: 0.295, obp: 0.365, slg: 0.445, ops: 0.810 },
      { name: '김혜성', position: '2B', battingAvg: 0.320, obp: 0.385, slg: 0.450, ops: 0.835 },
      { name: '송성문', position: '3B', battingAvg: 0.312, obp: 0.378, slg: 0.490, ops: 0.868 },
      { name: '최주환', position: '1B', battingAvg: 0.248, obp: 0.322, slg: 0.415, ops: 0.737 },
      { name: '도슨', position: 'LF', battingAvg: 0.310, obp: 0.380, slg: 0.455, ops: 0.835 },
      { name: '고영우', position: 'DH', battingAvg: 0.268, obp: 0.338, slg: 0.340, ops: 0.678 },
      { name: '이형종', position: 'RF', battingAvg: 0.238, obp: 0.325, slg: 0.385, ops: 0.710 },
      { name: '김재현', position: 'C', battingAvg: 0.245, obp: 0.305, slg: 0.310, ops: 0.615 },
      { name: '이재상', position: 'SS', battingAvg: 0.228, obp: 0.275, slg: 0.305, ops: 0.580 },
    ],
  },
};
