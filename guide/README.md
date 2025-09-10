# 테스트 툴킷: 이미 완성된 프로젝트에 테스트 붙이기

## 목표

지금까지 `curl`과 브라우저로 손으로 확인하던 것을 자동화된 테스트로 바꿔 보기위한 프로젝트다.

앞서 만든 두 프로젝트에 테스트를 실제로 붙이고, 마지막으로 간단한 성능 측정 도구를 사용해본다.

- `appendix/01-fastify-ws`의 `order-api-fastify`: Vitest 단위·API 테스트

- `foundation/03f-nextjs`의 `order-console-next`: Playwright e2e·접근성 테스트

```sh
npx vitest run --reporter=verbose
✓ src/orders.store.test.ts > orders.store > totalByUser는 결제 완료된 주문만 사용자별로 합산한다
✓ src/orders.store.test.ts > orders.store > findOrder는 없는 id에 undefined를 반환한다
✓ src/orders.api.test.ts > orders API > GET /orders/totals는 200과 사용자별 합계를 반환한다
✓ src/orders.api.test.ts > orders API > POST /orders로 주문을 만들면 201과 새 id를 받는다

npx playwright test
✓ orders.spec.ts - 주문 목록에서 상세로 이동한다
✓ a11y.spec.ts - 주문 목록 페이지는 심각한 접근성 위반이 없다
```

`vitest run`은 테스트를 한 번 실행하고 끝낸다(감시 모드가 아니다).

`--reporter=verbose`는 테스트 하나하나의 결과를 찍고, `✓`는 통과다.

`playwright test`는 실제 브라우저를 띄워 화면 동작을 자동으로 검사한다.

> 이 프로젝트는 새 개념을 가르치기보다, "이 도구가 뭘 하는지, 어떻게 실행하는지"를 감 잡게 하는 데 목적이 있다.

## 0. 테스트에 대한 사전지식

### 1. Assertion은 실패해도 멈추지 않는 `assert()`다.

C에서 `assert(condition)`을 써봤다면, `expect(값).toEqual(기대값)`이 하는 일이 근본적으로 같다는 걸 바로 알아챌 수 있다.

"이 값이 이래야 정상이다"를 코드로 선언해두고, 아니면 실패로 표시하는 것이다.

```c
// C: 조건이 거짓이면 그 자리에서 프로그램을 즉시 중단시킨다(abort)
assert(total_by_user("kim") == 17000);
```

```ts
// Vitest: 조건이 거짓이면 "이 테스트 하나만" 실패로 기록하고, 나머지 테스트는 계속 실행된다
expect(totalByUser()).toEqual({ kim: 17000, lee: 30000, park: 7000 });
```

결정적인 차이는 실패 이후의 동작이다.

C의 `assert`는 실패하면 `abort()`로 프로세스 전체를 죽인다. 그래서 보통 디버그 빌드에만 켜두고, 릴리스 빌드에서는 `NDEBUG`로 꺼버린다.

테스트 프레임워크의 `expect`는 실패해도 **그 `it` 블록 하나만 실패로 기록하고, 다음 `it`은 그대로 이어서 실행된다.**

`toEqual`(깊은 값 비교), `toBe`(참조/원시값 비교), `toMatchObject`(부분 일치)처럼 종류가 나뉜 것도, boolean 하나만 받는 C의 `assert`보다 "무엇이 왜 다른지"를 더 친절하게 보여주기 위한 확장이다.

### 2. 테스트끼리는 상태를 격리해야 한다.

"테스트끼리 상태가 섞이는 문제"는 사실 C 프로그램에서도 익숙한 종류의 버그다.

전역 변수를 쓰는 함수를 두 번 연속 호출하면 두 번째 호출이 첫 번째가 남긴 상태의 영향을 받는 것과 같다.

C의 유닛 테스트 프레임워크(Check 등)는 테스트 케이스마다 `fork()`로 완전히 새 프로세스를 띄워 메모리를 통째로 새로 시작하게 만든다.

Vitest는 그 중간쯤이다.

- 테스트 파일 단위로는 격리한다. 파일마다 모듈을 새로 불러오므로 파일끼리는 상태가 안 섞인다.

- 같은 파일 안의 테스트들은 같은 모듈 인스턴스를 공유하며 연달아 돈다. 테스트마다 전부 새로 띄우는 것보다 훨씬 빠르기 때문이다.

대신 그 범위 안에서는 **개발자가 직접 "이전 테스트가 남긴 상태를 지운다"는 책임을 진다**(`beforeEach`의 리셋 함수가 그 역할이다).

> Nest의 `Test.createTestingModule`이 테스트마다 DI 컨테이너 자체를 새로 만드는 것도 눈여겨볼 만하다.  
> 이 문제를 "리셋 함수를 잊지 않기"가 아니라 구조적으로 피하는 방식이다.

### 3. e2e는 조건이 될 때까지 다시 확인한다(폴링).

`expect(...).toBeVisible()`은 한 번 검사하고 끝나지 않고, 최대 5초까지 짧은 간격으로 다시 확인한다.

C에서 특정 조건(예: 공유 메모리의 플래그)이 참이 될 때까지 `while (!ready) { usleep(50000); }`처럼 짧게 자며 반복 확인하는 폴링(polling)을 짜본 적이 있다면 같은 패턴이다. 

다만 Playwright는 무한정 기다리지 않고 타임아웃이 지나면 실패로 확정한다.

Next.js의 서버 컴포넌트는 데이터를 `await`한 뒤에야 응답한다. 

이렇게 결과가 도착하는 정확한 시각을 예측할 수 없는 비동기 UI를 검사할 때 폴링이 없으면, "아직 안 그려진 순간"을 검사해버려 테스트가 들쭉날쭉해진다(flaky).

## 1. 준비

```sh
cd order-api-fastify
npm install -D vitest
```

`package.json`에 아래 두 스크립트를 추가한다. `test` 항목을 만들어 두면 `npm test`로 실행할 수 있고, `build`는 아래의 `tsconfig.build.json`으로 컴파일하도록 바꾼다.

```json
{ 
  "scripts": { 
    "test": "vitest run",
    "build": "tsc -p tsconfig.build.json" 
  } 
}
```

> `npm pkg set scripts.test="vitest run"`으로 넣어도 된다.

Vitest는 기본으로 `**/*.test.ts`, `**/*.spec.ts` 파일을 찾아 실행한다(별도 설정 파일은 필요 없다).

다만 테스트 파일도 `src/` 안에 두므로, `npm run build`가 테스트까지 `dist/`로 컴파일한다.

그러면 Vitest가 `dist/*.test.js`까지 찾아내 같은 테스트를 두 번 돌린다.

