# Next.js App Router: 서버 렌더링으로 옮긴 주문 관리 화면

## 목표

react로 만든 주문 목록/상세 화면을 Next.js로 옮긴다. 화면과 동작은 거의 같지만, **데이터를 어디서 가져오는가**가 달라진다.

`useEffect`도, 로딩 state도, 경쟁 상태를 막던 `cancelled` 플래그도 이 문서에서는 사라지지만 완성 결과는 react 프로젝트와 같다.

| 동작 | 결과 |
|---|---|
| `/orders` 열기 | 주문 4건 링크 목록 |
| 101번(kim) 클릭 | 곧바로 "불러오는 중..." → 약 1.2초 뒤 상세 |
| 104번(취소된 주문) 클릭 | 약 0.3초 뒤 "이 주문은 취소되어 상세 정보가 없습니다" |
| "검토 완료로 표시" 클릭 | 누를 때마다 문구가 바뀜 |

## 0. Next.js에 대한 사전지식

react에서는 컴포넌트가 전부 브라우저 하나에서만 실행됐다.

**컴포넌트**는 화면 한 조각을 돌려주는 함수다. props(인자)를 받아 "무엇을 그릴지" 기술한 JSX를 return하고, 그것을 실제 DOM으로 바꾸는 일은 react가 한다. "페이지를 구성하는 조각"이라는 이해는 맞지만, 중요한 것은 그 조각이 **호출되는 함수**라는 점이다.

그래서 서버 컴포넌트와 클라이언트 컴포넌트를 가르는 기준도 화면에서 차지하는 영역이나 크기가 아니라, **그 함수가 어느 쪽에서 호출되는가**다.

| | 서버 컴포넌트 | 클라이언트 컴포넌트 |
|---|---|---|
| 표시 | 없음(기본값) | 파일 맨 위 `"use client"` |
| 함수가 호출되는 곳 | 서버(Node 프로세스) | 첫 렌더는 서버, 그 뒤로는 브라우저 |
| 브라우저로 전송되는 코드 | 없음 | 있음 |
| 쓸 수 있는 것 | `async`/`await`, DB·파일 접근 | `useState`, 이벤트 핸들러, `window` |

Next.js는 **같은 소스 트리 안에 "서버에서 실행될 코드"와 "브라우저에서 실행될 코드"가 함께 있고, 빌드 도구가 이를 나눠서 처리한다.** 이 하나의 전제가 이 문서 전체(서버/클라이언트 컴포넌트, 파일 기반 라우팅, 빌드타임/요청타임 렌더링)를 관통한다.

### 1. 하나의 소스 트리가 두 실행 환경으로 나뉜다.

C에서 크로스 컴파일 빌드 시스템을 다뤄봤다면 이런 구성을 본 적 있을 것이다. 같은 헤더를 공유하면서도 `#ifdef TARGET_SERVER` / `#ifdef TARGET_CLIENT`로 갈라, 하나는 서버용 바이너리로, 하나는 임베디드(클라이언트)용 바이너리로 각각 컴파일한다.

Next.js도 원리는 같다. `app/` 아래 모든 파일은 기본적으로 서버용으로 빌드되고, 파일 맨 위에 `"use client";`라는 표시가 있어야만 그 파일이 브라우저에서도 실행될 별도 번들로 함께 컴파일된다.

```c
// C: 프리프로세서 지시문으로 같은 소스를 서버용/클라이언트용으로 나눠 컴파일
#ifdef TARGET_CLIENT
void handle_button_click(void) { /* 임베디드(클라이언트) 바이너리에만 포함 */ }
#endif
```

```tsx
// Next.js: 파일 맨 위의 "use client"가 그 파일이 클라이언트 번들에도 포함되게 하는 표시다
"use client";
export function ReviewButton() { /* 서버 번들과 브라우저 번들 양쪽에 존재 */ }
```

차이는 C의 `#ifdef`가 컴파일 전에 텍스트를 잘라내는 전처리기 매크로라는 점이다. `"use client"`는 빌드 도구가 모듈 단위로 두 개의 서로 다른 실행 결과물(서버 번들 / 브라우저 번들)을 만들도록 지시하는 경계다.

표시가 없는 파일(서버 컴포넌트)은 브라우저로 아예 전송되지 않는다. 코드 자체가 클라이언트 번들에 없다.

> `useState`/이벤트 핸들러가 서버 컴포넌트에서 안 되는 이유가 여기서 나온다. 서버 컴포넌트 → 클라이언트 컴포넌트로는 숫자·문자열 같은 직렬화 가능한 값만 props로 넘길 수 있는 이유도 같다(함수 포인터를 다른 실행 파일로 그대로 넘길 수 없는 것과 같다).

#### 훅(hook)이 서버 컴포넌트에서 안 되는 이유

`useState`, `useEffect`처럼 `use`로 시작하는 react 함수들을 **훅**이라고 부른다. 훅은 컴포넌트 함수를 "렌더 사이에 유지되는 무언가"에 연결하는 창구다. `useState`는 다시 렌더해도 살아 있는 값에, `useEffect`는 렌더가 끝난 뒤에 실행될 작업에 연결한다.

그러니까 훅은 "클라이언트에서 실행되는 함수"라서가 아니라, **연결될 대상이 서버에 없어서** 서버 컴포넌트에서 쓸 수 없다. 서버 컴포넌트는 요청 한 번에 함수가 한 번 호출되고 HTML을 내놓은 뒤 사라진다.

- 다시 렌더되는 일이 없으므로 "다시 렌더해도 유지되는 값"(state)이라는 개념 자체가 성립하지 않는다.
- 버튼 클릭은 브라우저에서 일어나므로 `setReviewed`를 불러 줄 이벤트가 서버에는 도달하지 않는다.
- 반대 방향의 제약도 같은 이유다. `async`/`await`는 서버 컴포넌트만 쓸 수 있다.

> `use`로 시작하는 함수가 전부 클라이언트 전용인 것은 아니지만, 이 문서에서 다루는 상태·효과 훅(`useState`, `useEffect`)은 전부 클라이언트 컴포넌트의 것이다.

### 2. 디렉터리 구조가 곧 라우팅 테이블이다.

**라우팅 테이블**은 "어떤 URL로 요청이 오면 어떤 코드를 실행할지" 적어 둔 대응표다. 그 표의 오른쪽에 적히는 코드, 즉 **URL 하나를 받아 응답을 만들어 내는 함수**가 **핸들러**다. "URL에 해당하는 작업을 하는 함수"라는 이해가 맞다.

express/Nest에서는 이 표의 한 줄 한 줄을 코드로 직접 썼다.

```ts
// express: 왼쪽이 URL 패턴, 오른쪽이 핸들러. 이 호출 자체가 표에 한 줄을 추가하는 일이다
ordersRouter.get("/:id", handler);
```

```ts
// Nest: 데코레이터가 같은 일을 한다. 표를 조립하는 주체가 프레임워크로 옮겨진 것뿐이다
@Get(":id") findOne(@Param("id") id: string) { /* ... */ }
```

Next.js에는 이 줄이 없다. **폴더 경로 자체가 URL이고, 그 폴더 안의 `page.tsx`가 핸들러다**(`app/orders/[id]/page.tsx` → `/orders/:id`).

