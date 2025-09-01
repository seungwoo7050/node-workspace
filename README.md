# foundation/04: 프론트엔드와 백엔드 연결 및 로그인 구현

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-NestJS%20%7C%20Passport%20JWT%20%7C%20Next.js-lightgrey)

NestJS 주문 API에 JWT 로그인을 붙여 주문 생성을 막고, Next.js 화면에서 서버 액션으로 그 API를 호출해 프론트와 백엔드를 하나로 잇습니다.

## 지원 범위

`order-api-nest` (API, 인메모리 저장)

- NestJS의 주문 API: `GET /orders`(`?paid=true|false`), `GET /orders/totals`, `GET /orders/:id`, `POST /orders`, 그리고 `GET /`(`Hello World!`)
- `POST /auth/login`: `{"id":"kim","password":"1234"}`이면 200과 `accessToken`(만료 1시간), 틀리면 401
- `POST /orders`는 `Authorization: Bearer <토큰>`이 있어야 201, 없거나 유효하지 않으면 401 (Passport `jwt` 전략)
- CORS는 `FRONTEND_URL`(기본 `http://localhost:3000`)만 허용
- 설정은 `.env`에서 읽고, `JWT_SECRET`이 없으면 서버가 뜨지 않음

`order-console-next` (웹)

- Next.js의 `/orders` 목록과 `/orders/[id]` 상세(가짜 데이터, 로딩·없는 주문 화면, 검토 버튼)
- `/orders`의 "테스트 주문 만들기" 버튼: 서버 액션이 `kim`으로 로그인한 뒤 토큰을 붙여 `POST /orders`를 호출하고, 결과(`생성됨: #203 choi` 등)를 표시

## 구성

- `order-api-nest/`: NestJS API. `src/auth/`(로그인·JWT 전략), `src/orders/`, `.env`(학습용 데모 값, 커밋됨)
- `order-console-next/`: Next.js 앱. `app/orders/actions.ts`(서버 액션), `app/orders/create-test-order-button.tsx`, `.env.local`

## 실행

API는 `4000`, 웹은 `3000`에서 뜹니다. 터미널 두 개를 씁니다.

```sh
# 터미널 1: API (.env의 PORT=4000, JWT_SECRET, DEMO_PASSWORD를 읽음)
cd order-api-nest
npm ci
npm run start:dev
```

```sh
# 터미널 2: 웹 (API_URL과 DEMO_PASSWORD를 .env.local에서 읽음)
cd order-console-next
npm ci
npm run dev
```

브라우저에서 http://localhost:3000/orders 를 열고 "테스트 주문 만들기"를 누릅니다. 데모 계정은 `kim` / `1234`입니다.

curl로 확인:

```sh
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -d '{"user":"choi","price":9000,"paid":true}'
{"message":"Unauthorized","statusCode":401}
curl -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"id":"kim","password":"1234"}'
{"accessToken":"eyJ..."}
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -H 'Authorization: Bearer eyJ...' -d '{"user":"choi","price":9000,"paid":true}'
{"id":203,"user":"choi","price":9000,"paid":true}
```

## 테스트

```sh
cd order-api-nest
npm test            # 단위 테스트(Vitest)
npm run test:e2e    # e2e 테스트. AppModule 전체를 띄우므로 .env를 읽음
npm run lint        # oxlint --type-aware

cd ../order-console-next
npm run lint        # eslint
```

테스트는 스캐폴드가 만든 기본 테스트로, `GET /`가 `Hello World!`를 돌려주는지만 확인합니다. 로그인과 주문 API는 curl과 브라우저로 확인합니다.