그래서 빌드할 때만 테스트 파일을 빼는 설정을 하나 더 둔다.

```json
// tsconfig.build.json
// tsconfig.json을 그대로 물려받고, 테스트 파일만 컴파일에서 뺀다
{ 
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.test.ts"],
}
```

> `npm run typecheck`는 그대로 `tsconfig.json`을 써서 테스트 코드까지 타입 검사한다.

## 2. 1단계: 순수 함수 단위 테스트

가장 테스트하기 쉬운 건 입력 → 출력만 있고 부작용이 없는 함수다.

그런데 Fastify의 `orders.plugin.ts`는 데이터(`orders` 배열)와 집계 로직이 라우트 등록 코드 안에 섞여 있어서, 라우트를 거치지 않고는 로직만 따로 부를 수 없다. 

그래서 Express의 `orders.store.ts`처럼 **데이터와 로직을 별도 파일로 뺀다.**

초기 데이터는 상수(`initialOrders`)로 따로 둬서, "처음 상태로 되돌리기"를 할 수 있게 해 둔다.

```ts
// src/orders.store.ts
export type Order = { id: number; user: string; price: number; paid: boolean };

// 초기 데이터를 상수로 분리해 두면 테스트에서 언제든 처음 상태로 되돌릴 수 있다
const initialOrders: Order[] = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 102, user: "lee", price: 8000, paid: false },
  { id: 103, user: "kim", price: 5000, paid: true },
  { id: 201, user: "lee", price: 30000, paid: true },
  { id: 202, user: "park", price: 7000, paid: true },
];

// 모듈 최상위 상태: 서버가 켜져 있는 동안(그리고 같은 테스트 파일 안에서) 모두가 공유한다
// 원소 객체까지 복사해서, initialOrders 자체는 절대 바뀌지 않게 한다
const orders: Order[] = initialOrders.map((o) => ({ ...o }));
let nextId = 203;

export function listOrders(paid?: boolean): Order[] {
  return paid === undefined ? [...orders] : orders.filter((o) => o.paid === paid);
}
export function findOrder(id: number): Order | undefined {
  return orders.find((o) => o.id === id);
}
export function addOrder(input: Omit<Order, "id">): Order {
  const order: Order = { id: nextId++, ...input };
  orders.push(order);
  return order;
}
export function totalByUser(): Record<string, number> {
  return orders.filter((o) => o.paid).reduce<Record<string, number>>((acc, o) => {
    acc[o.user] = (acc[o.user] ?? 0) + o.price;
    return acc;
  }, {});
}
```

`orders.plugin.ts`는 이제 데이터를 갖지 않고, store 함수를 부르기만 한다. 스키마와 라우트 선언은 기존과 같다.

```ts
// src/orders.plugin.ts
// 배열·nextId·합계 계산이 빠지고 store 호출로 바뀐다
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError } from "./http.js";
import { addOrder, findOrder, listOrders, totalByUser } from "./orders.store.js";
import { broadcast } from "./realtime.js";

const OrderSchema = z.object({
  id: z.number().int(),
  user: z.string().min(1),
  price: z.number().positive(),
  paid: z.boolean(),
});
const CreateOrderSchema = OrderSchema.omit({ id: true });

export const ordersPlugin: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get("/", { schema: { querystring: z.object({ paid: z.enum(["true", "false"]).optional() }) } }, async (req) => {
    const { paid } = req.query;
    return listOrders(paid === undefined ? undefined : paid === "true");
  });

  fastify.get("/totals", async () => totalByUser());

  fastify.get("/:id", { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req) => {
    const order = findOrder(req.params.id);
    if (!order) throw new HttpError(404, `order ${req.params.id} not found`);
    return order;
  });

  fastify.post("/", { schema: { body: CreateOrderSchema } }, async (req, reply) => {
    const order = addOrder(req.body);
    broadcast("order.created", order);
    reply.code(201);
    return order;
  });
};
```

이제 store만 따로 테스트한다.

```ts
// src/orders.store.test.ts
import { describe, expect, it } from "vitest";
import { findOrder, totalByUser } from "./orders.store.js";

describe("orders.store", () => {
  it("totalByUser는 결제 완료된 주문만 사용자별로 합산한다", () => {
    expect(totalByUser()).toEqual({ kim: 17000, lee: 30000, park: 7000 });
  });

  it("findOrder는 없는 id에 대해서는 undefined를 반환한다", () => {
    expect(findOrder(999)).toBeUndefined();
  });
});
```

```sh
npx vitest run
# 출력
npm notice run order-api-fastify@1.0.0 npx
npm notice run 'vitest' run

 RUN  v5.0.3 /Users/woopinbell/Desktop/ongoing/nodejs/test/order-api-fastify

 ✓ src/orders.store.test.ts (2 tests) 2ms
   ✓ orders.store (2)
     ✓ totalByUser는 결제 완료된 주문만 사용자별로 합산한다 1ms
     ✓ findOrder는 없는 id에 대해서는 undefined를 반환한다 0ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  02:25:38
   Duration  111ms (transform 64%, import 22%, worker 8%, tests 6%)
```

`describe`로 묶고 `it`으로 각 시나리오를 쓴다.

`expect(값).toEqual(...)`처럼 "실제로 나온 값이 기대와 같은가"를 확인하는 게 assertion이다.

> 이 단계는 서버를 띄우지도, HTTP를 거치지도 않는, 순수 로직만 검사한다.

### Vitest API

- `describe(그룹 이름, 함수)`: 관련된 테스트를 하나의 그룹으로 묶는다. 여기서는 위 `it`들이 "orders.store"에 대한 테스트라는 뜻이다.

- `it(설명, 함수)`: 테스트 케이스 하나다(`test`라고 써도 같다). 설명 문장이 곧 테스트 이름이고, 함수 안에서 `expect`가 틀리면 이 테스트가 실패한다.

- `expect(값)`: 결과가 기대와 맞는지 검사하는 assertion을 시작한다. 뒤에 붙는 매처로 비교 방식을 정한다.

- `.toEqual(기대값)`: 객체/배열의 "내용"이 같은지 비교한다. 참조가 같을 필요는 없다.

- `.toBeUndefined()`: 값이 `undefined`인지 검사한다.

#### `toEqual`과 `toBe`

앞에서 `toEqual`은 깊은 값 비교, `toBe`는 참조/원시값 비교라고만 짚었다. 차이는 객체를 비교할 때 드러난다.

`toBe`는 `Object.is`(사실상 `===`)로 비교하므로, 객체는 **같은 객체(같은 참조)일 때만** 통과한다.

`totalByUser()`는 부를 때마다 `reduce`로 새 객체를 만들기 때문에, 내용이 같은 객체 리터럴과 `toBe`로 비교하면 실패한다.

