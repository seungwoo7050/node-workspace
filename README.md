# foundation/01-typescript: TypeScript와 zod로 옮긴 주문 리포트

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-zod%20%7C%20tsx-lightgrey)

주문 관리 도메인의 주문 리포트 스크립트를 TypeScript로 옮긴다.
가짜 API가 돌려준 주문을 zod 스키마로 검사하고, 통과한 주문만 집계한다.

## 요구 환경

- Node.js와 npm. package.json에 engines 지정은 없다.

## 시작 상태

`foundation/00-javascript`의 소스(`.gitignore`, `ts-order-report/src/`의 `.js` 파일 3개)를 그대로 가져온 커밋(`c1ec7d3`)에서 시작한다.
이 시점에는 package.json이 없고, 다음 커밋(`f3fd69d`)에서 TypeScript 실행 환경을 추가한다.

## 지원 범위

**ts-order-report/**

- 세 페이지(1, 2, 3)를 `Promise.allSettled`로 병렬 조회하고 걸린 시간을 `console.time`으로 출력한다.
- 실패한 페이지는 `실패:`와 오류 메시지를 경고로 출력한다. 3페이지는 데이터가 없어 항상 실패한다.
- `Order` 인터페이스와 함수 시그니처에 타입을 명시한다.
- API 응답은 `unknown[]`로 받고, `parseOrder`가 `OrderSchema`(zod)로 검사한다.
- 검사 결과는 `{ ok: true; order } | { ok: false; error }` 판별 유니온으로 돌려준다.
- 검사에 실패한 주문은 페이지, 주문 id, 실패 이유를 출력하고 건너뛴다. 가짜 데이터에는 `price`가 문자열인 주문(103)과 `paid`가 빠진 주문(202)이 들어 있다.
- 결제된(`paid: true`) 주문만 사용자별로 합계를 내고, 합계 1위 사용자를 출력한다.

## 구성

- `ts-order-report/`: 주문 리포트 스크립트. 주요 파일 `src/api.ts`(500ms 지연이 있는 가짜 비동기 API와 일부러 잘못된 데이터), `src/report.ts`(`Order` 타입, 집계 함수, zod 스키마와 검증), `src/main.ts`(조회, 검증, 출력 조립), `tsconfig.json`(`strict`, `NodeNext`, `src`를 `dist`로 컴파일)

## 실행

서버가 아닌 단발 스크립트라 포트를 쓰지 않는다.

```sh
# 저장소 루트에서
cd ts-order-report
npm ci
npx tsx src/main.ts          # tsx로 TypeScript를 바로 실행
```

그 밖의 스크립트는 다음과 같다.

```sh
# ts-order-report에서
npm run dev                  # tsx watch로 파일이 바뀔 때마다 다시 실행
npm run build && npm start   # tsc로 dist/에 컴파일한 뒤 node dist/main.js 실행
```

## 테스트

자동 테스트는 없다.
타입 검사 스크립트만 있다.

```sh
# ts-order-report에서
npm run typecheck            # tsc --noEmit으로 타입만 검사
```
