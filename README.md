# foundation/00-JavaScript

![Language](https://img.shields.io/badge/language-JavaScript-yellow?logo=javascript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Node.js%20%7C%20ESM-lightgrey)

`foundation/00-javascript`는 node-workspace의 `foundation` 가지 00단계입니다. 가짜 비동기 API에서 주문을 여러 페이지 받아, 사용자별 결제 합계와 1위를 출력하는 작은 Node 스크립트(`order-report`)를 만듭니다.

## 지원 범위

- 가짜 비동기 API `fetchOrders(page)`: 0.5초 지연 뒤 1·2페이지 주문을 돌려주고, 3페이지는 일부러 실패
- `Promise.allSettled`로 세 페이지를 병렬 조회하고, 실패한 페이지는 경고만 출력한 뒤 나머지로 계속 진행
- 결제 완료(`paid: true`) 주문만 골라 사용자별 합계를 내는 `totalByUser`, 합계 1위를 고르는 `topUser`
- 외부 패키지 없이 Node 내장 기능과 ES 모듈(`"type": "module"`)만 사용

## 구성

- `order-report/`: Node 스크립트
  - `api.js`(가짜 비동기 API), `report.js`(순수 집계 함수), `main.js`(조립과 출력)

## 실행

설치할 의존성이 없습니다. Node만 있으면 됩니다.

```sh
cd order-report
node main.js
```

출력 예:

```sh
병렬 조회: 501ms 안팎
실패: page 3 not found
사용자별 합계: { kim: 17000, lee: 30000, park: 7000 }
1위: { name: 'lee', total: 30000 }
```