```ts
expect(totalByUser()).toBe({ kim: 17000, lee: 30000, park: 7000 }); // 실패: 서로 다른 객체다
expect(totalByUser()).toEqual({ kim: 17000, lee: 30000, park: 7000 }); // 통과: 필드를 하나씩 비교한다

const t = totalByUser();
expect(t).toBe(t); // 통과: 같은 객체다
```

함정은 첫 줄의 실패 메시지다. 양쪽 값이 똑같이 찍히는데 실패한다.

```sh
AssertionError: expected { kim: 17000, lee: 30000, park: 7000 } to be { kim: 17000, lee: 30000, park: 7000 } // Object.is equality

If it should pass with deep equality, replace "toBe" with "toStrictEqual"

Expected: { kim: 17000, lee: 30000, park: 7000 }
Received: serializes to the same string
```

| 매처 | 비교 방식 | 쓰는 곳 |
| --- | --- | --- |
| `toBe` | `Object.is`(참조/원시값) | 숫자·문자열·불리언, 같은 객체인지 확인 |
| `toEqual` | 필드를 재귀적으로 비교 | 객체·배열의 내용 |
| `toStrictEqual` | `toEqual`에 더해 값이 `undefined`인 필드까지 구분 | 모양까지 엄격하게 볼 때 |

- `{ a: 1, b: undefined }`와 `{ a: 1 }`은 `toEqual`로는 같고, `toStrictEqual`로는 다르다(`+ "b": undefined`가 diff에 찍힌다).

- 이 문서는 상태 코드처럼 원시값은 `toBe`, 응답 본문처럼 객체는 `toEqual`로 검사한다(2단계).

- "serializes to the same string"이 보이면 값이 아니라 비교 방식을 의심한다.

> C로 치면 `toBe`는 두 포인터를 `==`로 비교하는 것이고, `toEqual`은 구조체 필드를 하나씩 비교하는 함수를 짠 것이다.

## 3. 2단계: API 계층 테스트

이번엔 실제로 HTTP 요청을 보내서 라우트까지 검사한다.

Fastify는 서버를 진짜로 띄우지 않고도 요청을 흉내 낼 수 있는 `app.inject()`를 내장하고 있다.

그러려면 먼저 `main.ts`의 "서버를 만드는 부분"과 "포트를 여는 부분(`listen`)"을 떼어 놓아야 한다.

테스트는 앞부분만 필요하다.

```ts
// src/app.ts
// main.ts에 있던 설정을 그대로 옮기고, listen()만 뺀다
import Fastify, { type FastifyError } from "fastify";
import websocketPlugin from "@fastify/websocket";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError } from "./http.js";
import { ordersPlugin } from "./orders.plugin.js";
import { addClient } from "./realtime.js";

// 서버를 "만들기만" 하고 listen()은 하지 않는다. 테스트에서는 포트를 열 필요가 없어서 생성과 실행을 분리한다
// 인자를 안 주면 로그를 끈다(테스트 출력이 로그로 어지럽지 않게). main.ts만 true로 켠다
export function buildApp({ logger = false } = {}) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler<FastifyError>((err, req, reply) => {
    if (err instanceof HttpError) { reply.code(err.statusCode).send({ error: err.message }); return; }
    if (err.validation) { reply.code(400).send({ error: err.message }); return; }
    if (err.statusCode && err.statusCode < 500) { reply.code(err.statusCode).send({ error: err.message }); return; }
    req.log.error(err);
    reply.code(500).send({ error: "Internal Server Error" });
  });

  app.register(websocketPlugin);
  // buildApp은 async가 아니라 06처럼 await app.register(...)를 쓸 수 없어서, /ws 라우트를 자식 플러그인 안에 넣는다
  app.register(async (scoped) => {
    scoped.get("/ws", { websocket: true }, (socket) => addClient(socket));
  });

  app.get("/health", { schema: { response: { 200: z.object({ ok: z.boolean() }) } } }, async () => ({ ok: true }));
  app.register(ordersPlugin, { prefix: "/orders" });
  return app;
}
```

Fastify는 플러그인을 등록 순서대로 로드한다. 

그래서 자식 플러그인이 실행될 때는 `websocketPlugin`이 이미 로드되어 있어 `{ websocket: true }`가 제대로 먹힌다.

```ts
// src/main.ts
import { buildApp } from "./app.js";

const app = buildApp({ logger: true });
const PORT = Number(process.env.PORT ?? 4000); // 웹 화면(order-console-next)이 쓰는 3000번과 겹치지 않게 4000번
app.listen({ port: PORT }, () => console.log(`http://localhost:${PORT}`));
```

`npx tsx src/main.ts`로 띄워서 curl과 `scratch-client.mjs`가 그대로 동작하는지 먼저 확인한다.

> 리팩터링은 동작을 바꾸지 않아야 한다.

이제 테스트를 쓴다.

```ts
// src/orders.api.test.ts
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("orders API", () => {
  it("GET /orders/totals는 200과 사용자별 합계를 반환한다", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/orders/totals" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kim: 17000, lee: 30000, park: 7000 });
  });
});
```

```sh
npx vitest run
# 출력
npm notice run order-api-fastify@1.0.0 npx
npm notice run 'vitest' run

 RUN  v5.0.3 /Users/woopinbell/Desktop/ongoing/nodejs/test/order-api-fastify

 ✓ src/orders.store.test.ts (2 tests) 2ms
 ✓ src/orders.test.ts (1 test) 56ms

 Test Files  2 passed (2)
      Tests  3 passed (3)
   Start at  02:35:46
   Duration  284ms (import 49%, transform 25%, tests 24%, worker 2%)
