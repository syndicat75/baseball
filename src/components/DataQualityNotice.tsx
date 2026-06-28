/**
 * @file DataQualityNotice.tsx
 * @description Informs the user of unresolved rainout/postponed matches and specifies how the engine corrects them.
 */

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { KBOGame } from '../types';

interface DataQualityNoticeProps {
  unresolvedGames: any[];
}

/**
 * Notice card displayed when some postponed matches are not yet officially rescheduled.
 */
export const DataQualityNotice: React.FC<DataQualityNoticeProps> = ({ unresolvedGames }) => {
  const count = unresolvedGames.length;
  console.log(`[DataQualityNotice] Rendered with unresolvedGames count: ${count}`);

  if (count === 0) {
    return null;
  }

  // Group by teams to show a friendly summary
  const teamCounts: Record<string, number> = {};
  unresolvedGames.forEach(g => {
    teamCounts[g.away] = (teamCounts[g.away] || 0) + 1;
    teamCounts[g.home] = (teamCounts[g.home] || 0) + 1;
  });

  const affectedTeamsStr = Object.entries(teamCounts)
    .map(([team, num]) => `${team}(${num}경기)`)
    .join(', ');

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 transition-all duration-200">
      <div className="flex-shrink-0 mt-0.5">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
      </div>
      <div className="space-y-1.5 flex-1">
        <h4 className="text-sm font-bold text-amber-900">잔여 경기 데이터 품질 경고 및 자동 보정 안내</h4>
        <p className="text-xs text-amber-800 leading-relaxed">
          KBO 공식 일정에 아직 공식 재편성되지 않은 우천취소/순연 경기(총 <strong>{count}경기</strong>)가 감지되었습니다. 
          각 구단별 최종 144경기를 충족하기 위해, 시뮬레이터가 이 경기들을 상대전적 기반의 <strong>가상 미정 경기(Synthetic Match)</strong>로 생성하여 보정 계산하였습니다.
        </p>
        <p className="text-[11px] text-amber-700/90 font-medium">
          보정 대상 구단: {affectedTeamsStr}
        </p>
      </div>
    </div>
  );
};
