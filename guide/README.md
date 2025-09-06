# Fastify & WebSocket: 주문 API 실시간 확장

## 목표

Express/Nest가 아닌 Fastify로 백엔드를 짜 보고, 다른 방식(전체 방송)의 WebSocket과 비교해 보기위한 프로젝트다.

주문 API를 Fastify로 다시 만들고, 주문이 새로 생성되면 연결된 모든 클라이언트에 실시간으로 알려주는 WebSocket 기능을 붙인다.

```sh
# 터미널 1: 연결해두고 대기
node scratch-client.mjs
# 연결됨

# 터미널 2
curl -X POST localhost:4000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'
{"id":203,"user":"choi","price":9000,"paid":true}

# 터미널 1에 실시간으로 찍힌다
받음: {"event":"order.created","data":{"id":203,"user":"choi","price":9000,"paid":true}}
```

## 0. 전제

### 1. 플러그인 스코프 격리: C의 `static`(파일 스코프)과 같은 발상

Express의 `Router()`는 URL 접두사만 나눌 뿐, 그 안에서 선언한 건 사실상 전역이나 다름없었다(같은 모듈 스코프를 공유).

Fastify의 플러그인은 **플러그인 함수 하나가 자기만의 격리된 스코프를 가지고, 그 안에서 `fastify.decorate(...)`로 추가한 것은 기본적으로 바깥에서 안 보인다**는 점이 다르다.

C에서 `.c` 파일 맨 위에 `static int counter;`나 `static void helper(void) {...}`로 선언하면, 그 변수·함수는 같은 파일 안에서만 보이고 다른 `.c` 파일에서는 링크조차 안 된다.

정말 다른 파일에 공개하고 싶다면 `static`을 빼고 헤더에 선언(`extern`)해야 한다. 

이것과 같은 발상이다.

```c
// order_plugin.c: static은 이 파일 밖으로 새어나가지 않는다
static int orders_count = 0; // main.c에서는 안 보인다
```

```ts
// orders.plugin.ts
// 플러그인 스코프 밖(main.ts)으로 새어나가지 않는다
fastify.decorate("ordersCount", () => orders.length); // main.ts에서는 undefined
```

Fastify에서 "바깥에 공개"하는 방법(`fastify-plugin` 패키지로 감싸기)은 C에서 `static`을 떼고 헤더에 선언을 노출하는 것과 같은 역할을 한다.

> 기본값이 "격리(캡슐화)"이고, 공개는 명시적으로 선택해야 한다는 방향이 같다.

### 2. WebSocket: 요청-응답이 아니라 열린 연결

한 번 연결(핸드셰이크)하면 그 TCP 연결을 계속 열어두고 서버가 먼저 데이터를 보낼 수 있다. C로 짠 `accept()` 이후의 지속 연결 소켓과 원리가 같다.

이 프로젝트가 `foundation/05-ws-gateway`와 다른 지점은 대상이다. `05`는 room(그룹)에 속한 특정 사용자에게만 보냈지만, 여기서는 연결된 **모든 클라이언트**에게 방송(broadcast)한다.

## 1. 준비

```sh
mkdir order-api-fastify && cd order-api-fastify
npm init -y
npm pkg set type=module
npm install fastify zod fastify-type-provider-zod
npm install -D typescript tsx @types/node ws @types/ws
mkdir src
```

- `fastify`: 웹 서버 프레임워크

- `zod`: 검증 라이브러리

- `fastify-type-provider-zod`: Fastify 라우트의 검증·타입을 zod 스키마로 처리하게 해 주는 연결 패키지

- `tsx`는 TS를 컴파일 없이 실행하고, `ws`는 WebSocket 라이브러리, `@types/*`는 타입 정의다.

`tsconfig.json`과 `scripts`는 최소본을 쓴다(`types: ["node"]`, `include: ["src"]` 포함, `dev`/`typecheck`/`build`/`start`).

> Fastify 5, zod 4, `fastify-type-provider-zod` 7 기준이다.

> 규모가 큰 프로젝트는 여러 패키지(`apps/*`, `packages/*` 등)를 pnpm workspace로 묶어 서로를 `@my-app/shared`처럼 내부 패키지 이름으로 import하기도 한다.  
> 이 프로젝트는 단일 패키지로 충분해서 직접 구성하지는 않는다.  
> 그런 구조를 만나면 "폴더마다 자기 `package.json`이 있고, 루트의 `pnpm-workspace.yaml`이 그것들을 묶는다"는 정도만 알아두면 낯설지 않다.  

## 2. 1단계: 최소 Fastify 서버

```ts
// src/main.ts
import Fastify from "fastify";

const app = Fastify({ logger: true }); // 요청 로깅이 내장되어 있다. epxress에서 직접 짠 로깅 미들웨어가 필요 없다

app.get("/health", async () => {
  return { ok: true }; // return한 값을 Fastify가 그대로 JSON 응답으로 보낸다. res.json() 호출이 없다
});

// PORT 환경변수가 있으면 그 포트를, 없으면 4000번을 쓴다(웹 화면이 쓰는 3000번과 겹치지 않게)
const PORT = Number(process.env.PORT ?? 4000);
app.listen({ port: PORT }, () => console.log(`http://localhost:${PORT}`));
```

```sh
npx tsx src/main.ts
curl -i localhost:4000/health