```

Express에는 이런 기능이 내장돼 있지 않아서, 보통 `supertest` 같은 별도 패키지로 `app` 객체에 요청을 보낸다(`npm install -D supertest`, `request(app).get("/orders/totals")`).

두 방식은 이렇게 다르다.

- supertest: 내부에서 비어 있는 임시 포트로 서버를 잠깐 띄우고, 거기에 진짜 HTTP 요청을 보낸다.

- Fastify `inject()`: 별도 패키지 없이 내장돼 있고, 포트를 아예 열지 않고 요청을 앱 안으로 바로 흘려 넣는다.

### Vitest API

- `it(설명, async () => { ... })`: 테스트 함수를 async로 쓰면 안에서 `await`를 쓸 수 있다. Vitest는 반환된 Promise가 끝날 때까지 기다린다. 아래 "async 테스트는 Promise를 돌려줘야 기다린다"에서 다룬다.

- `.toBe(기대값)`: 원시값(숫자·문자열 등)이 정확히 같은지 검사한다. 객체에 쓰면 안 되는 이유는 1단계 "`toEqual`과 `toBe`"에서 봤다.

#### async 테스트는 Promise를 돌려줘야 기다린다

Vitest가 기다리는 것은 테스트 함수가 **돌려준 Promise** 하나뿐이다. `async` 함수는 본문의 `await`가 모두 끝나야 완료되는 Promise를 돌려주므로, 그 안의 `expect`가 전부 실행된 뒤에 테스트 결과가 정해진다.

`async`/`await` 없이 `.then`으로 쓰고 Promise를 돌려주지 않으면 이야기가 달라진다. Vitest는 함수가 반환된 순간 테스트를 통과로 기록하고, `.then` 안의 `expect`는 그 뒤에야 실행된다.

```ts
// 잘못: Promise를 돌려주지 않는다. 기대값을 일부러 500으로 틀리게 적었다
it("GET /orders/totals는 200을 반환한다", () => {
  const app = buildApp();
  app.inject({ method: "GET", url: "/orders/totals" }).then((res) => {
    expect(res.statusCode).toBe(500);
  });
});
```

```text
⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
AssertionError: expected 200 to be 500 // Object.is equality
...
Test Files  1 passed (1)
Tests  1 passed (1)
Errors  1 error
```

이번에는 Vitest가 테스트가 끝난 뒤에 터진 에러를 따로 잡아 "Errors 1 error"로 실행 전체를 실패(종료 코드 1)로 만들었다. 하지만 테스트 자체는 "passed"로 남는다. 실패해야 할 테스트가 통과로 찍히는, 가장 찾기 어려운 종류의 실수다.

- `.then`을 쓰고 싶다면 `return app.inject(...).then(...)`처럼 Promise를 돌려준다. 처음부터 `async`/`await`로 쓰는 편이 빠뜨릴 일이 적다.

- `async` 테스트 안에서도 `await`를 빠뜨리면 기다리지 않는다. `const res = app.inject(...)`라고 쓰면 `res`는 Promise라서 `res.statusCode`가 `undefined`가 되고, 이때는 다행히 테스트가 실패한다(`npm run typecheck`도 잡는다).

> 테스트 함수가 Promise를 돌려주지 않으면 Vitest 입장에서는 동기 테스트다. 함수가 반환된 순간 끝난 것으로 본다.

### Fastify API

- `app.inject({ method, url })`: 실제로 포트를 열지 않고 "이런 HTTP 요청이 왔다"고 가정해 응답을 돌려받는다. 플러그인 로딩과의 관계는 아래 "`inject()`는 앱 준비가 끝나길 기다린다"에서 다룬다.

- `res.json()`: 응답 본문을 JSON으로 파싱한다.

#### `inject()`는 앱 준비가 끝나길 기다린다

`buildApp()`은 `app.register(...)`를 `await` 없이 부르고 바로 `app`을 돌려준다. `register`는 플러그인을 등록 목록에 올리기만 하고, 실제 로딩(플러그인 함수 실행, 라우트 추가)은 `app.ready()`나 `listen()`이 불릴 때 등록 순서대로 일어난다. 그래서 `buildApp()`이 막 끝난 시점에는 `/orders/totals` 라우트가 아직 없다.

```ts
const app = buildApp();
app.hasRoute({ method: "GET", url: "/orders/totals" }); // false: 플러그인이 아직 로딩되지 않았다

const res = await app.inject({ method: "GET", url: "/orders/totals" });
app.hasRoute({ method: "GET", url: "/orders/totals" }); // true: inject가 먼저 로딩을 끝냈다
res.statusCode; // 200
```

`inject()`는 앱이 아직 준비되지 않았으면 내부에서 `ready()`를 먼저 기다린 뒤 요청을 넣는다. `main.ts`에서는 `listen()`이 같은 일을 한다. 테스트에서 `await app.ready()`를 따로 부르지 않아도 되는 이유다.

- 요청이 소켓을 거치지 않을 뿐, 라우팅·zod 검증·`setErrorHandler`는 실제 요청과 똑같이 거친다. 그래서 400·404 같은 에러 응답도 `inject()`로 검사할 수 있다.

- `app.hasRoute`, `app.printRoutes()`처럼 라우트 목록을 보는 API로 `ready()` 전에 확인하면, `app.get`으로 바로 붙인 `/health`만 보이고 플러그인 안의 `/orders` 라우트는 빠져 있다. 라우트가 없다고 나오면 로딩 시점부터 의심한다.

> C로 치면 `recv()`로 소켓에서 읽는 대신, 요청 구조체를 직접 채워 서버의 요청 처리 함수에 넘기는 것과 같다.

## 4. 3단계: 테스트끼리 상태가 섞이는 함정

POST로 주문을 만드는 테스트를 `orders.api.test.ts`의 `describe` 안, GET 테스트 아래에 하나 추가한다.

```ts
// orders.api.test.ts의 describe 안에 추가
it("POST /orders로 주문을 만들면 201과 새 id를 받는다", async () => {
  const app = buildApp();
  const res = await app.inject({
    method: "POST", url: "/orders",
    payload: { user: "choi", price: 9000, paid: true }, // 요청 본문(body)으로 보낼 데이터
  });
  expect(res.statusCode).toBe(201); // 201 Created: 새로 만들었다는 성공 상태 코드
  expect(res.json()).toEqual({ id: 203, user: "choi", price: 9000, paid: true });
});
```

`npx vitest run`은 통과한다. 같은 파일 안의 테스트는 적힌 순서대로 돌기 때문에, GET이 먼저 초기 상태를 보고 POST가 그 뒤에 주문을 추가한다.

그런데 **이 통과는 순서에 기댄 우연이다.** 순서를 섞어서 돌려 본다.

```sh
# --sequence.shuffle: 테스트 실행 순서를 무작위로 섞는다. 몇 번 반복해 본다
npx vitest run --sequence.shuffle
```

몇 번에 한 번씩 GET 테스트가 실패한다.

```sh
npm notice run order-api-fastify@1.0.0 npx
npm notice run 'vitest' run --sequence.shuffle

 RUN  v5.0.3 /Users/woopinbell/Desktop/ongoing/nodejs/test/order-api-fastify
      Running tests with seed "1791654930042"

 ✓ src/orders.store.test.ts (2 tests) 2ms
 ❯ src/orders.api.test.ts (2 tests | 1 failed) 49ms
   ❯ orders API (2)
     × GET /orders/totals는 200과 사용자별 합계를 반환한다 6ms
     ✓ POST /orders로 주문을 만들면 201과 새 id를 받는다 42ms

 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/orders.api.test.ts > orders API > GET /orders/totals는 200과 사용자별 합계를 반환한다
