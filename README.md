# foundation/02b: Express

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Express%205%20%7C%20zod%20%7C%20tsx-lightgrey)

주문 데이터를 메모리에 두고 조회·생성·집계하는 REST API(`order-api`)를 Express 5로 만듭니다. DB가 없는 인메모리 구조라 서버를 다시 켜면 처음 데이터로 돌아갑니다.

## 지원 범위

- `GET /health`: `{"ok":true}`
- `GET /orders`: 주문 목록. `?paid=true|false`로 결제 여부 필터
- `GET /orders/totals`: 결제 완료 주문의 사용자별 합계
- `GET /orders/:id`: 주문 하나. 정수가 아니면 400, 없으면 404
- `POST /orders`: 주문 생성(`user`, `price`, `paid`). zod로 검증해 실패하면 400, 성공하면 201
- 요청마다 메서드·경로·상태 코드·소요 시간을 찍는 로깅 미들웨어
- 매칭되는 라우트가 없으면 404, 에러는 한 곳의 에러 핸들러에서 `{"error": ...}` JSON으로 응답(500은 메시지를 숨김)

## 구성

- `order-api/`: Express 서버
  - `src/main.ts`(앱 조립·미들웨어·에러 핸들러), `src/orders.router.ts`(라우트), `src/orders.store.ts`(인메모리 저장소·스키마), `src/http.ts`(`HttpError`, 검증 도우미)

## 실행

API 포트로 `3000`을 사용합니다(`PORT` 환경 변수로 바꿀 수 있습니다).

```sh
cd order-api
npm ci
npm run dev
```

다른 터미널에서:

```sh
curl localhost:3000/orders/totals
{"kim":17000,"lee":30000,"park":7000}
curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'
{"id":203,"user":"choi","price":9000,"paid":true}
```

빌드해서 실행:

```sh
npm run build && npm start # dist/main.js 실행
```

## 테스트

테스트 코드는 없습니다. 타입 검사만 합니다.

```sh
npm run typecheck # tsc --noEmit
```