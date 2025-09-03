# foundation/05-ws-gateway: NestJS WebSocket 알림 게이트웨이

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-NestJS%20%7C%20socket.io%20%7C%20Passport%20JWT-lightgrey)

JWT 로그인이 붙은 주문 관리 API(`order-api-nest`)에 socket.io 게이트웨이를 더한다. 주문이 생성되면 그 주문을 만든 사용자의 소켓에만 `order.created` 이벤트를 보낸다.

## 요구 환경

- Node.js와 npm. package.json에 engines 지정은 없다.
- DB나 Docker는 필요 없다.

## 시작 상태

`foundation/04-integration-and-auth` 브랜치의 소스를 가져온 커밋(`2fa6569`)에서 시작한다. 이어서 socket.io 게이트웨이 패키지를 추가한다(`e56c5e0`).

## 지원 범위

**order-api-nest/**

- `POST /auth/login`: 본문 `{ id, password }`. `id`가 `kim`이고 `password`가 `.env`의 `DEMO_PASSWORD`와 같으면 200과 `{ accessToken }`을 돌려준다. 틀리면 401이다. 토큰 만료는 1시간이다.
- `GET /orders`: 주문 전체. `?paid=true`면 결제된 주문, 그 밖의 `paid` 값이면 미결제 주문만 돌려준다.
- `GET /orders/totals`: 결제된 주문의 사용자별 금액 합계.
- `GET /orders/:id`: 숫자가 아닌 `id`는 400, 없는 주문은 404다.
- `POST /orders`: `Authorization: Bearer <토큰>`이 필요하고 없거나 틀리면 401이다. 본문 `{ user, price, paid }`는 `class-validator`로 검증하고 실패하면 400이다. 성공하면 201이다.
- 주문은 메모리 배열에 저장한다. 서버를 다시 띄우면 초기 데이터 5건으로 돌아간다.
- socket.io 게이트웨이는 HTTP와 같은 포트를 쓴다. 연결할 때 `handshake.auth.token`의 JWT를 검증하고, 토큰이 없거나 검증에 실패하면 연결을 끊는다.
- 검증된 소켓은 `user:<sub>` room에 들어간다. 주문이 생성되면 요청한 토큰의 `sub` room에만 `order.created`로 주문 객체를 보낸다. 본문의 `user` 값은 알림 대상과 관계없다.

## 구성

- `order-api-nest/`: NestJS API. 주요 파일 `src/main.ts`(전역 `ValidationPipe`, CORS, 포트), `src/auth/`(로그인과 JWT 전략), `src/orders/`(주문 컨트롤러·서비스·DTO), `src/notifications/notifications.gateway.ts`(연결 시 토큰 검증, room 단위 전송), `scratch-client.mjs`(로그인 후 소켓을 연결해 이벤트를 출력하는 확인용 클라이언트)
- `order-api-nest/.env`: `JWT_SECRET`, `DEMO_PASSWORD`, `FRONTEND_URL`, `PORT`. 학습용 데모 값이 커밋되어 있다. `JWT_SECRET`이 없으면 서버가 시작할 때 에러를 던진다.

## 실행

API와 게이트웨이는 `.env`의 `PORT`인 `4000`에서 뜬다.

```sh
# 터미널 1: 저장소 루트에서
cd order-api-nest
npm ci
npm run start:dev
```

`scratch-client.mjs`는 `kim`/`1234`로 로그인한 뒤 소켓을 연결하고, 연결되면 `연결됨`, 이벤트를 받으면 `알림:`과 주문 객체를 출력한다.

```sh
# 터미널 2: order-api-nest/에서
node scratch-client.mjs
```

같은 계정으로 토큰을 받아 주문을 만들면 터미널 2에 알림이 출력된다.

```sh
# 터미널 3: 아무 위치에서
TOKEN=$(curl -s -X POST localhost:4000/auth/login -H "Content-Type: application/json" \
  -d '{"id":"kim","password":"1234"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -X POST localhost:4000/orders -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"user":"choi","price":9000,"paid":true}'
```

## 테스트

게이트웨이와 주문 API에 대한 자동 테스트는 없다. 있는 테스트는 기본 스캐폴드의 `GET /`(`Hello World!`) 확인뿐이다. 알림은 위 실행 절차로 확인한다.

```sh
# order-api-nest/에서
npm run lint      # oxlint로 src/, test/ 검사
npm test          # vitest 단위 테스트(AppController 스캐폴드)
npm run test:e2e  # vitest + supertest로 GET / 확인, .env를 읽는다
```