AssertionError: expected { kim: 17000, lee: 30000, …(2) } to deeply equal { kim: 17000, lee: 30000, park: 7000 }

- Expected
+ Received

  {
+   "choi": 9000,
    "kim": 17000,
    "lee": 30000,
    "park": 7000,
  }

 ❯ src/orders.api.test.ts:9:24
      7|     const res = await app.inject({ method: "GET", url: "/orders/totals" });
      8|     expect(res.statusCode).toBe(200);
      9|     expect(res.json()).toEqual({ kim: 17000, lee: 30000, park: 7000 });
       |                        ^
     10|   });
     11|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 3 passed (4)
   Start at  02:55:30
   Duration  255ms (import 45%, transform 27%, tests 25%, worker 2%)
```

POST가 먼저 돈 경우, choi의 주문이 남아 있는 것이다.

`orders.store.ts`의 `orders` 배열은 모듈 스코프 상태라 같은 파일의 모든 테스트가 공유하기 때문이다.

> Express에서 경험한 "모든 요청이 공유하는 상태"가 여기서는 테스트를 오염시키는 쪽으로 작동한다.

`buildApp()`을 테스트마다 새로 불러도 소용없다. Fastify 인스턴스는 새것이지만 store 모듈은 하나다.

반대로 `orders.store.test.ts`의 `totalByUser` 테스트는 섞어도 안 깨진다. 앞서 본 대로 Vitest가 파일 단위로는 모듈을 따로 불러오기 때문이다.

고치는 방법은 "매 테스트가 깨끗한 상태에서 시작하게" 만드는 것이다. 가장 간단한 방법은 테스트 전용 리셋 함수를 store에 추가하는 것이다.

```ts
// orders.store.ts 맨 아래에 추가
// 함수 이름 앞의 __는 "테스트 전용이라 일반 코드에서 쓰지 말라"는 관례적 표시다
export function __resetForTests() {
  // 배열을 그 자리에서 비운다. 같은 배열 객체를 유지하므로 이 배열을 참조하는 다른 코드에도 반영된다
  orders.length = 0;
  // 초기 데이터를 복사해서 다시 채운다. 복사하지 않으면 테스트가 객체를 고칠 때 initialOrders까지 바뀐다
  orders.push(...initialOrders.map((o) => ({ ...o })));
  nextId = 203;
}
```

```ts
// orders.api.test.ts
// import 두 줄을 바꾸고, describe 위에 beforeEach를 추가한다
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { __resetForTests } from "./orders.store.js";

// 어느 테스트도 앞 테스트가 남긴 데이터에 영향받지 않게 한다
beforeEach(() => { __resetForTests(); });
```

이제 `--sequence.shuffle`로 몇 번을 돌려도 결과가 같다.

> Nest는 `Test.createTestingModule`로 테스트마다 아예 새 인스턴스를 만들어서 이 문제를 원천적으로 피한다.

### Vitest API

- `beforeEach(함수)`: 각 테스트(`it`)가 실행되기 직전마다 호출되는 준비 함수를 등록한다. 어디에 적느냐에 따라 적용 범위가 달라지며, 아래 "훅이 실행되는 순서와 범위"에서 다룬다.

#### 훅이 실행되는 순서와 범위

`beforeEach`처럼 테스트 앞뒤에 끼어드는 함수를 훅(hook)이라고 한다. 네 가지가 있다.

| 훅 | 실행 시점 |
| --- | --- |
| `beforeAll` | 그 범위의 첫 테스트 전에 한 번 |
| `beforeEach` | 그 범위의 각 테스트 직전마다 |
| `afterEach` | 그 범위의 각 테스트 직후마다 |
| `afterAll` | 그 범위의 마지막 테스트 뒤에 한 번 |

범위는 훅을 적은 위치로 정해진다. 파일 최상위에 적으면 그 파일의 모든 테스트에, `describe` 안에 적으면 그 `describe` 안의 테스트에만 적용된다. 위 코드는 `beforeEach`를 `describe` 바깥, 파일 최상위에 뒀으므로 이 파일의 모든 테스트 앞에서 리셋이 돈다.

```ts
beforeAll(() => console.log("beforeAll"));
beforeEach(() => console.log("beforeEach(파일)"));
afterEach(() => console.log("afterEach"));

describe("A", () => {
  beforeEach(() => console.log("beforeEach(A)"));
  it("a1", () => console.log("a1"));
});
it("b1", () => console.log("b1"));
// 출력 순서:
// beforeAll
// beforeEach(파일)
// beforeEach(A)
// a1
// afterEach
// beforeEach(파일)
// b1
// afterEach
```

- 바깥 범위의 `beforeEach`가 안쪽보다 먼저 돈다. `b1`은 `describe("A")` 밖에 있으므로 `beforeEach(A)`가 돌지 않는다.

- 리셋을 `beforeAll`에 두면 파일 시작 때 한 번만 돌아서 테스트 사이의 오염을 막지 못한다. 이 문제에는 `beforeEach`가 맞다.

- 0장 2절에서 본 대로 파일끼리는 Vitest가 격리하므로, 훅은 같은 파일 안의 테스트 사이를 정리하는 도구다.

> C 유닛 테스트 프레임워크 Check의 fixture(테스트마다 부르는 setup/teardown 함수)와 같은 자리다.  
> 다만 Vitest는 `fork()`로 프로세스를 새로 띄우지 않으므로, 무엇을 되돌릴지는 훅 안에 직접 적어야 한다.

## 5. 4단계: 브라우저를 띄워서 e2e 테스트

`order-console-next`로 옮겨 실제 브라우저 동작을 검사한다.

```sh
cd ../order-console-next
# @playwright/test: 브라우저를 자동으로 조작해 검사하는 e2e(end-to-end, 처음부터 끝까지) 테스트 도구
npm install -D @playwright/test
# 테스트에 쓸 브라우저(chromium)를 내려받는다
npx playwright install chromium
```

> Linux/CI라면 `--with-deps`를 붙여 브라우저가 필요로 하는 시스템 라이브러리도 함께 설치한다: `npx playwright install --with-deps chromium`

테스트 전에 `npm run dev`가 떠 있지 않아도 된다. 아래 설정의 `webServer`가 알아서 띄우고, 이미 떠 있으면 그걸 쓴다.

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
  use: { baseURL: "http://localhost:3000" },
});
```

```ts
// e2e/orders.spec.ts
import { test, expect } from "@playwright/test";

test("주문 목록에서 상세로 이동한다", async ({ page }) => {
  await page.goto("/orders");
  // 101 뒤에 아무 글자가 오고 kim이 붙은 이름의 링크를 찾아 클릭한다
  await page.getByRole("link", { name: /101.*kim/ }).click();
  await expect(page.getByRole("heading", { name: /101.*kim/ })).toBeVisible(); // 서버 fetch가 끝날 때까지 자동 대기
});
```

