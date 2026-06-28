# ⚾ KBO 가을야구 진출 확률 계산기 설계 문서 (Design.md)

이 문서는 본 웹 애플리케이션의 예약 수집형 JSON 연동 아키텍처, 디렉토리 구조, 데이터 파이프라인 흐름 및 정적 자가진단 검증에 대한 상세 기술 사양을 담고 있습니다.

---

## 1. 개요 및 시스템 목적
본 앱은 실시간 프로야구 순위 및 일정 데이터를 연동하여 잔여 시즌 동안 각 구단이 최종 5위 이내(포스트시즌 와일드카드 결정전 포함)에 진입할 확률을 정밀하게 통계적으로 연산하는 예측 시스템입니다. 

Vercel Serverless Function 환경에서의 외부 크롤러 레이턴시 지연, 타임아웃(Timeout 10초 제한), 대상 웹사이트의 파서 오작동 및 Vercel IP 차단 문제를 원천적으로 종식하기 위해, **GitHub Actions 기반 정기 예약 수집 모델(Scheduled JSON Ingestion)**로 전환하여 설계되었습니다.

---

## 2. 파일 및 폴더 구조 (Directory Tree)

기능별 응집도를 극대화하고 결합도를 낮추기 위해, 코드가 레이어별로 철저히 모듈화되어 분리되어 있습니다.

```
/
├── .github/
│   └── workflows/
│       └── update-kbo-data.yml      # GitHub Actions 수집 & 캐싱 스케줄러 워크플로
│
├── api/                             # Vercel Serverless HTTP Endpoints
│   ├── health.ts                    # API 헬스체크
│   ├── simulate.ts                  # 정적 JSON 데이터를 이용한 초고속 몬테카를로 시뮬레이션
│   └── kbo/
│       ├── standings.ts             # 정적 JSON 기반 구단별 순위 데이터 조회 API
│       └── schedule.ts              # 정적 JSON 기반 잔여 일정/우천 순연 데이터 조회 API
│
├── scripts/
│   └── update-kbo-data.ts           # 수집기(Harvester) 실행 독립 실행형 스크립트
│
├── public/
│   └── data/                        # [NEW] 예약 수집된 정적 데이터 저장소
│       ├── kbo-latest.json          # 최신 수집 완료 파일
│       ├── kbo-YYYY-MM-DD.json      # 일자별 누적 예비 스냅샷 파일
│       └── kbo-source-status.json   # 수집기 가동 성공 여부 및 통계 로그
│
├── src/
│   ├── App.tsx                      # 메인 대시보드 UI 및 프론트엔드 연동 상태 관리
│   ├── main.tsx                     # React 엔트리 포인트
│   ├── index.css                    # Tailwind CSS 및 스타일링
│   ├── types.ts                     # 전역 공통 TypeScript 타입/인터페이스 정의
│   ├── config.ts                    # 글로벌 상수 및 팀 메타데이터 설정 (모델, 상수 집중)
│   │
│   ├── components/                  # UI 컴포넌트 분리
│   │   ├── DateControl.tsx          # 날짜 선택 및 수집 트리거 컨트롤러
│   │   ├── SimulationControls.tsx   # 시뮬레이션 파라미터 (횟수, 시드, 모델) 제어
│   │   ├── ProbabilityCards.tsx     # 구단별 진출 확률 상단 요약 카드
│   │   ├── ProbabilityTable.tsx     # 구단별 상세 기록 분석 데이터 테이블
│   │   ├── RankDistribution.tsx     # 최종 예상 순위 분포 히트맵 시각화
│   │   └── DataQualityNotice.tsx    # 미확정 경기 및 품질 가이드 경고
│   │
│   └── lib/
│       ├── kbo/
│       │   ├── buildSnapshotByDate.ts # 과거 시점 순위표 역산/재구성 모듈
│       │   ├── parseStandings.ts      # KBO standings 기본 인터페이스 및 긴급 데이터 생성
│       │   ├── parseSchedule.ts       # KBO schedule 기본 분석 모델
│       │   │
│       │   └── sources/               # 다중 데이터 소스 수집 엔진 레이어
│       │       ├── index.ts           # KboDataSource 규격 선언
│       │       ├── sourceManager.ts   # 우선순위 우회 스케줄러 & 타임아웃(5초) 처리기
│       │       ├── fetchWithTimeout.ts# 타임아웃 방지 브라우저 헤더 주입 fetch 유틸
│       │       ├── officialKboEnglishSource.ts # [P1] KBO 영문 공식 웹사이트 스크래퍼
│       │       ├── myKboStatsSource.ts# [P2] MyKBOStats 비공식 보조 소스 스크래퍼
│       │       ├── aiScoreSource.ts   # [P3] AiScore 글로벌 일정/결과 비공식 보조 스크래퍼
│       │       └── fallbackSource.ts  # [P4] 2026 시즌 내장 예비 오프라인 백업 데이터
│       │
│       └── simulation/
│           ├── simulateSeason.ts      # 몬테카를로 엔진 핵심 구동 로직
│           └── pseudoRandom.ts        # 난수 결정성 유지를 위한 LCG pseudo-random 생성기
```

