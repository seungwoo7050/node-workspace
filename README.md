# appendix/02: 테스트 툴킷

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Vitest%20%7C%20Playwright%20%7C%20axe--core%20%7C%20Lighthouse%20CI-lightgrey)

앞서 만든 두 프로젝트에 자동 테스트를 붙입니다. 

- Fastify 주문 API에는 Vitest 단위·API 테스트

- Next.js 주문 화면에는 Playwright e2e·접근성 테스트와 Lighthouse 성능 측정

## 지원 범위

- `order-api-fastify`: `appendix/01-fastify-ws`의 주문 API·`/health`·`/ws` 방송 그대로
  
  - 서버 생성(`buildApp`)과 `listen`을 분리해 포트를 열지 않고 테스트
  
  - Vitest 단위 테스트(주문 집계·조회 함수)와 API 테스트(`GET /orders/totals`, `POST /orders`)

- `order-console-next`: `foundation/03f-nextjs`의 주문 목록 `/orders`와 상세 `/orders/:id` 화면 (데이터는 `lib/api.ts`의 고정 목록과 인위적 지연, API 서버를 부르지 않음)
  
  - 상세 화면의 로딩 표시, 없는 주문의 not-found 화면, 클라이언트 컴포넌트 버튼
  
  - Playwright e2e: 목록에서 상세로 이동
  
  - `@axe-core/playwright`로 `/orders` 접근성 위반 검사
  
  - `lighthouserc.cjs`로 `/orders` 성능 점수를 3회 측정

## 구성

- `order-api-fastify/`: Fastify API. `src/app.ts`(`buildApp`), `src/main.ts`(listen), `src/orders.store.ts`(순수 함수), `src/*.test.ts`(Vitest)

- `order-console-next/`: Next.js(App Router) 화면. `app/orders/`(화면), `lib/api.ts`(가짜 데이터), `e2e/`(Playwright), `playwright.config.ts`, `lighthouserc.cjs`

두 프로젝트는 서로 호출하지 않으므로 각각 따로 띄웁니다.

## 실행

API는 `4000`, 화면은 `3000` 포트를 사용합니다.

```sh
cd order-api-fastify
npm ci
npm run dev
```

```sh
cd order-console-next
npm ci
npm run dev
```

## 테스트

```sh
cd order-api-fastify
npm test
npm run typecheck
```

```sh
cd order-console-next
npx playwright install chromium
npx playwright test
```

Playwright는 `playwright.config.ts`의 `webServer` 설정으로 `npm run dev`를 스스로 띄우고, 3000번에 이미 서버가 떠 있으면 그것을 씁니다.

성능 측정은 프로덕션 빌드를 띄운 뒤 실행합니다(Chrome 필요).

```sh
npm run build && npm run start
npx lhci autorun # 결과는 .lighthouseci/에
kill %1
```