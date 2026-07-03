/**
 * @file server.ts
 * @description KBO 리그 포스트시즌 확률 및 경기 승부 예측 서비스를 운영하기 위한 Express + Vite Full-Stack 서버 엔트리 포인트입니다.
 * 모든 API 라우트(/api/*)를 Vercel 서버리스 스타일의 핸들러와 매핑하며, 프로덕션 환경에서는 정적 dist 빌드를 서빙하고,
 * 로컬 개발 모드(NODE_ENV !== 'production')에서는 Vite 미들웨어를 장착하여 핫 리로드(SPA)를 지원합니다.
 * 포트 3000번 및 호스트 0.0.0.0 바인딩을 강제하여 Cloud Run 컨테이너 인그레스 라우팅 환경을 완벽하게 맞춥니다.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

// API 핸들러들 임포트 (정적 매핑 및 번들링 지원용)
import healthHandler from './api/health';
import standingsHandler from './api/kbo/standings';
import todayGamesHandler from './api/kbo/today-games';
import gameDetailsHandler from './api/kbo/game-details';
import gamePredictionsHandler from './api/kbo/game-predictions';
import predictionsHandler from './api/kbo/predictions';
import refreshHandler from './api/kbo/refresh';
import scheduleHandler from './api/kbo/schedule';
import simulateHandler from './api/simulate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @function adaptHandler
 * @description Express 요청/응답 쌍을 Vercel 서버리스 스타일 핸들러 형식에 적합하게 어댑팅하는 미들웨어 어댑터입니다.
 * @param {any} handler VercelRequest/VercelResponse 시그니처를 따르는 핸들러 함수
 * @returns Express 라우트 핸들러 함수
 */
function adaptHandler(handler: any) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log(`[Express Server] [CALL] API Handler: ${req.method} ${req.path}`);
    try {
      // Vercel Request 인터페이스 모사
      const extendedReq = Object.assign(req, {
        query: req.query as Record<string, string>,
        body: req.body
      });

      // Vercel Response 인터페이스 모사 (status 연쇄 호출 및 json 헬퍼 보강)
      const extendedRes = Object.assign(res, {
        status(code: number) {
          res.statusCode = code;
          return extendedRes;
        },
        json(data: any) {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'application/json');
          }
          res.end(JSON.stringify(data));
          return extendedRes;
        }
      });

      await handler(extendedReq, extendedRes);
    } catch (err) {
      console.error(`[Express Server] [ERROR] Handler execution failed on ${req.path}:`, err);
      next(err);
    }
  };
}

/**
 * @function startServer
 * @description Express 애플리케이션 및 개발/운영 맞춤형 라우팅 서빙을 시작합니다.
 */
async function startServer() {
  console.log('[Express Server] [CALL] startServer - Initializing Server...');
  const app = express();
  const PORT = 3000;

  // JSON 및 URL-encoded 바디 파서 장착
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API 라우팅 정적 매핑 등록 (Express 4/5 호환)
  app.get('/api/health', adaptHandler(healthHandler));
  app.get('/api/kbo/standings', adaptHandler(standingsHandler));
  app.get('/api/kbo/today-games', adaptHandler(todayGamesHandler));
  app.get('/api/kbo/game-details', adaptHandler(gameDetailsHandler));
  app.get('/api/kbo/game-predictions', adaptHandler(gamePredictionsHandler));
  app.get('/api/kbo/predictions', adaptHandler(predictionsHandler));
  app.post('/api/kbo/refresh', adaptHandler(refreshHandler));
  app.get('/api/kbo/refresh', adaptHandler(refreshHandler)); // GET 지원
  app.get('/api/kbo/schedule', adaptHandler(scheduleHandler));
  app.post('/api/simulate', adaptHandler(simulateHandler));
  app.get('/api/simulate', adaptHandler(simulateHandler));

  // 개발 모드와 프로덕션(운영) 모드 분기 처리
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Express Server] Mode: DEVELOPMENT. Mounting Vite SPA middleware.');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    // Vite가 애셋 서빙과 라우팅을 가로채서 처리하도록 등록
    app.use(vite.middlewares);
  } else {
    console.log('[Express Server] Mode: PRODUCTION. Serving compiled static assets.');
    const distPath = path.join(process.cwd(), 'dist');
    // 빌드된 정적 애셋 서빙
    app.use(express.static(distPath));
    // SPA 폴백 라우팅 (모든 프론트엔드 URL 대응)
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 에러 처리 최종 미들웨어
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Express Server] [CRITICAL] Unhandled Middleware Error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        details: err.message || '알 수 없는 서버 내부 에러가 발생했습니다.'
      });
    }
  });

  // 호스트 0.0.0.0 및 포트 3000번 수신 대기 시작
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Express Server] [READY] Server is listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