다만 표가 사라진 것은 아니다. `next build`(개발 모드라면 `next dev`)가 `app/` 아래를 훑어 폴더 구조를 그대로 옮긴 라우팅 테이블을 **대신 생성한다**(결과물은 `.next/` 안에 들어 있다). 내가 손으로 쓰던 줄을 빌드 도구가 파일 트리에서 읽어 내는 것이다. 그래서 폴더를 옮기는 것이 곧 URL 변경이고, 따로 고쳐야 할 연결 코드가 없다.

오래된 C 기반 웹 서버(CGI)에서 `/cgi-bin/orders.cgi`라는 URL이 파일시스템의 `cgi-bin/orders.cgi` 실행 파일과 그대로 대응되던 방식과 같은 철학이다. 라우팅 테이블을 따로 관리하지 않고 파일시스템 자체가 테이블이 된다.

`[id]`처럼 대괄호로 감싼 폴더 이름은 그 자리에 오는 값을 파라미터로 받는다는 표시다. 이 한 칸을 **동적 세그먼트**라고 부른다. URL을 `/`로 자른 토막 하나하나가 세그먼트이고(`/orders/101` → `orders`, `101`), 그중 글자가 고정된 칸이 아니라 요청마다 값이 달라지는 칸이 동적 세그먼트다. **동적 세그먼트 값**은 거기에 실제로 들어온 값(`"101"`)을 말하며 `params`로 받는다.

| | express | Next.js |
|---|---|---|
| URL 패턴 | `"/orders/:id"` 문자열 | `app/orders/[id]/` 폴더 경로 |
| 핸들러 | `(req, res) => ...` | `page.tsx`의 default export |
| 동적 세그먼트 값 | `req.params.id` | `await params`의 `id` |
| 표를 만드는 주체 | 내 코드 | 빌드 도구 |

동적 세그먼트와 **쿼리 문자열**(`?sort=desc`)은 둘 다 "URL로 넘기는 값"이라 섞이기 쉽다. 차이는 라우팅 테이블에 걸리는지다. 동적 세그먼트는 경로의 일부라서 폴더가 있어야 하고, 쿼리 문자열은 어느 URL에든 그냥 붙을 수 있어 폴더와 무관하다.

| | 동적 세그먼트 | 쿼리 문자열 |
|---|---|---|
| 예 | `/orders/101` | `/orders?sort=desc` |
| 선언 | `app/orders/[id]/` 폴더 | 선언하지 않는다 |
| 읽기 | `await params` | `await searchParams` |
| 쓰는 곳 | **무엇을** 보는지(자원 식별) | 그것을 **어떻게** 보는지(정렬·필터·페이지) |

> `/orders/101`과 `/orders?id=101`은 기술적으로 둘 다 되지만, 하나의 주문을 가리키는 주소는 경로로 쓴다. 자원 하나에 주소 하나가 대응되는 쪽이 링크·공유·캐시 모두에 유리하다.

### 3. 렌더링 결과는 빌드 때 굳을 수도, 요청마다 새로 만들어질 수도 있다.

지금까지 만든 함수(`totalByUser`, Express 핸들러 등)는 전부 호출될 때마다 실행됐다. Next.js의 서버 컴포넌트는 기본적으로 **`next build` 시점에 딱 한 번 실행되고, 그 결과(HTML)가 고정되어 재사용될 수 있다.**

C로 비유하면 `#define TOTAL (2 + 3)`처럼 컴파일 타임에 계산이 끝나 바이너리에 상수 `5`로 박히는 것과, `int total = compute();`처럼 프로그램이 실행될 때마다 다시 계산하는 것의 차이와 같다.

> 어느 쪽이 될지는 컴포넌트가 요청 시점 정보(쿠키, 헤더 등)를 쓰는지에 따라 Next.js가 자동으로 결정한다. 직접 `#ifdef`로 고르는 게 아니라는 점이 C와 다르다.

#### 빌드 결과물과 "서버 없이 배포"

`next build`가 내놓는 것은 크게 세 가지다.

| 결과물 | 내용 | 누가 쓰나 |
|---|---|---|
| 서버 번들 | 서버 컴포넌트 코드, 생성된 라우팅 테이블 | Node 프로세스가 실행한다 |
| 클라이언트 번들 | `"use client"` 파일들 | 브라우저가 내려받아 실행한다 |
| 미리 렌더된 HTML | 정적으로 판정된 라우트의 렌더 결과 | 그대로 전송된다 |

"빌드 결과물이 서버용·클라이언트용 두 개인가"라는 해석은 절반은 맞다. 코드는 두 벌로 갈라지지만, 거기에 **빌드 때 미리 렌더해 둔 HTML**이 더해진다.

모든 라우트가 정적이면(요청 시점 정보를 읽는 라우트가 하나도 없으면) 서버 번들을 실행할 일이 남지 않는다. 이때 `next.config.ts`에 `output: "export"`를 주면 HTML·JS·CSS 파일만 뽑아내, S3나 GitHub Pages 같은 **정적 호스팅**에 그냥 올릴 수 있다. 이 문서의 앱은 `/orders/[id]`가 동적이라 그대로는 해당되지 않는다.

여기서 "서버가 없다"는 말은 **내 코드를 실행하는 서버가 없다**는 뜻이다. 파일을 HTTP로 돌려주는 웹 서버는 여전히 있다. 정적과 동적의 차이는 그 서버가 요청을 받고 무엇을 하는지다.

| | 정적 호스팅 | 동적 서버 |
|---|---|---|
| 요청이 오면 | 디스크의 파일을 찾아 그대로 보낸다 | 내 코드를 실행해 응답을 만든다 |
| 같은 URL의 응답 | 항상 같다 | 요청(쿠키·헤더·시각·DB)에 따라 달라진다 |
| 필요한 것 | 파일 서버 | Node 런타임 |

그러니 "정적이어도 서버다"가 맞다. 다만 구분의 기준은 사용자의 입력값이 정해져 있다는 쪽보다 **응답이 요청과 무관하게 미리 정해져 있다**는 쪽이 정확하다. 정적 호스팅에 올린 앱도 브라우저에서 JS가 돌기 때문에 클릭·입력에 반응하고 외부 API를 부를 수도 있다. 다만 그 일이 전부 브라우저에서 일어나므로, 서버에만 두어야 하는 것(DB 접속 정보, API 비밀키)은 둘 수 없다.

## 1. 준비

```sh
# create-next-app: Next.js 프로젝트 뼈대를 만들어 주는 공식 도구. --yes는 질문 없이 추천 기본값으로 만든다
npx create-next-app@latest order-console-next --yes
cd order-console-next
# 개발 서버를 켠다(기본 주소 http://localhost:3000)
npm run dev
```

`--yes` 없이 실행했다면 첫 질문에서 추천 기본값(TypeScript, ESLint, Tailwind, App Router, Turbopack)을 고른다. 이 문서의 실습은 Tailwind를 쓰지 않지만 켜져 있어도 무방하다.

개발 서버 주소는 `http://localhost:3000`이다(Vite는 5173이었다).