```sh
npx playwright test

# 출력
npm notice run order-console-next@0.1.0 npx
npm notice run 'playwright' test
[WebServer] npm notice run order-console-next@0.1.0 dev
[WebServer] npm notice run next dev

Running 1 test using 1 worker

  ✓  1 e2e/orders.spec.ts:3:5 › 주문 목록에서 상세로 이동한다 (2.5s)

  1 passed (9.2s)
```

### Playwright 설정

- `defineConfig(설정)`: 설정 객체를 타입 검사와 자동완성이 되게 감싸 준다.

- `testDir`: 이 폴더의 `*.spec.ts`만 테스트로 본다. 지정하지 않으면 프로젝트 전체를 뒤진다.

- `webServer`: 테스트 전에 `command`로 서버를 띄우고, `url`이 응답할 때까지 기다린다. `reuseExistingServer: true`면 이미 그 주소로 서버가 떠 있을 때 새로 띄우지 않고 그대로 쓴다.

- `use.baseURL`: 테스트 코드에서 `page.goto("/orders")`처럼 경로만 써도 이 주소가 앞에 붙는다.

### Playwright API

- `test(이름, async ({ page }) => { ... })`: 테스트 하나다. 함수가 받는 도구 묶음에서 `page`(브라우저 탭 하나)만 꺼내 쓴다.

- `page.goto(경로)`: 그 주소로 이동한다.

- `page.getByRole(역할, { name })`: 화면에서 그 역할(링크, 제목 등)을 하는 요소 중 접근성 이름이 `name`에 맞는 것을 찾는다. `.click()`은 그 요소를 클릭한다. 역할과 이름이 무엇인지는 아래 "`getByRole`: 역할과 접근성 이름으로 찾는다"에서 다룬다.

- `expect(요소).toBeVisible()`: 요소가 화면에 보일 때까지 자동으로 재시도하며 기다린다(기본 5초). 재시도가 필요한 이유는 0장 3절과 아래 "여기서 알아둘 것"에서 다룬다.

#### `getByRole`: 역할과 접근성 이름으로 찾는다

역할(role)은 요소가 "무엇인지"를 나타내는 접근성 정보다. 대부분 태그에서 자동으로 정해진다. `<a href>`는 `link`, `<h1>`~`<h6>`는 `heading`, `<button>`은 `button`이다.

접근성 이름(accessible name)은 스크린 리더가 그 요소를 부르는 이름이다. 링크·버튼·제목은 보통 안의 텍스트가 이름이 되고, `aria-label`이 있으면 그것이 우선한다.

```tsx
// app/orders/page.tsx: 역할 link, 이름 "#101 kim - 12,000원"
<Link href={`/orders/${o.id}`}>#{o.id} {o.user} - {o.price.toLocaleString()}원</Link>

// app/orders/[id]/page.tsx: 역할 heading, 이름 "#101 kim"
<h2>#{order.id} {order.user}</h2>
```

그래서 `getByRole("link", { name: /101.*kim/ })`는 목록의 101번 링크를, `getByRole("heading", { name: /101.*kim/ })`는 상세 페이지의 `<h2>`를 찾는다.

| 찾는 방법 | 예 | 테스트가 깨지는 때 |
| --- | --- | --- |
| `getByRole` | `page.getByRole("link", { name: /101.*kim/ })` | 사용자가 보는 역할·이름이 바뀔 때 |
| CSS 셀렉터 | `page.locator("ul > li:first-child a")` | 마크업 구조나 클래스가 바뀔 때 |

- `name`에 문자열을 주면 대소문자를 무시한 부분 일치로, 정규식을 주면 정규식으로 맞춘다.

- `getByRole(...)`은 그 자리에서 요소를 찾지 않고 "찾는 방법"(로케이터)만 만든다. 실제로 찾는 것은 `.click()`이나 `expect(...)`가 실행될 때이고, 그때 요소가 나타날 때까지 기다린다.

- 5단계의 접근성 스캔과 같은 정보(역할·이름)를 쓰므로, `getByRole`로 찾을 수 없는 요소는 스크린 리더 사용자에게도 이름이 없는 요소일 가능성이 크다.

> 테스트를 화면 구조가 아니라 사용자가 보는 것(이 링크, 이 제목)에 묶어 두면, 마크업을 고쳐도 테스트가 덜 깨진다.

### 여기서 알아둘 것

`expect(...).toBeVisible()`은 한 번 검사하고 끝나는 게 아니라, 조건이 맞을 때까지(기본 5초) **자동으로 재시도**한다.

Next.js 프로젝트에서 본 것처럼 상세 페이지는 서버에서 데이터를 `await`한 뒤에야 응답이 온다.

그래서 이런 자동 대기가 없으면 테스트가 페이지 로딩 중에 검사해버려 매번 실패하거나 불안정해진다(flaky test).

## 6. 5단계: 접근성 자동 스캔

```sh
# @axe-core/playwright: 접근성 검사 엔진 axe-core를 Playwright에서 쓰게 해 주는 패키지
npm install -D @axe-core/playwright
```

```ts
// e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("주문 목록 페이지는 심각한 접근성 위반이 없다", async ({ page }) => {
  await page.goto("/orders");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]); // 비어 있으면 자동 검사를 통과한 것이다
});
```

```sh
npx playwright test

# 출력
npm notice run order-console-next@0.1.0 npx
npm notice run 'playwright' test
[WebServer] npm notice run order-console-next@0.1.0 dev
[WebServer] npm notice run next dev

Running 2 tests using 2 workers

  ✓  1 e2e/orders.spec.ts:3:5 › 주문 목록에서 상세로 이동한다 (2.7s)
  ✓  2 e2e/a11y.spec.ts:4:5 › 주문 목록 페이지는 심각한 접근성 위반이 없다 (1.2s)

  2 passed (4.9s)
```

`axe-core`는 명도 대비, `alt` 속성 누락, 잘못된 ARIA 속성처럼 규칙으로 자동 판별 가능한 문제만 잡는다.

키보드만으로 전체 기능을 쓸 수 있는지, 스크린 리더가 읽는 순서가 자연스러운지처럼 사람이 직접 확인해야 하는 부분은 못 잡는다.

> **자동 스캔은 "최소한의 바닥"이지 접근성 검증의 전부가 아니다.**

### axe-core API

- `new AxeBuilder({ page }).analyze()`: 현재 페이지를 접근성 규칙(명도 대비, `alt` 누락 등)으로 검사해 결과 객체를 돌려준다.

