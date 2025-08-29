# foundation/03b: NestJS

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-NestJS%2012%20%7C%20class--validator%20%7C%20Vitest-lightgrey)

Express 주문 API를 같은 동작 그대로 NestJS로 다시 만든 프로젝트(`order-api-nest`)와 데코레이터 메타데이터로 의존성을 주입하는 원리를 직접 구현해 보는 작은 예제(`decorator-practice`)입니다.

## 지원 범위

`order-api-nest` (인메모리 저장, 서버를 다시 켜면 처음 데이터로 돌아갑니다)

- `GET /`: `Hello World!` (스캐폴드 기본 라우트)
- `GET /orders`: 주문 목록. `?paid=true|false`로 결제 여부 필터
- `GET /orders/totals`: 결제 완료 주문의 사용자별 합계
- `GET /orders/:id`: 주문 하나. 정수가 아니면 400(`ParseIntPipe`), 없으면 404
- `POST /orders`: 주문 생성(`user`, `price`, `paid`). `CreateOrderDto`와 전역 `ValidationPipe`(`whitelist: true`)로 검증해 실패하면 400, 성공하면 201
- 컨트롤러·서비스·모듈 구조와 생성자 주입(`OrdersService`는 싱글턴)

`decorator-practice`

- `reflect-metadata`와 `design:paramtypes`만으로 생성자 의존성을 재귀로 풀어 인스턴스를 만드는 미니 DI 컨테이너

## 구성

- `order-api-nest/`: NestJS API. `src/orders/`(모듈·컨트롤러·서비스·DTO), `test/`(e2e)
- `decorator-practice/`: `src/mini-di.ts` 하나로 된 예제

## 실행

API 포트는 `3000`입니다(`PORT` 환경 변수로 바꿀 수 있습니다).

```sh
cd order-api-nest
npm ci
npm run start:dev
```

다른 터미널에서:

```sh
curl localhost:3000/orders/totals

# 출력 결과
{"kim":17000,"lee":30000,"park":7000}

curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'

# 출력 결과
{"id":203,"user":"choi","price":9000,"paid":true}
```

미니 DI 예제:

```sh
cd decorator-practice
npm ci
npm run build && npm start

# 출력 결과
npm notice run decorator-practice@1.0.0 build
npm notice run tsc -p .
npm notice run decorator-practice@1.0.0 start
npm notice run node dist/mini-di.js
[ 'a', 'b' ]
```