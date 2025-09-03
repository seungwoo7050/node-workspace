# foundation/05: NestJS WebSocket 게이트웨이

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-NestJS%20%7C%20socket.io%20%7C%20JWT-lightgrey)

로그인(JWT)까지 붙은 주문 API(`order-api-nest`)에 NestJS 게이트웨이와 socket.io를 더하여 주문이 생성되면 그 주문을 만든 사용자에게만 실시간 알림을 보냅니다.

## 지원 범위

- 데모 로그인 `POST /auth/login` (`id: kim`, 비밀번호는 `.env`의 `DEMO_PASSWORD`) → JWT 발급
- 주문 API (메모리 배열 저장, 서버를 끄면 초기 데이터로 돌아감)
  - `GET /orders`, `GET /orders?paid=true|false`, `GET /orders/totals`, `GET /orders/:id`
  - `POST /orders` (JWT 필요, 본문은 `class-validator`로 검증)
- socket.io 게이트웨이 (API와 같은 포트 `4000`)
  - 연결 시 `handshake.auth.token`의 JWT를 검증하고, 없거나 틀리면 바로 끊음
  - 검증된 소켓을 `user:<id>` room에 넣음
  - 주문 생성 시 주문을 만든 사용자의 room에만 `order.created` 이벤트를 보냄

## 구성

- `order-api-nest/`: NestJS API. 
  - `src/auth`(로그인·JWT 전략)
  - `src/orders`(주문)
  - `src/notifications`(게이트웨이)
  - `scratch-client.mjs`(로그인 후 알림을 받아 출력하는 확인용 클라이언트)

## 실행 및 테스트

API는 `4000`에서 뜹니다(`.env`의 `PORT`). DB나 compose는 필요 없습니다.

```sh
cd order-api-nest
npm ci
npm run start:dev
```

다른 터미널에서 알림을 받을 클라이언트를 띄웁니다. `kim`/`1234`로 로그인한 뒤 연결합니다.

```sh
node scratch-client.mjs # "연결됨" 출력 후 대기
```

또 다른 터미널에서 같은 계정으로 주문을 만들면 클라이언트 터미널에 `알림: { ... }`이 찍힙니다.

```sh
TOKEN=$(curl -s -X POST localhost:4000/auth/login -H "Content-Type: application/json" \
  -d '{"id":"kim","password":"1234"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -X POST localhost:4000/orders -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"user":"choi","price":9000,"paid":true}'
```