# appendix/02-test-toolkit: 주문 API와 주문 화면의 자동 테스트

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Vitest%20%7C%20Playwright%20%7C%20axe--core%20%7C%20Lighthouse%20CI-lightgrey)

Fastify 주문 API에 Vitest 단위·API 테스트를 붙인다. Next.js 주문 화면에는 Playwright E2E·접근성 테스트와 Lighthouse CI 성능 측정을 붙인다.

## 요구 환경

- Node.js와 npm. 두 package.json 모두 engines 지정은 없다.
- Playwright용 Chromium(`npx playwright install chromium`으로 설치).
- Lighthouse CI 측정에는 Chrome이 필요하다.

## 시작 상태

`appendix/01-fastify-ws`의 `order-api-fastify/`와 `foundation/03f-nextjs`의 `order-console-next/`를 그대로 가져온 커밋(`6a37a24`)에서 시작한다.

## 지원 범위

**order-api-fastify/**

- `GET /health`: `{ ok: true }`를 반환한다.
- `GET /orders`: 주문 목록을 반환한다. `?paid=true|false`로 결제 여부를 거른다.
- `GET /orders/totals`: 결제 완료 주문만 사용자별로 합산한다.
- `GET /orders/:id`: 주문 하나를 반환한다. 없으면 404다.
- `POST /orders`: `user`·`price`·`paid`로 주문을 만들고 201을 반환한다. 스키마 검증에 실패하면 400이다.
- `/ws`: WebSocket 연결. 주문이 만들어지면 연결된 클라이언트에 `order.created` 이벤트를 보낸다.
- 데이터는 메모리 배열이다. `buildApp()`이 `listen` 없이 앱을 만들어 테스트가 `app.inject`로 요청을 보낸다.

**order-console-next/**

- `/orders`: 주문 목록 화면. 각 항목이 상세 화면으로 링크된다.
- `/orders/:id`: 주문 상세 화면. 불러오는 동안 `loading.tsx`를 보여 준다. 없는 주문(104번)은 `not-found.tsx`를 보여 준다. 검토 표시 버튼은 클라이언트 컴포넌트다.
- 데이터는 `lib/api.ts`의 고정 목록과 인위적 지연이다. API 서버를 호출하지 않는다.

## 구성

- `order-api-fastify/`: Fastify API. 주요 파일 `src/app.ts`(`buildApp`), `src/main.ts`(`listen`), `src/orders.plugin.ts`(라우트), `src/orders.store.ts`(저장소 함수, 테스트용 `__resetForTests`), `src/realtime.ts`(WebSocket 방송), `src/*.test.ts`(Vitest), `tsconfig.build.json`(빌드에서 테스트 파일 제외), `scratch-client.mjs`(WebSocket 확인용 클라이언트)
- `order-console-next/`: Next.js(App Router) 화면. 주요 파일 `app/orders/`(화면), `lib/api.ts`(가짜 데이터), `e2e/`(Playwright 테스트), `playwright.config.ts`, `lighthouserc.cjs`

## 실행

API는 `4000`(환경 변수 `PORT`로 변경), 화면은 `3000` 포트를 쓴다.

```sh
# 터미널 1: 저장소 루트에서
cd order-api-fastify
npm ci
npm run dev
```

```sh
# 터미널 2: 저장소 루트에서
cd order-console-next
npm ci
npm run dev
```

화면은 브라우저에서 `http://localhost:3000/orders`로 연다. WebSocket 방송은 `order-api-fastify/`에서 `node scratch-client.mjs`를 띄운 채 `POST /orders`를 보내면 `order.created` 이벤트로 확인한다.

## 테스트

```sh
# 저장소 루트에서
cd order-api-fastify
npm test           # Vitest: orders.store 단위 테스트, GET /orders/totals·POST /orders API 테스트
npm run typecheck  # tsc --noEmit
```

```sh
# 저장소 루트에서
cd order-console-next
npm run lint                     # ESLint
npx playwright install chromium  # 처음 한 번
npx playwright test              # e2e/: 목록에서 상세 이동, /orders 접근성 위반 검사
```

E2E용 npm 스크립트는 없다. `playwright.config.ts`의 `webServer`가 `npm run dev`를 띄우고, 3000번에 서버가 이미 있으면 그것을 쓴다. 접근성 테스트는 axe 위반이 하나도 없어야 통과한다.

Lighthouse CI는 프로덕션 빌드를 띄운 뒤 실행한다. `lighthouserc.cjs`는 `/orders`를 3회 측정하고 성능 점수가 0.8 미만이면 경고한다.

```sh
# 터미널 1: order-console-next/에서
npm run build
npm run start
```

```sh
# 터미널 2: order-console-next/에서
npx lhci autorun  # 결과는 .lighthouseci/에 남는다(git 제외)
```
