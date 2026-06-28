/**
 * @file ProbabilityTable.tsx
 * @description Renders a detailed, responsive data table of current records, predicted wins, expected final rankings, and postseason entry probabilities.
 */

import React from 'react';
import { CONFIG } from '../config';
import { TeamSimulationStats } from '../types';
import { getProbabilityZone } from './ProbabilityCards';

interface ProbabilityTableProps {
  results: TeamSimulationStats[];
}

/**
 * Renders the tabular view of simulation statistics with a highlighted postseason bubble zone.
 */
export const ProbabilityTable: React.FC<ProbabilityTableProps> = ({ results }) => {
  console.log(`[ProbabilityTable] Rendered with ${results.length} team results`);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      
      {/* Table Header / Subheading */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">전개표 및 진출 상세 분석</h3>
          <p className="text-xs text-slate-400">시뮬레이션 완료 결과에 따른 각 구단별 예측 수치입니다.</p>
        </div>
        <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-md">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          4위~7위는 가을야구 5위권 경계선 경쟁역(Bubble Zone)
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" id="probability-standings-table">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-sans">
              <th className="py-3 px-4 text-center w-12">현재</th>
              <th className="py-3 px-4">구단명</th>
              <th className="py-3 px-4 text-center">현재 경기</th>
              <th className="py-3 px-4 text-center">현재 승-패-무</th>
              <th className="py-3 px-4 text-center">현재 승률</th>
              <th className="py-3 px-4 text-center bg-slate-100/50">예상 평균 승수</th>
              <th className="py-3 px-4 text-center bg-slate-100/50">예상 평균 순위</th>
              <th className="py-3 px-4 w-60">가을야구 진출 확률 (Top 5)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-600 text-sm">
            {results.map((r, index) => {
              const teamConf = CONFIG.TEAMS[r.team];
              const teamColor = teamConf?.color || 'bg-slate-500';
              const zone = getProbabilityZone(r.playoffProbability);
              
              // Highlight the bubble zone (ranks 4, 5, 6, 7 based on current/average rank)
              const isBubbleZone = r.currentRank >= 4 && r.currentRank <= 7;

              // Current win rate display
              const denom = r.currentWins + r.currentLosses;
              const currentWinRate = denom > 0 ? (r.currentWins / denom).toFixed(3) : '.000';

              return (
                <tr
                  key={r.team}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    isBubbleZone ? 'bg-blue-50/10' : ''
                  }`}
                >
                  {/* Current Rank */}
                  <td className="py-4 px-4 text-center font-bold text-slate-500 font-mono">
                    {r.currentRank}위
                  </td>

                  {/* Team name + Logo */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full ${teamColor} text-white font-black text-[10px] flex items-center justify-center`}>
                        {teamConf?.logoChar || 'T'}
                      </div>
                      <span className="font-bold text-slate-800">{teamConf?.nameKo || r.team}</span>
                    </div>
                  </td>

                  {/* Current games */}
                  <td className="py-4 px-4 text-center font-mono text-slate-500 font-medium">
                    {r.currentWins + r.currentLosses + r.currentDraws}경기
                  </td>

                  {/* Current record */}
                  <td className="py-4 px-4 text-center font-mono font-bold text-slate-700">
                    {r.currentWins}승-{r.currentLosses}패-{r.currentDraws}무
                  </td>

                  {/* Current winrate */}
                  <td className="py-4 px-4 text-center font-mono text-slate-500 font-semibold">
                    {currentWinRate}
                  </td>

                  {/* Expected Final Wins */}
                  <td className="py-4 px-4 text-center font-mono font-bold text-blue-600 bg-slate-50/30">
                    {r.averageFinalWins}승
                  </td>

                  {/* Expected Average Rank */}
                  <td className="py-4 px-4 text-center font-mono font-bold text-slate-700 bg-slate-50/30">
                    {r.averageFinalRank}위
                  </td>

                  {/* Playoff Entry Probability */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 font-extrabold text-right font-mono text-slate-800">
                        {r.playoffProbability.toFixed(1)}%
                      </div>
                      <div className="flex-1">
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${zone.barColor}`}
                            style={{ width: `${r.playoffProbability}%` }}
                          />
                        </div>
                      </div>
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded border flex-shrink-0 ${zone.badgeClass}`}>
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
