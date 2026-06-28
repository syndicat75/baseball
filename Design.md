# KBO 가을야구 진출 확률 계산기 설계 문서 (Design.md)

이 문서는 몬테카를로 시뮬레이션 기반의 KBO 프로야구 가을야구 진출 확률 계산기 애플리케이션의 아키텍처 및 세부 설계 사항을 문서화합니다.

---

## 1. 전반적인 아키텍처 (Architecture Overview)

본 애플리케이션은 **Vite + React (TypeScript) + Vercel Serverless Function**의 풀스택 웹 애플리케이션입니다.
KBO 공식 웹사이트의 가용 데이터 수집(Scraping/Parsing), 일 단위 경기 일정의 재구성, 그리고 수만 회차의 병렬 몬테카를로 시뮬레이션을 통해 포스트시즌 진출 확률을 안정적이고 실시간으로 구동합니다.

```
+--------------------------------------------------------+
|                      React UI                          |
|  (App.tsx, DateControl, SimulationControls, Charts)    |
+---------------------------+----------------------------+
                            |
                     /api/simulate
                     /api/kbo/standings
                     /api/kbo/schedule
                            |
                            v
+--------------------------------------------------------+
|              Vercel Serverless Functions               |
|      (api/simulate.ts, api/kbo/standings.ts, ...)      |
+---------------------------+----------------------------+
                            |
                            v
+--------------------------------------------------------+
|              KBO Data Fetch & Parser                   |
|       (fetchKboPage, parseStandings, parseSchedule)     |
+--------------------------------------------------------+
```

---

## 2. 파일 구조 및 모듈 분리 (Modular File Structure)

코드가 너무 무거워져서 타임아웃이나 오류가 발생하는 것을 방지하기 위해 파일과 모듈을 엄격히 기능별로 격리했습니다.

### 2.1 Backend / API Endpoints (Vercel Serverless API)
- `/api/health.ts`: 서버 상태 점검 엔드포인트
- `/api/kbo/standings.ts`: 특정 날짜 기준 순위 정보 및 상대 전적 데이터 조회 엔드포인트 (실패 시 `bundled-fallback` 반환)
- `/api/kbo/schedule.ts`: 특정 날짜 기준 잔여 경기 일정 조회 엔드포인트 (실패 시 `bundled-fallback` 반환)
- `/api/simulate.ts`: 지정 시점을 기준으로 몬테카를로 시뮬레이션 계산 구동 엔드포인트 (10,000회 연산 강제 최적화 탑재)

### 2.2 Core Logic Module (TypeScript)
- `src/config.ts`: 전역 상수, 팀 메타데이터, 캐시 TTL, API 엔드포인트 주소 등 설정 집중화
- `src/types.ts`: KBO 관련 데이터 모델 및 시뮬레이션 결과 타입 선언
- `src/data/fallbackStandings2026.ts`: KBO 2026 가상 시즌 고품질 순위 및 상대 전적 정적 데이터셋 번들
- `src/data/fallbackSchedule2026.ts`: KBO 2026 가상 시즌 720경기 결정론적 세부 일정 데이터셋 번들
- `src/lib/kbo/fetchKboPage.ts`: 크롤링 타임아웃(로컬 8초 / 프로덕션 2.5초), 재시도(로컬 1회 / 프로덕션 0회) 환경별 최적화 모듈
- `src/lib/kbo/parseStandings.ts`: KBO 순위 HTML 테이블 파서 및 텍스트 정규식 파서(이중 안전장치 및 10개 구단 정합성 검증 탑재)
- `src/lib/kbo/parseSchedule.ts`: KBO 공식 AJAX 웹 서비스를 활용한 정밀 월별 일정 수집 및 매치업 파싱 모듈 (월별 AbortController 3초 제한 탑재)
- `src/lib/kbo/buildSnapshotByDate.ts`: 오늘/미래 날짜 시 즉시 parseStandings를 반환하고, 과거 시점에만 전체 시즌 일정 역추적을 시도하는 고속 스냅샷 구성 모듈
- `src/lib/kbo/cache.ts`: 서버리스 메모리 압박을 피하기 위한 간단한 인메모리 시간 기반 TTL 캐시
- `src/lib/simulation/simulateSeason.ts`: 몬테카를로 시뮬레이션 엔진 (누적 승률/균등 확률/하이브리드 모델 지원)

### 2.3 Frontend UI Component
- `src/App.tsx`: 최상단 조정 컴포넌트, 네트워크 정밀 자가진단(Self-Diagnostics) 관리
- `src/components/DateControl.tsx`: 시뮬레이션 기준 날짜 조절 카드
- `src/components/SimulationControls.tsx`: 연산 횟수(Iterations), 확률 계산 모델 선택 카드
- `src/components/ProbabilityCards.tsx`: 10개 구단별 포스트시즌 진출 확률 대형 요약 배너
- `src/components/ProbabilityTable.tsx`: 정밀 통계 지표(최고/최저 순위, 5위 확보 승수 등) 정보 그리드
- `src/components/RankDistribution.tsx`: 몬테카를로 누적 결과에 따른 순위별 확률 분포 차트

---

## 3. 안정성 향상을 위한 핵심 설계 (Resilience Design)

### 3.1 3-단계 이중 안전 장치 (Failover Pattern)
1. **정상 수집 (Success)**: KBO 공식 홈페이지 및 공식 AJAX 웹 서비스를 통해 실시간 순위 테이블 및 월간 경기 기록 데이터를 로드합니다.
2. **백업 파서 (Text-Regex Parser)**: HTML 레이아웃이 변경되었을 때, 내부 정규식 패턴 분석기를 돌려 구단별 성적 정보를 텍스트 레벨에서 파싱해냅니다.
3. **내장 샘플 전환 (Sample Database Recovery)**: KBO 네트워크 전체가 다운되거나 오프라인일 때, 내장된 720경기 가상 시즌 일정을 실시간으로 주입하고 `fallback-sample` 플래그를 올려 프론트가 다운되지 않도록 유지합니다.

### 3.2 KST (Korea Standard Time) 시간 동기화
컨테이너 인프라가 미국이나 유럽 시간에 있어도 자가진단 및 오늘 날짜 기준 정합성을 맞추기 위해 `toLocaleString('en-US', { timeZone: 'Asia/Seoul' })`을 사용하여 서울 시간 기준으로 날짜를 엄격히 한정합니다.

### 3.3 Vercel Serverless 제한 대응
- `vercel.json`에 `maxDuration: 10` 설정을 추가하여 기본 서버리스 작동 시간 제한을 늘렸습니다.
- 과거 시점 순위 재구성 시, 월별 수집을 동시 병렬 요청(`Promise.allSettled`) 처리하여 응답 속도를 극대화했습니다.

---

## 4. 로깅 정책 (Logging Policy)

안정적인 유지 보수를 위해 모든 비즈니스 함수 호출 시 아래 형태의 정형 로그가 서버 콘솔에 남습니다:
```
[parseSchedule] [CALL] parseMatchup - Text: "한화 5vs2 두산"
[buildSnapshotByDate] [CALL] getKstDateString - Resolved KST: "2026-06-28"
[api/simulate] [CALL] handler - date: "2026-06-28", iterations: "50000", ...
```
이를 통해 장애 지점을 추적할 때 프론트 자가진단 UI의 `phase` 데이터와 서버 터미널 로그를 즉각적으로 매핑할 수 있습니다.