# 출력
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 11
Date: Fri, 09 Oct 2026 19:11:59 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"ok":true}%
```

### Fastify API

- `Fastify({ logger: true })`: 앱 인스턴스를 만든다. `logger: true`면 요청/응답을 자동으로 로그에 남긴다.

- `app.get(경로, 핸들러)`: GET 요청을 처리한다. async 핸들러가 돌려준 값이 응답 본문이 된다.

- `app.listen({ port }, 콜백)`: 그 포트에서 요청을 받기 시작한다. 준비되면 콜백이 실행된다.

#### 반환값이 곧 응답이다

Fastify의 async 핸들러는 Promise를 돌려주고, Fastify는 그 Promise가 완료된 값을 받아 JSON으로 직렬화해 보낸다.

응답을 "보내는 함수 호출"이 따로 없으니, 응답을 정하는 것은 `return` 한 줄뿐이다.

그래서 `return`을 빠뜨리면 에러 없이 **빈 응답**이 나간다.

```ts
app.get("/health", async () => {
  const body = { ok: true }; // 만들기만 하고 return하지 않았다
});
// curl -i localhost:4000/health
// 200, Content-Length: 0 (본문이 비어 있다)
```

async 함수는 `return`이 없으면 `undefined`로 완료되는 Promise를 돌려준다.

Fastify는 이를 "보낼 본문이 없다"로 받아 200과 빈 본문을 보낸다.

서버 로그에도 에러가 남지 않아서, 클라이언트 쪽에서 "응답이 비었다"는 증상으로만 드러난다.

| 핸들러 모양 | 응답을 보내는 방법 | `return`을 빠뜨리면 |
| --- | --- | --- |
| `async () => {...}` | 값을 `return` | 200, 빈 본문 |
| `() => {...}`(async 아님) | `reply.send(값)` 호출 | 응답이 나가지 않아 요청이 멈춘다 |

- 이 문서의 핸들러는 전부 async로 쓰고 값을 `return`한다. 상태 코드만 바꿀 때는 `reply.code(201)`을 부른 뒤 값은 그대로 `return`한다.

- 화살표 함수의 짧은 본문(`async () => ({ ok: true })`)은 `return`을 쓰지 않아도 값을 돌려준다.

> C 함수에서 반환값을 계산만 하고 `return`을 빠뜨리면 호출자가 쓰레기 값을 받는 것처럼, 여기서는 클라이언트가 빈 본문을 받는다.  
> C 컴파일러는 `-Wall`에서 경고라도 해 주지만, 여기서는 타입 검사도 서버 로그도 조용하다.

### Express와 바로 다른 점

- Logger가 내장돼 있어서 요청마다 자동으로 로그 줄이 찍힌다.

- 핸들러는 `res.json(...)`을 호출하는 대신 **값을 반환**하면 Fastify가 알아서 직렬화해서 보낸다.

## 3. 2단계: 스키마로 검증하기

Express에서는 핸들러 안에서 `parseOrThrow(schema, data)`를 호출해 검증했다.

Fastify는 검증 규칙을 **라우트를 등록하는 시점에** 선언한다. 이 방식이 `fastify-type-provider-zod`를 통해 zod 스키마로도 그대로 된다.

```ts
// src/main.ts
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.get(
  "/health",
  { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
  async () => ({ ok: true }), // 소괄호로 감싸야 {}가 함수 본문이 아니라 객체로 해석된다
);

const PORT = Number(process.env.PORT ?? 4000);
app.listen({ port: PORT }, () => console.log(`http://localhost:${PORT}`));
```

`schema.response`는 "이 라우트가 실제로 무엇을 돌려주는지"를 선언해두는 것이다.

나가는 응답도 검증 대상이 된다. 들어오는 요청만 검증하던 Express의 zod 사용법과 다른 지점이다.

### Fastify API

- `ZodTypeProvider`: zod 스키마로부터 요청/응답의 TS 타입을 자동으로 추론하게 해 주는 설정이다.

- `.withTypeProvider<ZodTypeProvider>()`: 이 앱의 라우트에서 zod 스키마를 타입 추론에 쓰겠다고 선언한다.

- `app.setValidatorCompiler(validatorCompiler)`: 요청(params/query/body)을 zod로 검사하게 한다.

- `app.setSerializerCompiler(serializerCompiler)`: 응답을 zod로 검사·직렬화하게 한다.

- `app.get(경로, 옵션, 핸들러)`: 두 번째 인자로 라우트 옵션(`schema`)을 넘긴다.

- `schema.response[200]`: 상태 코드 200일 때 응답이 이 모양이어야 한다는 선언이다.

#### 응답 스키마는 나가는 값을 검사하고 거른다

`serializerCompiler`를 등록하면, 핸들러가 `return`한 값은 바로 JSON이 되지 않고 먼저 `schema.response`의 zod 스키마를 통과한다.

결과는 두 갈래다.

```ts
const HealthSchema = z.object({ ok: z.boolean() });

// 스키마에 없는 필드는 응답에서 빠진다
app.get("/health", { schema: { response: { 200: HealthSchema } } }, async () => ({ ok: true, secret: "pw" }));
// curl localhost:4000/health
// {"ok":true}

// 스키마와 모양이 다르면 응답 대신 500이 나간다
app.get("/health", { schema: { response: { 200: HealthSchema } } }, async () => ({ ok: "yes" }));
// curl localhost:4000/health
// {"statusCode":500,"code":"FST_ERR_RESPONSE_SERIALIZATION","error":"Internal Server Error","message":"Response doesn't match the schema"}
```

| 반환값 | `schema.response`가 없을 때 | 있을 때 |
| --- | --- | --- |
| 스키마에 없는 필드가 섞임 | 그대로 나간다 | 그 필드만 빠지고 나간다 |
| 필드 타입이 다름 | 그대로 나간다 | 500 |

- 필드가 빠지는 건 zod의 `z.object`가 모르는 키를 버리기 때문이다. 비밀번호 해시 같은 내부 필드가 실수로 응답에 섞여도 밖으로 새지 않는다.

- 모양이 틀린 응답은 클라이언트 탓이 아니라 서버 코드의 버그라서 400이 아니라 500이다. 서버 로그에는 `ResponseSerializationError`가 남는다.

- `schema.response`를 적지 않은 라우트(3단계의 `/totals` 등)는 이 검사 없이 반환값이 그대로 직렬화된다.

> 요청 스키마가 "들어오는 값"을 막는 문이라면, 응답 스키마는 "나가는 값"을 막는 문이다. 둘 다 같은 zod 스키마로 적는다.

## 4. 3단계: 주문 라우트와 플러그인

Fastify는 기능 단위를 **플러그인**으로 나눈다. Express의 `Router()` + `app.use("/orders", router)`에 대응한다.

```ts
// src/orders.plugin.ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

export type Order = { id: number; user: string; price: number; paid: boolean };

// 모듈 최상위의 배열은 서버가 켜져 있는 동안 모든 요청이 공유한다
const orders: Order[] = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 102, user: "lee", price: 8000, paid: false },
  { id: 103, user: "kim", price: 5000, paid: true },
  { id: 201, user: "lee", price: 30000, paid: true },
  { id: 202, user: "park", price: 7000, paid: true },
];
let nextId = 203; // 다음에 발급할 주문 번호