```
order-console-next/
├─ app/
│  ├─ layout.tsx   ← 루트 레이아웃(필수). <html>, <body>를 여기서 렌더한다
│  └─ page.tsx     ← "/" 페이지
├─ next.config.ts
├─ AGENTS.md       ← AI 코딩 도구용 안내문. 실습과 무관하다
└─ ...
```

폴더가 곧 URL이다(`app/posts/[id]/page.tsx` → `/posts/123`). 폴더에 `page.tsx`가 있어야 그 URL이 열린다.

## 2. 1단계: 정적 목록 페이지

`lib/api.ts`

```ts
// lib/api.ts
export type Order = { id: number; user: string; price: number; paid: boolean };

export const ORDERS: Order[] = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 102, user: "lee", price: 8000, paid: false },
  { id: 103, user: "kim", price: 5000, paid: true },
  { id: 104, user: "park", price: 7000, paid: true }, // 취소되어 상세 조회 대상에서 빠진다
];
```

`app/orders/page.tsx`를 만든다.

```tsx
// app/orders/page.tsx
import Link from "next/link";
import { ORDERS } from "@/lib/api";

// 파일 맨 위에 "use client"가 없으므로 서버에서 실행되는 서버 컴포넌트다
export default function OrdersPage() {
  return (
    <main>
      <h1>주문 관리</h1>
      <ul>
        {ORDERS.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`}>#{o.id} {o.user} - {o.price.toLocaleString()}원</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

`http://localhost:3000/orders`를 열면 목록이 바로 보인다(`/`는 아직 템플릿 첫 화면 그대로다).

react 프로젝트와 코드 모양은 비슷하지만 결정적으로 다른 점이 하나 있다. **이 컴포넌트는 브라우저가 아니라 서버에서 실행된다.**

### Next.js 규칙

- `app/orders/page.tsx`의 default export: 그 폴더 경로(`/orders`)의 화면이 된다. 파일 이름과 export 방식이 정해져 있다(아래 "`page.tsx`와 예약된 파일 이름"에서 다룬다).
- `@/lib/api`(경로 별칭): `@/`는 프로젝트 루트를 가리킨다. `../../lib/api` 같은 상대경로 대신 쓰며, `create-next-app`이 `tsconfig.json`에 설정해 둔다. `lib/`을 `app/` 바깥에 두는 이유는 아래 "`app/`과 `lib/`의 경계"에서 다룬다.

#### `page.tsx`와 예약된 파일 이름

앞서 본 대로 폴더 경로가 URL이 된다. 다만 Next.js가 보는 것은 폴더 안의 **정해진 이름의 파일**뿐이다. 이 문서에서 만드는 것은 아래 네 가지다.

| 파일 | 하는 일 | 만드는 곳 |
|---|---|---|
| `page.tsx` | 그 URL의 화면. 이 파일이 있어야 URL이 열린다 | 1단계 |
| `layout.tsx` | 그 폴더 아래 모든 페이지를 감싸는 공통 틀 | 4단계(루트는 처음부터 있다) |
| `loading.tsx` | `page`가 준비되는 동안 보여 줄 화면 | 4단계 |
| `not-found.tsx` | `notFound()`가 호출됐을 때 보여 줄 화면 | 4단계 |

```tsx
// app/orders/page.tsx
// 올바른 예: default export라야 Next.js가 찾는다
export default function OrdersPage() { /* ... */ }

// 잘못된 예: default 없이 이름 있는 export만 두면 화면이 되지 않는다
export function OrdersPage() { /* ... */ }
```

- 함수 이름(`OrdersPage`)은 아무래도 된다. Next.js는 이름이 아니라 "`page.tsx`의 default export"를 찾는다.
- 예약되지 않은 이름의 파일은 같은 폴더에 있어도 URL이 되지 않는다.
- `index.tsx`, `orders.tsx`처럼 다른 이름으로 만들면 그 폴더에는 `page`가 없는 것으로 취급되어 404가 된다.

> C 프로그램의 시작점이 "`main`이라는 이름의 함수"로 정해져 있는 것처럼, Next.js 라우트의 시작점은 "`page.tsx`의 `default export`"로 정해져 있다.

#### `app/`과 `lib/`의 경계

두 디렉터리의 성격이 전혀 다르다. `app/`은 **Next.js가 예약한** 디렉터리로 라우팅 테이블의 입력이다. 반면 `lib/`은 Next.js가 아무 의미도 두지 않는 그냥 폴더다. 규칙이 아니라 관례이고, `utils/`나 `server/`로 이름을 바꿔도 아무 일도 생기지 않는다.

| | `app/` | `lib/` |
|---|---|---|
| Next.js에게 | 예약된 디렉터리. 폴더 경로가 URL이 된다 | 의미 없음. 평범한 모듈 디렉터리 |
| 파일 이름 | `page`/`layout`/`loading`/`not-found`는 역할이 정해져 있다 | 자유 |
| 두는 것 | 화면, 그리고 그 화면만 쓰는 조각 | 화면이 아닌 코드(데이터 조회, 타입, 유틸) |
| 이름 변경 | 불가 | 가능 |

판단 기준은 하나다. **그 파일이 URL을 만들어야 하는가.** `lib/api.ts`의 `getOrder`는 URL이 아니고, 목록 페이지와 상세 페이지가 함께 쓴다. 그래서 `app/` 바깥이다.

반대로 `app/` 안에 라우트가 아닌 파일을 둬도 된다. 이후에 만들 `app/orders/[id]/review-button.tsx`가 그 예다. 예약된 이름이 아니므로 URL이 되지 않고, 그 라우트 하나만 쓰는 조각이라 쓰는 자리 옆에 둔다.

```
lib/api.ts                            ← 여러 라우트가 함께 쓰는 데이터 계층
app/orders/page.tsx                   ← URL이 된다
app/orders/[id]/page.tsx              ← URL이 된다
app/orders/[id]/review-button.tsx     ← URL이 아니다. 이 라우트 전용 조각
app/orders/[id]/loading.tsx           ← 예약된 이름.
```

express/Nest로 옮기면 `app/`이 컨트롤러 계층, `lib/`이 서비스·도메인 계층에 해당한다. 요청을 받아 화면으로 바꾸는 얇은 층과, 요청이 뭐였는지 모르는 채 데이터를 다루는 층의 분리다.

> 여러 라우트가 공유하는 것은 `lib/`로, 한 라우트만 쓰는 것은 그 라우트 폴더 안으로. 공유 범위가 자리를 결정한다.

### Next.js API

- `Link`(`next/link`): 페이지를 새로 불러오지 않고 이동하는 링크 컴포넌트다. `<a>`와의 차이는 아래 "`Link`와 `<a>`의 차이"에서 다룬다.

#### `Link`와 `<a>`의 차이

`Link`도 최종 HTML에는 `<a href="/orders/101">`로 그려진다. 차이는 클릭했을 때 일어나는 일이다.

```tsx
<a href="/orders/101">#101</a> // 브라우저가 새 HTML 문서를 요청하고 페이지 전체를 다시 불러온다
<Link href="/orders/101">#101</Link> // 클릭을 가로채서, 바뀌는 부분의 데이터만 받아 화면을 바꾼다
```