---

## 3. 예약 수집 JSON 아키텍처 및 복구 체계 (Resilient Scheduled Ingestion)

### 3.1 GitHub Actions Harvester 연동 흐름
1. **스케줄 작동:** 한국 시간(KST) 오전 9시, 오후 4시, 오후 11시(경기 종료 직후) 크론 탭에 의해 자동 구동됩니다.
2. **크롤러 가동:** 독립 실행 스크립트 `scripts/update-kbo-data.ts`가 가동되어 KBO 공식 영문 사이트 ➜ MyKBOStats ➜ AiScore 순서로 순차 크롤링을 시도합니다.
3. **5초 제한 샌드박스:** 각 소스 수집 시 최대 5초의 타임아웃을 적용해 반응이 느린 외부 소스를 고속 차단하고 다음 우선순위 소스로 자동 연쇄 이양(Cascading)합니다.
4. **결과 보존 및 커밋:** 수집된 가을야구 전산 인풋 데이터셋을 `public/data/kbo-latest.json` 및 `public/data/kbo-YYYY-MM-DD.json`에 영속화하고, 깃 레포지토리에 자동 푸시하여 Vercel Cloud에 즉시 전파합니다.

### 3.2 수집 오류 시의 자가 보존 (Resilient Fail-safe)
- 만약 원격 외부 소스들이 전부 장애를 겪거나 네트워크가 유실되더라도, 수집기 스크립트는 직전에 정상 작동해 구축되었던 기존 `kbo-latest.json` 캐시 파일을 파괴하지 않고 온전히 보존합니다.
- 웹앱은 외부 직접 조회를 일절 수행하지 않으므로, 외부 서비스 점검 시점에도 가을야구 계산기 전체 구동성과 고속 연산 능력은 100% 무중단 정상 구동됩니다.

---

## 4. 몬테카를로 시뮬레이션 연산 설계
- **과거 순위 역산:** 사용자가 과거 특정 분석 기준일을 선택하면, 시스템은 그 시점까지의 누적 데이터만 추려 순위를 실시간 역산(`buildSnapshotByDate`)하여 스냅샷을 구성합니다.
- **결정적 난수 생성:** 시뮬레이션 계산 시 일관성 있는 예측 결과를 보존하기 위해 JS의 비결정적 `Math.random` 대신 Seed 값이 주입되는 Linear Congruential Generator(LCG) 알고리즘을 사용합니다.
- **예측 확률 모델 (src/config.ts 설정 집중):**
  - `equal` (균등 확률 모델): 각 구단의 누적 승률 등 전력과 무관하게 홈/원정 각각 50%의 승리 확률 적용.
  - `winRate` (누적 승률 모델): 시뮬레이션 시점의 두 팀간 누적 승률 차이에 기반한 통계 가중 확률 계산.
  - `hybrid` (하이브리드 다면 모델): 누적 승률 가중에 더해 최근 10경기 흐름 및 홈/원정 승률 지표를 복합 연산하여 정밀 가중 반영.
- **실행 제한 방어:** Vercel Serverless 함수의 타임아웃 제약을 극복하고 즉각 응답을 보장하기 위해 시뮬레이션 횟수는 최대 **10,000회**로 서버 레벨에서 자동 조정됩니다.

---

## 5. UI 및 자가진단 설계

### 5.1 데이터 연동 상태 카드 (Connection Status Banner)
- 예약 수집된 JSON 데이터 파일의 수집 완성 상태 및 원본 출처(`originalSourceLabel`), 마지막 수집 완료 날짜/시간(`fetchedAt`)을 표시합니다.
- 외부 수집 실패 후 기존 캐시 보존 모드가 활성화된 상태이면 노란색 경고로 표시하고, 완전한 오프라인 상태이면 주황색 카드로 비상 경고를 안내합니다.

### 5.2 정적 자가진단 모니터 (Static Self-Diagnostics Monitor)
수행 과정에서 실제 크롤러 네트워크 검사를 제외하고 **데이터 파이프라인의 내부 무결성**을 수동/자동 수집 검사합니다.
- **1단계 (정적 JSON 파일 로드):** 수집된 데이터의 물리적 가동 상태 및 갱신 상태 확인
- **2단계 (10개 팀 순위 정합성):** 로드된 테이블에 10개 구단 순위표가 깨짐 없이 들어있는지 검사
- **3단계 (남은 경기 데이터 존재):** 잔여 정규시즌 일정 수집 무결성 및 순연 경기 유무 확인
- **4단계 (시뮬레이션 가동 가능성):** 정적 JSON 데이터 기준으로 몬테카를로 수만 회 계산 연산이 에러 없이 고속 작동하는지 확인
