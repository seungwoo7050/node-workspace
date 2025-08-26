# foundation/03f-nextjs: Next.js 주문 화면

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Next.js%2016%20%7C%20React%2019%20%7C%20Tailwind%20CSS-lightgrey)

주문 목록과 상세 화면을 Next.js App Router로 만든다. 상세 데이터는 서버 컴포넌트에서 직접 `await`하므로 `useEffect`와 로딩 state가 없다.

## 요구 환경

- Node.js와 npm. package.json에 engines 지정은 없다.
- 화면을 볼 브라우저. 별도 API 서버는 필요 없다.

## 시작 상태

빈 `README.md`만 있는 첫 커밋(`72aeba3`)에서 출발한다. 다음 커밋(`76835e5`)에서 `npx create-next-app@latest order-console-next --yes`로 App Router, TypeScript, Tailwind CSS, ESLint 뼈대를 만든다. `next.config.ts`의 `cacheComponents: true`와 `partialPrefetching: true`는 이 생성 커밋부터 들어 있고 이후 바뀌지 않았다.

## 지원 범위

**order-console-next/**

- `/orders`: `lib/api.ts`의 `ORDERS` 4건(101~104)을 `/orders/<id>` 링크 목록으로 보여 주는 서버 컴포넌트다.
- `/orders/[id]`: 서버 컴포넌트가 `params`를 `await`한 뒤 가짜 API `getOrder`를 `await`해 주문 번호, 사용자, 금액, 결제 여부를 보여 준다.
- `getOrder` 지연: 101은 1200ms, 102는 200ms, 103은 600ms, 그 밖의 id는 300ms다.
- 기다리는 동안 같은 폴더의 `loading.tsx`가 "불러오는 중 ..."을 보여 준다.
- 104번은 목록에는 있지만 가짜 DB에서 빠져 있어 `getOrder`가 `null`을 돌려준다. 이때와 없는 id일 때 `notFound()`가 호출되어 `not-found.tsx`의 "이 주문은 취소되어 상세 정보가 없습니다." 문구와 `/orders` 링크가 나온다.
- `ReviewButton`: 상태가 필요한 버튼만 `"use client"` 클라이언트 컴포넌트로 분리했다. 누를 때마다 "검토 완료로 표시"와 "검토 완료 취소"가 번갈아 바뀐다.
- `/`는 create-next-app이 만든 기본 페이지 그대로다.

## 구성

- `order-console-next/`: Next.js 앱. 주요 파일 `lib/api.ts`(주문 데이터와 가짜 API), `app/orders/page.tsx`(목록), `app/orders/[id]/page.tsx`(상세), `app/orders/[id]/loading.tsx`(로딩 화면), `app/orders/[id]/not-found.tsx`(없는 주문 화면), `app/orders/[id]/review-button.tsx`(클라이언트 버튼), `next.config.ts`(`cacheComponents`, `partialPrefetching`, Turbopack의 Tailwind CSS 로더 설정)

## 실행

`next dev`와 `next start`는 포트를 따로 지정하지 않으므로 Next.js 기본 포트 `3000`을 쓴다.

```sh
# 저장소 루트에서
cd order-console-next
npm ci
npm run dev
```

브라우저에서 `http://localhost:3000/orders`를 연다. `http://localhost:3000/orders/104`를 열면 취소된 주문 화면이 나온다.

프로덕션 모드로 실행한다.

```sh
# order-console-next/에서
npm run build
npm run start
```

## 테스트

자동 테스트는 없다. package.json에 있는 검사 스크립트는 lint 하나다.

```sh
# order-console-next/에서
npm run lint   # eslint-config-next의 core-web-vitals, typescript 규칙으로 검사한다
```

화면 동작은 위 실행 절의 주소를 브라우저로 열어 확인한다.