| 구분 | `<a>` | `Link` |
|---|---|---|
| 클릭하면 | 새 HTML 문서를 받아 페이지 전체를 다시 그림 | 바뀌는 부분의 데이터만 받아 그 부분만 바꿈 |
| JS 번들 | 다시 받아 다시 실행 | 그대로 유지 |
| 레이아웃·클라이언트 컴포넌트의 state | 전부 초기화 | 레이아웃은 유지 |
| 미리 받기(prefetch) | 없음 | 프로덕션 빌드에서 화면에 보이는 링크의 대상을 미리 받아 둔다 |

- 둘 다 주소창의 URL은 바뀌고 뒤로 가기도 된다. 겉으로 보이는 차이는 화면이 깜빡이며 처음부터 다시 그려지는지 여부다.
- DevTools의 Network 탭에서 확인할 수 있다. `<a>`로 이동하면 문서(Doc) 요청이 새로 생기고, `Link`로 이동하면 문서 요청 없이 데이터 요청만 생긴다.
- 앱 안의 페이지끼리 이동할 때는 `Link`, 외부 사이트로 나갈 때는 그냥 `<a>`를 쓴다.

"클릭을 가로채서 바뀌는 부분만 바꾼다"는 것은 SPA가 하던 일 그대로다. 그래서 **첫 화면 이후의 페이지 이동은 Next.js도 기본적으로 SPA처럼 동작한다**고 이해해도 된다. react 앱과 다른 점은 두 가지다.

- 첫 응답이 이미 내용이 채워진 HTML이다(5단계). SPA는 빈 `<div id="root"></div>`에서 출발해 JS가 전부 그렸다.
- 이동할 때 브라우저가 받는 것은 "바뀐 화면을 그리기 위한 데이터"이고, 그중 서버 컴포넌트 부분은 서버에서 렌더된 결과로 온다. 브라우저가 라우팅 테이블을 들고 컴포넌트를 처음부터 그리는 것이 아니다.

> react에서 `onClick`으로 state를 바꿔 상세를 보여 줬던 것을, 여기서는 URL 이동으로 하면서도 페이지 전체를 다시 불러오지 않게 해 주는 것이 `Link`다.

### 여기서 달라진 것

#### 서버 컴포넌트가 기본값이다

`app/` 안의 모든 컴포넌트는 표시가 없으면 서버에서만 실행된다. 그래서 `useState`/`useEffect`/이벤트 핸들러를 못 쓴다.

react의 컴포넌트는 브라우저에서만 실행됐다. 그 전제가 여기서 깨진다.

#### 파일 기반 라우팅

`app/orders/page.tsx`가 `/orders`가 된다. react에서 `useState`로 관리하던 "선택된 주문"은 이제 URL(`/orders/101`)로 표현된다.

## 3. 2단계: 동적 라우트로 상세 페이지

`lib/api.ts`에 상세 조회 함수를 추가한다. react의 `fetchOrder`와 거의 같지만, 없을 때 `throw` 대신 `null`을 돌려준다. Next.js의 방식으로 "없음"을 처리하기 위해서다.

`lib/api.ts`에 추가

```ts
// 104번은 "취소된 주문"이라 상세 조회 대상에서 뺀다
const DB = ORDERS.filter((o) => o.id !== 104);
// 주문 id별 지연 시간(ms)
const LATENCY: Record<number, number> = { 101: 1200, 102: 200, 103: 600 };
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function getOrder(id: number): Promise<Order | null> {
  // LATENCY에 없는 id는 기본 300ms 지연
  await delay(LATENCY[id] ?? 300);
  // find는 못 찾으면 undefined를 돌려주므로 null로 바꿔 "없음"을 통일한다
  return DB.find((o) => o.id === id) ?? null;
}
```

`app/orders/[id]/page.tsx`를 만든다.

```tsx
// app/orders/[id]/page.tsx
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/api";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // 동적 세그먼트 값은 Promise다.
  // URL에서 온 id는 문자열이라 숫자로 바꿔 넘긴다
  const order = await getOrder(Number(id)); // 서버에서 직접 await한다. useEffect도 로딩 state도 없다

  if (!order) notFound(); // 가장 가까운 not-found.tsx를 보여준다

  // notFound()는 반환하지 않고 끝나므로, 여기부터 TS는 order가 null이 아님을 안다
  return (
    <main>
      <h2>#{order.id} {order.user}</h2>
      <p>{order.price.toLocaleString()}원 · {order.paid ? "결제완료" : "미결제"}</p>
    </main>
  );
}
```

101번을 클릭하면 약 1.2초 뒤 상세가 보인다.

react의 `OrderDetail`에 있던 `useState<Loaded>`, `useEffect`, `cancelled` 플래그, "로딩 중" 파생값 계산이 **전부 없다.** 서버 컴포넌트가 데이터를 직접 `await`하고, 로딩과 "없음"은 특수 파일이 대신 맡는다.

### Next.js 규칙

- `async` 서버 컴포넌트: 서버 컴포넌트는 `async` 함수로 만들어 본문에서 바로 `await`할 수 있다. 클라이언트 컴포넌트에서는 안 된다.
- `params`: `[id]` 같은 동적 세그먼트의 값이 담긴 props다. `/orders/101`이면 `id`가 `"101"`(문자열)이다. 왜 Promise이고 왜 문자열인지는 아래 "`params`: Promise로 오는 문자열"에서 다룬다.

#### `params`: Promise로 오는 문자열

`/orders/101`이 요청되면 Next.js는 URL을 폴더 구조(`[id]`)에 맞춰 `{ id: "101" }`을 만들고, 그것을 Promise에 담아 `params`로 넘긴다.

**값이 항상 문자열인 이유**는 URL이 텍스트이기 때문이다. C의 `main(int argc, char *argv[])`가 숫자 인자도 문자열로 받아 `atoi`/`strtol`로 바꿔야 하는 것과 같다. 여기서는 `Number(id)`가 그 변환이다.

```js
Number("101"); // 101
Number("abc"); // NaN
Number(""); // 0
Number("101abc"); // NaN (strtol처럼 앞부분만 읽지 않는다)
```

`/orders/abc`를 열면 `getOrder(NaN)`이 되고, `NaN`과 같은 id는 없으므로 `null`이 돌아와 `notFound()`로 간다. 이 문서의 코드는 우연히 안전하게 끝나지만, 변환 결과를 그대로 DB 조회에 넘기는 코드라면 `Number.isInteger(n)` 같은 검사를 먼저 둔다.

**Promise인 이유**는 `params`가 요청이 와야 정해지는 값이기 때문이다. Next.js는 이런 값을 Promise로 넘겨서, 그 값이 필요 없는 부분(레이아웃 등)은 먼저 렌더를 시작하고 값이 필요한 컴포넌트만 `await`에서 기다리게 한다. 15에서 Promise로 바뀌었고, 16에서는 Promise가 아닌 것처럼 바로 꺼내 쓰는 방식이 완전히 막혔다.

