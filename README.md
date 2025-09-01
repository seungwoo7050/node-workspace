# foundation/04-integration-and-auth: 프론트엔드와 백엔드 연결, JWT 로그인

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-NestJS%20%7C%20Passport%20JWT%20%7C%20Next.js-lightgrey)

NestJS 주문 API에 JWT 로그인을 붙여 주문 생성을 로그인한 사용자로 제한한다. Next.js 화면은 서버 액션으로 로그인한 뒤 그 API에 주문을 만든다.

## 요구 환경

- Node.js와 npm. package.json에 engines 지정은 없다.
- 화면 확인용 브라우저.

## 시작 상태

`foundation/03b-nestjs`의 `order-api-nest/`와 `foundation/03f-nextjs`의 `order-console-next/`를 그대로 가져온 커밋(`c781128`)에서 시작한다.

## 지원 범위

**order-api-nest/**

- 주문은 메모리에만 저장한다. 서버를 다시 띄우면 시드 5건으로 돌아간다.
- `GET /`는 `Hello World!`를 돌려준다.
- `GET /orders`는 전체 목록을, `?paid=true|false`를 주면 결제 여부로 거른 목록을 돌려준다.
- `GET /orders/totals`는 결제된 주문의 사용자별 합계를 돌려준다.
- `GET /orders/:id`는 주문 하나를 돌려준다. 정수가 아니면 400, 없으면 404다.
- `POST /auth/login`은 `id`가 `kim`이고 `password`가 `DEMO_PASSWORD`와 같으면 200과 `accessToken`(만료 1시간)을 돌려준다. 틀리면 401, 필드가 비면 400이다.
- `POST /orders`는 `Authorization: Bearer <토큰>`을 Passport `jwt` 전략으로 검증한다. 토큰이 없거나 유효하지 않으면 401, 통과하면 201과 새 주문(`id` 203부터)을 돌려준다.
- 요청 본문은 `ValidationPipe({ whitelist: true })`로 검사한다.
- CORS는 `FRONTEND_URL`에 적힌 출처를 허용한다.
- `JWT_SECRET`이 없으면 `JwtStrategy` 생성자가 에러를 던져 서버가 뜨지 않는다.

**order-console-next/**

- `/orders`는 `lib/api.ts`의 가짜 데이터로 목록을 그린다. API를 호출하지 않는다.
- `/orders/[id]`는 지연을 둔 가짜 조회로 상세를 그린다. 로딩 화면, 없는 주문(104 등) 화면, 검토 토글 버튼이 있다.
- `/orders`의 "테스트 주문 만들기" 버튼은 서버 액션 `createTestOrder`를 부른다. 서버 액션은 `kim`으로 로그인하고 토큰을 붙여 `POST /orders`로 `choi` 9000원 주문을 만든다. 결과는 `생성됨: #<id> <user>` 또는 에러 메시지로 표시한다.

## 구성

- `order-api-nest/`: NestJS API. 주요 파일 `src/main.ts`(검증 파이프, CORS, 포트), `src/auth/auth.controller.ts`(로그인), `src/auth/jwt.strategy.ts`(토큰 검증), `src/orders/orders.controller.ts`(주문 라우트, 생성에 가드), `.env`(`JWT_SECRET`, `DEMO_PASSWORD`, `FRONTEND_URL`, `PORT`).
- `order-console-next/`: Next.js 앱. 주요 파일 `app/orders/actions.ts`(서버 액션), `app/orders/create-test-order-button.tsx`(버튼과 결과 표시), `lib/api.ts`(가짜 데이터).
- `order-api-nest/.env`에는 학습용 데모 값이 커밋되어 있다(`JWT_SECRET=<JWT 비밀값>`, `DEMO_PASSWORD=1234`, `FRONTEND_URL=http://localhost:3000`, `PORT=4000`).
- `order-console-next/.env.local`은 `.gitignore`의 `.env*`에 걸려 저장소에 없다. 서버 액션이 `API_URL`(없으면 `http://localhost:4000`)과 `DEMO_PASSWORD`를 여기서 읽으므로 직접 만든다.

## 실행

API는 `.env`의 `PORT`대로 `4000`, 웹은 `next dev` 기본값인 `3000`에서 뜬다. 터미널 두 개를 쓴다.

```sh
# 터미널 1: 저장소 루트에서 API 실행
cd order-api-nest
npm ci
npm run start:dev
```

```sh
# 터미널 2: 저장소 루트에서 웹 실행
cd order-console-next
printf 'DEMO_PASSWORD=1234\n' > .env.local
npm ci
npm run dev
```

브라우저에서 `http://localhost:3000/orders`를 열고 "테스트 주문 만들기"를 누른다. API를 띄운 뒤 처음 누르면 `생성됨: #203 choi`가 표시된다.

```sh
# 다른 터미널에서 API 직접 확인
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -d '{"user":"choi","price":9000,"paid":true}'
curl -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"id":"kim","password":"1234"}'
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -H 'Authorization: Bearer <accessToken>' -d '{"user":"choi","price":9000,"paid":true}'
```

첫 요청은 토큰이 없어 401이다. 둘째 요청은 200과 `accessToken`을 돌려준다. 셋째 요청에 그 토큰을 넣으면 201과 새 주문이 돌아온다.

## 테스트

```sh
# 저장소 루트에서
cd order-api-nest
npm test            # Vitest 단위 테스트(src/**/*.spec.ts)
npm run test:e2e    # Vitest e2e 테스트. vitest.config.e2e.ts가 process.loadEnvFile()로 .env를 읽는다
npm run lint        # oxlint src/ test/

cd ../order-console-next
npm run lint        # eslint
```

두 테스트는 스캐폴드가 만든 기본 테스트로, `GET /`가 `Hello World!`를 돌려주는지만 확인한다. 로그인과 주문 API는 위의 curl과 브라우저로 확인한다.
