/**
 * @file RankDistribution.tsx
 * @description Displays an interactive final rank distribution heatmap matrix (1st to 10th place probabilities) for all teams.
 */

import React from 'react';
import { CONFIG } from '../config';
import { TeamSimulationStats } from '../types';

interface RankDistributionProps {
  results: TeamSimulationStats[];
}

/**
 * Returns a Tailwind class representing cell background opacity based on probability value.
 */
function getHeatmapClass(prob: number): string {
  if (prob === 0) return 'bg-white text-slate-300';
  if (prob < 1) return 'bg-slate-50 text-slate-400 font-medium';
  if (prob < 5) return 'bg-blue-50 text-blue-600 font-semibold';
  if (prob < 15) return 'bg-blue-100 text-blue-700 font-bold';
  if (prob < 30) return 'bg-blue-200 text-blue-800 font-bold';
  if (prob < 60) return 'bg-blue-500 text-white font-extrabold';
  return 'bg-blue-700 text-white font-black';
}

/**
 * Renders the rank distribution matrix table (heatmap).
 */
export const RankDistribution: React.FC<RankDistributionProps> = ({ results }) => {
  console.log(`[RankDistribution] Rendered with ${results.length} team results`);

  // We want to sort the rows by current rank or playoff probability (results is already sorted by playoff probability)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-sm">최종 예상 순위 분포도 (Rank Distribution Heatmap)</h3>
        <p className="text-xs text-slate-400">
          각 구단이 최종 정규시즌을 1위부터 10위로 마칠 확률(%)을 나타낸 분포 매트릭스입니다.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse text-xs" id="rank-distribution-matrix">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
              <th className="py-3 px-4 text-left font-semibold">구단명</th>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rank => (
                <th key={rank} className={`py-3 px-2 w-14 font-mono font-bold ${rank <= 5 ? 'text-blue-600 bg-blue-50/20' : 'text-slate-500'}`}>
                  {rank}위
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map(r => {
              const teamConf = CONFIG.TEAMS[r.team];
              const teamColor = teamConf?.color || 'bg-slate-500';

              return (
                <tr key={r.team} className="hover:bg-slate-50/50 transition-colors">
                  {/* Row Team Name */}
                  <td className="py-3 px-4 text-left font-bold text-slate-800 border-r border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full ${teamColor} text-white font-black text-[8px] flex items-center justify-center`}>
                        {teamConf?.logoChar || 'T'}
                      </div>
                      <span>{teamConf?.nameKo || r.team}</span>
                    </div>
                  </td>

                  {/* Rank Cell Probabilities */}
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rank => {
                    const prob = r.rankDistribution[rank] || 0;
                    const heatmapStyle = getHeatmapClass(prob);
                    
                    return (
                      <td
                        key={rank}
                        className={`py-3 px-1 border-r border-slate-100/50 font-mono text-[11px] transition-all duration-300 ${heatmapStyle}`}
                        title={`${teamConf?.nameKo || r.team}의 최종 ${rank}위 확률: ${prob}%`}
                      >
                        {prob === 0 ? '-' : `${prob}%`}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-[10px] text-slate-500 font-semibold">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-slate-50 border border-slate-200 inline-block rounded" /> 0% ~ 1% 미만
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-blue-50 inline-block rounded" /> 1% ~ 5% 미만
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-blue-100 inline-block rounded" /> 5% ~ 15% 미만
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-blue-200 inline-block rounded" /> 15% ~ 30% 미만
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-blue-500 inline-block rounded" /> 30% ~ 60% 미만
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-blue-700 inline-block rounded" /> 60% 이상
        </span>
      </div>

    </div>
  );
};