```tsx
// 잘못된 예: Promise에서 바로 꺼내려 한다
const bad = Number(params.id);
// 타입 에러(TS2339): Property 'id' does not exist on type 'Promise<{ id: string; }>'.

// 올바른 예: 먼저 await로 꺼낸다
const { id } = await params;
```

- `await`를 쓰려면 컴포넌트가 `async`여야 한다. 서버 컴포넌트만 `async`가 될 수 있으므로 이 패턴은 서버 컴포넌트의 것이다.
- `cookies()`, `headers()`, `connection()`도 같은 이유로 Promise를 돌려준다.

> URL에서 온 값은 "Promise를 벗기고, 문자열을 원하는 타입으로 바꾼다"는 두 단계를 거쳐야 쓸 수 있다.

### Next.js API

- `notFound()`(`next/navigation`): 호출하면 컴포넌트 실행을 그 자리에서 멈추고 가장 가까운 `not-found.tsx` 화면으로 전환한다. 어떻게 멈추는지는 아래 "`notFound()`는 예외를 던져 실행을 끊는다"에서 다룬다.

#### `notFound()`는 예외를 던져 실행을 끊는다

`notFound()`는 특별한 표시(`digest`)를 붙인 에러를 `throw`하는 함수다. 그 에러가 컴포넌트 밖으로 올라가면 Next.js가 표시를 알아보고, 에러 화면 대신 가장 가까운 `not-found.tsx`를 그린다.

그래서 타입 선언도 `notFound(): never`다. `never`는 "정상적으로 돌아오는 일이 없다"는 반환 타입이고, TS는 이 호출 뒤의 코드에서 `order`가 `null`이 아니라고 좁힌다(코드 주석의 "여기부터 TS는 order가 null이 아님을 안다").

```tsx
if (!order) notFound(); // 여기서 throw되므로 아래로 내려오지 않는다
return <h2>#{order.id} {order.user}</h2>; // order: Order
```

흔한 실수는 `try/catch` 안에서 부르는 것이다. Next.js에 도달해야 할 에러를 내 `catch`가 먼저 잡아 버린다.

```tsx
try {
  const order = await getOrder(Number(id));
  if (!order) notFound();
  return <h2>#{order.id}</h2>;
} catch (e) {
  // notFound()가 던진 에러도 여기서 잡힌다. not-found.tsx 대신 이 화면이 나온다
  return <p>조회 실패</p>;
}
```

- `notFound()`는 `try` 바깥에서 부른다. 꼭 안에서 불러야 한다면 `catch`의 첫 줄에서 `unstable_rethrow(e)`(`next/navigation`)를 불러 Next.js의 에러는 다시 던지게 한다.
- `return notFound()`처럼 `return`을 붙이지 않아도 된다. 이미 `throw`로 빠져나간다.

> C의 `exit()`처럼 `_Noreturn`인 함수와 같은 자리지만, 프로세스를 끝내는 대신 예외로 호출 스택을 거슬러 올라간다. 그래서 중간의 `catch`가 가로챌 수 있다.

## 4. 3단계: 상태가 필요한 부분만 클라이언트 컴포넌트로

"검토 완료로 표시" 버튼은 클릭할 때마다 문구가 바뀌어야 한다. 서버 컴포넌트로는 안 된다(이벤트 핸들러가 없다). 이 부분만 분리한다.

`app/orders/[id]/review-button.tsx`

```tsx
"use client"; // 파일 맨 위, import보다 먼저

import { useState } from "react";

export function ReviewButton({ orderId }: { orderId: number }) {
  const [reviewed, setReviewed] = useState(false);
  return (
    <button onClick={() => setReviewed((v) => !v)}>
      {reviewed ? "검토 완료 취소" : "검토 완료로 표시"} (#{orderId})
    </button>
  );
}
```

`app/orders/[id]/page.tsx`

```tsx
// import와 return 안에 추가
import { ReviewButton } from "./review-button";
// ...
<ReviewButton orderId={order.id} />
```

`"use client"`는 `ReviewButton` 파일 하나에만 있다. 이 파일과 여기서 import한 것들이 브라우저에서도 실행되는 클라이언트 컴포넌트가 된다.

서버 컴포넌트(`OrderDetailPage`)는 숫자(`order.id`)만 props로 넘긴다. 직렬화 가능한 값이라 서버→클라이언트 경계를 넘을 수 있다.

### 일부러 깨뜨려보기

#### `"use client"` 지우기

`review-button.tsx`의 `"use client";`를 지워본다. 개발 서버 화면과 `npm run build` 모두 이런 에러로 멈춘다.

```sh
You're importing a module that depends on `useState` into a React Server Component module. This API is only available in Client Components. To fix, mark the file (or its parent) with the `"use client"` directive.
```

서버 컴포넌트가 기본값이라 표시가 없으면 서버 쪽으로 취급되기 때문이다.

#### 상세 페이지에 `"use client"` 붙이기

이번엔 반대로 `[id]/page.tsx` 맨 위에 `"use client";`를 추가해본다. 이쪽은 더 교묘하다. `npm run build`는 통과하고 화면도 일단 그려진다.

그런데 브라우저 콘솔(과 개발 서버 터미널)에 이런 에러가 찍힌다.

```sh
<OrderDetailPage> is an async Client Component. Only Server Components can be async at the moment.
```

`async` 컴포넌트는 서버 컴포넌트에서만 지원되는 구조다. 데이터를 `await`하는 서버 컴포넌트를 통째로 클라이언트로 바꾸면 "지금은 우연히 그려지지만 보장되지 않는" 상태가 된다.

> 빌드 성공만 보고 넘어가면 놓치는 실수라 콘솔을 꼭 확인한다.

## 5. 4단계: 로딩과 "없음" 화면

`app/orders/[id]/loading.tsx`를 만든다. 같은 폴더의 `page`가 준비되는 동안 Next.js가 자동으로 보여 주는 파일이라 따로 import하지 않는다.

`app/orders/[id]/loading.tsx`

```tsx
export default function Loading() {
  return <p>불러오는 중...</p>;
}
```

`app/orders/[id]/not-found.tsx`를 만든다. `notFound()`가 호출되면 Next.js가 이 컴포넌트를 대신 보여 준다.

