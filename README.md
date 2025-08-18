# foundation/02b-express: Express 주문 API

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Express%205%20%7C%20zod%20%7C%20tsx-lightgrey)

주문을 조회·생성·집계하는 REST API(`order-api`)를 Express 5로 만든다. 주문은 메모리 배열에 있어서 서버를 다시 켜면 처음 데이터 5건으로 돌아간다.

## 요구 환경

- Node.js와 npm. package.json에 engines 지정은 없다.
- 확인용으로 `curl`을 쓴다.

## 시작 상태

빈 `README.md`만 있는 첫 커밋(`9ca794e`)에서 시작한다. 다음 커밋(`13a7641`)에서 `npm init`으로 `order-api/`를 만들고 의존성과 `tsconfig.json`을 둔다.

## 지원 범위

**order-api/**

- `GET /health`: `{"ok":true}`를 돌려준다.
- `GET /orders`: 주문 목록을 돌려준다. `?paid=true` 또는 `?paid=false`로 결제 여부를 거른다. 그 밖의 값이면 400이다.
- `GET /orders/totals`: 결제 완료 주문의 금액을 사용자별로 합해 돌려준다.
- `GET /orders/:id`: 주문 하나를 돌려준다. `id`가 정수가 아니면 400, 해당 주문이 없으면 404다.
- `POST /orders`: `user`(빈 문자열 불가), `price`(양수), `paid`(불리언)를 zod로 검증한다. 실패하면 400, 성공하면 201과 새 주문을 돌려준다. 새 `id`는 203부터 1씩 늘어난다.
- 요청마다 메서드·경로·상태 코드·소요 시간을 콘솔에 찍는다.
- 매칭되는 라우트가 없으면 404 `{"error":"Not Found"}`로 응답한다.
- 에러는 마지막 에러 핸들러 한 곳에서 `{"error": ...}` JSON으로 응답한다. 상태 코드는 에러의 `status` 값을 쓰고, 없으면 500이다. 500 이상이면 메시지 대신 `Internal Server Error`를 보내고 에러를 콘솔에 찍는다.

## 구성

- `order-api/`: Express 서버. 주요 파일 `src/main.ts`(앱 조립, 로깅 미들웨어, 404, 에러 핸들러), `src/orders.router.ts`(`/orders` 라우트와 쿼리 검증), `src/orders.store.ts`(인메모리 저장소, `OrderSchema`·`CreateOrderSchema`), `src/http.ts`(`HttpError`, zod 검증 도우미 `parseOrThrow`)

## 실행

API 포트는 `3000`이다. `PORT` 환경 변수로 바꿀 수 있다.

```sh
# 터미널 1: 저장소 루트에서
cd order-api
npm ci
npm run dev   # tsx watch로 src/main.ts 실행
```

```sh
# 터미널 2: 확인 요청
curl localhost:3000/orders/totals
curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'
```

첫 요청은 `kim`, `lee`, `park`의 결제 합계를 돌려준다. 두 번째 요청은 201과 `id`가 203인 주문을 돌려준다.

빌드해서 실행할 수도 있다.

```sh
# order-api/에서
npm run build   # tsc로 dist/에 컴파일
npm start       # node dist/main.js 실행
```

## 테스트

자동 테스트는 없다. 타입 검사 스크립트만 있고, 동작은 위 `curl` 요청으로 확인한다.

```sh
# order-api/에서
npm run typecheck   # tsc --noEmit
```