const OrderSchema = z.object({
  id: z.number().int(), user: z.string().min(1), price: z.number().positive(), paid: z.boolean(),
});
const CreateOrderSchema = OrderSchema.omit({ id: true }); // 생성 요청에는 id가 없다

// 인자로 받은 fastify 인스턴스에 라우트를 등록한다. Express의 Router()에 대응한다
export const ordersPlugin: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get("/", { schema: { querystring: z.object({ paid: z.enum(["true", "false"]).optional() }) } }, async (req) => {
    const { paid } = req.query;
    // paid가 없으면 전체, 있으면 문자열 "true"와 비교해 boolean으로 바꿔 필터한다
    return paid === undefined ? orders : orders.filter((o) => o.paid === (paid === "true"));
  });

  fastify.get("/totals", async () => {
    // 결제 완료만 거른 뒤 사용자 이름별 합계를 객체 하나로 접는다
    return orders.filter((o) => o.paid).reduce<Record<string, number>>((acc, o) => {
      acc[o.user] = (acc[o.user] ?? 0) + o.price;
      return acc;
    }, {});
  });

  fastify.get("/:id", { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req) => {
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) throw new Error(`order ${req.params.id} not found`); // 4단계에서 상태 코드가 붙는 에러로 바꾼다
    return order;
  });

  fastify.post("/", { schema: { body: CreateOrderSchema } }, async (req, reply) => {
    const order: Order = { id: nextId++, ...req.body }; // 검증을 통과한 본문 필드를 펼쳐 넣는다
    orders.push(order);
    reply.code(201); // 201 Created
    return order;
  });
};
```

```ts
// src/main.ts: 
// import는 맨 위에, register는 /health 라우트 아래(app.listen 위)에
import { ordersPlugin } from "./orders.plugin.js";
app.register(ordersPlugin, { prefix: "/orders" });
```

```sh
curl localhost:4000/orders/totals
{"kim":17000,"lee":30000,"park":7000}