`app/orders/[id]/not-found.tsx`

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1>이 주문은 취소되어 상세 정보가 없습니다</h1>
      <Link href="/orders">목록으로</Link>
    </main>
  );
}
```

104번을 클릭하면 "불러오는 중..." 다음 약 0.3초 뒤 이 화면이 보인다.

화면은 "없음"인데 `curl -s -o /dev/null -w '%{http_code}' localhost:3000/orders/104`는 `404`가 아니라 **`200`을** 준다.

`loading.tsx`가 있으면 Next.js는 로딩 화면부터 스트리밍으로 먼저 보내기 시작한다. HTTP 상태 코드는 첫 바이트와 함께 이미 나가 버려서, 나중에 `notFound()`가 호출돼도 바꿀 수 없다. 대신 Next.js는 HTML에 `<meta name="robots" content="noindex">`를 끼워 검색엔진이 이 페이지를 색인하지 않게 한다.

상태 코드가 꼭 404여야 한다면(예: API처럼 쓰이는 페이지) 그 라우트에서는 `loading.tsx`를 빼야 한다.

`app/layout.tsx`에 내비게이션도 추가한다. `layout.tsx`의 내용은 그 아래 모든 페이지에 공통으로 그려지고, `{children}` 자리에 각 페이지 내용이 들어간다.

`app/layout.tsx`

```tsx
// import는 맨 위에, <nav>는 <body> 안 {children} 바로 위에
import Link from "next/link";
// ...
<nav><Link href="/orders">주문 목록</Link></nav>
```

## 6. 5단계: 서버가 채워준 HTML 확인하기

`npm run dev`를 켠 채로 다른 터미널에서 확인한다.

```sh
# 첫 응답 HTML에서 <h2>...</h2> 부분만 뽑아 본다
curl -s http://localhost:3000/orders/102 | grep -o '<h2.*</h2>'
# <h2>#<!-- -->102<!-- --> <!-- -->lee</h2>
```

JS가 실행되기 전의 첫 응답 HTML에 이미 `lee`라는 이름이 들어 있다.

사이사이의 `<!-- -->`는 React가 끼워 넣는 빈 주석이다. JSX의 `#{order.id} {order.user}`는 텍스트 조각 4개(`#`, `102`, ` `, `lee`)인데, HTML로 내보내면 브라우저가 이것들을 한 덩어리 텍스트로 합쳐 버려서 하이드레이션 때 경계를 다시 찾을 수 없다. 주석이 그 경계 표시다.

react의 Vite 앱(`curl -s http://localhost:5173`)으로 같은 걸 해보면 빈 `<div id="root"></div>`와 스크립트 태그뿐이다. 이름은 브라우저가 JS를 실행하고 fetch를 끝낸 뒤에야 나타난다.

> react에서 겪은 한계(로딩·에러 상태와 경쟁 상태를 직접 처리해야 하고, 첫 HTML이 비어 있던 것)가 여기서 해결된 모습이다.

## 7. 6단계: 빌드 때 굳는 데이터

`app/orders/page.tsx`의 `<h1>` 아래에 렌더 시각을 추가한다.

```tsx
{/* 이 값이 언제 계산되는지가 실험의 핵심이다 */}
<p>렌더 시각: {new Date().toISOString()}</p>
```

- (a) `npm run dev`에서 새로고침을 반복한다 → 시각이 매번 바뀐다.
- (b) 서버를 끄고 `npm run build && npm run start`(프로덕션 모드)로 새로고침을 반복한다 → 시각이 빌드 때 값으로 고정된다. 빌드 로그의 라우트 요약에서 `/orders`가 정적으로 표시된다.

컴포넌트가 요청 시점 정보(`cookies()`, `headers()` 등)나 `no-store` fetch를 쓰지 않으면, Next.js는 **`next build` 때 한 번 렌더한 HTML을 계속 재사용한다.** 외부 API를 부르는 페이지가 개발 중에는 최신이다가 배포하면 굳는 함정이 이것이다.

이 "굳는다"가 곧 **캐시**다. 캐시라는 말이 헷갈리는 이유는 한 요청에 캐시가 여러 겹 있고, 어느 겹에서 오래된 값이 나오는지 모른 채 "캐시 때문"이라고 뭉뚱그리기 때문이다. (b)에서 본 것은 그중 Next.js의 것 하나다.

| 어디 | 무엇을 재사용하나 | 지우는 방법 |
|---|---|---|
| 브라우저 캐시 | 받아 둔 응답 | 강력 새로고침, DevTools의 Disable cache |
| CDN | 배포본의 응답 | 해당 서비스에서 무효화 |
| Next.js 라우트 캐시 | **빌드 때 렌더한 HTML**(이 절의 주제) | 재빌드, 재검증, 라우트를 동적으로 바꾸기 |
| `fetch`/데이터 캐시 | 서버에서 부른 API 응답 | `cache: "no-store"` 등 |

- 지금 보는 값이 오래됐다면 "어느 겹에서 왔는가"부터 좁힌다. 9.5의 빌드 로그에서 그 라우트가 `○`인지 `ƒ`인지 보는 것이 가장 빠른 첫 질문이다.
- 개발 서버(`npm run dev`)는 매 요청 새로 렌더하므로 이 캐시가 드러나지 않는다. (a)와 (b)의 차이가 그것이다.

> "캐시 때문"이라는 설명은 어느 캐시인지 말하기 전까지는 아직 원인이 아니다.

매 요청 새로 렌더하려면 아래처럼 요청 시점 API를 쓴다.

```tsx
// (c) 확인만 하고 되돌린다
import { connection } from "next/server";

export default async function OrdersPage() {
  await connection(); // 이 라우트를 요청 시점에 렌더하도록 만든다
  // ...
}
```

다시 빌드해서 실행하면 시각이 요청마다 바뀐다.

### Next.js API

- `connection()`(`next/server`): "요청이 들어온 시점에 실행하라"고 Next.js에 알리는 함수다. 이 라우트를 빌드 때 미리 굳히지 않게 만든다. 다른 요청 시점 API와의 차이는 아래 "`connection()`과 요청 시점 API"에서 다룬다.

#### `connection()`과 요청 시점 API

정적/동적을 Next.js가 자동으로 고른다는 것은 0장 3절에서 봤다. 판단 기준은 "요청이 와야만 알 수 있는 값을 읽는가"다. `new Date()`는 요청마다 값이 달라지지만 Next.js가 알아볼 수 있는 요청 정보가 아니라서, (b)에서 빌드 때 값으로 굳었다.

Next.js가 알아보는 요청 시점 API는 이런 것들이다. 모두 Promise라서 `await`로 꺼낸다(2단계 "`params`: Promise로 오는 문자열"과 같은 이유다).

| API | 읽는 것 |
|---|---|
| `cookies()`(`next/headers`) | 요청의 쿠키 |
| `headers()`(`next/headers`) | 요청 헤더 |
| `searchParams` props | URL의 `?sort=desc` 같은 쿼리 문자열 |
| `connection()`(`next/server`) | 아무것도 읽지 않는다. "실제 요청을 기다린다"는 표시만 한다 |

**쿠키**는 서버가 브라우저에게 "이 이름=값 쌍을 저장해 두고 앞으로 요청마다 같이 보내라"고 지시해 둔 작은 문자열이다. HTTP는 요청 하나하나가 서로를 기억하지 못하므로, 로그인 세션처럼 "이 요청이 누구의 요청인지"를 이어 붙이려면 매 요청에 실려 오는 꼬리표가 필요하다. 응답의 `Set-Cookie` 헤더로 심고, 그다음 요청의 `Cookie` 헤더로 돌아온다.

`cookies()`가 요청 시점 API인 이유도 여기서 나온다. 쿠키 값은 요청이 도착해야 알 수 있고 사용자마다 다르다. 그 값을 읽는 페이지는 빌드 때 하나의 HTML로 굳힐 수 없으므로 Next.js가 그 라우트를 동적으로 돌린다.

쿠키를 **세션**이나 `localStorage`와 섞어 쓰면 여기서 바로 막힌다. 셋 다 "브라우저에 뭔가를 남겨 둔다"로 뭉뚱그려 기억하기 쉽지만, 서버 컴포넌트에서 읽을 수 있는지가 서로 다르다.

