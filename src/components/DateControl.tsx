/**
 * @file DateControl.tsx
 * @description Provides a calendar input for selecting the reference date for KBO standings snapshotting.
 * Restricts future dates and triggers snapshot re-compilation.
 */

import React from 'react';
import { Calendar, RefreshCw } from 'lucide-react';

interface DateControlProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  lastUpdated: string | null;
}

/**
 * Renders the reference date selector and the force-refresh action button.
 */
export const DateControl: React.FC<DateControlProps> = ({
  selectedDate,
  onDateChange,
  onRefresh,
  isLoading,
  lastUpdated,
}) => {
  console.log(`[DateControl] Rendered with date: "${selectedDate}", isLoading: ${isLoading}`);

  // Restrict to today's date or earlier
  const todayStr = new Date().toISOString().split('T')[0];

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    console.log(`[DateControl] User changed date value to: "${val}"`);
    onDateChange(val);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 transition-all duration-200 hover:shadow-md">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        {/* Left: Heading & Label */}
        <div className="space-y-1">
          <label htmlFor="reference-date" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Calendar className="w-4 h-4 text-slate-500" />
            분석 기준일 선택
          </label>
          <p className="text-xs text-slate-400">
            과거 날짜를 선택하면 해당 시점까지의 경기 결과가 누적되어 스냅샷이 자동 재구성됩니다.
          </p>
        </div>

        {/* Right: Date Input & Refresh button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <div className="relative">
              <input
                id="reference-date"
                type="date"
                max={todayStr}
                value={selectedDate}
                onChange={handleDateInputChange}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg text-sm text-slate-700 font-medium outline-none transition-all cursor-pointer"
              />
            </div>
            <span className="text-[10px] text-amber-600 font-bold mt-1 max-w-[200px] leading-tight">
              ⚠️ 현재 최신 수집 데이터 스냅샷 기준으로만 계산을 지원합니다.
            </span>
          </div>

          <button
            onClick={() => {
              console.log('[DateControl] Refresh clicked');
              onRefresh();
            }}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-50 text-slate-700 font-medium text-sm rounded-lg border border-slate-200 cursor-pointer transition-all"
            title="서버에 예약 수집된 JSON 데이터 파일을 다시 읽어옵니다."
            id="refresh-data-btn"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            예약 수집 데이터 다시 읽기
          </button>
        </div>
      </div>

      {lastUpdated && (
        <div className="mt-3 text-[11px] text-right text-slate-400 font-mono">
          마지막 데이터 수집 시점: {lastUpdated}
        </div>
      )}
    </div>
  );
};
