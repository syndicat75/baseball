/**
 * @file DataReliabilityCard.tsx
 * @description 시뮬레이션에 주입된 KBO 데이터셋의 품질 지표와 신뢰도 점수를 사용자에게 명확히 전달하는 고광택 카드 컴포넌트입니다.
 */

import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, HelpCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { ReliabilityResult } from '../lib/quality/calculateDataReliability';

interface DataReliabilityCardProps {
  reliability: ReliabilityResult;
}

/**
 * @function DataReliabilityCard
 * @description 점수 구간에 따라 적합한 테마 컬러를 반영하고 세부 정합성 체크리스트를 접거나 펼쳐서 파악할 수 있는 컴포넌트입니다.
 * @param {DataReliabilityCardProps} props 신뢰도 리포트 데이터를 주입받는 속성
 */
export const DataReliabilityCard: React.FC<DataReliabilityCardProps> = ({ reliability }) => {
  console.log(`[DataReliabilityCard] [CALL] DataReliabilityCard rendered with score: ${reliability.score}`);

  const getReliabilityStyles = (level: string) => {
    switch (level) {
      case 'very_good':
        return {
          bg: 'bg-emerald-50/70 border-emerald-100',
          ring: 'ring-emerald-500/20',
          text: 'text-emerald-800',
          iconColor: 'text-emerald-600',
          scoreBg: 'bg-emerald-500 text-white',
          statusBadge: 'bg-emerald-100 text-emerald-900 border-emerald-200'
        };
      case 'good':
      case 'warning':
        return {
          bg: 'bg-amber-50/70 border-amber-100',
          ring: 'ring-amber-500/20',
          text: 'text-amber-800',
          iconColor: 'text-amber-600',
          scoreBg: 'bg-amber-500 text-white',
          statusBadge: 'bg-amber-100 text-amber-900 border-amber-200'
        };
      default:
        return {
          bg: 'bg-rose-50/70 border-rose-100',
          ring: 'ring-rose-500/20',
          text: 'text-rose-800',
          iconColor: 'text-rose-600',
          scoreBg: 'bg-rose-500 text-white',
          statusBadge: 'bg-rose-100 text-rose-950 border-rose-200'
        };
    }
  };

  const style = getReliabilityStyles(reliability.level);
  const formattedTime = reliability.metrics.fetchedAt
    ? new Date(reliability.metrics.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-';

  return (
    <div id="data-reliability-card" className={`rounded-xl border p-5 shadow-sm transition-all duration-300 ${style.bg} hover:shadow-md flex flex-col justify-between h-full`}>
      
      {/* Header Info */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {reliability.score >= 90 ? (
              <ShieldCheck className={`w-5 h-5 ${style.iconColor}`} />
            ) : reliability.score >= 60 ? (
              <AlertTriangle className={`w-5 h-5 ${style.iconColor}`} />
            ) : (
              <ShieldAlert className={`w-5 h-5 ${style.iconColor}`} />
            )}
            <span className="font-bold text-slate-800 text-sm">데이터 실시간 신뢰도 점수</span>
          </div>
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${style.statusBadge}`}>
            {reliability.uiLabel}
          </span>
        </div>

        {/* Main Score Display */}
        <div className="flex items-end justify-between py-1">
          <div className="space-y-0.5">
            <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900">
              {reliability.score}
            </span>
            <span className="text-slate-400 text-xs font-semibold ml-1">/ 100점</span>
            <div className="text-[11px] font-semibold text-slate-500">
              판정 등급: <span className="font-bold text-slate-800">{reliability.label}</span>
            </div>
          </div>
          <div className="w-12 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div 
              className={`h-full ${reliability.score >= 90 ? 'bg-emerald-500' : reliability.score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${reliability.score}%` }}
            />
          </div>
        </div>

        {/* Detail grid list */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-slate-200/50 text-[11px] text-slate-500 font-medium">
          <div className="flex justify-between items-center">
            <span>순위표 완료 경기</span>
            <span className="font-bold font-mono text-slate-700">{reliability.metrics.standingsCompletedGames}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>일정표 완료 경기</span>
            <span className="font-bold font-mono text-slate-700">{reliability.metrics.scheduleCompletedGames}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>순위표 필요 잔여</span>
            <span className="font-bold font-mono text-slate-700">{reliability.metrics.requiredRemainingGames}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>수집된 잔여 일정</span>
            <span className="font-bold font-mono text-slate-700">{reliability.metrics.actualRemainingGames}</span>
          </div>
          <div className="flex justify-between items-center col-span-2 text-slate-400 border-t border-dashed border-slate-200/30 pt-1.5">
            <span>인공 보정(Synthetic) 경기</span>
            <span className={`font-bold font-mono ${reliability.metrics.syntheticGameCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
              {reliability.metrics.syntheticGameCount} 경기
            </span>
          </div>
        </div>
      </div>

      {/* Warnings & Meta Footer */}
      <div className="mt-4 space-y-2">
        {reliability.warnings.length > 0 && (
          <div className="bg-white/70 border border-slate-150 rounded-lg p-2 max-h-[80px] overflow-y-auto space-y-1">
            {reliability.warnings.map((w, idx) => (
              <div key={idx} className="flex items-start gap-1 text-[9px] text-slate-600 leading-tight">
                <span className="text-amber-500 font-bold">⚠️</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold pt-1 border-t border-slate-200/40">
          <span>출처: <span className="text-slate-600 font-bold">{reliability.metrics.source}</span></span>
          <span className="flex items-center gap-0.5">
            <RefreshCw className="w-2.5 h-2.5 animate-spin-slow" />
            <span>갱신 {formattedTime}</span>
          </span>
        </div>
      </div>

    </div>
  );
};