| | 값이 있는 곳 | 요청에 실려 오나 | 서버 컴포넌트에서 |
|---|---|---|---|
| 쿠키 | 브라우저 | 매 요청 자동으로 | `await cookies()`로 읽는다 |
| 세션 | 서버(DB·메모리) | 쿠키에 담긴 **식별자만** | 그 식별자로 서버에서 조회한다 |
| `localStorage` | 브라우저 | 실려 오지 않는다 | **읽을 수 없다** |

- 쿠키는 **운반 수단**이고 세션은 **그 운반되는 열쇠로 서버에서 꺼내는 내용물**이다. "세션에 저장한다"는 말은 보통 "서버에 저장하고 그 식별자를 쿠키로 보낸다"를 뜻한다. 둘은 경쟁하는 선택지가 아니라 한 쌍이다.
- `localStorage`는 브라우저를 떠나지 않는다. 그래서 로그인 상태를 여기에 두면 서버 컴포넌트는 로그인 여부를 알 수 없고, 첫 HTML을 로그인한 화면으로 그려 줄 수 없다. 0장의 "서버에서 실행되는 코드"에게는 존재하지 않는 값이다.
- `localStorage`를 꼭 써야 한다면 클라이언트 컴포넌트의 `useEffect` 안에서만 읽는다. 렌더 중에 읽으면 7단계의 `window is not defined`와 9.4의 하이드레이션 불일치를 동시에 만난다.

> 서버가 알아야 하는 것은 쿠키로, 그 브라우저만 알면 되는 것은 `localStorage`로. 이 문서의 구분선(서버에서 실행되는 코드 / 브라우저에서 실행되는 코드)이 그대로 적용된다.

`connection()`은 이 렌더 시각 실험처럼 **요청에서 읽을 값은 없지만 매번 새로 계산해야 하는** 경우를 위한 것이다. 빌드 때 미리 렌더하는 동안에는 이 Promise가 끝나지 않아서 Next.js가 그 라우트를 미리 굳히지 못하고, 실제 요청을 처리할 때는 바로 끝난다.

```tsx
await connection(); // next build의 미리 렌더: 여기서 더 진행되지 않는다 → 동적 라우트
// 실제 요청: 바로 통과해서 아래가 요청마다 실행된다
const now = new Date().toISOString();
```

- 요청 시점 API를 하나라도 쓰면 그 라우트 전체가 동적(`ƒ`)이 된다. 9.5의 빌드 로그로 확인할 수 있다.
- `cookies()`, `headers()`를 이미 쓰는 컴포넌트라면 `connection()`을 따로 부를 필요가 없다.

> 동적으로 만들고 싶은데 읽을 요청 정보가 없다면 `connection()`, 읽을 정보가 있다면 그 API를 쓰는 것으로 충분하다.

## 8. 7단계: 클라이언트 컴포넌트의 렌더링 중 브라우저 API

`review-button.tsx`의 컴포넌트 본문 첫 줄에 `console.log(window.innerWidth);`를 추가하고 `/orders/102`를 연다.

개발 서버 터미널에 `⨯ ReferenceError: window is not defined`가 찍히고, 브라우저에는 `Switched to client rendering because the server rendering errored: window is not defined` 에러 오버레이가 뜬다.

**`"use client"` 컴포넌트도 처음 열 때는 서버에서 한 번 렌더**되어 초기 HTML의 일부가 되기 때문이다(하이드레이션으로 브라우저에서 다시 살아난다).

서버에는 `window`가 없으니 서버 렌더가 실패하고, Next.js는 그 부분을 브라우저 렌더로 되돌려 화면은 어떻게든 그려 낸다. 그래서 "화면은 나오는데 에러가 있다"는 헷갈리는 상태가 된다.

> `window`, `document` 같은 브라우저 전용 전역은 이벤트 핸들러나 `useEffect` 안에서만 안전하게 읽을 수 있다.

## 9. 8단계: 서버/클라이언트 경계에서 원인 좁히기

react의 디버깅 기법(브라우저 DevTools, React Developer Tools, `debugger;`)은 클라이언트 컴포넌트에는 그대로 통한다.

문제는 Next.js에 "서버에서만 실행되는 코드"가 생겼다는 것이다. 어느 쪽에서 실행된 코드가 문제인지부터 구분해야 원인을 좁힐 수 있다.

### 9.1 첫 질문: 이 로그는 어디에 찍히는가?

```tsx
// app/orders/page.tsx (서버 컴포넌트)
console.log("서버 컴포넌트 실행됨");
```

```tsx
// review-button.tsx (클라이언트 컴포넌트, "use client")
console.log("클라이언트 컴포넌트 실행됨");
```

`/orders`를 새로고침하면 **`console.log("서버 컴포넌트 실행됨")`은 브라우저 콘솔이 아니라 `npm run dev`를 실행 중인 터미널에 찍힌다.**

`ReviewButton`의 로그는 상세 페이지인 `/orders/102`에서 본다.

- 처음 렌더될 때: 서버 렌더 때문에 터미널에 한 번, 하이드레이션 때문에 브라우저 콘솔에도 찍힌다(7단계에서 본 대로 클라이언트 컴포넌트도 서버에서 한 번 렌더된다). 개발 모드 StrictMode에서는 브라우저 쪽이 두 번일 수 있다.
- 버튼을 클릭해서 다시 렌더될 때: 브라우저 콘솔에만 찍힌다.

> "로그가 안 보인다"는 문제의 절반은 엉뚱한 곳(터미널 vs 브라우저 콘솔)을 보고 있어서다.

### 9.2 Next.js 개발 서버의 에러 오버레이 읽는 법

서버 컴포넌트에서 에러가 나면(예: `getOrder`가 reject) 브라우저 화면 전체를 덮는 빨간 오버레이가 뜬다. 여기서 두 가지를 확인한다.

- 에러가 발생한 파일과 줄 번호: 오버레이의 스택 트레이스를 클릭하면 브라우저 소스가 아니라 실제 `.tsx` 원본으로 이동한다(소스맵).

- "Server" 배지 유무: 오버레이 상단에 이 에러가 서버 컴포넌트에서 났는지 클라이언트 컴포넌트에서 났는지 표시된다. 7단계(`window is not defined`)처럼 실행 환경을 헷갈린 에러는 여기서 바로 구분된다.

### 9.3 `next dev`에 Node 인스펙터 붙이기

서버 컴포넌트 코드는 결국 Node 프로세스 안에서 실행되므로, JS의 인스펙터가 그대로 통한다.

다만 `next dev`는 프로세스를 여러 개 띄우기 때문에 `node --inspect`를 직접 붙이기 어렵고, Next.js가 제공하는 옵션을 쓴다.

```sh
# "--" 뒤의 인자는 npm이 아니라 next dev에 그대로 전달된다
npm run dev -- --inspect
# ...
# - Debugger port: 9229
```

> `NODE_OPTIONS='--inspect' npm run dev`로도 되지만, 부모 프로세스가 9229를 먼저 차지해 실제 앱 코드는 9230에 붙는 식이라 헷갈린다. `--inspect-brk`를 `NODE_OPTIONS`로 주면 Next.js CLI 자체의 첫 줄에서 멈춰 버린다.

