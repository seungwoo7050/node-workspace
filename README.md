# appendix/01-fastify-ws: Fastify 주문 API와 WebSocket 방송

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Fastify%20%7C%20zod%20%7C%20%40fastify%2Fwebsocket-lightgrey)

주문 관리 API를 Fastify로 만든다. 주문이 생성되면 WebSocket으로 연결된 모든 클라이언트에 그 주문을 방송한다.

## 요구 환경

- Node.js와 npm. package.json에 engines 지정은 없다.
- DB나 Docker는 필요 없다. 주문은 메모리 배열에 저장한다.

## 시작 상태

빈 `README.md`만 있는 첫 커밋(`596583b`)에서 시작한다. 다음 커밋(`59e3195`)에서 `order-api-fastify/`의 package.json과 tsconfig.json을 만든다.

## 지원 범위

**order-api-fastify/**

- 주문 데이터는 메모리 배열이고 시드 주문 5건으로 시작한다. 인증은 없다.
- `GET /health`: `{ "ok": true }`를 돌려준다.
- `GET /orders`: 전체 주문. `?paid=true` 또는 `?paid=false`로 결제 여부를 거른다. 그 밖의 값은 400이다.
- `GET /orders/totals`: 결제된 주문의 금액을 사용자별로 합산한다.
- `GET /orders/:id`: 주문 하나. 없는 주문은 404, 정수가 아닌 id는 400이다.
- `POST /orders`: 본문 `{ user, price, paid }`를 zod 스키마로 검증한다(`user` 빈 문자열 불가, `price` 양수, `paid` boolean). 성공하면 201과 생성된 주문을 돌려준다. 검증에 실패하면 400이다.
- 에러 응답 본문은 `{ "error": "<메시지>" }`다. `HttpError`는 그 상태 코드, 검증 실패는 400, Fastify가 낸 그 밖의 4xx는 그 코드 그대로, 나머지는 500(`Internal Server Error`)이다.
- WebSocket `/ws`: API와 같은 포트에서 연결을 받는다. 주문이 생성될 때마다 연결된 모든 클라이언트에 `{"event":"order.created","data":<주문>}`을 보낸다. 클라이언트가 보낸 메시지는 처리하지 않는다.

## 구성

- `order-api-fastify/`: Fastify API. 주요 파일 `src/main.ts`(서버 생성, zod 검증기 연결, 에러 처리, `/ws`·`/health` 등록), `src/orders.plugin.ts`(`/orders` 라우트 플러그인과 스키마), `src/realtime.ts`(연결된 소켓 목록과 방송), `src/http.ts`(상태 코드를 담는 `HttpError`), `scratch-client.mjs`(`/ws`에 붙어 받은 메시지를 출력하는 확인용 클라이언트)

## 실행

API와 WebSocket은 `4000` 포트에서 뜬다. `PORT` 환경 변수로 바꿀 수 있다.

```sh
# 터미널 1: 저장소 루트에서
cd order-api-fastify
npm ci
npm run dev        # tsx watch로 src/main.ts 실행
```

빌드해서 실행하려면 `npm run build`로 `dist/`를 만든 뒤 `npm run start`를 쓴다.

```sh
# 터미널 2: order-api-fastify/에서
node scratch-client.mjs
```

연결되면 `연결됨`을 출력하고 대기한다.

```sh
# 터미널 3: 아무 위치에서
curl -X POST localhost:4000/orders -H "Content-Type: application/json" \
  -d '{"user":"choi","price":9000,"paid":true}'
```

주문이 생성되면 터미널 2에 `받음:` 뒤로 `order.created` 메시지가 찍힌다.

## 테스트

자동 테스트는 없다. 타입 검사만 스크립트로 있다.

```sh
# order-api-fastify/에서
npm run typecheck  # tsc --noEmit으로 타입 검사
```

동작은 위의 `scratch-client.mjs`와 `curl`로 직접 확인한다.
