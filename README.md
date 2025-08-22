# foundation/02f-react: React 주문 화면

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-React%20%7C%20Vite%20%7C%20oxlint-lightgrey)

주문 목록을 보여 주고, 고른 주문의 상세를 비동기로 불러오는 브라우저 화면(`order-console`)을 React로 만든다. 서버 없이 앱 안의 가짜 API만 쓴다.

## 요구 환경

- Node.js와 npm. package.json에 engines 지정은 없다.
- 화면을 열 브라우저.

## 시작 상태

빈 `README.md`만 있는 첫 커밋(`e51c649`)에서 시작한다. 이어서 Vite `react-ts` 템플릿으로 `order-console/`을 만든 커밋(`65344b3`) 위에 기능을 쌓는다.

## 지원 범위

**order-console/**

- 주문 4건(101~104) 목록을 표시한다. 각 줄은 주문 번호, 사용자, 금액, 결제 여부를 담은 버튼과 확인용 체크박스다.
- 체크박스는 상태를 저장하지 않는 비제어 입력이다.
- 주문 버튼을 누르면 `fetchOrder(id)`로 상세를 불러와 주문 번호, 사용자, 금액, 결제 여부를 표시한다.
- 응답 지연은 주문마다 다르다. 101은 1200ms, 102는 200ms, 103은 600ms, 그 밖은 300ms다.
- 응답이 오기 전에는 "불러오는 중..."을 표시한다.
- 빠르게 다른 주문을 눌러도 마지막에 고른 주문의 응답만 표시한다. 이전 요청의 응답은 `useEffect` 정리 함수의 `cancelled` 플래그로 무시한다.
- 104번은 목록에는 있지만 조회 대상에서 빠져 있어 "이 주문은 취소되어 상세 정보가 없습니다."를 표시한다.
- 주문을 고르면 "검토 완료로 표시" 버튼이 나온다. 누른 주문 번호는 중복 없이 하단 "검토 완료:" 줄에 쌓인다.
- "최신순/오래된순" 버튼은 커스텀 훅 `useToggle`로 목록 순서를 뒤집는다.

## 구성

- `order-console/`: Vite + React 앱. 주요 파일 `src/api.ts`(주문 데이터 `ORDERS`와 지연이 있는 가짜 API `fetchOrder`), `src/App.tsx`(선택·검토·정렬 상태와 화면 조립), `src/OrderList.tsx`(목록), `src/OrderDetail.tsx`(상세 비동기 조회), `src/useToggle.ts`(불리언 토글 훅), `src/main.tsx`(`StrictMode`로 렌더).

## 실행

`vite.config.ts`에 포트 지정이 없어 Vite 기본 포트(개발 서버 5173, preview 4173)를 쓴다.

```sh
# 저장소 루트에서
cd order-console
npm ci
npm run dev
```

브라우저에서 `http://localhost:5173`을 열면 "주문 관리" 제목과 주문 목록이 나온다.

빌드 결과를 확인하려면 다음을 실행한다.

```sh
# order-console/에서
npm run build     # tsc -b 타입 검사 뒤 vite build로 dist/에 빌드
npm run preview   # dist/를 로컬 서버로 띄움
```

## 테스트

자동 테스트는 없다. 린트와 빌드 단계의 타입 검사만 있고, 동작은 브라우저에서 직접 눌러 확인한다.

```sh
# order-console/에서
npm run lint    # oxlint(.oxlintrc.json: rules-of-hooks 등)
npm run build   # tsc -b 타입 검사 포함
```
