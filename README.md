# ⚾ KBO 프로야구 가을야구 진출 확률 계산기 (KBO Postseason Simulator)

공식 KBO 리그 순위 및 잔여 경기 일정을 기반으로 한 통계적 몬테카를로 시뮬레이션 웹 어플리케이션입니다.

---

## 📡 예약 수집형 (Scheduled Ingestion) 아키텍처 개요
본 애플리케이션은 사용자 요청 시점에 실시간으로 외부 사이트를 크롤링하는 방식에서 벗어나, **GitHub Actions를 활용한 정기 예약 수집 모델**을 채택하고 있습니다. 
이를 통해 외부 사이트의 Timeout, IP 차단, HTML 파서 변경 등 여러 변수로 인해 발생하는 Vercel 웹 서버의 500 에러를 100% 방지하고 극한의 안정성과 고속 연산 응답 속도를 보장합니다.

```
[GitHub Actions (Cron)]
      │
      ▼ (정해진 시각 또는 수동 실행)
┌──────────────────────────────────────────────┐
│  scripts/update-kbo-data.ts 실행             │
│  - 데이터 소스 순차 수집 (Timeout 5초)       │
│  - JSON 생성 및 레포지토리 자동 푸시          │
└──────────────────────┬───────────────────────┘
                       │
                       ▼ (저장되는 위치)
┌──────────────────────────────────────────────┐
│  public/data/kbo-latest.json                 │
│  public/data/kbo-YYYY-MM-DD.json             │
│  public/data/kbo-source-status.json          │
└──────────────────────┬───────────────────────┘
                       │
                       ▼ (Vercel Serverless)
┌──────────────────────────────────────────────┐
│  API 엔드포인트 (/api/simulate)              │
│  - 수 밀리초 내로 정적 JSON 파일 로드          │
│  - 몬테카를로 시뮬레이션 연산 후 즉각 응답      │
└──────────────────────────────────────────────┘
```

---

## 🚀 주요 기능
- **몬테카를로 시뮬레이션 (Monte Carlo Simulation):** 정규 시즌의 미치러진 잔여 일정 전체를 수만 회 가상 플레이 구동하여 각 구단이 최종 5위 이내(가을야구 진출 조건)에 포함될 확률을 통계적으로 계산합니다.
- **예약 수집형 JSON 연동:** 실시간 크롤링에 의존하지 않고 로컬에 캐싱된 검증 완료된 JSON 파일을 활용해 500 서버 에러가 없으며, 0.1초 내로 초고속 계산 결과를 반환합니다.
- **다중 소스 장애 대응 메커니즘 (Multi-Source Resilience Adapter):** GitHub Actions 수집 시점에 KBO 공식 영문 사이트 수집이 실패하면 MyKBOStats, AiScore 비공식 보조 소스 및 내장 백업 데이터를 우선순위별로 자동 cascading 적용해 데이터를 완성합니다.
- **마지막 성공 데이터 자가 보존:** 외부 수집 시도 중 전면적인 장애가 발생하더라도 마지막으로 정상 수집에 성공했던 로컬 캐시 파일을 지우지 않고 유지함으로써 계산기 구동의 영속성을 완벽히 보장합니다.
- **네트워크 자가진단 모니터 (Self-Diagnostics):** 로컬 JSON 파일 로드 상태, 10개 구단 순위표 정합성, 남은 일정 무결성, 몬테카를로 엔진 연산 가동성 여부를 원클릭으로 검증할 수 있습니다.

---

## 🕒 데이터 수집 스케줄 (GitHub Actions)
KBO 리그 진행 시간을 반영하여 한국 시간(KST) 기준 아래 시각에 자동으로 데이터를 수집하고 빌드를 배포합니다.

- **오전 9:00 (00:00 UTC):** 전날 최종 경기 결과를 최종 반영 및 당일 오전 분석 기준 데이터 구축
- **오후 4:00 (07:00 UTC):** 당일 주중/주말 경기 개시 직전 최종 라인업 및 스냅샷 보강
- **오후 11:00 (14:00 UTC):** 당일 모든 경기 완료 후 가을야구 진출 확률 정밀 업데이트

### 🚀 수동 수집 강제 구동 방법 (Manual Dispatch)
정기 스케줄 외에 즉시 최신 KBO 데이터를 반영해야 할 경우, 저장소 관리 콘솔에서 수동으로 크롤러를 작동시킬 수 있습니다.
1. 이 프로젝트의 GitHub 저장소에 접속합니다.
2. 상단 메뉴의 **Actions** 탭으로 이동합니다.
3. 좌측 워크플로 목록에서 **KBO Playoff Data Auto-Harvester**를 클릭합니다.
4. 우측 상단의 **Run workflow** 드롭다운 버튼을 클릭하고 **Run workflow** 버튼을 눌러 즉시 최신 데이터를 수집 및 반영합니다.

---

## 📁 생성되는 수집 데이터 구조 (`public/data/`)
- `kbo-latest.json`: 웹앱이 디폴트로 읽는 가장 최근에 성공적으로 수집 완료된 KBO 순위, 경기 일정 데이터 파일
- `kbo-YYYY-MM-DD.json`: 분석 기준일을 과거 특정 시점으로 변경 시 불러오기 위한 일자별 누적 예비 데이터셋
- `kbo-source-status.json`: 데이터 수집 엔진의 구동 로그, 성공률 및 에러 현황 리포트

---

## 🛠️ 기술 스택
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Motion (from `motion/react`)
- **Backend:** Node.js Express & Vercel Serverless Function (TypeScript bundling)
- **Harvester:** GitHub Actions, tsx runtime compiler
- **Scraping Engine:** Cheerio, Fetch (with browser imitation headers)

---

## 📡 API 엔드포인트 목록 (Vercel Serverless)
- **정적 순위 API:** `/api/kbo/standings?date=YYYY-MM-DD`
- **정적 일정 API:** `/api/kbo/schedule?from=YYYY-MM-DD`
- **정적 고속 시뮬레이션 API:** `/api/simulate?date=YYYY-MM-DD&iterations=10000&model=winRate&seed=42`

---

## 💻 로컬 개발 환경 실행법

### 1. 패키지 의존성 설치
```bash
npm install
```

### 2. 수동 수집기(Harvester) 1회 작동
```bash
npm run update:kbo-data
```
`public/data/kbo-latest.json` 및 `kbo-source-status.json` 파일이 정상적으로 로컬에 생성되는 것을 확인합니다.

### 3. 개발 서버 기동
```bash
npm run dev
```
기본적으로 http://localhost:3000 에서 프론트엔드와 백엔드가 동시에 활성화됩니다.
