# foundation/00-javascript: 비동기 주문 집계 스크립트

![Language](https://img.shields.io/badge/language-JavaScript-yellow?logo=javascript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-ES%20Modules%20%7C%20no%20dependencies-lightgrey)

가짜 비동기 API에서 주문을 여러 페이지 받아 사용자별 결제 합계와 1위를 출력하는 Node 스크립트(`order-report`)를 만든다.
외부 패키지 없이 JavaScript와 Node 전역 기능만 쓴다.

## 요구 환경

- Node.js. package.json에 engines 지정은 없다.
- 설치할 의존성이 없어서 npm 설치 단계는 필요 없다.

## 시작 상태

빈 `README.md`만 있는 `initial commit`(`b1b40cc`)에서 시작한다.
다음 커밋(`6722c32`)에서 `order-report/package.json`과 `.gitignore`를 추가한다.

## 지원 범위

**order-report/**

- `fetchOrders(page)`: 500ms 지연 뒤 1·2페이지의 주문 배열을 돌려준다. 그 밖의 페이지는 `page <번호> not found` 에러로 거부된다.
- `totalByUser(orders)`: `paid: true`인 주문만 골라 사용자별 `price` 합계 객체를 만든다.
- `topUser(totals)`: 합계가 가장 큰 사용자를 `{ name, total }`로 돌려준다. 빈 객체면 `null`을 돌려준다.
- `main()`: `Promise.allSettled`로 1~3페이지를 동시에 조회하고 소요 시간을 `console.time`으로 출력한다.
- 실패한 페이지는 `console.warn`으로 경고만 남기고, 성공한 페이지의 주문으로 집계를 계속한다.
- `main()` 밖으로 에러가 나오면 `치명적 오류:`를 출력하고 종료 코드 1로 끝난다.

## 구성

- `order-report/`: Node 스크립트. 주요 파일 `package.json`(`"type": "module"`로 ES 모듈 사용, 의존성 없음), `api.js`(가짜 비동기 API와 페이지별 주문 데이터), `report.js`(순수 집계 함수 `totalByUser`, `topUser`), `main.js`(조회, 집계, 출력 조립)

## 실행

서버가 아니라서 포트는 없다.

```sh
# 저장소 루트에서
cd order-report
node main.js
```

3페이지 조회 실패 경고가 한 줄 나온다.
사용자별 합계는 `kim` 17000, `lee` 30000, `park` 7000이고, 1위는 `lee`(30000)다.
세 호출이 동시에 진행되므로 소요 시간은 지연 한 번(500ms) 수준이다.

## 테스트

자동 테스트는 없다.
`package.json`의 `test` 스크립트는 `echo "Error: no test specified" && exit 1` 자리표시라서 종료 코드 1로 끝난다.
확인은 위의 `node main.js` 출력으로 한다.
