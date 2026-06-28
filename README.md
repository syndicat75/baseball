# ⚾ KBO 프로야구 가을야구 진출 확률 계산기 (KBO Postseason Simulator)

공식 KBO 리그 순위 및 잔여 경기 일정을 기반으로 한 통계적 몬테카를로 시뮬레이션 웹 어플리케이션입니다.

---

## 🚀 주요 기능
- **몬테카를로 시뮬레이션 (Monte Carlo Simulation):** 잔여 일정 전체를 최대 10,000회 가상 시뮬레이션 구동하여 각 구단이 최종 5위 이내(가을야구 진출 조건)에 포함될 확률을 통계적으로 계산합니다.
- **다중 소스 장애 대응 메커니즘 (Multi-Source Resilience Adapter):** KBO 공식 한글/영문 홈페이지 수집이 네트워크 이슈나 Vercel IP 차단 등으로 실패하면 MyKBOStats, AiScore 비공식 보조 소스 및 내장 백업 데이터를 우선순위별로 자동 cascading 적용하여 어떠한 경우에도 500 장애를 차단합니다.
- **네트워크 자가진단 모니터 (Self-Diagnostics):** API 서버 상태부터 순위 데이터, 일정 파싱, 시뮬레이션까지의 수집 상태와 활용된 소스 정보 및 탈락한 소스 목록을 실시간 검사할 수 있습니다.
- **다채로운 예측 확률 모델:** 단순 50% 균등 모델, 누적 승률 가중 모델, 최근 흐름과 홈/원정 지표를 고려한 하이브리드 다면 모델을 지원합니다.

---

## 🛠️ 기술 스택
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Motion
- **Backend:** Node.js Express & Vercel Serverless Function (TypeScript CJS bundling)
- **Scraping Engine:** Cheerio, Fetch (with browser imitation headers)

---

## 🔗 데이터 소스 우선순위 및 어댑터 아키텍처
본 앱은 외부 데이터를 최대 3초 이내에 성공적으로 가져오는 최우선 소스를 판별해 연산에 사용합니다.

1. **KBO Official English Site** (`eng.koreabaseball.com`) - 높은 안정성, 빠른 로드 시간
2. **MyKBOStats** (`mykbostats.com`) - 해외 유명 야구 분석 데이터베이스
3. **AiScore KBO Matches** - 다국적 통합 리그 기록 서비스
4. **KBO Official Korean Site** (`koreabaseball.com`) - 국내 AJAX 기반 순위/일정
5. **Bundled Fallback Database** - 오프라인 모드 시 구동되는 로컬 2026시즌 예비 일정

---

## 💻 로컬 개발 환경 실행법

### 1. 패키지 의존성 설치
```bash
npm install
```

### 2. 개발 서버(Express + Vite 프록시 통합 서버) 기동
```bash
npm run dev
```
기본적으로 http://localhost:3000 에서 프론트엔드와 백엔드가 동시에 활성화됩니다.

### 3. 프로덕션 빌드 및 실행
```bash
npm run build
npm start
```

---

## 📡 API 엔드포인트 목록
- **헬스체크:** `/api/health`
- **실시간 순위:** `/api/kbo/standings?date=YYYY-MM-DD`
- **실시간 일정:** `/api/kbo/schedule?from=YYYY-MM-DD`
- **시뮬레이션 연산:** `/api/simulate?date=YYYY-MM-DD&iterations=10000&model=winRate&seed=42`