- `results.violations`: 규칙을 어긴 항목의 배열이다. 각 항목의 필드(`id`, `nodes[].target`, `help`)는 7단계 8.6에서 펼쳐 본다.

## 7. 6단계: 성능 측정 맛보기

```sh
# @lhci/cli: Lighthouse(성능·접근성·SEO 측정 도구)를 명령줄/CI에서 반복 실행하게 해 주는 도구
npm install -D @lhci/cli
```

설정 파일은 CommonJS 방식(`.cjs`)이라 `import` 대신 `module.exports`로 설정을 내보낸다.

```js
// lighthouserc.cjs
module.exports = {
  ci: {
    collect: { url: ["http://localhost:3000/orders"], numberOfRuns: 3 },
    assert: { assertions: { "categories:performance": ["warn", { minScore: 0.8 }] } },
  },
};
```

```sh
# 프로덕션 빌드 후 서버를 켠다.
# (e2e에서 띄운 npm run dev가 아직 3000번을 쓰고 있다면 먼저 끈다)
npm run build && npm run start # 프로덕션 모드로 띄워야 실제 성능에 가까운 값이 나온다
# 설정 파일(lighthouserc.cjs)대로 측정 → 결과 검사까지 한 번에 실행한다. Chrome이 설치되어 있어야 한다
npx lhci autorun
# 출력
npm notice run order-console-next@0.1.0 npx
npm notice run 'lhci' autorun
✅  .lighthouseci/ directory writable
✅  Configuration file found
✅  Chrome installation found
Healthcheck passed!

Running Lighthouse 3 time(s) on http://localhost:3000/orders
Run #1...done.
Run #2...done.
Run #3...done.
Done running Lighthouse!

Checking assertions against 1 URL(s), 3 total run(s)

All results processed!

Done running autorun.
```

측정 결과는 `.lighthouseci/` 폴더에 실행마다 `lhr-*.html`(브라우저로 여는 보고서)과 `lhr-*.json`으로 남는다.

> `.gitignore`에 `.lighthouseci/`를 추가해 둔다.

기준(`minScore: 0.8`)에 못 미치면 `warn`이라 경고만 찍힌다. `"error"`로 바꾸면 종료 코드가 실패가 되어 CI를 멈춘다. 결과를 외부에 올리는 `upload` 설정은 이 문서에서는 쓰지 않는다.

Lighthouse는 성능·접근성·SEO·모범 사례를 0~1 점수로 매긴다.

`numberOfRuns: 3`처럼 여러 번 측정하는 이유는 성능 수치가 그날의 컴퓨터 상태에 따라 흔들리기(noisy) 때문이다. 한 번 재서 나쁘게 나왔다고 진짜 느려진 게 아닐 수 있다. 그래서 여러 번 잰 값을 하나로 합칠 때는 튀는 값 하나에 끌려가는 평균보다 중앙값이 더 믿을 만하다.

> 지금은 "이 도구가 여러 번 재서 점수를 낸다"는 것만 알아두면 충분하다.

### Lighthouse CI 설정

- `collect.url`: 측정할 주소들이다.
- `collect.numberOfRuns`: 같은 페이지를 몇 번 측정할지 정한다. 측정값이 흔들리기 때문에 3번 잰다.
- `assert.assertions`: 측정 결과가 기준을 넘는지 검사한다. `"categories:performance"`는 성능 점수, `"warn"`은 기준 미달 시 실패 대신 경고만 낸다는 뜻이고, `minScore: 0.8`은 0.8 이상이어야 한다는 뜻이다.

## 8. 7단계: 실패한 테스트의 원인 좁히기

테스트가 실패했을 때 "왜 실패했는지"를 좁히는 방법은 지금까지의 디버깅과 성격이 조금 다르다.

실행 중인 서버 하나를 들여다보는 게 아니라, **그 테스트가 재현하는 그 순간으로 최대한 빨리 돌아가야 한다.**

### 8.1 실패한 테스트 하나만 골라 반복 실행하기

전체를 다시 돌리며 기다리는 대신, 이름으로 딱 하나만 골라 실행한다.

```sh
npx vitest run -t "findOrder는 없는 id에 undefined를 반환한다"
npx vitest # watch 모드: 파일을 저장할 때마다 관련 테스트만 자동 재실행
```

JS에서 `node --watch`로 스크립트를 저장할 때마다 재실행했던 것과 같은 습관을 테스트 단위로 적용한 것이다.

> 코드를 고치고, 저장하고, 그 테스트만 다시 보는 사이클을 최대한 짧게 만든다.

### 8.2 `expect`가 실패하면 값의 diff부터 읽는다.

Vitest는 `toEqual`이 실패하면 기대값과 실제값을 나란히 놓고 다른 부분만 표시해준다.

```
- Expected
+ Received

  {
-   "kim": 17000,
+   "kim": 12000,
    "lee": 30000,
  }
```

`-`는 기대했던 값, `+`는 실제로 나온 값이다.

- `+`쪽이 이상하면 코드 버그다.

- `-`쪽이 애초에 잘못 적혀 있었다면 테스트 자체의 기대값이 틀린 것이다.

> 이 구분을 먼저 하고 나서 코드를 고칠지 테스트를 고칠지 정한다.

### 8.3 Vitest UI로 테스트 트리와 결과를 한눈에 보기

```sh
npx vitest --ui
```

브라우저 화면에서 모든 테스트를 트리로 보여주고, 실패한 항목을 클릭하면 8.2의 diff와 콘솔 출력을 한 화면에서 볼 수 있다.

> 테스트 개수가 많아져서 터미널 스크롤로는 원하는 실패를 찾기 번거로울 때 쓴다.

### 8.4 Playwright는 실패한 순간을 트레이스로 남겨둔다.

Playwright는 `--trace on`으로 돌리면 테스트의 실행 과정 전체(각 단계의 화면 캡처, DOM 스냅샷, 네트워크 요청)를 트레이스로 기록해둔다.

C 프로그램이 크래시할 때 코어 덤프를 남겨서 나중에 `gdb core`로 그 순간을 그대로 복기하는 것과 목적이 같다.

```sh
# --reporter=html: playwright-report/에 HTML 보고서를 만든다. 이 설정의 기본 리포터는 터미널에만 찍으므로, 빼면 show-report가 볼 보고서가 없다
npx playwright test --trace on --reporter=html
npx playwright show-report # 테스트 목록·실패 메시지·트레이스를 브라우저로 확인(playwright-report/ 폴더)
# 트레이스 파일은 test-results/<테스트별 폴더>/trace.zip 에 생긴다. 실패 화면도 따로 스크린샷 파일로 남지 않고 이 안에 단계별 화면 캡처로 들어 있다
npx playwright show-trace test-results/<테스트별 폴더>/trace.zip # 클릭·네트워크 요청을 타임라인으로 재생
```