curl localhost:4000/orders/abc
{"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"params/id Invalid input: expected number, received NaN"}%
```

Express에서 핸들러 안에 직접 쓴 `Number.isInteger` 검사를 `schema.params`가 대신했다.

반면 `curl localhost:4000/orders/999`는 아직 500이다(`throw new Error`에 상태 코드 정보가 없다).

### zod API

- `.int()`: 정수만 통과시킨다.

- `.min(1)`: 문자열 길이가 1 이상이어야 한다.

- `.positive()`: 0보다 커야 한다.

- `.omit({ id: true })`: `id` 필드를 뺀 새 스키마를 만든다.

- `z.enum(["true", "false"]).optional()`: 두 문자열 중 하나이거나 아예 없어야 한다.

- `z.coerce.number()`: 문자열 `"101"`을 숫자로 변환한 뒤 검사한다. 아래 같은 절에서 다룬다.

#### 쿼리스트링과 경로 매개변수는 항상 문자열이다

URL은 글자들이다. `/orders/101`의 `101`도, `?paid=true`의 `true`도 서버에 도착하면 문자열 `"101"`, `"true"`다.

JSON 본문은 `9000`과 `"9000"`을 구분하지만, URL에는 그런 구분이 없다.

그래서 `schema.params`에 `z.number()`를 그대로 쓰면 숫자 주문 번호도 400이 된다.

```ts
fastify.get("/:id", { schema: { params: z.object({ id: z.number().int() }) } }, ...);
// curl localhost:4000/orders/101
// {"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"params/id Invalid input: expected number, received string"}
```

`z.coerce.number()`는 검사 전에 `Number(값)`으로 먼저 바꾼다.

`"abc"`는 `NaN`이 되어 위에서 본 `received NaN`으로 걸러진다.

같은 방법을 불리언에 쓰면 함정이 있다.

`z.coerce.boolean()`은 `Boolean(값)`으로 바꾸는데, 빈 문자열이 아닌 문자열은 전부 `true`다.

```ts
z.coerce.boolean().parse("true");  // true
z.coerce.boolean().parse("false"); // true: "false"도 빈 문자열이 아니다
```

이 값으로 필터하면 `?paid=false`를 보내도 결제 완료 주문만 돌아온다.

그래서 이 문서는 `z.enum(["true", "false"])`로 두 문자열만 받고, 핸들러에서 `paid === "true"`로 직접 비교한다.

| 받는 값 | 쓴 스키마 | 이유 |
| --- | --- | --- |
| 경로의 `id` | `z.coerce.number().int()` | `Number("101")`은 믿을 만하다 |
| 쿼리의 `paid` | `z.enum(["true", "false"])` | `Boolean("false")`가 `true`라서 변환을 쓰지 않는다 |
| 본문의 `price`, `paid` | `z.number()`, `z.boolean()` | JSON은 타입을 그대로 실어 온다 |

- `z.coerce.number()`는 빈 문자열을 `0`으로 바꿔 통과시킨다(`Number("")`가 `0`). 0이 허용되면 안 되는 값이면 `.positive()`를 같이 건다.

> C의 `main(int argc, char *argv[])`에서 `argv`가 전부 문자열이라 `atoi`로 바꿔 써야 했던 것과 같다. URL도 숫자를 문자열로만 실어 온다.

### Fastify API

- `FastifyPluginAsyncZod`: zod 타입 프로바이더가 적용된 플러그인 함수의 타입이다.

- `schema.querystring`: 쿼리스트링(`?paid=true`)을 검증한다. 통과한 값은 `req.query`에 타입과 함께 들어온다.

- `/:id`: 콜론(`:`)이 붙은 자리는 경로 매개변수다. `schema.params`로 검증한다.

- `schema.body`: 요청 본문을 검증한다.

- `reply`: 핸들러의 두 번째 인자로, 상태 코드 같은 응답 설정을 맡는다. `reply.code(201)`처럼 쓴다.

- `app.register(플러그인, { prefix })`: 플러그인의 모든 경로 앞에 `prefix`를 붙여 앱에 연결한다(플러그인은 자기 스코프를 갖는다).

### 플러그인 타입을 `FastifyPluginAsyncZod`로 적는 이유

`main.ts`에서 `withTypeProvider<ZodTypeProvider>()`를 붙인 건 `app` 변수 하나의 타입이다.

플러그인 함수는 별도 파일에서 `fastify` 인자를 받으므로, 이 인자에도 "zod 스키마로 타입을 추론하라"는 정보를 따로 줘야 한다.

Fastify 기본의 `FastifyPluginAsync`로 적으면 검증은 런타임에 똑같이 되지만 **타입 추론이 끊긴다**.

`req.query`, `req.params`, `req.body`가 전부 `unknown`이 되고 `npm run typecheck`가 `Property 'paid' does not exist on type 'unknown'` 같은 에러를 낸다.

### Express와 달라지는 지점

`/totals`를 `/:id` 아래에 등록해도 문제가 생기지 않는다.

`orders.plugin.ts`에서 `/totals` 라우트를 `/:id` 아래로 옮기고 다시 요청해도 결과가 똑같다.

Fastify의 라우터는 등록 순서와 무관하게 **정적 경로(`/totals`)를 파라미터 경로(`/:id`)보다 항상 먼저** 매칭한다.

> Express/NetJS에서 두 번이나 겪은 "순서 함정"이 여기서는 애초에 성립하지 않는다.

## 5. 4단계: 에러 처리

`src/http.ts`를 만든다.

```ts
// 기본 Error에 HTTP 상태 코드를 더한 에러 종류
export class HttpError extends Error {
  // readonly statusCode: 매개변수를 읽기 전용 필드 this.statusCode로도 만드는 TS 축약 문법
  constructor(readonly statusCode: number, message: string) { super(message); }
}
```

`orders.plugin.ts`의 `/:id`가 `HttpError`를 던지도록 고친다.

```ts
import { HttpError } from "./http.js";
// ...
if (!order) throw new HttpError(404, `order ${req.params.id} not found`); // 404 Not Found
```

`main.ts`에 전역 에러 핸들러를 등록한다.

```ts
// src/main.ts 
// import는 맨 위에 추가(첫 줄의 Fastify import도 이렇게 바꾼다).
// setErrorHandler는 setSerializerCompiler 아래에.
import Fastify, { type FastifyError } from "fastify";
import { HttpError } from "./http.js";

app.setErrorHandler<FastifyError>((err, req, reply) => {
  if (err instanceof HttpError) { reply.code(err.statusCode).send({ error: err.message }); return; }
  if (err.validation) { reply.code(400).send({ error: err.message }); return; } // 스키마 검증 실패
  // 잘못된 JSON 본문처럼 Fastify가 스스로 4xx로 분류한 에러는 그 상태 코드를 그대로 쓴다
  if (err.statusCode && err.statusCode < 500) { reply.code(err.statusCode).send({ error: err.message }); return; }
  // 예상 못 한 에러는 서버 로그에만 자세히 남기고, 클라이언트에는 일반 문구만 보낸다
  req.log.error(err);
  reply.code(500).send({ error: "Internal Server Error" });
});
```

`<FastifyError>`를 빼면 `npm run typecheck`가 `'err' is of type 'unknown'`으로 막는다.

세 번째 `if`를 빼면 `-d 'not json'` 같은 깨진 본문이 400이 아니라 500(`Internal Server Error`)으로 떨어진다.

Fastify의 JSON 파서가 붙인 `statusCode: 400`을 버리게 되기 때문이다.

```sh
curl -i localhost:4000/orders/999
# 출력, price가 음수이고 user가 빈 문자열이라 스키마 검증에 걸리는 요청 → 400
HTTP/1.1 404 Not Found
content-type: application/json; charset=utf-8
content-length: 31
Date: Sat, 10 Oct 2026 09:23:37 GMT
Connection: keep-alive
Keep-Alive: timeout=72

curl -i -X POST localhost:4000/orders -H "Content-Type: application/json" -d '{"user":"","price":-5}'
# 출력
HTTP/1.1 400 Bad Request
content-type: application/json; charset=utf-8
content-length: 182
Date: Sat, 10 Oct 2026 09:23:43 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"error":"body/user Too small: expected string to have >=1 characters, body/price Too small: expected number to be >0, body/paid Invalid input: expected boolean, received undefined"}%
```

### Fastify API

- `app.setErrorHandler(핸들러)`: 라우트에서 발생한 모든 에러가 모이는 전역 핸들러를 등록한다. `(err, req, reply)`를 받는다.

- `<FastifyError>`: Fastify 5는 `err`를 기본으로 `unknown` 취급한다(아무 값이나 throw될 수 있으니까). `err.validation` 같은 필드를 쓰려면 "여기 오는 에러는 `FastifyError` 모양"이라고 알려 준다.

- `err.validation`: 스키마 검증에 실패했을 때 Fastify가 채워 주는 필드다.

- `err.statusCode`: Fastify가 스스로 분류한 에러의 상태 코드다.

- `reply.code(상태).send(본문)`: 상태 코드를 정하고 응답을 바로 보낸다.

- `req.log.error(err)`: 내장 로거로 에러를 남긴다.

#### `reply.send` 뒤에 `return`을 두는 이유

1단계의 라우트 핸들러는 값을 `return`해서 응답했다.

에러 핸들러는 그와 달리 `reply.send(...)`를 직접 불러서 보낸다.

`send`는 응답을 보낼 뿐 함수를 끝내지 않으므로, 그 아래 코드는 계속 실행된다.

`return;`을 빼면 404를 보낸 뒤에도 마지막 줄까지 내려가서 500을 한 번 더 보내려 한다.

```ts
app.setErrorHandler<FastifyError>((err, req, reply) => {
  if (err instanceof HttpError) { reply.code(err.statusCode).send({ error: err.message }); } // return이 없다
  // ...
  reply.code(500).send({ error: "Internal Server Error" }); // 여기까지 내려온다
});
```

클라이언트는 처음 보낸 404를 정상적으로 받는다.

HTTP 응답은 한 번 나가면 되돌릴 수 없어서 두 번째 `send`는 무시되고, 서버 로그에만 경고가 남는다.

`curl localhost:4000/orders/999`를 보내면 응답은 404 그대로이고, 서버 로그에 이런 `warn`(`level` 40) 줄이 찍힌다.

```sh
{"level":40,...,"err":{"type":"FastifyError","message":"Reply was already sent, did you forget to \"return reply\" in \"/orders/999\" (GET)?",...}}
```

- 응답은 맞게 나가는데 로그에 경고가 쌓이는 증상이라 놓치기 쉽다. 경고 문구 그대로 "`return`을 빠뜨렸다"를 먼저 의심한다.

- `return reply.code(404).send(...)`처럼 한 줄로 써도 같다.

> C의 `switch`에서 `break`를 빠뜨리면 다음 `case`로 흘러내리는 것과 같은 실수다. `send`는 `break`가 아니다.

### Express와 달라지는 지점

Express에서는 Express 5가 되고 나서야([4→5]) async 핸들러의 throw를 자동으로 에러 경로에 넘겼다.

Fastify는 처음부터 이게 기본 동작이었다. `try/catch`로 감싸거나 `next(err)`를 부를 필요가 없다.

## 6. 5단계: 플러그인 캡슐화 함정

Fastify 플러그인은 격리된 스코프를 갖는다. `orders.plugin.ts` 안에서 아래처럼 데코레이터를 하나 추가해본다.

```ts
// orders.plugin.ts
...
export const ordersPlugin: FastifyPluginAsyncZod = async (fastify) => {
fastify.decorate("ordersCount", () => orders.length);

fastify.get("/", { schema: { querystring: z.object({ paid: z.enum(["true", "false"]).optional() }) } }, async (req) => {
...
```

그리고 `main.ts`에서 이걸 써본다.

확인하는 **시점**이 중요하다. `app.register(...)`는 플러그인을 "등록 예약"만 하고 바로 실행하지 않는다.

플러그인이 실제로 다 로드된 뒤를 보려면 `app.ready()` 콜백 안에서 확인한다.

```ts
// main.ts
...
app.register(ordersPlugin, { prefix: "/orders" });
// (app as any): 타입 검사를 잠깐 꺼서 타입에 없는 ordersCount를 읽어 본다(호출하지 않고 값이 있는지만 본다).
console.log("register 직후:", (app as any).ordersCount); // undefined: 플러그인이 아직 실행되지도 않았다
app.ready(() => console.log("ready 후:", (app as any).ordersCount)); // 그래도 undefined: 이게 캡슐화다
```

두 줄 모두 `undefined`가 찍힌다. 첫 줄은 타이밍 탓이라 증거가 못 되지만, **플러그인이 다 로드된 뒤인 두 번째 줄도 `undefined`다.**

`fastify.decorate`로 추가한 건 그 플러그인 스코프 안에서만 보인다.

`orders.plugin.ts`를 벗어난 `main.ts`에서는 안 보인다.

여러 기능을 나눠 등록해도 서로의 내부 구현이 새어나가지 않게 하려는 의도적 설계다.

정말 상위 스코프까지 노출하고 싶다면 `fastify-plugin` 패키지로 감싼다. 그러면 `ready 후:`에 함수가 찍힌다.

```sh
npm install fastify-plugin
```

```ts
import fp from "fastify-plugin";
...
app.get("/health", { schema: { response: { 200: z.object({ ok: z.boolean() }) } } }, async () => ({ ok: true }));
app.register(fp(ordersPlugin), { prefix: "/orders" });
console.log("register 직후:", (app as any).ordersCount);
...
```

단, 부작용이 있다. `fp`는 "캡슐화를 하지 않는다"는 표시라서, 스코프에 딸린 `prefix` 옵션도 함께 무시된다.

실제로 해보면 `/orders/totals`가 404가 되고 `/totals`로 옮겨 가 있다.

> 그래서 `fp`는 라우트 묶음이 아니라 "데코레이터·훅만 공개하는 작은 플러그인"(예: DB 연결을 `fastify.db`로 공개)에 쓰고, 라우트 플러그인은 캡슐화된 채로 둔다.

### Fastify API

- `fastify.decorate(이름, 값)`: fastify 인스턴스에 새 속성/메서드를 추가한다. 하지만 이 플러그인의 스코프 안에서만 보인다.

- `app.ready(콜백)`: 등록된 플러그인이 전부 로드된 뒤 콜백을 실행한다.

## 7. 6단계: WebSocket 연결 관리

```sh
npm install @fastify/websocket # Fastify에서 WebSocket 경로를 등록하게 해 주는 공식 플러그인
```

연결된 클라이언트를 관리하고 방송하는 로직을 별도 파일로 뺀다.

```ts
// src/realtime.ts
import type { WebSocket } from "ws";

// 지금 연결된 클라이언트(소켓)들. 모듈 최상위라 모든 요청이 공유한다
const clients = new Set<WebSocket>();

export function addClient(socket: WebSocket) {
  clients.add(socket);
  socket.on("close", () => clients.delete(socket)); // 연결이 끊기면 목록에서 제거. 안 하면 죽은 소켓에 계속 보내려 한다
}

export function broadcast(event: string, data: unknown) {
  const payload = JSON.stringify({ event, data }); // WebSocket으로는 문자열을 보낸다
  for (const client of clients) client.send(payload);
}
```

```ts
// src/main.ts: import는 맨 위에, 나머지는 setErrorHandler 아래(/health 라우트 위)에
import websocketPlugin from "@fastify/websocket";
import { addClient } from "./realtime.js";

// 플러그인을 등록하고 준비될 때까지 기다린다(최상위 await는 ESM 파일에서 쓸 수 있다)
await app.register(websocketPlugin);
app.get("/ws", { websocket: true }, (socket) => addClient(socket));
```

`await`가 중요하다. `@fastify/websocket`은 "라우트가 등록되는 순간" 끼어드는 훅(`onRoute`)으로 `{ websocket: true }` 옵션을 처리한다.

`await` 없이 바로 `app.get("/ws", ...)`를 쓰면 플러그인이 아직 로드되기 전이라 그 훅이 없다. 그러면 `/ws`가 평범한 HTTP 라우트로 등록돼 버린다.

`orders.plugin.ts`의 POST 핸들러에서 생성 직후 방송한다.

```ts
// orders.plugin.ts
import { broadcast } from "./realtime.js";
// ...
fastify.post("/", { schema: { body: CreateOrderSchema } }, async (req, reply) => {
  const order: Order = { id: nextId++, ...req.body };
  orders.push(order);
  // 연결된 모든 클라이언트에게 "order.created" 이벤트와 새 주문을 보낸다
  broadcast("order.created", order);
  reply.code(201);
  return order;
});
```

### ws API

- `socket.on("close", 콜백)`: 연결이 끊길 때 실행할 함수를 등록한다.

- `client.send(문자열)`: 그 클라이언트에게 메시지를 보낸다.

#### 메시지는 문자열이나 바이트로 오간다

WebSocket이 실어 나르는 것은 텍스트 아니면 바이트다.

HTTP 핸들러처럼 객체를 돌려주면 알아서 JSON으로 바꿔 주는 단계가 없다.

그래서 `broadcast`는 보내기 전에 직접 `JSON.stringify`를 부른다.

```ts
client.send({ event, data }); // 객체를 그대로 넘기면
// TypeError: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received an instance of Object

client.send(JSON.stringify({ event, data })); // 문자열로 바꿔서 보낸다
```

받는 쪽도 대칭이다. `ws` 라이브러리는 받은 메시지를 문자열이 아니라 `Buffer`(바이트 덩어리)로 넘긴다.

이후 클라이언트가 `data.toString()`을 부르는 이유다. 객체로 다루려면 그 문자열을 다시 `JSON.parse`한다.

```js
ws.on("message", (data) => {
  console.log(Buffer.isBuffer(data)); // 출력: true
  const msg = JSON.parse(data.toString()); // { event: "order.created", data: {...} }
});
```

| 방향 | HTTP 핸들러(Fastify) | WebSocket(`ws`) |
| --- | --- | --- |
| 보낼 때 | 객체를 `return`하면 Fastify가 JSON으로 바꾼다 | 직접 `JSON.stringify` |
| 받을 때 | `req.body`가 이미 객체다 | `Buffer` → `toString()` → `JSON.parse` |

- `{ event, data }`처럼 이벤트 이름과 내용을 한 객체에 담는 모양은 이 문서가 정한 약속이다. WebSocket에는 "이벤트 이름" 개념이 따로 없어서, 받는 쪽은 `msg.event`를 보고 직접 분기한다.

> C 소켓의 `write`가 바이트만 받아서, 구조체를 보내려면 바이트 배치를 정해 직렬화해야 했던 것과 같다.  
> 다만 여기서는 바이트 배치 대신 JSON 텍스트를 약속으로 쓴다.

### @fastify/websocket API

- `{ websocket: true }`: 이 경로는 HTTP가 아니라 WebSocket 연결을 받는다. 연결된 소켓이 핸들러의 인자로 들어온다.

### 여기 쓰인 것들

#### 열려 있는 양방향 연결

WebSocket은 HTTP와 달리 한 번 연결되면 계속 열려 있는 양방향 통신이다.

Express에서 다룬 요청-응답 모델(한 번 요청하면 한 번 응답받고 끝)과 근본적으로 다르다.

#### 모듈 스코프 상태

`clients`는 모듈 스코프 상태다.

Express 프로젝트의 `orders.store.ts`에서 본 "모든 요청이 공유하는 상태"와 같은 성질이 여기서는 "연결된 모든 클라이언트"를 추적하는 데 쓰인다.

#### 연결 정리 책임

`close` 이벤트에서 정리하지 않으면 끊긴 연결에 계속 `send`를 시도하게 된다.

> 서버 하나가 여러 클라이언트를 상대할 때 자원을 정리하는 책임이 항상 따라온다는 걸 보여주는 최소 예다.

## 8. 7단계: 테스트 클라이언트로 확인하기

간단한 Node 스크립트를 클라이언트로 써서 방송을 직접 본다.

`order-api-fastify` 폴더 바로 아래(`package.json` 옆)에 만든다. 1장에서 devDependencies로 설치한 `ws`를 거기서 찾는다.

```js
// scratch-client.mjs
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:4000/ws");
ws.on("open", () => console.log("연결됨"));
// 받은 데이터는 Buffer(바이트 덩어리)라서 toString()으로 문자열로 바꿔 출력한다
ws.on("message", (data) => console.log("받음:", data.toString()));
```

```sh
# 터미널 1
npx tsx src/main.ts

# 터미널 2
node scratch-client.mjs
# 연결됨

# 터미널 3
curl -X POST localhost:4000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'
```

터미널 2에 `받음: {"event":"order.created","data":{"id":203,"user":"choi","price":9000,"paid":true}}`가 즉시 찍힌다.

터미널을 하나 더 열어 같은 스크립트를 또 실행해두면, POST 한 번에 **두 클라이언트 모두** 받는다. `broadcast`가 `clients` 전체를 순회하기 때문이다.

### ws API

- `new WebSocket(주소)`: 서버에 연결한다. `ws://`는 WebSocket용 주소 방식이다(HTTP의 `http://`에 해당). 연결은 이 줄에서 끝나지 않으며, 아래 "연결은 비동기로 열린다"에서 다룬다.

- `ws.on("open", 콜백)`: 연결에 성공했을 때 실행된다.

- `ws.on("message", 콜백)`: 서버로부터 메시지를 받았을 때 실행된다. 받은 `data`가 `Buffer`인 이유는 "메시지는 문자열이나 바이트로 오간다"에서 봤다.

#### 연결은 비동기로 열린다

`new WebSocket(...)`은 연결을 **시작**만 하고 바로 돌아온다.

핸드셰이크는 그 뒤에 네트워크를 오가며 진행되고, 끝나면 `open` 이벤트가 온다. 그 전에 `send`를 부르면 에러가 난다.

```js
const ws = new WebSocket("ws://localhost:4000/ws");
ws.send("hi");
// Error: WebSocket is not open: readyState 0 (CONNECTING)
```

보내는 코드는 `open` 콜백 안에 둔다.

```js
const ws = new WebSocket("ws://localhost:4000/ws");
ws.on("open", () => {
  console.log("연결됨");
  ws.send("hi"); // 여기서는 연결이 열려 있다
});
```

`readyState`는 연결 상태를 숫자로 담는다.

| 값 | 이름 | 뜻 |
| --- | --- | --- |
| 0 | `CONNECTING` | 핸드셰이크 중 |
| 1 | `OPEN` | 주고받을 수 있다 |
| 2 | `CLOSING` | 닫는 중 |
| 3 | `CLOSED` | 닫혔다 |

서버 쪽 소켓은 핸들러에 들어올 때 이미 `OPEN`이라서, 6단계의 `addClient`는 이 걱정 없이 바로 보낼 수 있다.

반대로 이미 `CLOSED`가 된 소켓에 `send`하면 에러를 던지지 않고 조용히 버려진다.

"연결 정리 책임"에서 `close` 때 목록에서 지우는 이유가 이것이다.

실패가 드러나지 않으니 죽은 소켓이 쌓여도 모른다.

> C에서 논블로킹 소켓의 `connect()`가 `EINPROGRESS`를 돌려주고, 쓰기 가능해질 때까지 기다린 뒤에야 `write`하는 것과 같은 구조다.

## 9. 8단계: 플러그인 경계와 방송 상태 디버깅하기

JavaScript와 Express의 디버깅 기법(`--inspect-brk`, VS Code 브레이크포인트, 에러 스택 읽기)은 여기서도 그대로 쓴다.

Fastify에서 새로 필요한 건 **플러그인 스코프 경계**와 **지금 연결된 클라이언트 목록**을 들여다보는 방법이다.

### 9.1 Fastify 내장 로거(pino)의 레벨을 낮춰서 직접 심은 상세 로그 보기

`Fastify({ logger: true })`는 `info` 레벨이라 요청마다 `incoming request`와 `request completed` 두 줄만 찍는다.

레벨을 낮추면 그보다 낮은 `debug`·`trace` 로그도 찍힌다.

```ts
const app = Fastify({ logger: { level: "trace" } }).withTypeProvider<ZodTypeProvider>();
```

단, Fastify 자체는 요청을 처리하면서 `debug`·`trace` 로그를 남기지 않는다. 

바꾼 뒤 정상 요청, 404, 400, 201을 보내 봐도 바꾸기 전과 같은 `info` 줄만 나온다.

이 설정이 쓸모 있는 건 코드에 직접 심어 둔 상세 로그를 켤 때다. `orders.plugin.ts`의 `GET /` 핸들러에 한 줄 넣어 본다.

```ts
const { paid } = req.query;
req.log.trace({ paid }, "쿼리 확인"); // 기본(info)에서는 안 찍히고, trace로 낮췄을 때만 찍힌다
```

`curl "localhost:4000/orders?paid=true"`를 보내면 `{"level":10,...,"reqId":"req-2","paid":"true","msg":"쿼리 확인"}`이 찍힌다. `req.log`로 남긴 줄에는 그 요청의 `reqId`가 붙어서, 같은 `reqId`의 `incoming request` 줄과 이어 볼 수 있다.

> Express의 `DEBUG=express:*`처럼 레벨만 올리면 내부 로그가 나오는 스위치는 아니다.  
> 평소에는 꺼 두고 싶은 상세 로그를 미리 심어 두고, 필요할 때 레벨만 낮춰 켜는 스위치다.

### 9.2 스키마 검증 실패 원인을 `err.validation`에서 펼쳐보기

4단계의 에러 핸들러는 검증 실패를 `{"error": err.message}`로 뭉뚱그려 보여준다.

어떤 필드가 왜 실패했는지 상세히 보려면 `err.validation` 배열을 그대로 찍어본다.

```ts
app.setErrorHandler<FastifyError>((err, req, reply) => {
  if (err.validation) {
    console.dir(err.validation, { depth: null }); // instancePath, message, params가 필드별로 들어있다
    reply.code(400).send({ error: err.message });
    return;
  }
  // ...
});
```

`price`에 음수, `user`에 빈 문자열을 보내면 이렇게 찍힌다.

```
[
  {
    keyword: 'too_small',
    instancePath: '/user',
    schemaPath: '#/user/too_small',
    message: 'Too small: expected string to have >=1 characters',
    params: { origin: 'string', minimum: 1, inclusive: true },
    ...
  },
  {
    keyword: 'too_small',
    instancePath: '/price',
    ...
  }
]
```

TypeScript에서 zod의 `safeParse` 결과를 `console.dir`로 펼쳐보던 것과 같은 습관이다.

> Fastify가 스키마 검증을 라우트 등록 시점으로 옮겼을 뿐, "실패 원인을 구조화된 형태로 확인한다"는 디버깅 방법 자체는 같다.

### 9.3 플러그인 스코프 문제: "분명 등록했는데 안 보인다"

0장에서 정리한 캡슐화 때문에, 플러그인 안에서 등록한 게 왜 안 보이는지 헷갈릴 때가 있다. 확인 순서는 항상 같다.

1. 그 기능을 **등록한 플러그인 함수 안**에서는 보이는가?  
플러그인 내부에서 `console.log(fastify.ordersCount)`를 찍어본다.  
C에서 `static` 변수가 같은 파일 안에서는 정상적으로 보이는지 먼저 확인하는 것과 같다.

2. 보인다면, 바깥 스코프에서 안 보이는 게 의도된 캡슐화다.  
`fastify-plugin`으로 감쌌는지 확인한다.

3. 플러그인 내부에서도 안 보인다면 등록 순서 문제다.  
Fastify는 `app.register(...)`가 실행된 순서대로 플러그인을 로드하므로, `decorate`보다 그걸 쓰는 코드가 먼저 등록됐을 수 있다.

### 9.4 지금 연결된 WebSocket 클라이언트 수를 직접 확인하기

7단계에서 "두 클라이언트 모두 받는다"를 눈으로 확인했는데, 안 될 때는 `clients` 목록 자체가 비어있는 건 아닌지부터 본다.

```ts
// realtime.ts: 디버깅 동안만 추가
export function debugClients() {
  console.log("연결된 클라이언트 수:", clients.size);
}
```

`broadcast` 호출 직전에 `debugClients()`를 넣어보면 "메시지를 보냈는데 아무도 못 받았다"는 문제를 절반으로 좁힐 수 있다.

- 애초에 `clients`가 비어 있어서인가(연결이 실제로는 안 됐거나 `close`에서 이미 지워졌음)

- 아니면 클라이언트 쪽 리스너(`ws.on("message", ...)`) 문제인가

### 9.5 라우트 매칭 우선순위를 코드로 직접 확인하기

3단계에서 "정적 경로가 항상 먼저 매칭된다"고 설명했는데, Fastify는 이 라우팅 트리를 직접 출력해주는 기능이 있다.

```ts
app.ready(() => {
  console.log(app.printRoutes());
});
```

```text
└── /
    ├── ws (GET, HEAD)
    ├── health (GET, HEAD)
    └── orders (GET, HEAD, POST)
        └── / (GET, HEAD, POST)
            ├── totals (GET, HEAD)
            └── :id (GET, HEAD)
```

`/totals`와 `/:id`가 실제로 어떤 트리 구조로 등록됐는지 텍스트로 그려서 보여준다. `GET`을 등록하면 `HEAD`가 자동으로 따라붙는다는 것도 보인다.

> "왜 순서를 바꿔도 안전한지" 추측 대신 라우터 내부 구조로 직접 확인할 수 있다.

### 시험해보기

```sh
npx tsx --inspect-brk src/main.ts
```

`orders.plugin.ts`의 POST 핸들러 안, `broadcast("order.created", order)` 호출 다음 줄에 브레이크포인트를 찍고 주문을 하나 생성해, 그 시점에 `clients.size`가 몇인지 직접 확인한다.

### 도전 과제

#### 1. 라우팅 트리 출력해 보기

`main.ts`에 아래 줄을 추가해 라우팅 트리를 출력한다.

```ts
app.ready(() => console.log(app.printRoutes()));
```

`/totals`를 `/:id` 아래로 옮겨도 트리 구조상 정적 경로가 항상 먼저 오는지 확인한다.

옮기기 전과 후에 트리가 어떻게 달라지는가?

**답**

1. 옮기기 전과 후의 출력이 똑같다. 두 번 모두 `/` 아래에 `totals (GET, HEAD)`가 먼저, `:id (GET, HEAD)`가 그 다음에 그려진다.

2. 옮긴 상태에서도 `curl localhost:4000/orders/totals`는 `{"kim":17000,"lee":30000,"park":7000}`, `curl localhost:4000/orders/101`은 101번 주문을 돌려준다.

> 트리는 코드에 적은 순서가 아니라 라우터가 정한 순서(정적 경로 먼저)로 만들어진다. 그래서 등록 순서를 바꿔도 매칭 결과가 그대로다.

#### 2. 검증 실패 위치 비교하기

4단계의 에러 핸들러에 9.2의 `console.dir(err.validation, ...)`을 추가한다.

`price`에 음수를 보냈을 때와 `user`를 빈 문자열로 보냈을 때 `instancePath`가 각각 어떻게 다른지 비교한다.

**답**

1. `price`만 음수(`{"user":"choi","price":-5,"paid":true}`)면 배열에 항목이 하나뿐이고 `instancePath: '/price'`, `keyword: 'too_small'`, `params: { origin: 'number', minimum: 0, inclusive: false }`다.

2. `user`만 빈 문자열(`{"user":"","price":9000,"paid":true}`)이면 역시 하나뿐이고 `instancePath: '/user'`, `params: { origin: 'string', minimum: 1, inclusive: true }`다.

3. 응답 본문의 `message`도 그 필드만 담는다. 각각 `body/price Too small: expected number to be >0`, `body/user Too small: expected string to have >=1 characters`다.

> `instancePath`는 본문 안에서 실패한 필드의 위치다. 여러 필드가 한꺼번에 틀리면 9.2처럼 필드마다 항목이 하나씩 쌓인다.

## 10. 완성 확인

- [ ] `curl localhost:4000/orders/totals`가 Express와 같은 값을 낸다

- [ ] 라우트 등록 순서를 바꿔도 `/totals`가 정상 매칭되는 것을 확인했다(3단계)

- [ ] 4단계의 에러 응답(404, 400)이 정상 동작한다

- [ ] 5단계의 플러그인 캡슐화 함정을 직접 재현했다

- [ ] 두 개의 `scratch-client.mjs`를 동시에 띄운 상태에서 주문을 생성하면 둘 다 받는 것을 확인했다

## 11. 다음 단계

### 자가 점검

1. Fastify 핸들러가 `res.json()` 대신 값을 반환하는 것과, Express가 `res.json()`을 명시적으로 부르는 것의 차이는?

2. Express/NestJS에서 두 번 겪은 라우트 순서 함정이 Fastify에서는 왜 문제가 안 되는가?

3. 플러그인 안에서 `fastify.decorate`로 추가한 게 다른 스코프에 안 보이는 이유는? 왜 이렇게 설계됐을까?

4. WebSocket 연결과 HTTP 요청-응답은 근본적으로 무엇이 다른가?

5. `close` 이벤트에서 `clients`를 정리하지 않으면 무슨 문제가 생기는가?

### Express와의 대조

| 관심사 | Express | Fastify |
|---|---|---|
| 검증 | 핸들러 안에서 `parseOrThrow` 직접 호출 | 라우트 등록 시점에 `schema`로 선언 |
| 응답 | `res.json(...)` 명시적으로 호출 | 반환값을 자동 직렬화 |
| 라우트 순서 | 먼저 등록된 것이 먼저 매칭(정적/파라미터 무관) | 정적 경로가 항상 우선 |
| async 에러 | Express 5부터 자동 전파 | 처음부터 자동 전파 |
| 기능 분리 | `Router()`: 스코프 격리 없음 | 플러그인: 스코프가 격리됨(`decorate` 등) |

### 이 문서에서 다루지 않은 것

존재만 언급한다.

- 여러 클라이언트를 "방(room)" 단위로 묶기, 재연결 로직, 여러 서버 인스턴스에 걸친 WebSocket 상태 공유(Redis Pub/Sub 등)
- WebSocket 연결 인증: "HTTP의 Guard/미들웨어가 WS 연결에는 그대로 적용되지 않는다"는 함정을 이미 겪었을 것이다. 원리는 여기서도 같다(연결 시점에 직접 토큰을 검증해야 한다).