`chrome://inspect`로 붙이면 `getOrder`, `app/orders/[id]/page.tsx` 같은 서버 컴포넌트 코드에 브레이크포인트를 걸 수 있다.

단, 이렇게 멈추는 건 서버 쪽 실행뿐이다. `ReviewButton`처럼 브라우저에서 실행되는 클라이언트 컴포넌트는 여전히 브라우저 DevTools의 Sources 패널에서 따로 멈춰야 한다. **디버깅 대상이 서버 컴포넌트인지 클라이언트 컴포넌트인지에 따라 붙여야 할 디버거 자체가 다르다.**

### 9.4 하이드레이션 불일치(Hydration Mismatch) 읽는 법

서버가 렌더한 HTML과, 브라우저가 그 위에서 다시 렌더한 결과가 다르면 콘솔에 "Hydration failed" 계열의 경고가 뜬다.

대표적인 원인은 서버와 클라이언트가 다른 값을 계산하는 경우다. 예를 들어 클라이언트 컴포넌트가 렌더링 중에 `Date.now()`나 `Math.random()`을 직접 쓰면, 6단계에서 본 렌더 시각처럼 서버가 만든 HTML의 값과 브라우저가 하이드레이션 시점에 다시 계산한 값이 어긋난다.

> 의심 가는 컴포넌트에 `console.log`를 넣고 9.1의 방법으로 서버 로그와 브라우저 로그의 값을 나란히 비교하면 어느 쪽 계산이 다른지 바로 보인다.

### 9.5 빌드 로그의 라우트 표로 정적/동적 여부 확인하기

6단계의 "빌드 때 굳는 데이터" 문제는 실행해보지 않고도 빌드 로그만으로 미리 알 수 있다.

```sh
npm run build
# Route (app)
# ┌ ○ /
# ├ ○ /_not-found
# ├ ○ /orders
# └ ƒ /orders/[id]
#
# ○  (Static)   prerendered as static content
# ƒ  (Dynamic)  server-rendered on demand
```

`○`는 정적(빌드 시점에 한 번 렌더, 이후 재사용), `ƒ`는 동적(요청마다 서버에서 렌더)이다. `/orders/[id]`는 URL마다 값이 달라지는 동적 세그먼트라 `ƒ`가 됐다.

원하는 라우트가 `○`로 나오는데 매 요청 최신 데이터를 기대하고 있었다면, 그 컴포넌트가 요청 시점 정보를 전혀 쓰지 않아 Next.js가 정적으로 판단했다는 뜻이다. 6단계의 `connection()`을 넣고 다시 빌드하면 `ƒ /orders`로 바뀐다.

### 시험해보기

```sh
npm run dev -- --inspect
```

`chrome://inspect`로 연결한다(목록에 안 보이면 "Configure..."에 터미널이 알려 준 `localhost:9229`를 추가한다).

`app/orders/[id]/page.tsx`의 `getOrder(Number(id))` 호출 다음 줄에 브레이크포인트를 찍고 101번 주문을 열어, `order` 변수에 정말 서버에서 조회한 값이 들어오는지 직접 확인한다.

### 도전 과제

#### 1. 서버 컴포넌트에서 에러 내기

`app/orders/[id]/page.tsx`에 아래 줄을 추가하고 새로고침한다.

```tsx
throw new Error("일부러 에러");
```

에러 오버레이의 "Server" 표시와 스택 트레이스가 가리키는 줄을 확인한다. 확인 후 지운다.

에러는 어디에서 났다고 표시되고, 어느 줄을 가리키는가?

**답**

1. 개발 서버 터미널에 `⨯ Error: 일부러 에러`와 `at OrderDetailPage (app/orders/[id]/page.tsx:10:9)`처럼 원본 `.tsx` 파일의 줄·칸이 찍히고, 그 아래 코드 조각이 `throw`를 넣은 줄을 `>`로 가리킨다. 빌드된 청크 파일이 아니라 원본 위치다.
2. 브라우저가 받은 HTML 안의 에러 정보에도 같은 메시지와 함께 `"env":"Server"`가 실려 있다. 이 에러가 서버 컴포넌트에서 났다는 표시다.
3. `curl`로 받은 상태 코드는 `500`이 아니라 `200`이다. 4단계의 104번과 같은 이유로, `loading.tsx` 화면부터 스트리밍으로 먼저 나가기 때문이다.

> 개발 서버는 타입 검사를 하지 않아 그대로 뜨지만, 이 줄을 둔 채 `npm run build`를 하면 `'order' is possibly 'null'` 타입 에러로 실패한다. `throw` 아래 코드가 도달할 수 없게 되면서 `notFound()`로 좁혀 둔 `order` 타입이 적용되지 않기 때문이다.

#### 2. 클릭 로그가 찍히는 곳 예측하기

`review-button.tsx`의 `onClick` 핸들러 안에 `console.log`를 추가한다.

9.1의 기준으로 이 로그가 터미널과 브라우저 콘솔 중 어디에만 찍히는지 예측한 뒤, 직접 클릭해서 확인한다.

**답**

브라우저 콘솔에만 찍힌다. 클릭 이벤트 핸들러는 서버 렌더 때 실행되지 않고, 브라우저에서 클릭할 때만 실행되기 때문이다.

## 10. 완성 확인

```sh
npm run build      # 타입 검사 + 프로덕션 빌드. 에러 없이 끝나야 한다
npm run lint       # 코드 규칙 위반을 검사한다
```

- [ ] 목표 표의 모든 동작이 재현된다
- [ ] 5단계에서 서버가 채워 준 HTML과 react(CSR)의 빈 HTML의 차이를 직접 확인했다
- [ ] 6단계 (a)와 (b)의 차이를 재현했고, `connection()`으로 (c)를 만들어봤다
- [ ] react의 `useEffect`·`cancelled`·로딩 계산이 이 앱에 없는 이유와, 그 자리를 `loading.tsx`/`notFound()`가 대신하는 것을 설명할 수 있다
- [ ] 서버 컴포넌트의 `console.log`가 터미널에, 클라이언트 컴포넌트의 `console.log`가 브라우저 콘솔에 찍히는 차이를 직접 확인했다

## 11. 다음 단계

### 자가 점검

1. Vite 앱과 이 앱에서 `/orders/102`의 첫 HTML 응답은 어떻게 다른가?

2. 서버 컴포넌트에서 `useState`를 쓸 수 없는 이유는? `"use client"`는 무엇의 경계를 긋는가?

3. `"use client"` 컴포넌트는 브라우저에서만 실행되는가?

4. `params`가 Promise인 이유는?

5. 컴포넌트가 요청 시점 정보를 쓰지 않으면 어떤 일이 생기는가? 개발 모드에서는 왜 안 드러나는가?

### 이 문서에서 다루지 않은 것

존재만 알아둔다.

- Server Actions(`"use server"`)로 폼 제출·데이터 변경 처리
- Cache Components(16), 재검증(`revalidatePath`), 스트리밍과 `<Suspense>`
- 메타데이터(SEO), `next/image`, `next/font`, 배포