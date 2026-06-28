# ⚾ KBO 가을야구 진출 확률 계산기 설계 문서 (Design.md)

이 문서는 본 웹 애플리케이션의 클라이언트 정적 연동(Serverlessless Browser Simulation) 아키텍처, 디렉토리 구조, 데이터 파이프라인 흐름 및 브라우저 자가진단 검증에 대한 상세 기술 사양을 담고 있습니다.

---

## 1. 개요 및 시스템 목적
본 앱은 정적으로 예약 수집된 프로야구 순위 및 일정 데이터를 연동하여, 잔여 시즌 동안 각 구단이 최종 5위 이내(포스트시즌 와일드카드 결정전 포함)에 진입할 확률을 브라우저 환경에서 직접 통계적으로 연산(몬테카를로 시뮬레이션)하는 예측 시스템입니다. 

기존 Vercel Serverless Function API 의존 구조에서 발생하던 **서버 오류 500, 레이턴시 지연, API 타임아웃** 등의 인프라 이슈를 완벽하게 배제하기 위해, 모든 연산 흐름을 **브라우저 로컬 구동 구조**로 전면 전환하여 설계되었습니다.

---

## 2. 파일 및 폴더 구조 (Directory Tree)

기능별 응집도를 극대화하고 결합도를 낮추기 위해, 코드가 레이어별로 철저히 모듈화되어 분리되어 있습니다.

```
/
├── .github/
│   └── workflows/
│       └── update-kbo-data.yml      # GitHub Actions 수집 & 캐싱 스케줄러 워크플로
│
├── api/                             # [디버그/보조] 디버그 로그 또는 기존 API 참조용 백업 폴더
│
├── scripts/
│   └── update-kbo-data.ts           # 수집기(Harvester) 실행 독립 실행형 스크립트
│
├── public/
│   └── data/                        # 예약 수집된 정적 데이터 저장소
│       ├── kbo-latest.json          # 최신 수집 완료 파일 (브라우저에서 직접 fetch)
│       └── kbo-YYYY-MM-DD.json      # 일자별 누적 예비 스냅샷 파일
│
├── src/
│   ├── App.tsx                      # 메인 대시보드 UI 및 프론트엔드 연동 상태 관리
│   ├── main.tsx                     # React 엔트리 포인트
│   ├── index.css                    # Tailwind CSS 및 스타일링
│   ├── types.ts                     # 전역 공통 TypeScript 타입/인터페이스 정의
│   ├── config.ts                    # 글로벌 상수 및 팀 메타데이터 설정 (모델, 상수 집중)
│   │
│   ├── data/                        # 오프라인 백업 및 fallback 데이터 레이어
│   │   ├── fallbackKboData.ts       # [NEW] 통합 KBO fallback 데이터셋 (standings + schedule)
│   │   ├── fallbackSchedule2026.ts  # 2026 시즌 내장 예비 오프라인 스케줄 백업 데이터
│   │   └── fallbackStandings2026.ts # 2026 시즌 내장 예비 오프라인 순위표 백업 데이터
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
│       │   └── sources/               # 다중 데이터 소스 수집 엔진 레이어 (GitHub Actions 사용)
│       │       └── sourceManager.ts   # 상대 전적 추정 및 데이터 우선순위 관리
│       │
│       ├── staticData/
│       │   └── loadKboStaticData.ts   # [NEW] 브라우저 정적 JSON 로더 및 Fallback 변환 처리
│       │
│       └── simulation/
│           ├── simulateSeason.ts      # 몬테카를로 엔진 핵심 구동 로직 (브라우저 가동용)
│           ├── simulateFromStaticData.ts # [NEW] 정적 데이터를 받아 시뮬레이션을 연결하는 순수 브라우저 브릿지
│           ├── ranking.ts             # 시뮬레이션 결과 기반 최종 순위 정합성 계산기
│           └── probabilityModel.ts    # 전력 비교 및 경기별 가중 승률 예측 모델
```

---

## 3. 클라이언트 정적 데이터 및 시뮬레이션 아키텍처

### 3.1 정적 JSON 로딩 구조 (loadKboStaticData.ts)
- 브라우저가 직접 `fetch('/data/kbo-latest.json?ts=' + Date.now())`를 호출하여 최신 데이터를 다운로드합니다.
- 특정 날짜 조회 시 우선적으로 `kbo-YYYY-MM-DD.json` 파일 fetch를 시도하며, 해당 파일이 없을 시 `kbo-latest.json`으로 우아하게 폴백합니다.
- 네트워크가 완전히 끊기거나 정적 JSON 파일이 부재한 초기 빌드 상태에서는 `src/data/fallbackKboData.ts`에 번들링된 하드코딩 데이터를 탑재하여, 어떠한 상황에서도 에러 없이 대시보드가 정상 구동되도록 합니다.
- **절대 프론트 핵심 흐름에서 서버 API(/api/...)를 호출하지 않으므로 서버 오류 500이 100% 영구적으로 소멸됩니다.**

### 3.2 브라우저 사이드 몬테카를로 시뮬레이션 (simulateFromStaticData.ts)
- DOM, `fs`, `process` 등 Node.js 서버 환경에 전혀 의존하지 않는 순수 TypeScript 계산 코드셋을 브라우저 JS 런타임 위에서 즉시 가동합니다.
- 현대 데스크톱/모바일 브라우저의 높은 성능 덕분에 수만 회의 정적 시뮬레이션은 싱글 스레드에서도 수십~수백 밀리초 이내로 고속 완료됩니다.
  - **10,000회:** 즉시 실행 완료되어 실시간 반응형 결과 갱신 보장.
  - **50,000회 / 100,000회:** 연산 도중 사용자 경험을 위해 부드러운 로딩 인디케이터 제공.
- 시뮬레이션 난수 발생에 Seeded Random(LCG) 알고리즘을 유지하여, 동일 옵션(Seed) 입력 시 언제나 동일하고 신뢰할 수 있는 예측 지표를 반환합니다.

---

## 4. 자가진단 모니터 (Self-Diagnostics)

네트워크 상태 및 API 서버 정상 여부 검사 대신, **브라우저에 로드된 데이터와 시뮬레이터 자체의 정합성**을 실시간으로 자가 점검합니다.
- **1단계 (정적 JSON 로드 검증):** 원격 서버 파일 다운로드 성공 여부 검사
- **2단계 (순위 데이터 10개 팀 검증):** 10개 프로야구 구단 순위표가 손상 없이 온전히 수집되었는지 여부
- **3단계 (남은 경기 데이터 존재 검증):** 잔여 정규시즌 경기 및 우천 취소 순연 일정이 정합성 있게 로드되었는지 확인
- **4단계 (브라우저 시뮬레이션 가동 가능성 검증):** 브라우저 내장 몬테카를로 연산 엔진이 정상적으로 1,000회 이상의 샘플 플레이를 무오류 완료하는지 테스트

---

## 5. 데이터 수집 및 업데이트 자동화 (GitHub Actions)
- 실제 프로야구 경기 일정 및 경기 결과 수집 작업은 웹 서버나 프론트엔드가 아닌, **GitHub Actions 워크플로가 전담**합니다.
- 매일 지정된 시각 또는 관리자의 수동 런(Run workflow) 실행에 의해 가동되어 데이터를 수집하고 `public/data/kbo-latest.json`을 갱신합니다.
- 데이터 갱신을 수작업으로 강제 실행하고 싶을 경우:
  - **GitHub 저장소 ➜ Actions ➜ update-kbo-data ➜ Run workflow** 메뉴를 실행하면 즉시 수집이 갱신됩니다.
