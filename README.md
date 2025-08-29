# foundation/03b-nestjs: NestJS 주문 API와 미니 DI

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-NestJS%2012%20%7C%20class--validator%20%7C%20reflect--metadata%20%7C%20Vitest-lightgrey)

주문 관리 API를 NestJS의 모듈·컨트롤러·서비스 구조로 만든다(`order-api-nest/`). `reflect-metadata`로 생성자 의존성을 주입하는 작은 DI 컨테이너도 직접 만든다(`decorator-practice/`).

## 요구 환경

- Node.js와 npm. package.json에 engines 지정은 없다.

## 시작 상태

빈 `README.md` 하나만 있는 커밋(`21c0f73`)에서 시작한다. 다음 커밋(`f75e5e2`)에서 `npx @nestjs/cli new order-api-nest`로 뼈대를 만든다.

## 지원 범위

**order-api-nest/**

- 주문은 메모리에만 저장한다. 서버를 다시 켜면 초기 주문 5건(id `101`~`202`)으로 돌아간다.
- `GET /`: `Hello World!`를 돌려준다(스캐폴드 기본 라우트).
- `GET /orders`: 주문 목록. `?paid=true`면 결제한 주문만, `paid`에 다른 값이 오면 결제하지 않은 주문만 돌려준다.
- `GET /orders/totals`: 결제한 주문의 사용자별 금액 합계.
- `GET /orders/:id`: 주문 하나. `id`가 정수가 아니면 400(`ParseIntPipe`), 없으면 404(`NotFoundException`).
- `POST /orders`: 주문 생성. 본문은 `user`(빈 문자열 불가), `price`(양수), `paid`(불리언)다. 성공하면 201과 새 주문을 돌려준다. 새 id는 `203`부터 매긴다.
- 본문 검증은 `CreateOrderDto`와 전역 `ValidationPipe({ whitelist: true })`가 맡는다. 검증에 실패하면 400이다. DTO에 없는 필드는 지운다.
- 주문 생성 시 `Logger`로 로그를 남긴다.

**decorator-practice/**

- `design:paramtypes` 메타데이터로 생성자 매개변수 타입을 읽어 의존 클래스를 재귀로 만드는 `resolve` 함수.
- 만든 인스턴스는 `Map`에 캐시해 클래스마다 하나만 둔다.
- `@Get` 데코레이터는 `route` 메타데이터를 기록만 하고, `resolve`는 이를 쓰지 않는다.

## 구성

- `order-api-nest/`: NestJS API. 주요 파일 `src/main.ts`(부트스트랩, 전역 `ValidationPipe`), `src/app.module.ts`(루트 모듈), `src/orders/orders.module.ts`(주문 모듈), `src/orders/orders.controller.ts`(라우트), `src/orders/orders.service.ts`(인메모리 저장과 로직), `src/orders/dto/create-order.dto.ts`(생성 DTO), `test/app.e2e-spec.ts`(e2e 테스트)
- `decorator-practice/`: 미니 DI 예제. 주요 파일 `src/mini-di.ts`(데코레이터와 `resolve`), `tsconfig.json`(`experimentalDecorators`, `emitDecoratorMetadata` 켬)

## 실행

API 포트는 `3000`이다. `PORT` 환경 변수로 바꿀 수 있다.

```sh
# 터미널 1: API 서버
cd order-api-nest
npm ci
npm run start:dev
```

```sh
# 터미널 2: 확인 요청
curl localhost:3000/orders/totals
curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'
```

첫 요청은 `kim` 17000, `lee` 30000, `park` 7000의 합계를 돌려준다. 두 번째 요청은 서버를 켠 뒤 처음이면 id `203`인 주문을 만든다.

```sh
# 저장소 루트에서
cd decorator-practice
npm ci
npm run build   # tsc로 dist/에 컴파일
npm start       # dist/mini-di.js 실행
```

실행하면 `Controller`가 주입받은 `Repo`의 결과 `['a', 'b']`를 콘솔에 찍는다.

## 테스트

`order-api-nest/`에는 스캐폴드 기본 테스트만 있다. 주문 라우트를 다루는 테스트는 없다.

```sh
# 저장소 루트에서
cd order-api-nest
npm test           # Vitest 단위 테스트(AppController가 Hello World!를 돌려주는지)
npm run test:e2e   # Vitest + supertest e2e(GET / 이 200과 Hello World!인지)
npm run lint       # oxlint로 src/, test/ 검사
```

`decorator-practice/`에는 자동 테스트가 없다. `npm start` 출력으로 확인한다.
