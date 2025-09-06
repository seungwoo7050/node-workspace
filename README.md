# appendix/01: Fastify와 WebSocket

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Fastify%20%7C%20zod%20%7C%20WebSocket-lightgrey)

주문 API를 Fastify로 새로 만들고(`order-api-fastify`) 주문이 생성되면 연결된 모든 클라이언트에 WebSocket으로 방송합니다.

## 지원 범위

- 주문 API (메모리 배열 저장, 인증 없음)
  - `GET /orders`, `GET /orders?paid=true|false`, `GET /orders/totals`, `GET /orders/:id`
  - `POST /orders` (zod 스키마로 본문 검증, 성공 시 201)
- `GET /health` → `{ "ok": true }`
- 공통 에러 처리: 없는 주문 404, 검증 실패 400, 그 밖의 예상치 못한 에러 500
- WebSocket 엔드포인트 `/ws` (API와 같은 포트 `4000`)
  - 주문 생성 시 연결된 모든 클라이언트에 `{"event":"order.created","data":{...}}`를 보냄

## 구성

- `order-api-fastify/`: Fastify API. `src/main.ts`(서버·에러 처리·`/ws`), `src/orders.plugin.ts`(주문 라우트 플러그인), `src/realtime.ts`(연결 목록과 방송), `scratch-client.mjs`(받은 메시지를 출력하는 확인용 클라이언트)

## 실행

API는 `4000`에서 뜹니다(`PORT` 환경 변수로 바꿀 수 있음). DB나 compose는 필요 없습니다.

```sh
cd order-api-fastify
npm ci
npm run dev
```

다른 터미널에서 클라이언트를 연결해 둡니다.

```sh
node scratch-client.mjs # "연결됨" 출력 후 대기
```

또 다른 터미널에서 주문을 만들면 클라이언트 터미널에 `받음: {"event":"order.created",...}`이 찍힙니다.

```sh
curl -X POST localhost:4000/orders -H "Content-Type: application/json" \
  -d '{"user":"choi","price":9000,"paid":true}'
```

## 테스트

이 단계에는 자동 테스트가 없습니다. 타입 검사만 합니다.

```sh
npm run typecheck
```

동작은 위의 `scratch-client.mjs`와 `curl`로 직접 확인합니다. 테스트 도구는 다음 단계에서 붙입니다.