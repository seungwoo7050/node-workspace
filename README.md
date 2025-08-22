# foundation/02f: React

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-React%20%7C%20Vite-lightgrey)

주문 목록을 보여 주고, 하나를 고르면 비동기로 상세를 불러와 보여 주는 브라우저 화면(`order-console`)을 React로 만듭니다. 서버 없이 화면 안의 가짜 API만 씁니다.

## 지원 범위

- 주문 4건 목록 표시(주문 번호, 사용자, 금액, 결제 여부)
- 주문을 고르면 가짜 API `fetchOrder(id)`로 상세를 불러와 카드로 표시
  - 응답 지연이 주문마다 다름(101은 1.2초, 102는 0.2초 등). 빠르게 바꿔 눌러도 마지막에 고른 주문만 표시(이전 요청 응답은 무시)
  - 취소된 104번은 "이 주문은 취소되어 상세 정보가 없습니다"를 표시
- "검토 완료로 표시" 버튼과 하단 검토 완료 요약
- "최신순/오래된순" 토글로 목록 순서 뒤집기(`useToggle` 커스텀 훅)

## 구성

- `order-console/`: Vite + React 앱
  - `src/api.ts`(주문 데이터와 가짜 API), `src/App.tsx`, `src/OrderList.tsx`, `src/OrderDetail.tsx`, `src/useToggle.ts`

## 실행

```sh
cd order-console
npm ci
npm run dev
```

브라우저에서 `http://localhost:[portnumber]`을 엽니다.

빌드 결과 확인:

```sh
npm run build     # tsc -b 타입 검사 후 dist/에 빌드
npm run preview   # 빌드 결과를 로컬에서 띄움
```

## 테스트

테스트 코드는 없습니다. 린트와 빌드 시 타입 검사만 합니다.

```sh
npm run lint    # oxlint
npm run build   # tsc -b 포함
```