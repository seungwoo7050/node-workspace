# foundation/01-TypeScript

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-TypeScript%20%7C%20zod%20%7C%20tsx-lightgrey)

`foundation/01-typescript`는 node-workspace의 `foundation` 가지 01단계입니다.

00단계의 주문 리포트 스크립트를 TypeScript로 옮기고(`ts-order-report`), 모양이 어긋난 응답 데이터를 zod로 걸러낸 뒤 집계합니다.

## 지원 범위

- 00단계의 기능을 그대로 TypeScript로 옮김: 세 페이지 병렬 조회(`Promise.allSettled`), 실패 페이지 경고, 사용자별 결제 합계와 1위
- `Order` 인터페이스와 함수 시그니처에 타입 명시
- API 응답은 `unknown[]`로 받고, zod 스키마(`OrderSchema`)와 `parseOrder`로 검증
  - `price`가 문자열이거나 `paid`가 빠진 주문은 이유를 출력하고 건너뜀
  - 결과는 `{ ok: true, order } | { ok: false, error }` 판별 유니온으로 돌려줌

## 구성

- `ts-order-report/src/`: TypeScript 스크립트
  - `api.ts`(가짜 비동기 API, 일부러 잘못된 데이터 포함)
  - `report.ts`(타입, 집계, 검증)
  - `main.ts`(조립과 출력)

## 실행

```sh
cd ts-order-report

# package-lock.json에 고정된 버전 그대로 설치
npm ci
npx tsx src/main.ts
```

출력 예:

```sh
병렬 조회: 501ms 안팎
잘못된 데이터 건너뜀: page 1의 주문 103 - price: Invalid input: expected number, received string
잘못된 데이터 건너뜀: page 2의 주문 202 - paid: Invalid input: expected boolean, received undefined
실패: page 3 not found
사용자별 합계: { kim: 12000, lee: 30000 }
1위: { name: 'lee', total: 30000 }
```

그 밖의 스크립트:

```sh
npm run dev # tsx watch로 파일이 바뀔 때마다 다시 실행
npm run build && npm start # tsc로 dist/에 컴파일한 뒤 node로 실행
```

## 테스트

테스트 코드는 없습니다. 타입 검사만 합니다.

```sh
npm run typecheck   # tsc --noEmit
```