트레이스 뷰어를 열면 테스트가 실패한 그 시점의 DOM이 정확히 어떤 모양이었는지, 어떤 셀렉터가 무엇을 찾다가 실패했는지 타임라인을 스크러빙하며 확인할 수 있다.

### 8.5 브라우저를 실제로 띄워서 눈으로 따라가기

헤드리스(화면 없이) 대신 실제 브라우저 창을 띄우고, 한 단계씩 멈춰가며 실행할 수 있다.

```sh
npx playwright test --headed --debug
```

`--debug`는 Playwright Inspector를 함께 띄운다. 이 상태에서 다음을 할 수 있다.

- "Step over" 버튼으로 한 동작씩 진행한다.

- 코드 중간에 `await page.pause();`를 추가해 그 지점에서 멈추고, 브라우저 상태를 직접 조작·확인한다.

> JS의 `debugger;`와 같은 역할을, 브라우저 자동화 흐름에 맞춰 제공하는 것이다.

### 8.6 axe-core 위반 내역을 필드별로 펼쳐보기

5단계의 `expect(results.violations).toEqual([])`가 실패하면, 배열 안에 무엇이 왜 걸렸는지 직접 펼쳐본다.

```ts
if (results.violations.length > 0) {
  console.dir(results.violations, { depth: null }); // id, impact, help, nodes(위반한 실제 엘리먼트)까지 전부 보인다
}
```

- `id`: 규칙 이름이다(예: `color-contrast`).

- `nodes[].target`: 위반한 엘리먼트의 CSS 셀렉터다.

- `help`: 고치는 방법에 대한 짧은 설명이다.

`id`와 `nodes[].target`을 보면 어떤 규칙을 어떤 엘리먼트가 어겼는지 바로 알 수 있다.

### 시험해보기

```sh
npx vitest run -t "totalByUser"
```

`orders.store.ts`의 `totalByUser` 계산식(`acc[o.user] = (acc[o.user] ?? 0) + o.price;`)을 잠깐 `- o.price`로 바꿔 일부러 깨뜨린 뒤 같은 명령을 실행한다. 8.2에서 설명한 `-`/`+` diff가 어떻게 나오는지 직접 확인하고, 확인 후 원복한다.

### 도전 과제

하나씩 고치고 원복하며 확인한다.

#### 1. 셀렉터를 깨뜨리고 트레이스 보기

`e2e/orders.spec.ts`의 셀렉터(`getByRole("link", { name: /101.*kim/ })`)를 존재하지 않는 텍스트로 잠깐 바꾸고 실행한다.

```sh
npx playwright test --trace on --reporter=html
npx playwright show-report
```

트레이스에 남은 실패 순간의 화면 캡처를 보고, "이 시점에 실제 DOM에는 뭐가 있었는지"를 트레이스 뷰어로 확인한다.

무엇이 남고, 그 순간 화면에는 무엇이 있었는가?

**답**

1. 이름이 맞는 링크가 없으므로 `click()`이 링크가 나타나기를 계속 기다리다가 `Test timeout of 30000ms exceeded`로 실패한다. `click()`에는 따로 제한 시간이 없어 `toBeVisible()`의 5초가 아니라 테스트 전체 제한 30초에 걸린다.

2. 실패 메시지의 Call log에 `waiting for getByRole('link', { name: /999.*nobody/ })`가 찍혀, 무엇을 찾다가 멈췄는지 바로 보인다.

3. 트레이스의 `click` 시점 화면에는 `주문 목록` 링크, `주문 관리` 제목, `#101 kim - 12,000원`부터 `#104 park - 7,000원`까지 네 링크만 있고, `999`나 `nobody`가 들어간 링크는 없다. 같은 폴더의 `error-context.md`에도 이 페이지 구조가 텍스트로 남는다.

> 셀렉터가 틀렸는지, 화면이 아직 안 그려졌는지는 그 순간의 DOM을 봐야 구분된다. 여기서는 목록이 다 그려져 있으니 셀렉터 쪽 문제다.

#### 2. 접근성 위반을 일부러 만들기

`a11y.spec.ts`가 검사하는 `/orders` 페이지에는 `<img>`도 아이콘 버튼도 없다. `<h1>` 위에 `alt` 없는 이미지(`<img src="/file.svg" width={16} height={16} />`)를 잠깐 하나 넣고 axe 스캔을 다시 돌린다.

8.6의 `console.dir`로 그 위반이 어떤 `id`와 `help` 메시지로 잡히는지 확인한다.

어떤 위반으로 잡히는가?

**답**

1. `console.dir`에 `id: 'image-alt'`, `impact: 'critical'`, `help: 'Images must have alternative text'`, 대상 셀렉터 `[ [ 'img' ] ]`가 찍힌다.

2. `expect(results.violations).toEqual([])`가 실패하고, diff의 `+`쪽에 그 위반 객체(`description`, `helpUrl`, `nodes` 등)가 통째로 나온다.

3. 넣은 이미지를 지우면 다시 통과한다.

> `alt` 없음은 규칙으로 판별되는 문제라 자동 스캔이 바로 잡는다.

## 9. 완성 확인

- [ ] `npx vitest run`의 모든 테스트가 통과한다

- [ ] 3단계에서 `--sequence.shuffle`로 테스트 순서에 따라 결과가 달라지는 것을 재현했고, `__resetForTests`로 고쳤다

- [ ] `npx playwright test`의 두 테스트가 모두 통과한다

- [ ] `expect(...).toBeVisible()`이 왜 자동 대기가 필요한지 설명할 수 있다

- [ ] axe-core가 잡을 수 있는 것과 못 잡는 것을 구분해서 말할 수 있다

## 10. 다음 단계

### 자가 점검

1. 단위 테스트와 e2e 테스트는 무엇이 다른가? 이 문서에서 각각 어떤 걸 검사했는가?

2. `orders` 배열이 테스트마다 초기화되지 않으면 왜 문제가 생기는가?

3. Fastify의 `app.inject()`가 하는 일은? Express였다면 무엇으로 대신하는가?

4. Playwright의 `toBeVisible()`이 즉시 실패하지 않고 재시도하는 이유는?

5. axe-core 스캔이 통과했다고 그 페이지가 완전히 접근 가능하다고 할 수 있는가?

### 이 문서에서 다루지 않은 것

존재만 언급한다.

- 모킹(`vi.mock`), 스냅샷 테스트, 테스트 커버리지 측정

- 시각적 회귀 테스트(Playwright 스크린샷 비교)

- 실제 DB를 띄워서 하는 통합 테스트(Testcontainers)

- CI 파이프라인에 이 테스트들을 실제로 연결하는 법