/**
 * @file ProbabilityTable.tsx
 * @description 구단별 11개 상세 컬럼(구단명, 현재 경기수, 실제 잔여 일정 수, 인공 보정 경기수, 전체 잔여 연산 경기수, 평균 최종 승수, 기대 추가 승수, 평균 최종 패수, 평균 최종 무수, 최종 합산 경기수, 가을야구 진출확률)을 완벽히 제공하는 통계표 컴포넌트입니다.
 */

import React from 'react';
import { CONFIG } from '../config';
import { TeamSimulationStats, KBOGame } from '../types';
import { getProbabilityZone } from './ProbabilityCards';

interface ProbabilityTableProps {
  results: TeamSimulationStats[];
  syntheticTeamCounts?: Record<string, number>;
  unresolvedGames?: KBOGame[];
  onTeamClick?: (teamCode: string) => void;
}

/**
 * @function ProbabilityTable
 * @description 구단별 몬테카를로 연산 상세 데이터 표를 렌더링하며 가상 보정 경기 수 정합성과 안전도를 시각화합니다.
 */
export const ProbabilityTable: React.FC<ProbabilityTableProps> = ({
  results,
  syntheticTeamCounts = {},
  unresolvedGames = [],
  onTeamClick
}) => {
  console.log(`[ProbabilityTable] [CALL] ProbabilityTable rendered with ${results.length} team results`);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      
      {/* Table Header / Subheading */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">구단별 시뮬레이션 상세 예측 데이터</h3>
          <p className="text-xs text-slate-400">구단별 144경기를 채우기 위한 실제 및 인공 보정 일정이 포함된 고정밀 연산 지표입니다.</p>
        </div>
        <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-md">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          4위~7위는 5위 와일드카드 진입 경계 구역 (Bubble Zone)
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" id="probability-standings-table">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-sans">
              <th className="py-3.5 px-3 text-center w-12">순위</th>
              <th className="py-3.5 px-3">구단명</th>
              <th className="py-3.5 px-3 text-center">현재 경기수</th>
              <th className="py-3.5 px-3 text-center">실제 잔여 일정 수</th>
              <th className="py-3.5 px-3 text-center">인공 보정 경기수</th>
              <th className="py-3.5 px-3 text-center">전체 잔여 연산 경기수</th>
              <th className="py-3.5 px-3 text-center bg-blue-50/40 text-blue-800">평균 최종 승수</th>
              <th className="py-3.5 px-3 text-center text-blue-600">기대 추가 승수</th>
              <th className="py-3.5 px-3 text-center bg-red-50/30 text-red-700">평균 최종 패수</th>
              <th className="py-3.5 px-3 text-center text-slate-700">평균 최종 무수</th>
              <th className="py-3.5 px-3 text-center bg-indigo-50/50 text-indigo-900 font-extrabold">최종 합산 경기수</th>
              <th className="py-3.5 px-3 w-52 text-center">가을야구 진출확률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-600 text-xs md:text-sm">
            {results.map((r) => {
              const teamConf = CONFIG.TEAMS[r.team as keyof typeof CONFIG.TEAMS];
              const teamColor = teamConf?.color || 'bg-slate-500';
              const zone = getProbabilityZone(r.playoffProbability);
              
              // 1. 현재 경기수 = 승 + 패 + 무
              const currentGames = r.currentWins + r.currentLosses + r.currentDraws;
              
              // 2. 실제 잔여 일정 수 (synthetic 필드가 없는 순수 잔여 일정)
              const actualRemainingCount = unresolvedGames.filter(
                g => !g.synthetic && (g.away === r.team || g.home === r.team)
              ).length;

              // 3. 인공 보정 경기수
              const syntheticCount = syntheticTeamCounts[r.team] || 0;

              // 4. 전체 잔여 연산 경기수
              const totalRemainingUsed = actualRemainingCount + syntheticCount;

              // 5. 기대 추가 승수
              const expectedAddWins = Math.max(0, r.averageFinalWins - r.currentWins);

              // 6. 평균 최종 패수/무수
              const avgFinalLosses = r.averageFinalLosses ?? Math.max(0, 144 - r.averageFinalWins - (r.averageFinalDraws ?? 0));
              const avgFinalDraws = r.averageFinalDraws ?? r.currentDraws;

              // 7. 최종 합산 경기수 (반드시 정확히 144경기인지 체크)
              const finalCombinedGamesCount = currentGames + totalRemainingUsed;

              // 시각화 경고 구분 (보정 경기 비율)
              const ratio = totalRemainingUsed > 0 ? (syntheticCount / totalRemainingUsed) * 100 : 0;
              let ratioBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              let ratioLabel = '안전';
              if (ratio >= 5 && ratio <= 15) {
                ratioBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                ratioLabel = '주의';
              } else if (ratio > 15) {
                ratioBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                ratioLabel = '위험';
              }

              // Bubble Zone 하이라이트 (현재 순위 4위~7위)
              const isBubbleZone = r.currentRank >= 4 && r.currentRank <= 7;

              return (
                <tr
                  key={r.team}
                  onClick={() => onTeamClick?.(r.team)}
                  className={`hover:bg-slate-100 transition-colors cursor-pointer ${
                    isBubbleZone ? 'bg-blue-50/15' : ''
                  }`}
                >
                  {/* Current Rank */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-500 font-mono">
                    {r.currentRank}위
                  </td>

                  {/* Team name + Logo */}
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full ${teamColor} text-white font-black text-[9px] flex items-center justify-center flex-shrink-0`}>
                        {teamConf?.logoChar || 'T'}
                      </div>
                      <span className="font-bold text-slate-800 whitespace-nowrap">{teamConf?.nameKo || r.team}</span>
                    </div>
                  </td>

                  {/* Current Games */}
                  <td className="py-3.5 px-3 text-center font-mono text-slate-500 font-medium">
                    {currentGames}
                  </td>

                  {/* Actual Remaining Schedule Count */}
                  <td className="py-3.5 px-3 text-center font-mono text-slate-500 font-medium">
                    {actualRemainingCount}
                  </td>

                  {/* Synthetic Remaining Games */}
                  <td className="py-3.5 px-3 text-center font-mono font-medium">
                    <div className="flex flex-col items-center justify-center">
                      <span className={syntheticCount > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}>
                        {syntheticCount}
                      </span>
                      {syntheticCount > 0 && (
                        <span className={`text-[8px] px-1 py-0.2 rounded border mt-0.5 whitespace-nowrap font-sans font-bold ${ratioBadgeClass}`}>
                          {ratioLabel} ({ratio.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Total Calculated Remaining Games */}
                  <td className="py-3.5 px-3 text-center font-mono text-slate-700 font-semibold bg-slate-50/30">
                    {totalRemainingUsed}
                  </td>

                  {/* Average Final Wins */}
                  <td className="py-3.5 px-3 text-center font-mono font-bold text-blue-700 bg-blue-50/10">
                    {r.averageFinalWins.toFixed(1)}승
                  </td>

                  {/* Expected Additional Wins */}
                  <td className="py-3.5 px-3 text-center font-mono text-blue-500 font-medium">
                    +{expectedAddWins.toFixed(1)}
                  </td>

                  {/* Average Final Losses */}
                  <td className="py-3.5 px-3 text-center font-mono font-medium text-red-500 bg-red-50/5">
                    {avgFinalLosses.toFixed(1)}패
                  </td>

                  {/* Average Final Draws */}
                  <td className="py-3.5 px-3 text-center font-mono text-slate-500">
                    {avgFinalDraws.toFixed(1)}무
                  </td>

                  {/* Projected Final Games (Must be exactly 144) */}
                  <td className="py-3.5 px-3 text-center font-mono font-extrabold text-indigo-900 bg-indigo-50/10">
                    <div className="flex flex-col items-center justify-center">
                      <span className={finalCombinedGamesCount !== 144 ? 'text-red-600 animate-pulse' : ''}>
                        {finalCombinedGamesCount}
                      </span>
                      {finalCombinedGamesCount !== 144 && (
                        <span className="text-[8px] text-red-500 font-normal">오류</span>
                      )}
                    </div>
                  </td>

                  {/* Playoff Entry Probability */}
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-12 font-extrabold text-right font-mono text-slate-800">
                        {r.playoffProbability.toFixed(1)}%
                      </div>
                      <div className="flex-1 min-w-[50px]">
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${zone.barColor}`}
                            style={{ width: `${r.playoffProbability}%` }}
                          />
                        </div>
                      </div>
                      <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 whitespace-nowrap ${zone.badgeClass}`}>
                        {zone.label.split(' ')[0]}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
};
