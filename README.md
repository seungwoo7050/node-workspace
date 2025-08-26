# foundation/03f: Next.js

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Next.js%2016%20%7C%20React%20%7C%20Tailwind-lightgrey)

주문 목록·상세 화면을 Next.js App Router로 만든 프로젝트입니다. 상세 데이터를 서버 컴포넌트에서 직접 불러오므로 `useEffect`와 로딩 state가 없습니다.

## 지원 범위

- `/orders`: 주문 4건 링크 목록(서버 컴포넌트)
- `/orders/[id]`: 주문 상세(서버 컴포넌트에서 가짜 API `getOrder`를 `await`)
  - 응답을 기다리는 동안 `loading.tsx`의 "불러오는 중..." 표시(101은 약 1.2초)
  - 없는 주문(취소된 104번 등)은 `notFound()`로 "이 주문은 취소되어 상세 정보가 없습니다" 화면과 목록 링크
- "검토 완료로 표시" 버튼: 상태가 필요한 이 부분만 클라이언트 컴포넌트(`"use client"`)로 분리해, 누를 때마다 문구가 바뀜
- `/`는 create-next-app이 만든 기본 페이지 그대로입니다

## 구성

- `order-console-next/`: Next.js 앱
  - `lib/api.ts`(주문 데이터와 가짜 API), `app/orders/page.tsx`(목록), `app/orders/[id]/`(상세 `page.tsx`, `loading.tsx`, `not-found.tsx`, `review-button.tsx`)

## 실행

웹은 `3000`에서 뜨며 API 서버는 필요 없습니다.

```sh
cd order-console-next
npm ci
npm run dev
```

브라우저에서 http://localhost:3000/orders 를 엽니다.

프로덕션 모드로 실행:

```sh
npm run build   # 빌드 로그의 라우트 요약에서 정적/동적 페이지 확인
npm run start
```