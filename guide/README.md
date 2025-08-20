# Express: 주문 API

## 목표

JavaScript로 작성된 주문 데이터를 인메모리로 서빙하는 REST API를 만든다.

```sh
curl localhost:3000/orders/totals
{"kim":17000,"lee":30000,"park":7000}

curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'
{"id":203,"user":"choi","price":9000,"paid":true}
```

> Express 5 기준(Node 18 이상)이다. 인터넷의 예제·답변은 4 기준이 많아, 5에서 달라지는 지점에는 **[4→5]** 표시를 붙인다.

### curl 옵션

- `curl 주소`: 터미널에서 HTTP 요청을 보내는 도구다. 주소만 주면 GET 요청을 보낸다.
- `-X POST`: HTTP 메서드를 POST(데이터를 만들어 달라는 요청)로 지정한다.
- `-H "..."`: 요청 헤더를 붙인다. `Content-Type: application/json`은 "본문이 JSON이다"라는 표시다.
- `-d '...'`: 요청 본문(body)으로 보낼 데이터다.

## 0. 사전지식

이 문서에서 만드는 Express 주문 API를 이해하기 위해 필요한 HTTP의 기본 모양과 JavaScript/TypeScript의 핵심 개념 5가지를 정리한다.

HTTP는 서버가 주고받는 데이터의 형식 그 자체이고, 이벤트 루프 기반의 비동기 처리와 TypeScript의 타입 검증 시스템은 서버 개발에서 가장 흔하게 발생하는 버그와 성능 병목을 예방하는 기본 바탕이 된다.

### 1. HTTP 요청과 응답의 모양

Express가 다루는 `req`와 `res`는 결국 아래 텍스트를 객체로 바꿔 놓은 것이다. 그래서 HTTP 자체의 모양을 먼저 본다.

#### 요청과 응답은 텍스트다

요청은 **요청줄 → 헤더들 → 빈 줄 → 본문** 순서의 텍스트다. `curl localhost:3000/orders/101`이 실제로 보내는 바이트는 다음과 같다.

```text
GET /orders/101 HTTP/1.1  ← 요청줄: 메서드, 경로(+쿼리), 프로토콜 버전
Host: localhost:3000      ← 헤더: 이름: 값
Accept: */*
                          ← 빈 줄: 여기까지가 헤더라는 신호
```

GET에는 본문이 없어서 빈 줄로 끝난다. POST는 빈 줄 뒤에 본문이 붙는다.

```text
POST /orders HTTP/1.1
Host: localhost:3000
Content-Type: application/json  ← 본문이 어떤 형식인지
Content-Length: 40              ← 본문이 몇 바이트인지

{"user":"choi","price":9000,"paid":true}
```

응답도 같은 구조다. 첫 줄만 요청줄 대신 **상태줄**이다.

```text
HTTP/1.1 200 OK                  ← 상태줄: 버전, 상태 코드, 짧은 설명
Content-Type: application/json
Content-Length: 11

{"ok":true}
```

이 구조가 그대로 Express의 객체에 1:1로 대응된다.

| HTTP 텍스트 | 요청에서 | 응답에서 |
|---|---|---|
| 첫 줄의 메서드 | `req.method` | - |
| 첫 줄의 경로·쿼리 | `req.url`, `req.path`, `req.query` | - |
| 첫 줄의 상태 코드 | - | `res.statusCode`, `res.status(코드)` |
| 헤더 | `req.headers` | `res.setHeader(이름, 값)` |
| 본문 | `req.body`(파싱 미들웨어가 채운다) | `res.json(...)`, `res.send(...)`, `res.end(...)` |

`req`/`res`의 각 속성이 어떤 값을 담는지는 2단계부터 코드와 함께 하나씩 확인한다.

> C에서 소켓으로 읽은 한 덩어리의 문자열을 `\r\n`마다 끊어 메서드·경로·헤더 구조체로 채워 넣는 일이, Express에서는 `req` 객체가 만들어지는 과정에 해당한다.

#### URL의 구조

주소 한 줄은 여러 조각이 붙어 있는 것이다.

```text
http://localhost:3000/orders/101?paid=true#top
└──┘   └───────┘ └──┘└─────────┘ └───────┘ └─┘
 scheme  host    port   path       query   fragment
```

| 조각 | 예 | 뜻 |
|---|---|---|
| scheme | `http` | 통신 규칙. `https`면 암호화된 연결이다 |
| host | `localhost` | 접속할 서버. `localhost`는 내 컴퓨터다 |
| port | `3000` | 그 서버의 몇 번 창구인지. `http`의 기본값은 80이라 `:80`은 생략된다 |
| path | `/orders/101` | 서버 안에서 어떤 자원인지. Express가 라우팅에 쓰는 부분이다 |
| query | `paid=true` | `?` 뒤의 `이름=값` 목록. `&`로 여러 개를 잇는다(`?paid=true&user=kim`) |
| fragment | `top` | 브라우저가 문서 안에서 이동할 위치. **서버로 전송되지 않는다** |

- 요청줄에 들어가는 것은 **path부터 query까지**다. scheme과 host는 "어디로 연결할지"를 정하는 데 쓰이고, host는 `Host` 헤더로 따로 전달된다.
- 그래서 서버가 보는 `req.url`은 `http://localhost:3000`이 빠진 `"/orders/101?paid=true"`다.

#### HTTP 메서드

메서드는 "이 경로에 무엇을 하고 싶은지"를 나타내는 동사다. 같은 경로라도 메서드가 다르면 다른 요청이다.

| 메서드 | 뜻 | 본문 | 이 문서에서 |
|---|---|---|---|
| `GET` | 조회한다. 서버 상태를 바꾸지 않는다 | 없음 | `GET /orders`, `GET /orders/:id` |
| `POST` | 새로 만든다. 보낼 때마다 하나씩 더 생긴다 | 있음 | `POST /orders` |
| `PUT` | 해당 자원을 보낸 내용으로 **통째로** 교체한다 | 있음 | 다루지 않음 |
| `PATCH` | 해당 자원의 **일부 필드만** 바꾼다 | 있음 | 다루지 않음 |
| `DELETE` | 삭제한다 | 보통 없음 | 다루지 않음 |

- `GET`과 `DELETE`, `PUT`은 같은 요청을 여러 번 보내도 결과가 같다(멱등). `POST`는 보낸 횟수만큼 자원이 늘어나므로 멱등하지 않다.
- `curl`은 주소만 주면 `GET`을 보내고, `-X POST`로 메서드를 바꾼다.
- Express에서는 메서드마다 등록 함수가 따로 있다(`app.get`, `app.post`, `app.put`, `app.patch`, `app.delete`). 메서드를 가리지 않고 받으려면 `app.all`을 쓴다.

#### 상태 코드는 첫 자리가 분류다

상태 코드는 세 자리 숫자이고, **첫 자리가 결과의 큰 분류**다. 숫자를 외우기보다 첫 자리로 "누구 잘못인지"를 먼저 읽는 것이 중요하다.

| 분류 | 뜻 | 대표 코드 |
|---|---|---|
| `1xx` | 정보 전달. "계속 진행하라" 같은 중간 응답이고 최종 결과가 아니다 | `100 Continue`, `101 Switching Protocols`(WebSocket 전환) |
| `2xx` | 성공 | `200 OK`, `201 Created`, `204 No Content`(성공했지만 본문 없음) |
| `3xx` | 리다이렉션. "다른 주소로 가라" | `301 Moved Permanently`, `304 Not Modified`(캐시 그대로 써라) |
| `4xx` | **클라이언트 잘못**. 요청이 잘못됐으니 고쳐서 다시 보내야 한다 | `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found` |
| `5xx` | **서버 잘못**. 요청은 멀쩡한데 서버가 처리에 실패했다 | `500 Internal Server Error`, `503 Service Unavailable` |

이 문서에서 실제로 쓰는 코드는 다섯 개다.

| 코드 | 언제 | 이 문서에서 |
|---|---|---|
| `200 OK` | 조회 성공 | `res.json(...)`의 기본값 |
| `201 Created` | 새 자원을 만들었다 | `POST /orders` 성공 |
| `400 Bad Request` | 요청의 형식·값이 잘못됐다 | zod 검증 실패, `/orders/abc` |
| `404 Not Found` | 그런 자원이나 경로가 없다 | `/orders/999`, 없는 경로 |
| `500 Internal Server Error` | 서버에서 예상 못 한 에러가 났다 | 에러 핸들러의 기본값 |

- 4xx와 5xx의 구분이 실무에서 가장 중요하다. 5단계의 에러 핸들러가 `status >= 500`일 때만 콘솔에 상세 에러를 남기고 클라이언트에는 내부 정보를 숨기는 이유가 이것이다. 4xx는 클라이언트가 고칠 수 있는 정보라 그대로 알려 주고, 5xx는 알려 줄 것이 없거니와 알려 주면 위험하다.
- `1xx`와 `3xx`는 이 문서에서 직접 만들지 않지만, 브라우저로 서버를 열면 `304`는 흔히 보게 된다. 2단계의 `ETag` 헤더와 짝을 이루는 코드다.

### 2. 이벤트 루프(Event Loop)

#### 개념과 작동 원리

Node.js는 단일 스레드(Single Thread) 기반의 이벤트 루프 모델로 동작한다. 모든 JavaScript 코드는 메인 스레드(Call Stack)에서 한 번에 하나씩 실행된다.

네트워크 요청이나 타이머 같은 비동기 I/O 작업이 발생하면 Node.js는 이를 백그라운드(libuv의 스레드 풀이나 OS 커널의 비동기 I/O)로 던져두고, 메인 스레드는 즉시 다음 코드를 실행한다.

백그라운드 작업이 완료되면 콜백이 태스크 큐(Task Queue)에 쌓이고, Call Stack이 비어있을 때 이벤트 루프가 이를 하나씩 가져와 실행한다.

```js
console.log("1. 시작");

// 0ms 뒤로 예약해도, 현재 실행 중인 코드가 모두 끝난 뒤에야 콜백이 실행된다
setTimeout(() => {
  console.log("2. 비동기 작업 완료 (타이머)");
}, 0);

console.log("3. 종료");

// 출력:
// 1. 시작
// 3. 종료
// 2. 비동기 작업 완료 (타이머)
```

#### 동기 블로킹(Blocking)의 위험성

Node.js 서버가 아무리 요청을 빠르게 처리하더라도, 핸들러 내부에서 무한 루프나 무거운 연산 같은 동기(Synchronous) 코드가 오랫동안 돌면 Call Stack 점유가 해제되지 않는다.

이 동안 이벤트 루프가 멈추므로 **뒤이어 들어오는 모든 다른 사용자 요청까지 응답하지 못하고 대기 상태**에 빠진다.

#### C 관점에서 보기

C로 서버를 짜봤다면 두 가지 동시성 모델 중 하나를 골랐을 것이다.

1. `fork()`나 `pthread_create()`로 연결마다 OS 스레드나 프로세스를 새로 띄우는 모델(Apache 계열)
2. `select()`/`epoll()`로 파일 디스크립터 하나의 이벤트 루프에서 준비된 소켓만 골라 처리하는 모델(nginx 계열)

Node.js의 이벤트 루프는 후자와 같은 계열이다. 단, C에서는 `epoll_wait()`가 돌려준 fd마다 어떤 콜백을 부를지 직접 배열이나 해시맵에 등록해 관리해야 했다면, Node/libuv는 그 등록과 디스패치를 런타임이 대신해 주는 차이만 있다.

```c
// C의 단일 스레드 이벤트 루프 골격. Node의 이벤트 루프와 같은 계열
while (1) {
    int n = epoll_wait(epfd, events, MAX_EVENTS, -1); // 콜 스택이 빌 때까지 대기하는 지점과 같다
    for (int i = 0; i < n; i++) {
        // 준비된 fd에 등록해둔 콜백(함수 포인터)을 호출. Node가 태스크 큐에서 콜백을 꺼내는 것과 같다
        handler_table[events[i].data.fd](events[i].data.fd);
    }
}
```

C의 `select`/`epoll` 루프에서 콜백 하나가 `while(1){}`처럼 안 끝나면 루프 전체가 다음 `epoll_wait()`로 못 넘어가 다른 모든 fd의 이벤트도 함께 멈춘다. Node에서 동기 코드가 이벤트 루프를 막는 것과 정확히 같은 실패 모드다.

반대로 `fork()`/`pthread_create()` 모델은 한 연결이 블로킹돼도 다른 프로세스나 스레드는 OS 스케줄러가 계속 돌려준다는 점에서 Node와 근본적으로 다르다. Node에는 그런 "여벌 스레드"가 없다는 뜻이다.

> 정확히는 I/O 자체는 libuv의 스레드 풀, 커널 비동기 기능이 처리하지만 작성한 JS 콜백 코드는 항상 메인 스레드 하나에서만 실행된다.

### 3. `async/await`와 비동기 에러 전달

`Promise`의 비동기 흐름을 동기식 코드처럼 읽기 쉽게 작성하게 해주는 문법이다.

#### 기본 동작

`async` 키워드가 붙은 함수는 항상 `Promise`를 반환한다.

함수 내부에서 `await`를 만나면 해당 `Promise`가 처리(Resolve)될 때까지 해당 비동기 함수의 실행만 일시 정지하고, 메인 스레드는 다른 요청을 처리하러 떠난다. 작업이 완료되면 멈췄던 지점부터 실행을 재개한다.

```js
// 안에서 throw하면 이 함수가 반환한 Promise가 실패(reject) 상태가 된다
async function fetchOrder(id) {
  // 이 함수만 멈추고 이벤트 루프는 다른 요청을 받으러 간다
  const response = await fetch(`/orders/${id}`);
  // 상태 코드가 200~299가 아니면 실패로 본다
  if (!response.ok) throw new Error("Order Not Found");
  return await response.json();
}
```

#### Express에서의 예외 전달

비동기 핸들러 내부에서 발생한 예외(`throw new Error()`)나 Rejection은 `try/catch` 블록으로 잡거나 호출자에게 전달해야 한다.

- Express 4 이하: `async` 핸들러 내부에서 던져진 에러가 미들웨어 체인으로 자동 전달되지 않아 서버가 무한 대기하거나 다운되었다. 반드시 `try/catch`로 감싸 `next(err)`를 직접 불러야 했다.

- Express 5 **[4→5]**: `async` 함수가 에러를 던지면 Express가 이를 감지하여 자동으로 에러 핸들러 미들웨어로 전달한다.

### 4. TypeScript 타입과 Zod 런타임 검증

TypeScript의 타입 시스템과 Zod 검증 라이브러리의 역할을 구분하여 데이터 안전성을 확보한다.

#### TypeScript 타입의 한계(컴파일 타임)

TypeScript의 타입 검사는 코드를 빌드(`tsc`)하는 컴파일 단계에서만 작동하며, JavaScript로 변환된 후에는 타입 정보가 완벽히 사라진다(Type Erasure).

따라서 **`req.body`나 `req.query`처럼 외부(클라이언트)에서 들어오는 데이터는 TypeScript 타입만으로 안전성을 보장할 수 없다.**

```ts
type CreateOrderInput = { user: string; price: number };

app.post("/orders", (req, res) => {
  // as는 컴파일러에게 "이 타입이다"라고 우길 뿐, 실행 중에 검사하지 않는다.
  // 클라이언트가 {"price": "abc"}를 보내도 막지 못한다.
  const input = req.body as CreateOrderInput;
});
```

#### Zod 런타임 검증(Runtime Validation)

Zod는 실제 코드가 돌아가는 런타임 시점에 들어온 데이터의 스키마 구조와 조건을 직접 검사한다.

```ts
import { z } from "zod";

// 1. 런타임 검증 스키마 정의
export const CreateOrderSchema = z.object({
  user: z.string().min(1), // 문자열이면서 길이가 1 이상(빈 문자열 불가)
  price: z.number().positive(), // 숫자이면서 0보다 커야 한다
  paid: z.boolean(),
});

// 2. 스키마로부터 TypeScript 타입 추론
export type CreateOrder = z.infer<typeof CreateOrderSchema>;

// 3. safeParse로 런타임 값 검증. 실패해도 던지지 않고 { success, data | error }를 돌려준다
const result = CreateOrderSchema.safeParse(req.body);
if (!result.success) {
  // 어떤 필드가 왜 틀렸는지 담은 배열
  console.log(result.error.issues);
}
```

#### `z.infer`: 스키마 하나로 타입까지 얻는다

같은 모양을 타입으로 한 번, 스키마로 또 한 번 적으면 둘이 어긋나기 시작한다. `z.infer`는 **이미 적어 둔 스키마에서 TypeScript 타입을 꺼내 주는** 도구라서, 선언을 한 곳에만 두게 해 준다.

```ts
const CreateOrderSchema = z.object({
  user: z.string().min(1),
  price: z.number().positive(),
  paid: z.boolean(),
});

// typeof CreateOrderSchema: "값"인 스키마 변수에서 그 변수의 "타입"을 꺼낸다
// z.infer<...>: 그 스키마가 통과시키는 데이터의 타입을 꺼낸다
type CreateOrder = z.infer<typeof CreateOrderSchema>;
// 결과: { user: string; price: number; paid: boolean }
```

- `typeof`가 두 번 등장하는 것처럼 보이지만 다른 것이다. 런타임의 `typeof x === "string"`과 달리, **타입을 쓰는 자리에 오는 `typeof`는 "이 변수의 타입"을 뜻하는 TypeScript 문법**이다.
- `.min(1)`이나 `.positive()` 같은 조건은 타입에 남지 않는다. "1자 이상인 문자열" 같은 타입은 TypeScript에 없기 때문이다. 길이·범위 조건은 런타임에 zod가, 모양(`string`인지 `number`인지)은 컴파일 타임에 TypeScript가 각각 맡는다.
- 방향이 **스키마 → 타입**인 것이 핵심이다. 타입을 먼저 쓰고 스키마를 맞추는 반대 방향으로는 자동화할 수 없다. 타입 정보는 컴파일하면 사라지지만 스키마는 런타임에 남는 실제 객체이기 때문이다.

#### 타입을 조립하는 도구: `Omit`과 `Record`

이미 있는 타입에서 새 타입을 만들 때 쓰는 TypeScript 내장 도구다. 둘 다 4단계의 `orders.store.ts`에 나온다.

`Omit<T, "키">`는 T에서 그 키만 **뺀** 타입이다. 주문의 `id`는 서버가 발급하므로, 생성 입력에는 `id`가 없어야 한다.

```ts
type Order = { id: number; user: string; price: number; paid: boolean };

// Order와 똑같은데 id만 없는 타입. 필드 셋을 다시 적지 않는다
type OrderInput = Omit<Order, "id">; // { user: string; price: number; paid: boolean }

function addOrder(input: OrderInput): Order {
  return { id: nextId++, ...input };
}
```

- 반대로 **고를** 때는 `Pick<Order, "id" | "user">`를 쓴다(`{ id: number; user: string }`).
- zod에도 같은 역할의 `OrderSchema.omit({ id: true })`가 있다. 스키마 쪽에서 `omit`한 뒤 `z.infer`로 타입을 꺼내면, 타입과 검증을 한 번에 맞출 수 있다. 5단계가 이 방식을 쓴다.

`Record<K, V>`는 **키가 K 타입이고 값이 V 타입인 객체**를 뜻한다. 사용자 이름별 합계처럼 키 이름을 미리 알 수 없는 객체에 쓴다.

```ts
// { kim: 17000, lee: 30000, park: 7000 } 처럼 문자열 키에 숫자 값이 붙은 객체
type Totals = Record<string, number>;
// { id: number; user: string; ... } 같은 고정 필드 객체와 달리, 키 이름을 열어 둔 것이다
```

- `Record<string, number>`의 값에 접근하면 TypeScript는 그 키가 실제로 있는지 모른다. 그래서 4단계 코드가 `acc[o.user] ?? 0`처럼 `?? 0`으로 "없으면 0"을 깔고 더한다.
- C의 관점에서는 `struct Order`(필드가 고정된 구조체)와 해시 테이블(키를 런타임에 넣는 자료구조)의 차이에 해당한다.

#### C 관점에서 보기

외부에서 온 `req.body`는 C에서 `void*`로 받은 원시 바이트 버퍼를 다루는 상황과 같다. `void*`는 어떤 구조체를 가리키는지 컴파일러가 모르기 때문에 멤버에 바로 접근(`.`)할 수 없고, 반드시 구체적인 포인터 타입으로 캐스팅해야 한다.

TS의 `unknown`이 이와 같다. `.user`, `.price`에 접근하려면 먼저 "이건 `CreateOrderInput` 모양이다"라고 좁혀야(narrowing) 하며, 컴파일러가 그 전까지는 막아준다.

> 주의할 점은 `@types/express`가 `req.body`를 `unknown`이 아니라 `any`로 정의한다는 것이다. `any`는 컴파일러가 아무것도 막지 않으므로 `req.body.user`를 바로 써도 통과한다. 그래서 `parseOrThrow(schema, data: unknown)`처럼 `unknown`으로 받아 zod로 좁힌 값만 쓴다.

```c
// 소켓에서 읽은 원시 바이트를 구조체로 해석하는 상황
void handle_request(void *raw_body, size_t len) {
    // 검증 없이 그냥 캐스팅. TS의 `as CreateOrderInput`과 같은 실수다.
    // 실제 메모리 배치가 CreateOrderInput과 다르면 컴파일은 되지만 실행 중 쓰레기 값을 읽거나 크래시한다.
    CreateOrderInput *input = (CreateOrderInput *)raw_body;

    // 필드 하나하나 매직 넘버까지 직접 검사한 뒤에야 신뢰한다. Zod의 safeParse가 자동으로 해주는 일이다
    if (len < sizeof(CreateOrderInput)) { /* 에러 처리 */ }
}
```

즉 `req.body as CreateOrderInput`(TS의 `as`)은 C의 `(CreateOrderInput *)raw_body`처럼 컴파일러를 설득할 뿐 실제 메모리(값)가 그 모양인지는 보장하지 않는다.

Zod의 `safeParse`는 바이너리 프로토콜을 파싱할 때 매직 넘버와 필드 길이를 한 바이트씩 직접 확인하던 방어 코드를, 스키마 선언 하나로 대신해 주는 것과 같다.

### 5. `tsconfig.json`과 `tsx`(컴파일과 도구)

TypeScript 서버 프로젝트를 구동하기 위한 핵심 도구 체인이다.

#### `tsconfig.json` 옵션

TypeScript 컴파일러가 코드를 해석하고 검사하는 규칙을 정한다. `tsconfig.json`은 TypeScript가 주석을 허용해서 읽는 JSON이다(일반 JSON에서는 주석이 안 된다).

```json
{
  "compilerOptions": {
    "target": "es2022", // 최신 JS 문법 기능으로 컴파일
    "module": "nodenext", // Node.js의 ESM(Import/Export) 모듈 시스템 규칙 적용
    "strict": true, // 암묵적 any, null 검사 등 모든 엄격한 타입 검사 옵션 활성화
    "skipLibCheck": true, // node_modules 내부 라이브러리 타입 선언 파일 검사 생략 (빌드 속도 향상)
    "rootDir": "src", // 소스 파일 위치
    "outDir": "dist" // 컴파일된 JS 파일이 저장될 위치
  }
}
```

#### `tsx`(TypeScript Execute)

Node.js는 `.ts` 파일을 직접 실행하지 못한다. `tsx`는 내부적으로 `esbuild`를 사용해 TypeScript 코드의 타입을 빠르게 지우고 메모리상에서 Node.js가 즉시 실행할 수 있게 해주는 개발용 러너(Runner) 도구다.

```sh
# watch를 붙이면 src 파일 변경을 감지해 서버를 자동으로 재시작한다
npx tsx watch src/main.ts
```

## 1. 준비

```sh
mkdir order-api && cd order-api
npm init -y
# 이 프로젝트의 .js/.ts를 ESM(import/export 문법)으로 해석하게 한다
npm pkg set type=module
# express: 웹 서버 프레임워크 / zod: 검증 라이브러리
npm install express zod
# @types/*는 해당 라이브러리의 타입 정의 모음이다
npm install -D typescript tsx @types/node @types/express
mkdir src
npm ls express # express@5.x인지 확인
```

`tsconfig.json`과 `scripts`는 최소본으로 작성한다. `types: ["node"]`는 Node 내장 API의 타입 정의(`@types/node`)를 쓰겠다는 뜻이다.

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "start": "node dist/main.js"
  }
}
```

- `dev`: 저장하면 서버가 자동으로 다시 시작된다.
- `typecheck`: 타입 검사만 하고 결과 파일은 만들지 않는다.
- `build`: `src`의 TS를 `dist`의 JS로 컴파일한다.
- `start`: 컴파일된 JS를 Node로 실행한다.

#### 다른 Express 프로젝트에서 다르게 보이는 것

이 문서는 ESM(`"type": "module"`, 상대 경로에 `.js` 확장자)으로 진행한다.

그런데 실무 프로젝트 중에는 `package.json`에 `"type"`이 없는(=CommonJS) 경우도 많다. `tsconfig.json`의 `moduleResolution: "nodenext"`이 CJS 패키지에서는 확장자 없는 `import { x } from "./foo"`를 그대로 허용하기 때문에, import 문에 `.js`가 안 붙어 있어도 정상이다.

문법(`import`/`export`)은 똑같이 쓰고, TS가 컴파일할 때 내부적으로 CommonJS(`require`)로 바꿔줄 뿐이다.

## 2. 1단계: Express 없이 서버 열어보기

Express가 뭘 대신 해주는지 먼저 본다. `src/scratch.ts`에 순수 Node `http`로 서버를 연다.

```ts
import http from "node:http";

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    // 본문이 JSON 형식임을 클라이언트에게 알린다
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.statusCode = 404; // 찾을 수 없음
    res.end("Not Found");
  }
}).listen(3000, () => console.log("http://localhost:3000"));
```

```sh
npx tsx src/scratch.ts
# -i: 응답 본문뿐 아니라 상태줄과 헤더(HTTP/1.1 200 OK 등)도 함께 출력한다
curl -i localhost:3000/health
HTTP/1.1 200 OK
Content-Type: application/json
Date: Thu, 08 Oct 2026 09:20:06 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Content-Length: 11

{"ok":true}%
```

Express 프레임워크가 없으면 URL·메서드 분기, 헤더 설정, JSON 직렬화를 전부 손으로 작성해야한다.

### Node http API

- `node:http`: Node에 내장된 HTTP 모듈이다. `node:` 접두사는 "설치한 패키지가 아니라 내장 모듈"이라는 표시다.
- `http.createServer(콜백)`: 요청이 올 때마다 콜백을 실행하는 서버 객체를 만든다. `req`는 요청, `res`는 응답이다.
- `req.method` / `req.url`: HTTP 메서드(GET, POST...)와 요청 경로다. `req.url`에는 쿼리스트링까지 붙어 있으며, 아래 "`req.url`에는 쿼리스트링이 붙어 있다"에서 다룬다.
- `res.setHeader(이름, 값)`: 응답 헤더를 설정한다.
- `res.statusCode`: 응답 상태 코드를 정한다.
- `res.end(본문)`: 본문을 보내고 응답을 끝낸다.
- `.listen(포트, 콜백)`: 해당 포트에서 요청을 받기 시작한다. 준비되면 콜백이 실행된다.

#### `req.url`에는 쿼리스트링이 붙어 있다

`req.url`은 요청줄(`GET /health?x=1 HTTP/1.1`)의 두 번째 칸을 그대로 담은 문자열이다. 경로와 `?` 뒤의 쿼리스트링을 나눠 주지 않는다.

그래서 위 서버에 쿼리스트링을 하나만 붙여도 `req.url === "/health"` 비교가 실패해 404가 된다.

```sh
curl "localhost:3000/health?x=1" # Not Found
# 서버 쪽 req.url 값: "/health?x=1"
```

순수 `http`로 경로와 쿼리를 나누려면 `URL` 객체로 직접 파싱해야 한다.

```ts
// req.url은 경로만 있으므로 아무 기준 주소나 붙여 완전한 URL로 만든다
const url = new URL(req.url ?? "/", "http://localhost");
url.pathname; // "/health"
url.searchParams.get("x"); // "1"
```

| 할 일 | `node:http` | Express |
|---|---|---|
| 경로 비교 | `req.url` 문자열을 직접 비교(쿼리 포함) | `app.get("/health")`가 경로만 비교 |
| 쿼리 읽기 | `URL`로 직접 파싱 | `req.query`(4단계) |

- Express로 바꾸면 `curl "localhost:3000/health?x=1"`도 `{"ok":true}`를 받는다. 라우팅이 경로 부분만 보고 매칭하기 때문이다.
- `req.url`의 타입은 `string | undefined`라서 위 코드처럼 `?? "/"`로 기본값을 줘야 타입 검사를 통과한다.

> C로 요청줄을 `sscanf(line, "%s %s", method, path)`로 읽으면 `path`에 `?x=1`까지 들어오는 것과 같다. 그 뒤를 자르는 일은 직접 해야 한다.

### 여기서 알아둘 것

#### `curl -i`의 출력 읽기

`-i` 없이 쓰면 본문만 나온다. `-i`를 붙이면 사전지식에서 본 **상태줄 → 헤더들 → 빈 줄 → 본문**이 그대로 출력된다. 위 응답을 한 줄씩 읽으면 다음과 같다.

| 줄 | 뜻 |
|---|---|
| `HTTP/1.1 200 OK` | 상태줄. 프로토콜 버전 1.1, 상태 코드 200(성공) |
| `Content-Type: application/json` | 본문이 JSON이다. 우리가 `res.setHeader`로 직접 붙인 것 |
| `Date: Thu, 08 Oct 2026 09:20:06 GMT` | 응답을 만든 시각. Node가 자동으로 붙인다 |
| `Connection: keep-alive` | 응답 후에도 TCP 연결을 끊지 않고 재사용한다 |
| `Keep-Alive: timeout=5` | 그 연결을 5초까지 유지한다 |
| `Content-Length: 11` | 본문이 11바이트다. `{"ok":true}`가 정확히 11자다 |
| (빈 줄) | 헤더 끝 표시 |
| `{"ok":true}` | 본문 |

- `Date`, `Connection`, `Keep-Alive`, `Content-Length`는 우리가 쓴 적이 없다. Node의 `http` 모듈이 채워 주는 것이다. `Content-Length`는 `res.end(본문)`에 넘긴 문자열 길이에서 계산된다.
- 맨 끝의 `%`(zsh) 또는 `⏎`(bash)는 응답의 일부가 아니다. **본문이 줄바꿈 없이 끝났다**는 셸의 표시다. `JSON.stringify`가 끝에 `\n`을 붙이지 않으니 정상이다.
- 상태 코드만 빠르게 보려면 `curl -o /dev/null -w '%{http_code}\n' 주소`를 쓴다(9단계의 `c` 함수가 이 방식이다). 헤더만 보려면 `curl -I` 또는 `curl -s -D - -o /dev/null`을 쓴다.

> `curl -v`를 쓰면 `>`로 시작하는 **보낸 요청**까지 보여 준다. 사전지식에서 본 요청줄과 헤더가 실제로 그 모양으로 나가는지 확인할 수 있다.

#### Express의 `app`은 `(req, res)` 함수다

`app.listen(3000)`은 `http.createServer(app).listen(3000)`의 축약이다.

Express가 대신 해주는 일은 "어떤 URL에 어떤 함수를 연결할지"(라우팅)와 "공통 처리를 어디 끼울지"(미들웨어)뿐이다.

#### 서버도 싱글 스레드 + 이벤트 루프다

요청이 동시에 와도 핸들러는 한 번에 하나만 실행되고, `await`하는 동안 다른 요청이 처리된다.

> 핸들러가 동기 코드로 오래 돌면 그동안 모든 요청이 멈춘다.

## 3. 2단계: 최소 Express 서버

```ts
// src/main.ts
import express from "express";

const app = express();
app.get("/health", (_req, res) => { // _req: 쓰지 않는 인자에 밑줄을 붙이는 관례
  res.json({ ok: true });
});
app.listen(3000, () => console.log("http://localhost:3000"));
```

```sh
npm run dev # tsx watch: 저장하면 자동 재시작
curl -i localhost:3000/health
```

`EADDRINUSE` 에러가 나면 이미 3000 포트를 쓰는 프로세스가 있다는 뜻이다. 이전 서버를 끄거나 `PORT=3001 npm run dev`로 바꾼다.

### Express API

- `express()`: 요청을 처리하는 앱 객체를 만든다.
- `app.get(경로, 핸들러)`: 그 경로로 GET 요청이 오면 핸들러를 실행한다.
- `res.json(객체)`: 객체를 JSON으로 바꿔 응답한다. 아래 "`res.json`이 대신 해 주는 일"에서 다룬다.
- `app.listen(포트, 콜백)`: 그 포트에서 요청을 받기 시작한다.

#### 라우팅과 라우트 핸들러

용어를 먼저 고정한다.

- **라우트(route)**: "**HTTP 메서드 + 경로**"의 한 쌍이다. `GET /health`가 라우트 하나다.
- **라우트 핸들러(route handler)**: 그 라우트에 매칭됐을 때 실행할 함수다. 위 코드의 `(_req, res) => { res.json({ ok: true }); }`가 핸들러다.
- **라우팅(routing)**: 들어온 요청의 메서드와 경로를 보고 **어느 핸들러를 실행할지 고르는 일**이다. 1단계에서 `if (req.method === "GET" && req.url === "/health")`로 손수 하던 그 분기를 Express가 대신한다.

라우트를 식별하는 것은 경로 하나가 아니라 **메서드와 경로의 쌍**이다. 그래서 경로가 같아도 메서드가 다르면 서로 다른 라우트이고, 각자 다른 핸들러를 가진다.

```ts
app.get("/health", handlerA);  // GET /health  → handlerA
app.post("/health", handlerB); // POST /health → handlerB. 위와 별개의 라우트다
```

`curl localhost:3000/health`는 `handlerA`를, `curl -X POST localhost:3000/health`는 `handlerB`를 실행한다. 등록하지 않은 메서드로 요청하면(`-X DELETE`) 아무 라우트에도 매칭되지 않아 404가 된다.

`app.get`은 "GET 전용 라우트를 등록한다"는 뜻이고, 메서드마다 `app.post`, `app.put`, `app.patch`, `app.delete`가 따로 있다. 이 함수들은 실행하는 순간 **"이 메서드 + 이 경로면 이 함수"라는 항목을 앱 내부 목록에 추가**할 뿐이다. 핸들러는 그때 실행되지 않고, 나중에 매칭되는 요청이 올 때마다 실행된다.

> C에서 `register_handler("GET", "/health", handle_health)`로 함수 포인터를 테이블에 넣어 두고, 요청이 올 때 테이블을 훑어 맞는 포인터를 부르는 것과 같다.

#### `res.json`이 대신 해 주는 일

1단계에서 손으로 쓴 세 줄(`setHeader`, `JSON.stringify`, `end`)을 `res.json` 한 줄이 대신한다. `curl -i`로 두 서버의 응답 헤더를 비교하면 차이가 보인다.

```sh
# 1단계(node:http)
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 11

# 2단계(Express의 res.json)
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 11
ETag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"
```

(`Date`, `Connection` 같은 공통 헤더는 뺐다.)

| 하는 일 | `node:http` | `res.json` |
|---|---|---|
| 객체 → JSON 문자열 | `JSON.stringify` 직접 호출 | 자동 |
| `Content-Type` | `setHeader`로 직접 | `application/json; charset=utf-8` 자동 |
| 상태 코드 | `res.statusCode = 404` | 기본 200, 바꾸려면 `res.status(404).json(...)`(4단계) |
| 응답 끝내기 | `res.end` 직접 호출 | 자동 |

- `res.json`도 마지막에 응답을 끝낸다. 그래서 같은 요청에 다시 응답할 수 없다(4단계 "응답은 요청마다 한 번만 보낼 수 있다").
- 문자열을 보내는 `res.send("hi")`는 `Content-Type`을 `text/html; charset=utf-8`로 붙인다. API 서버에서 JSON을 돌려줄 때는 `res.json`을 쓴다.

> `res`는 1단계의 Node `res` 객체 그대로이고, Express가 `json`, `status` 같은 메서드를 덧붙였을 뿐이다. 그래서 `res.statusCode`, `res.on(...)` 같은 Node 기능도 그대로 쓸 수 있다.

#### Express가 더 붙인 헤더 세 줄

위 비교에서 2단계 쪽에만 있던 헤더들이다.

`X-Powered-By: Express`는 "이 서버는 Express로 만들었다"는 표시다. 기능상 아무 역할이 없고, 서버 구성을 외부에 알려 주는 셈이라 실무에서는 보통 끈다.

```ts
app.disable("x-powered-by");
```

`Content-Type: application/json; charset=utf-8`의 `charset=utf-8`은 **본문의 바이트를 어떤 문자 인코딩으로 해석할지**를 알려 주는 부가 정보다(`;` 뒤는 타입의 파라미터다).

JSON 본문은 바이트의 나열이고, 같은 바이트도 인코딩을 다르게 보면 다른 글자가 된다. 한글 `"김"` 한 글자는 UTF-8에서 3바이트(`EA B9 80`)인데, 받는 쪽이 이를 1바이트 1글자 인코딩으로 읽으면 깨진 글자 세 개가 된다. 그래서 `{"user":"김"}`의 `Content-Length`도 글자 수인 12가 아니라 바이트 수인 14다.

1단계에서는 `res.setHeader("Content-Type", "application/json")`만 써서 `charset`이 없었다. JSON의 기본 인코딩이 UTF-8로 정해져 있어 대개는 문제가 없지만, 명시해 두면 받는 쪽이 추측할 일이 없다. Express가 그 일을 대신 해 주는 것이다.

`ETag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"`는 **응답 본문의 지문**이다. 본문 내용으로 계산한 짧은 문자열이라, 본문이 같으면 같은 값이 나오고 한 글자만 달라도 값이 바뀐다. 이 값으로 캐시가 아직 유효한지 판별한다.

1. 서버가 응답에 `ETag`를 붙여 보낸다.
2. 클라이언트가 같은 주소를 다시 요청할 때 그 값을 `If-None-Match` 헤더에 담아 보낸다.
3. 서버가 지금 본문의 ETag와 비교해서 같으면, 본문을 다시 보내지 않고 **`304 Not Modified`**만 보낸다(사전지식에서 본 3xx가 이것이다).

```sh
# 1. 응답의 ETag 값을 확인한다
curl -i localhost:3000/health
# ETag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"

# 2. 그 값을 그대로 돌려주면 본문 없이 304만 온다
curl -i localhost:3000/health -H 'If-None-Match: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"'
# HTTP/1.1 304 Not Modified
```

값의 각 부분은 이렇게 읽는다.

| 부분 | 뜻 |
|---|---|
| `W/` | weak(약한) 비교라는 표시. "바이트까지 완전히 동일"이 아니라 "내용상 같다"는 기준이다 |
| `b` | 본문 길이를 16진수로 쓴 것. `0xb` = 11바이트(`{"ok":true}`) |
| `Ai2R8hg...` | 본문의 해시를 짧게 인코딩한 값 |

- `res.json`이 자동으로 붙여 준다. 끄려면 `app.disable("etag")`다.
- 본문이 달라지면 값도 달라진다. `POST /orders`로 주문을 추가한 뒤 `GET /orders/totals`를 다시 호출하면 `ETag`가 바뀌는 것을 볼 수 있다.

> 서버가 본문을 매번 만들기는 하므로 CPU는 아껴 주지 않는다. 절약되는 것은 네트워크로 본문을 다시 보내는 비용이다.

## 4. 3단계: 미들웨어 체인 이해하기

Express의 핵심 모델을 코드 없이 먼저 눈으로 본다. `src/scratch.ts`에 미들웨어 체인을 Express 없이 직접 흉내 낸다.

```ts
// Next: (선택적으로) 에러를 받는 함수
type Next = (err?: Error) => void;
// Middleware: (요청 객체, next)를 받는 함수
type Middleware = (req: Record<string, unknown>, next: Next) => void;

function run(middlewares: Middleware[], req: Record<string, unknown>) {
  let i = 0; // 다음에 실행할 미들웨어의 위치
  const next: Next = (err) => {
    // 에러가 넘어오면 남은 미들웨어를 건너뛰고 "에러 경로"로 빠진다
    if (err) return console.log("에러 경로 →", err.message);
    const mw = middlewares[i++];
    // next 자신을 넘겨 주므로, 미들웨어가 next()를 부르면 다음 것으로 이어진다
    if (mw) mw(req, next);
  };
  next(); // 체인 시작
}

run([
  (req, next) => { console.log("1 logger"); next(); },
  // 앞 단계에서 요청 객체에 정보를 붙여 다음 단계에서 쓸 수 있게 한다
  (req, next) => { req.user = "kim"; console.log("2 auth"); next(); },
  (req) => { console.log("3 handler:", req.user); }, // next를 안 부름 = 여기서 체인 종료
], {});
// 출력: 1 logger → 2 auth → 3 handler: kim
```

```sh
npx tsx src/scratch.ts
```

미들웨어가 할 수 있는 일은 웹 프레임워크 전반(Express, NestJS, Spring 등)을 관통하는 공통 원리로, 제어 흐름상 딱 세 가지뿐이다.

1. 응답해서 체인을 끝낸다: 권한 없음(401)이나 잘못된 요청(400)처럼 중간에서 즉시 응답을 완료하고 다음으로 넘기지 않는다.
2. `next()`로 다음에 넘긴다: 문제없음을 확인하고 다음 미들웨어나 최종 핸들러에게 요청 처리를 이어나가게 한다.
3. `next(err)`(또는 throw)로 에러 경로로 점프한다: 처리 중 문제가 발생하면 남은 일반 미들웨어를 모두 건너뛰고 에러 전용 핸들러로 직행한다.

실제 Express는 이 3가지 기본 뼈대 위에 경로 매칭(URL)과 에러 전용 미들웨어 선별 기능이 더 붙어 작동한다.

이제 `main.ts`에 진짜 로깅 미들웨어를 추가해 보자.

```ts
// src/main.ts
import express from "express";

const app = express();

app.use((req, res, next) => {
  const start = Date.now(); // 소요 시간을 계산하려고 현재 시각을 기억한다
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next(); // 빼먹으면?
});

app.get("/health", (_req, res) => { res.json({ ok: true }); });
app.listen(3000, () => console.log("http://localhost:3000"));
```

`app.use()`는 미들웨어를 등록하는 함수이며, 그 내부에 전달되는 `(req, res, next) => { ... }`가 실제 미들웨어 처리 로직이다. Express는 등록된 `app.use` 및 라우터 순서대로 요청을 차례대로 넘겨준다.

작동 흐름은 다음과 같다.

1. 요청이 들어오면 등록된 미들웨어(1 → 2 → 3...)가 순서대로 실행된다.
2. 각 미들웨어가 `next()`를 호출하면 다음 미들웨어로 제어권이 넘어간다.
3. 중간 관문 역할을 하는 미들웨어들을 모두 거친 뒤, 마지막 `next()`를 통과해야 비로소 최종 목적지인 라우트 핸들러(`app.get`, `app.post` 등)에 도달해 비즈니스 로직을 수행하고 응답을 보낼 수 있다.

### Express API

- `app.use(함수)`: 모든 요청이 라우트 핸들러에 도달하기 전에 이 함수를 먼저 거치도록 등록한다. 이런 함수가 미들웨어다.
- `next`: 다음 미들웨어/핸들러로 넘기는 함수다.
- `res.on("finish", 콜백)`: 응답이 다 보내진 순간에 콜백을 실행한다. `next()` 다음 줄에서 재지 않는 이유는 아래 "`next()` 뒤가 아니라 `finish`에서 재는 이유"에서 다룬다.
- `req.originalUrl`: 쿼리스트링까지 포함한 원래 요청 주소다. `req.url`과의 차이는 아래 4단계 "마운트하면 `req.url`의 앞부분이 잘린다"에서 다룬다.
- `res.statusCode`: 응답 상태 코드다.

#### 체인의 구조: 연결 리스트가 아니라 배열 + 커서

미들웨어를 쓰다 보면 각자가 "다음"만 알고 있는 연결 리스트처럼 느껴진다. 미들웨어 입장에서 보이는 것이 `next` 하나뿐이니 자연스러운 감각이다.

하지만 실제 구조는 위 `run()` 함수가 그대로 보여 준다. **등록된 미들웨어들의 배열 하나와, 지금 어디까지 왔는지 가리키는 커서(`i`) 하나**다.

```ts
const middlewares = [logger, auth, handler]; // 등록 순서대로 쌓인 배열
let i = 0;                                   // 커서
const next = () => { const mw = middlewares[i++]; if (mw) mw(req, next); };
```

- 각 미들웨어가 `next`로 받는 것은 "다음 미들웨어"가 아니라 **항상 같은 `next` 함수 하나**다. 그 함수가 호출될 때마다 커서를 한 칸 밀어 배열에서 다음 것을 꺼낸다. 노드마다 `next` 포인터를 들고 있는 연결 리스트와 다른 점이다.
- 그래서 "다음"의 정체는 등록 순서가 결정한다. `app.use`와 `app.get`은 호출되는 순간 배열 끝에 항목을 덧붙일 뿐이고, **코드에서 위에 쓴 것이 배열에서 앞**이다. 미들웨어 순서가 곧 실행 순서라는 말이 이 뜻이다.
- 실제 Express는 배열의 각 항목(레이어)에 핸들러와 함께 **경로 조건**을 같이 저장한다. 그래서 커서를 밀면서 경로가 맞는 항목만 실행하고, 맞지 않는 항목은 실행하지 않고 지나간다. `app.use(함수)`처럼 경로를 안 주면 조건이 `"/"`가 되어 모든 요청에 걸린다.
- 4단계에서 붙이는 라우터는 **그 배열의 한 항목이 자기만의 배열을 또 가진 것**이다. 그래서 전체 모양은 하나의 평평한 줄이 아니라 트리이고, 라우터 내부 배열이 다 떨어지면 제어는 부모의 `next`로 돌아가 부모 배열의 다음 항목부터 계속된다.

> C로 치면 `struct layer { const char *path; handler_fn fn; } layers[N];` 배열을 인덱스로 훑는 루프이고, `next`는 그 루프를 한 칸 전진시키는 함수다.

#### 마지막 `next()`는 어디로 가는가

배열의 마지막 미들웨어가 `next()`를 부르면 꺼낼 항목이 없다. 위 `run()`에서는 `middlewares[i++]`가 `undefined`라서 `if (mw)`에 걸려 **아무 일도 없이 조용히 끝난다**.

Express에서는 조용히 끝나지 않는다. 배열이 떨어지면 제어가 Express 내장 최종 핸들러(`finalhandler`)로 넘어가고, 거기서 요청이 마무리된다.

| 거기까지 갔을 때의 상황 | 최종 핸들러가 하는 일 |
|---|---|
| 아무도 응답하지 않았고 에러도 없다 | `404 Not Found`로 응답한다(본문은 HTML) |
| 에러를 들고 왔다(`next(err)`) | `500`(또는 에러의 `status`)으로 응답하고 콘솔에 스택을 남긴다 |

- 그래서 아무 라우트도 등록하지 않은 Express 앱에 요청을 보내도 멈추지 않고 404가 온다. 1단계에서 `else { res.statusCode = 404; ... }`를 손으로 쓴 그 분기를 Express가 기본으로 갖고 있는 셈이다.
- 5단계에서 `app.use((_req, res) => { res.status(404).json(...) })`를 맨 뒤에 등록하는 이유가 이것이다. 그 미들웨어가 배열의 마지막 항목이 되어 **최종 핸들러보다 먼저** 응답하므로, 404가 HTML 대신 우리가 정한 JSON으로 나간다.
- 반대로 `next()`를 **부르지 않고 응답도 하지 않으면** 커서가 멈춘 채 아무 일도 일어나지 않는다. 최종 핸들러까지 가지 못하므로 404조차 오지 않고 요청이 영원히 대기한다. 바로 아래 "일부러 깨뜨려보기"가 이 상황이다.

> 정리하면 "마지막 `next()`"의 목적지는 세 가지 중 하나다. 내가 등록한 404 미들웨어, 아무것도 등록하지 않았다면 Express의 최종 핸들러, 그리고 에러를 들고 갔다면 4인자 에러 핸들러다.

#### `next()` 뒤가 아니라 `finish`에서 재는 이유

`next()`는 다음 미들웨어를 부르는 평범한 함수 호출이라, 뒤의 체인이 전부 동기로 끝나면 `next()`가 돌아왔을 때 응답도 끝나 있다. 그래서 이렇게 써도 될 것 같다.

```ts
app.use((req, res, next) => {
  const start = Date.now();
  next(); // 핸들러가 await에서 멈추면 응답 전에 여기로 돌아온다
  console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
});

app.get("/slow", async (_req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  res.status(201).json({ ok: true });
});
```

`curl localhost:3000/slow`를 보내면 두 방식의 로그가 다르다.

```text
GET /slow → 200 (0ms)
GET /slow → 201 (304ms)
```

첫 줄이 `next()` 뒤에서 찍은 로그, 둘째 줄이 위 `main.ts`처럼 `res.on("finish")`에서 찍은 로그다(시간은 실행마다 조금씩 다르다).

async 핸들러는 `await`를 만나면 그 자리에서 Promise를 돌려주고 빠져나온다. 그러면 `next()`도 바로 돌아오므로, 아직 응답 전이라 상태 코드는 기본값 200이고 시간은 0ms다.

- `res.on(이벤트, 콜백)`은 "이 일이 일어나면 이 함수를 불러 달라"고 등록만 해 두는 것이다. 등록하는 순간에는 아무것도 실행되지 않는다.
- `"finish"`는 응답을 다 보낸 순간에 한 번 발생한다. 응답 시점에 맞춰야 하는 일(소요 시간, 최종 상태 코드 기록)은 여기에 둔다.

> C 코드의 `handler_table`에 함수 포인터를 등록해 두고, 이벤트가 오면 루프가 그 포인터를 부르는 것과 같은 구조다.

### 일부러 깨뜨려보기

`next();`를 지워본다.

`curl localhost:3000/health`가 응답 없이 멈춘다(Ctrl+C로 중단). **서버 콘솔에는 에러도 로그도 없다.**

> 미들웨어와 핸들러의 모든 분기가 응답하거나 `next()`를 부르는지 확인해야 하는 이유다. `next();`를 되돌린다.

## 5. 4단계: 라우터 분리와 인메모리 스토어

`src/orders.store.ts`는 Express와 무관한 순수 로직이다.

```ts
export type Order = { id: number; user: string; price: number; paid: boolean };

// 모듈 최상위 변수는 서버가 켜져 있는 동안 살아 있고, 모든 요청이 같은 배열을 읽고 쓴다.
// NestJS의 "기본 scope는 싱글턴"과 같은 성질
const orders: Order[] = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 102, user: "lee", price: 8000, paid: false },
  { id: 103, user: "kim", price: 5000, paid: true },
  { id: 201, user: "lee", price: 30000, paid: true },
  { id: 202, user: "park", price: 7000, paid: true },
];
let nextId = 203; // 다음에 발급할 주문 번호

export function listOrders(paid?: boolean): Order[] {
  // 복사본을 돌려줘 바깥에서 원본을 실수로 바꾸지 못하게 한다
  return paid === undefined ? [...orders] : orders.filter((o) => o.paid === paid);
}
export function findOrder(id: number): Order | undefined {
  return orders.find((o) => o.id === id);
}
// id는 서버가 붙이므로 입력에는 없다
export function addOrder(input: Omit<Order, "id">): Order {
  const order: Order = { id: nextId++, ...input };
  orders.push(order);
  return order;
}
export function totalByUser(): Record<string, number> {
  // 결제 완료만 거른 뒤, 사용자 이름별 합계 객체 하나로 접는다
  return orders.filter((o) => o.paid).reduce<Record<string, number>>((acc, o) => {
    acc[o.user] = (acc[o.user] ?? 0) + o.price;
    return acc;
  }, {});
}
```

`src/orders.router.ts`

```ts
import { Router } from "express";
// ESM에서는 상대경로 import에 확장자를 쓴다. 실제 파일이 .ts여도 .js로 적는다
import { addOrder, findOrder, listOrders, totalByUser } from "./orders.store.js";

export const ordersRouter = Router();

// 이 라우터가 /orders 아래에 붙을 것이므로, "/"는 실제로 GET /orders를 뜻한다
ordersRouter.get("/", (req, res) => {
  const paid = req.query.paid; // 쿼리 값은 전부 문자열. 아직은 검증 없이 그대로 쓴다.
  res.json(listOrders(paid === undefined ? undefined : paid === "true"));
});

// "/totals"는 반드시 "/:id"보다 먼저 등록한다. 먼저 등록된 라우트가 먼저 매칭된다.
ordersRouter.get("/totals", (_req, res) => {
  res.json(totalByUser());
});

ordersRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id); // params는 항상 string
  const order = findOrder(id);
  // return으로 함수를 끝내 아래 res.json이 또 실행되지 않게 한다
  if (!order) { res.status(404).json({ error: `order ${id} not found` }); return; }
  res.json(order);
});

ordersRouter.post("/", (req, res) => {
  // 201 Created: "새로 만들었다"는 성공 코드
  res.status(201).json(addOrder(req.body)); // req.body는 아직 any(검증 없이 그대로 쓰고 5단계에서 고친다)
});
```

`main.ts`에 마운트한다.

```ts
// src/main.ts
import express from "express";
import { ordersRouter } from "./orders.router.js";

const app = express();
app.use(express.json()); // 라우트보다 "앞"에 등록해야 한다
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`));
  next();
});

app.get("/health", (_req, res) => { res.json({ ok: true }); });
app.use("/orders", ordersRouter);

// 환경변수 값은 항상 문자열이므로 Number()로 숫자로 바꾼다
const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
```

```sh
curl localhost:3000/orders/totals
# {"kim":17000,"lee":30000,"park":7000}
```

### Express API

- `Router()`: 관련된 경로들을 한 묶음으로 만드는 "미니 앱"이다. 나중에 `app.use("/orders", ...)`로 특정 경로 아래에 붙인다.
- `req.query`: 주소 뒤 `?paid=true` 같은 쿼리스트링을 객체로 파싱한 것이다. 값이 불리언이 아니라 문자열이며, 아래 "`req.query`와 `req.params`의 값은 문자열이다"에서 다룬다.
- `"/:id"`와 `req.params`: 콜론(`:`)으로 시작하는 부분은 경로 매개변수(어떤 값이든 받는 자리)다. 값은 `req.params.id`로 읽는다.
- `res.status(코드)`: 상태 코드를 정한다. 이어서 `.json(...)`으로 응답한다. 404 응답 뒤에 `return`을 붙인 이유는 아래 "응답은 요청마다 한 번만 보낼 수 있다"에서 다룬다.
- `express.json()`: `Content-Type`이 `application/json`인 요청의 본문을 파싱해서 `req.body`에 넣어 주는 내장 미들웨어다.
- `app.use("/orders", 라우터)`: 라우터의 모든 경로 앞에 `/orders`를 붙여 연결한다(마운트). 라우터 안에서 보는 주소는 아래 "마운트하면 `req.url`의 앞부분이 잘린다"에서 다룬다.

#### 라우터와 마운트

**라우터**는 라우트 여러 개를 한 묶음으로 담아 둔 객체다. `app`에서 라우팅 기능만 떼어 낸 "미니 앱"이라, `app.get`처럼 `ordersRouter.get`을 쓴다. 3단계에서 본 대로 자기만의 레이어 배열을 하나 갖고 있는 셈이다.

**마운트(mount)**는 그 묶음을 앱의 어느 경로 아래에 붙이는 일이고, `app.use("/orders", ordersRouter)` 한 줄이 그것이다. 이 줄이 하는 일은 두 가지다.

1. 앱의 미들웨어 배열에 `ordersRouter`를 항목으로 추가한다.
2. 그 항목의 경로 조건을 `/orders`로 둔다. 그래서 `/orders`로 시작하는 요청만 이 라우터로 들어가고, 들어갈 때 앞의 `/orders`가 잘린다(아래 "마운트하면 `req.url`의 앞부분이 잘린다").

그래서 **최종 경로는 "마운트 경로 + 라우터 내부 경로"로 합쳐진다.**

| `main.ts`의 마운트 | `orders.router.ts`의 등록 | 최종 라우트 |
|---|---|---|
| `app.use("/orders", ordersRouter)` | `ordersRouter.get("/")` | `GET /orders` |
| `app.use("/orders", ordersRouter)` | `ordersRouter.post("/")` | `POST /orders` |
| `app.use("/orders", ordersRouter)` | `ordersRouter.get("/totals")` | `GET /orders/totals` |
| `app.use("/orders", ordersRouter)` | `ordersRouter.get("/:id")` | `GET /orders/101`, `GET /orders/999`, ... |

여기서 `"/orders"`라는 문자열이 **정의된 곳은 `main.ts`의 마운트 한 줄뿐**이다. `orders.router.ts`를 열어 보면 `orders`라는 경로 문자열이 아예 없고 `"/"`, `"/totals"`, `"/:id"`만 있다. 라우터 코드의 `"/"`가 실제로 `GET /orders`를 뜻하는 이유이고, 같은 라우터를 `app.use("/v2/orders", ordersRouter)`로 한 번 더 붙이면 코드 수정 없이 `GET /v2/orders`도 생기는 이유다.

#### `app.use`와 `app.get`은 무엇이 다른가

`app.get("/health", ...)`와 `app.use("/orders", ...)`가 다른 함수인 것이 혼란스럽기 쉽다. 먼저 치워야 할 오해가 하나 있다.

> `app.get`은 **GET 요청을 보내는** 함수가 아니다. "GET 요청이 들어오면 이 함수를 실행하라"는 **등록**이다. 요청을 보내는 쪽은 언제나 `curl`이나 브라우저다.

그리고 둘은 사실 성질이 같다. **`app.use`도 `app.get`도 3단계에서 본 같은 배열에 항목(레이어) 하나를 추가하는 일**이고, 등록된 함수는 모두 `(req, res, next)`를 받는 미들웨어다. 라우트 핸들러도 미들웨어이며, 다만 보통 `next()`를 부르지 않고 응답해서 체인을 끝낸다는 점이 다를 뿐이다(3단계에서 본 미들웨어의 세 가지 일 중 첫 번째다).

차이는 **그 항목에 붙는 조건**뿐이다.

| 기준 | `app.get("/orders", h)` | `app.use("/orders", h)` |
|---|---|---|
| HTTP 메서드 | GET만 | 메서드를 가리지 않음(POST, DELETE 모두) |
| 경로 매칭 | **완전 일치**. `/orders`만 걸리고 `/orders/101`은 안 걸린다 | **접두사 일치**. `/orders`, `/orders/101`, `/orders/a/b` 모두 걸린다 |
| 경로 생략 | 불가 | 가능(`app.use(h)` = 모든 요청) |
| `req.url` | 그대로 | 매칭된 접두사만큼 잘린다 |
| 보통 쓰는 곳 | 라우트 하나의 최종 처리 | 공통 처리(로깅, 파싱)와 라우터 마운트 |

그래서 라우터를 붙일 때 `app.use`를 쓴다. `/orders` 아래의 **모든 메서드와 하위 경로**를 라우터에게 넘겨야 하기 때문이다. `app.get("/orders", ordersRouter)`로 붙이면 `POST /orders`와 `GET /orders/101`은 애초에 이 항목에 매칭되지 않아 라우터에 닿지 못하고, `GET /orders`마저 404가 된다. 경로가 잘리지 않아 라우터가 `"/orders"`를 자기 내부의 `"/"`와 비교하다 실패하기 때문이다.

`app.get("/health", ...)`에 `app.use`를 쓰지 않는 이유도 같다. `app.use("/health", ...)`로 쓰면 `POST /health`나 `/health/foo` 같은 요청까지 같은 핸들러가 받아 버린다.

#### 라우트끼리는 의존하지 않는다. 순서만 있다

라우트는 서로를 참조하거나 호출하지 않는다. 각자 "이 조건이면 이 함수"라는 독립된 항목이고, 유일한 상호작용은 **배열에서 누가 앞에 있느냐**다. Express는 배열을 앞에서부터 훑어 **처음 매칭된 항목에서 멈춘다.**

"먼저 등록된 라우트가 먼저 매칭된다"는 말은 곧 **코드에 먼저 쓴 줄이 먼저 매칭된다**는 뜻이다. `ordersRouter.get(...)` 같은 호출은 모듈 최상위에 있어서 파일을 불러오는 순간 위에서 아래로 실행되고, 실행된 순서대로 배열에 쌓이기 때문이다.

```ts
ordersRouter.get("/totals", ...); // 배열 [0]
ordersRouter.get("/:id", ...);    // 배열 [1]
```

`GET /orders/totals`가 오면 `[0]`이 먼저 매칭되어 거기서 끝난다. `[1]`의 `:id`도 `"totals"`에 매칭될 수 있지만 차례가 오지 않는다. 두 줄의 순서를 바꾸면 `[0]`이 된 `/:id`가 먼저 잡아채므로 결과가 달라진다. 아래 "일부러 깨뜨려보기"에서 직접 확인한다.

메서드가 다르면 조건 자체가 다르므로 경로가 같아도 서로 간섭하지 않는다. `ordersRouter.get("/")`와 `ordersRouter.post("/")`는 경로가 같지만 **별개의 라우트 둘**이고, 둘 사이에는 순서 문제도 없다.

| 요청 | 매칭되는 라우트 |
|---|---|
| `GET /orders` | `ordersRouter.get("/")` - 목록 조회 |
| `POST /orders` | `ordersRouter.post("/")` - 새 주문 생성 |
| `DELETE /orders` | 없음 → 404 |

#### `req.query`와 `req.params`의 값은 문자열이다

URL은 그냥 글자이므로, Express가 파싱해 준 `req.query`와 `req.params`의 값도 전부 문자열이다. `?paid=true`의 `true`는 불리언이 아니라 문자열 `"true"`이고, `/orders/101`의 `101`도 문자열 `"101"`이다. 그래서 라우터 코드는 `paid === "true"`로 비교하고 `Number(req.params.id)`로 바꾼다.

같은 이름이 두 번 오거나 값이 비어 있으면 모양이 또 달라진다.

```ts
// GET /orders?paid=true → req.query: { paid: "true" }
// GET /orders?paid=true&paid=false → req.query: { paid: ["true", "false"] }
// GET /orders?paid → req.query: { paid: "" }
// GET /orders/101 → req.params: { id: "101" }
```

| 요청 | `req.query.paid` | 지금 코드의 `listOrders(...)` 인자 |
|---|---|---|
| `?paid=true` | `"true"` | `true` |
| `?paid=yes` | `"yes"` | `false`(조용히 미결제 목록) |
| `?paid=true&paid=false` | `["true", "false"]` | `false`(조용히 미결제 목록) |
| 없음 | `undefined` | `undefined`(전체 목록) |

- 예상 밖의 값이 에러 없이 `false`로 흘러간다. 5단계에서 `z.enum(["true", "false"])`로 검사하면 이런 요청이 400으로 걸러진다.
- **[4→5]** Express 5의 기본 쿼리 파서는 `?a[b]=1`을 `{ "a[b]": "1" }`처럼 평평하게 읽는다. Express 4는 `{ a: { b: "1" } }`처럼 중첩 객체로 읽었다.

> C의 `main(int argc, char *argv[])`에서 `./a.out 42`의 `argv[1]`이 숫자 42가 아니라 문자열 `"42"`라서 `strtol`로 바꿔야 하는 것과 같다.

#### `Number()`가 바꾸지 못하면 `NaN`이 된다

문자열을 숫자로 바꾸는 `Number()`는 **실패해도 예외를 던지지 않고 `NaN`을 돌려준다.** `NaN`은 "Not a Number"의 약자이고, 이름과 달리 타입은 숫자다(`typeof NaN === "number"`). "숫자 타입인데 유효한 숫자가 아닌 값"을 나타내는 특수한 값이다.

```ts
Number("101");   // 101
Number("abc");   // NaN ← 에러가 아니다. 그냥 통과한다
Number("");      // 0  ← 빈 문자열은 0이다
Number("12abc"); // NaN (parseInt("12abc")는 12를 돌려준다. 다른 함수다)
```

`NaN`에는 다루기 까다로운 성질이 두 가지 있다.

**자기 자신과도 같지 않다.** 그래서 `x === NaN`으로는 절대 판별할 수 없고, 항상 `Number.isNaN(x)`나 `Number.isInteger(x)`를 써야 한다.

```ts
NaN === NaN;            // false (!)
Number.isNaN(NaN);      // true  ← 이렇게 검사한다
Number.isInteger(NaN);  // false ← 5단계가 쓰는 방식
```

**연산에 섞이면 전염된다.** 어떤 산술 연산에 들어가도 결과가 `NaN`이고, 문자열에 끼워 넣으면 `"NaN"`이라는 글자가 된다.

```ts
NaN + 1;              // NaN
`order ${NaN} not found`; // "order NaN not found"
```

아래 "일부러 깨뜨려보기"에서 보게 되는 `{"error":"order NaN not found"}`가 정확히 이 과정이다. `Number("totals")`가 조용히 `NaN`이 되고, `findOrder(NaN)`은 `o.id === NaN`이 언제나 `false`라 아무것도 못 찾고, 그 `NaN`이 에러 메시지의 글자로 흘러나온 것이다.

`Number(req.params.id)` 바로 뒤에 `Number.isInteger` 검사가 필요한 이유다. 5단계에서 `if (!Number.isInteger(id)) throw new HttpError(400, ...)` 한 줄을 넣어 `NaN`이 더 퍼지기 전에 400으로 끊는다.

> C의 `strtol("abc", NULL, 10)`은 변환에 실패하면 `0`을 돌려주므로 "입력이 `"0"`이었던 경우"와 구별되지 않아 `errno`나 `endptr`을 따로 확인해야 한다. JS는 실패를 `0`이 아닌 `NaN`이라는 별도의 값으로 알려 주므로 구별 자체는 쉽지만, 검사하지 않으면 그 값이 그대로 흘러간다는 점은 똑같다. IEEE 754의 `NaN`이 자기 자신과 같지 않은 성질도 C의 `double`에서와 동일하다.

#### 응답은 요청마다 한 번만 보낼 수 있다

HTTP는 요청 하나에 응답 하나다. `res.json`(과 `res.send`, `res.end`)은 응답을 보내고 끝내므로, 그 뒤에 다시 응답하면 이미 나간 헤더를 바꾸려는 셈이 되어 에러가 난다.

`res.json`은 응답을 보낼 뿐 함수를 끝내지는 않는다. 그래서 라우터 코드는 404 응답 뒤에 `return`을 붙였다. 빠뜨리면 아래처럼 된다.

```ts
app.get("/twice", (_req, res) => {
  res.status(404).json({ error: "not found" });
  res.json({ id: 101 }); // return이 없으면 이어서 실행된다
});
```

```text
curl 쪽: {"error":"not found"} → 404
서버 콘솔: Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
```

- 클라이언트는 첫 응답을 정상으로 받는다. 에러는 서버 콘솔에만 남으므로 curl만 보면 놓치기 쉽다.
- 이 문서의 `/:id`에서 `return`을 빼고 `/orders/999`를 요청하면, 두 번째 호출이 `res.json(undefined)`라 이번에는 우연히 에러도 없이 지나간다. 에러가 안 보인다고 맞는 코드는 아니다.
- 5단계에서는 응답 대신 `throw new HttpError(404, ...)`를 쓴다. `throw`는 함수를 그 자리에서 끝내므로 `return`이 필요 없다.

> 응답 함수 다음 줄에 코드가 더 있다면 `return`이 빠지지 않았는지 먼저 본다.

#### 마운트하면 `req.url`의 앞부분이 잘린다

`app.use("/orders", ordersRouter)`로 붙인 라우터 안에서는 `/orders`가 잘린 주소를 기준으로 매칭한다. 라우터에 `"/:id"`라고만 써도 `/orders/101`에 매칭되는 이유다.

이때 `req.url`도 같이 잘린다. 라우터 안에서 `/orders/101?x=1` 요청의 주소 관련 값을 찍어 보면 다음과 같다.

| 값 | 라우터 안에서 | 뜻 |
|---|---|---|
| `req.originalUrl` | `"/orders/101?x=1"` | 클라이언트가 보낸 원래 주소(쿼리 포함) |
| `req.baseUrl` | `"/orders"` | 마운트된 경로 |
| `req.url` | `"/101?x=1"` | 잘리고 남은 주소(쿼리 포함) |
| `req.path` | `"/101"` | 잘리고 남은 경로(쿼리 제외) |

- 3단계 로깅 미들웨어가 `req.url`이 아니라 `req.originalUrl`을 찍는 이유다. 로그는 어느 위치에서 찍어도 클라이언트가 보낸 주소 그대로여야 한다.
- 7단계 8.2의 `DEBUG` 로그에 나오는 `trim prefix (/orders) from url /orders/101`이 바로 이 잘라내기다.

> 라우터는 자기가 어디에 마운트될지 모르고 `"/"`, `"/:id"`만 안다. 그래서 같은 라우터를 `/v2/orders`에 붙여도 코드를 고칠 필요가 없다.

### `req`와 `res` 한눈에 보기

4단계까지 나온 속성들을 모아 둔다. 사전지식에서 본 HTTP 텍스트의 각 조각이 어디에 담기는지, 그리고 **언제 채워지는지**가 핵심이다.

`req`는 읽는 객체다.

| 속성 | 예(`GET /orders/101?paid=true` 요청) | 언제 값이 있는가 |
|---|---|---|
| `req.method` | `"GET"` | 항상 |
| `req.originalUrl` | `"/orders/101?paid=true"` | 항상. 어느 미들웨어에서 봐도 안 바뀐다 |
| `req.url` | 앱에서는 `"/orders/101?paid=true"`, 라우터 안에서는 `"/101?paid=true"` | 항상. 마운트에 따라 잘린다 |
| `req.baseUrl` | 라우터 안에서 `"/orders"` | 마운트된 뒤 |
| `req.path` | 라우터 안에서 `"/101"` | 항상. 쿼리 제외 |
| `req.query` | `{ paid: "true" }` | 항상. 값은 전부 문자열 |
| `req.params` | `{ id: "101" }` | **라우트에 매칭된 뒤.** 앱 단계 미들웨어에서는 `{}`다 |
| `req.body` | `undefined`(GET이라 본문 없음) | **`express.json()`을 지난 뒤.** 그 전에는 `undefined` |
| `req.headers` | `{ host: "localhost:3000", ... }` | 항상. 키는 소문자로 정규화된다 |
| `req.get("content-type")` | `"application/json"` | 항상. 헤더 하나를 대소문자 구분 없이 읽는다 |

`res`는 쓰는 객체다. 사전지식의 상태줄·헤더·본문에 각각 대응한다.

| 메서드 | 하는 일 | 응답을 끝내는가 |
|---|---|---|
| `res.status(코드)` | 상태 코드를 정하고 `res` 자신을 돌려준다(그래서 `.json()`을 이어 붙인다) | 아니다 |
| `res.setHeader(이름, 값)` | 응답 헤더를 붙인다 | 아니다 |
| `res.json(객체)` | JSON으로 직렬화해 보낸다 | **끝낸다** |
| `res.send(값)` | 문자열·버퍼 등을 보낸다. 문자열이면 `Content-Type`이 `text/html`이 된다 | **끝낸다** |
| `res.end(본문?)` | Node 원본 메서드. 아무 가공 없이 끝낸다 | **끝낸다** |
| `res.statusCode` | 지금 정해져 있는 상태 코드를 읽는다(로깅용) | - |
| `res.on("finish", 콜백)` | 응답이 다 나간 순간 실행할 콜백을 등록한다 | 아니다 |

- `res.status(404)`는 **아직 아무것도 보내지 않는다**. 상태 코드만 적어 두고, 실제 전송은 뒤에 붙는 `.json(...)`이 한다. 그래서 `res.status(404)`만 쓰고 끝내면 요청은 응답 없이 멈춘다.
- "끝낸다"로 표시된 셋은 요청당 한 번만 쓸 수 있다(아래 "응답은 요청마다 한 번만 보낼 수 있다").
- `req.params`가 앱 단계에서 `{}`이고 `req.body`가 파서 앞에서 `undefined`인 것이, 7단계 8.3의 디버깅 로그에서 눈으로 확인하는 바로 그 내용이다.

### Node API

- `process.env.PORT`: 실행할 때 `PORT=3001`처럼 넘긴 환경변수다. 없으면 `undefined`라서 `?? 3000`으로 기본값을 준다.

### 일부러 깨뜨려보기

#### 1. 라우트 순서

`orders.router.ts`에서 `/totals`를 `/:id` 아래로 옮긴다.

`curl localhost:3000/orders/totals`가 합계 대신 `{"error":"order NaN not found"}`(404)를 돌려준다. `"totals"`가 `:id`에 먼저 잡혀 `Number("totals")`가 `NaN`이 된 것이다.

#### 2. `express.json()` 위치

`app.use(express.json())`를 `app.use("/orders", ordersRouter)` 아래로 옮긴다.

POST 요청의 `req.body`가 `undefined`가 되는데, 에러는 나지 않는다. `{ id: nextId++, ...undefined }`는 JS에서 합법이라 `addOrder`가 `{"id":203}`만 있는 주문을 **201로 조용히 저장**한다.

`curl localhost:3000/orders/203`으로 확인하면 `user`·`price`가 없는 주문이 실제로 들어가 있다. 크래시보다 나쁜, 데이터가 조용히 망가지는 실패다(5단계의 검증이 필요한 이유이기도 하다).

## 6. 5단계: 검증 붙이기

지금까지는 `req.query`, `req.body`를 검증 없이 믿었지만 `unknown` + zod 패턴으로 교체한다.

`src/http.ts`

```ts
import { z } from "zod";

// HTTP 상태 코드를 함께 담는 에러 종류
export class HttpError extends Error {
  // readonly status: 매개변수를 곧바로 읽기 전용 필드 this.status로도 만든다
  constructor(readonly status: number, message: string) { super(message); }
}

// 스키마가 통과시키는 데이터의 타입 T를 그대로 반환한다
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    // 실패한 필드 위치(["user"])를 "user"로 잇는다. 루트 자체가 틀리면 빈 문자열이라 "(root)"로 대체한다
    const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join(" / ");
    throw new HttpError(400, detail); // 400 Bad Request: 클라이언트가 잘못된 요청을 보냈다
  }
  return result.data;
}
```

`orders.store.ts`에 스키마를 추가한다.

```ts
// orders.store.ts 맨 위에 추가
import { z } from "zod";

export const OrderSchema = z.object({
  id: z.number().int(),
  user: z.string().min(1),
  price: z.number().positive(),
  paid: z.boolean(),
});
// 생성 요청에는 id가 없으므로 id 필드를 뺀 스키마를 만든다
export const CreateOrderSchema = OrderSchema.omit({ id: true });
export type CreateOrder = z.infer<typeof CreateOrderSchema>;
```

`orders.router.ts`의 GET `/`, GET `/:id`, POST를 검증하도록 고친다. `ordersRouter` 선언과 `/totals` 라우트는 그대로 둔다.

```ts
// src/orders.router.ts
import { Router } from "express";
import { z } from "zod";
import { HttpError, parseOrThrow } from "./http.js";
import { CreateOrderSchema, addOrder, findOrder, listOrders, totalByUser } from "./orders.store.js";

// 쿼리스트링 값은 전부 문자열이라 boolean이 아니라 "true"/"false" 문자열로 검사한다
const ListQuerySchema = z.object({ paid: z.enum(["true", "false"]).optional() });

export const ordersRouter = Router();

ordersRouter.get("/", (req, res) => {
  // 검증에 실패하면 HttpError가 던져지고, 성공하면 검증된 값이 돌아온다
  const { paid } = parseOrThrow(ListQuerySchema, req.query);
  res.json(listOrders(paid === undefined ? undefined : paid === "true"));
});

// "/totals"는 그대로, 여전히 "/:id"보다 먼저
ordersRouter.get("/totals", (_req, res) => {
  res.json(totalByUser());
});

ordersRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  // Number("abc")는 NaN이라 정수 검사에서 걸린다. 던진 에러는 Express 5가 에러 핸들러로 넘긴다
  if (!Number.isInteger(id)) throw new HttpError(400, "id는 정수여야 한다");
  const order = findOrder(id);
  if (!order) throw new HttpError(404, `order ${id} not found`);
  res.json(order);
});

ordersRouter.post("/", (req, res) => {
  const input = parseOrThrow(CreateOrderSchema, req.body);
  res.status(201).json(addOrder(input));
});
```

에러가 `HttpError`를 던지는 형태로 바뀌었으니, `main.ts`에 404 핸들러와 에러 핸들러를 라우트들 **뒤에** 추가한다.

```ts
// main.ts. import는 파일 맨 위에 추가
import type { NextFunction, Request, Response } from "express";

// 아래는 app.use("/orders", ordersRouter) 아래, app.listen(...) 위에 추가
// 어떤 라우트에도 매칭되지 않은 요청이 마지막에 여기로 온다. 그래서 반드시 라우트들 "뒤에" 등록한다
app.use((_req, res) => { res.status(404).json({ error: "Not Found" }); });

// "status라는 숫자 필드가 있는 객체"인지 하나씩 확인한 뒤에만 꺼낸다. 아니면 500
function statusOf(err: unknown): number {
  if (typeof err === "object" && err !== null && "status" in err && typeof err.status === "number") return err.status;
  return 500; // 500 Internal Server Error: 서버 쪽 잘못
}

// 앞 단계에서 throw/next(err)된 에러가 여기로 온다
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = statusOf(err);
  if (status >= 500) console.error(err); // 서버 잘못일 때만 콘솔에 상세 에러를 남긴다
  // 4xx면 에러 메시지를 그대로 보여 주고, 서버 잘못이면 내부 정보를 숨기고 일반 문구만 보낸다
  const message = status < 500 && err instanceof Error ? err.message : "Internal Server Error";
  res.status(status).json({ error: message });
});
```

```sh
# 이름이 빈 문자열이고 price가 음수라 검증에 걸리는 요청
curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"","price":-5}'
{"error":"user: Too small: expected string to have >=1 characters / price: Too small: expected number to be >0 / paid: Invalid input: expected boolean, received undefined"} → 400
```

### Express API

- 404 핸들러: 경로 없이 `app.use`로 맨 뒤에 등록한 미들웨어다. 앞에서 아무도 응답하지 않은 요청이 여기로 온다.
- 에러 핸들러: 인자가 정확히 4개(`err, req, res, next`)인 미들웨어이기 때문에 `_next`를 안 써도 선언은 해야 한다. Express는 이것을 에러 전용 핸들러로 인식한다.

### 여기서 알아둘 것

#### `Content-Type` 없는 POST도 이제 걸러진다

`Content-Type` 헤더 없이 POST하면(`curl -X POST localhost:3000/orders -d 'user=x'`) `express.json()`이 본문을 건너뛰어 `req.body`가 `undefined`가 된다. 이제는 `{"error":"(root): Invalid input: expected object, received undefined"}`(400)로 걸러진다.

> **[4→5]** Express 5가 쓰는 body-parser 2는 파서가 본문을 건너뛰면 `req.body`를 `undefined`로 둔다. Express 4 시절 body-parser 1.x는 파서가 실행되는 순간 먼저 `req.body`를 `{}`로 채웠으므로 같은 요청에서 `{}`를 봤다. 4단계의 `express.json()` 위치 실험처럼 파서가 아예 실행되지 않은 경우는 버전과 무관하게 `undefined`다.

깨진 JSON(`-d '{bad'`)은 `express.json()`이 스스로 400 에러를 만들어 에러 핸들러로 넘긴다.

#### async 핸들러의 에러도 자동으로 넘어간다

**[4→5]** `app.get("/boom", async () => { throw new Error("boom"); })`처럼 async 핸들러가 throw/reject하면 Express 5는 자동으로 에러 핸들러에 넘긴다.

4에서 쓰던 `try/catch → next(err)` 감싸기나 `express-async-errors` 패키지는 5에서 필요 없다.

### 일부러 깨뜨려보기

에러 핸들러의 `_next: NextFunction` 파라미터만 지워본다(인자 3개).

`npm run typecheck`는 **통과**하는데, `curl localhost:3000/orders/abc`를 하면 JSON 대신 Express 기본 에러 페이지(HTML)가 온다. 인자 3개는 타입상 유효해도 Express가 일반 미들웨어로 취급해 에러 때 호출하지 않는다.

> 원복한다.

## 7. 6단계: 이벤트 루프 막기

`main.ts`에 라우트를 하나 추가한다.

> 위치가 중요하다. `app.use("/orders", ordersRouter)` 바로 아래, 5단계의 404 핸들러보다 위에 둔다. 404 핸들러 뒤에 두면 요청이 거기서 먼저 끝나 이 라우트에 영영 도달하지 않는다(미들웨어 순서가 곧 실행 순서다).

```ts
app.get("/block", (_req, res) => {
  const end = Date.now() + 5000; // 지금부터 5초 뒤의 시각
  // 동기 루프라서 끝날 때까지 이벤트 루프를 붙잡고 놓지 않는다
  while (Date.now() < end) {} // 5초 동안 동기 코드가 스레드를 점유
  res.json({ blocked: true });
});
```

터미널 하나로 `curl localhost:3000/block`을 실행한 직후, 다른 터미널에서 `curl localhost:3000/health`를 실행한다.

`/health`는 `/block`과 무관한 라우트인데도 **5초 뒤에야 응답한다.** 핸들러 하나가 동기 코드로 오래 돌면 그동안 서버 전체가 멈춘다(1단계에서 예고한 내용).

`while`을 아래로 바꾸고 같은 순서로 다시 해보면 `/health`가 즉시 응답한다. `await`는 그 핸들러만 멈춘다.

```ts
app.get("/block", async (_req, res) => {
  // 기다리는 동안 이 핸들러만 멈추고 서버는 다른 요청을 처리할 수 있다
  await new Promise((resolve) => setTimeout(resolve, 5000));
  res.json({ blocked: false });
});
```

## 8. 7단계: Express 서버 동작 추적하기

JS/TS에서 배운 디버깅 기법(`--inspect-brk`, VS Code 브레이크포인트, `zod` issues 분석)은 Express에서도 그대로 쓴다.

다만 서버 환경에서는 요청(Request)이 들어오는 시점과 미들웨어 체인의 흐름을 추적하는 디버깅 감각이 추가로 필요하다.

### 8.1 Express 디버깅의 첫 질문: 요청이 어디서 멈췄는가?

Express 서버에서 문제가 발생했을 때는 다음 3가지 패턴 중 하나다.

1. 응답이 오지 않고 무한 대기(타임아웃): 미들웨어나 핸들러에서 `res.send/json()`으로 응답하지 않았고, `next()`도 호출하지 않았다(3단계 일부러 깨뜨려보기 참조).
2. 원하지 않는 라우트가 실행됨/잘못된 결과: 라우터 등록 순서 문제로 상위 라우트에 먼저 매칭됐다(4단계 `/:id` vs `/totals` 참조).
3. 500 에러 또는 예외 발생: 핸들러 내부 동기/비동기 에러가 발생했거나, 미들웨어에서 `next(err)`가 호출됐다.

### 8.2 내장 디버그 로그(`DEBUG`) 켜기

Express 내부에서 라우트가 어떻게 매칭되고 미들웨어가 어떤 순서로 실행되는지 눈으로 확인하는 가장 쉬운 방법은 환경변수를 사용하는 것이다.

> **[4→5]** Express 5는 라우팅을 별도 패키지(`router`)로 분리했기 때문에, 인터넷에 흔한 `DEBUG=express:*`로는 앱 설정 로그(`express:application set "etag" ...`)만 나오고 라우팅 로그는 나오지 않는다. 라우팅을 보려면 `router` 네임스페이스를 켠다.

```sh
# DEBUG=router: 이 명령에만 환경변수를 임시로 지정해 Express 5의 라우터 디스패치 로그를 켠다
DEBUG=router npx tsx src/main.ts
```

서버를 켠 상태에서 `curl localhost:3000/orders/101`을 호출해보면, 터미널에 라우터가 요청을 어느 미들웨어·라우터로 넘기는지가 실시간으로 출력된다.

```text
router dispatching GET /orders/101
router jsonParser  : /orders/101
router <anonymous>  : /orders/101
router trim prefix (/orders) from url /orders/101
router router /orders : /orders/101
router dispatching GET /101
GET /orders/101 → 200 (2ms)
```

`jsonParser`(= `express.json()`) → `<anonymous>`(로깅 미들웨어) → `/orders` 라우터 순서로 지나가고, 라우터 안에서는 앞의 `/orders`가 잘려 `/101`로 다시 매칭된다는 것까지 보인다.

- `DEBUG=router,router:*`: 라우트·레이어가 등록되는 순간(`router:route new '/totals'`)까지 나온다.
- `DEBUG=*`: `body-parser` 같은 의존 패키지의 로그까지 전부 나온다.

> 요청이 원하는 라우트에 닿지 않을 때 최우선으로 켜보는 옵션이다.

C의 데몬 프로그램에서 `LOG_LEVEL=debug ./server`나 `strace -f -e trace=network ./server`로 재컴파일 없이 로그 레벨·시스템 콜을 들여다보는 것과 같은 역할이다. 코드 수정 없이 환경변수로 내부 동작의 가시성만 잠깐 높이는 방식이다.

### 8.3 미들웨어 체인 현황을 디버깅용 로그로 찍어보기

특정 요청이 들어왔을 때 `req.body`, `req.params`, `req.query`가 어떻게 변하는지 확인하려면 3단계에서 작성한 로깅 미들웨어를 확장해 잠시 디버깅용 정보를 찍어본다.

```ts
app.use((req, _res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.url}`);
  console.log(`  - Params:`, req.params); // 경로 매개변수. 앱 단계에서는 아직 라우트 매칭 전이라 항상 {}다(/:id 값은 라우터에 매칭된 뒤에야 채워진다)
  console.log(`  - Query:`, req.query); // ?뒤의 쿼리스트링
  console.log(`  - Body:`, req.body); // 요청 본문(express.json()이 파싱한 뒤에만 값이 있다)
  next();
});
```

> `express.json()`보다 위에 이 디버깅 미들웨어를 두면 `req.body`는 아직 파싱되지 않아 `undefined`로 찍힌다. 4단계에서 확인했던 미들웨어 순서의 중요성을 로그 출력 위치로도 바로 확인할 수 있다.

### 8.4 `tsx --inspect-brk`로 HTTP 요청 디버깅하기

터미널이나 VS Code 디버거를 연결한 상태에서 특정 HTTP 요청이 처리되는 과정을 브레이크포인트로 멈춰볼 수 있다.

```sh
# 디버거를 붙일 수 있게 열고 첫 줄에서 멈춘다. 이어서 chrome://inspect에서 연결한다
npx tsx --inspect-brk src/main.ts
```

1. Chrome에서 `chrome://inspect`로 접속 후 DevTools를 연다.
2. `src/orders.router.ts` 파일의 `ordersRouter.post("/")` 핸들러 내부 첫 줄에 브레이크포인트를 찍는다.
3. 다른 터미널에서 `curl` 명령어로 POST 요청을 보낸다.

   ```sh
   curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'
   ```

4. `curl` 요청이 보내진 순간 DevTools에서 실행이 멈추고, `req.body`에 전달된 객체 값이 정확히 들어왔는지 스코프 패널에서 확인할 수 있다.

`-brk`가 없는 `--inspect`라면 미리 찍어둔 브레이크포인트에서만 멈춘다. C에서 `gdb -ex run ./server`로 띄워두고 특정 핸들러 함수에 `break`를 걸어둔 뒤 요청이 그 함수를 타야 멈추는 것과 같은 동작이다.

### 8.5 `HttpError`와 zod 검증 에러 상세 추적

5단계에서 만든 `parseOrThrow` 함수는 검증 실패 시 에러 메시지를 하나로 합쳐서 던진다. 어떤 필드가 왜 검증에 실패했는지 명확히 추적하고 싶다면 `http.ts` 내부를 잠시 수정해 에러를 펼쳐본다.

```ts
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    // 디버깅용: 원본 issue 배열을 중첩 객체까지 끝까지 펼쳐서 출력한다
    console.dir(result.error.issues, { depth: null });
    const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join(" / ");
    throw new HttpError(400, detail);
  }
  return result.data;
}
```

잘못된 요청(`curl -X POST ... -d '{"user":""}'`)을 보내면 콘솔에 다음이 찍힌다.

- `code`(`too_small`, `invalid_type` 등)
- `path`, `message`
- 규칙별 부가 정보(`minimum`, `expected` 등)

zod 검증 조건 중 무엇을 위반했는지 빠르게 파악할 수 있다.

### 8.6 Express 에러 핸들러로 들어오는 에러 추적

`main.ts` 맨 아래에 작성한 4인자 에러 핸들러는 모든 라우터 및 미들웨어에서 발생한 에러가 최종 집결하는 곳이다.

```ts
// 인자 4개 = 에러 전용 핸들러
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = statusOf(err);
  if (status >= 500) {
    console.error("💥 [Fatal Error]:", err); // 500 이상의 에러는 스택 트레이스 전체 출력
  }
  const message = status < 500 && err instanceof Error ? err.message : "Internal Server Error";
  res.status(status).json({ error: message });
});
```

> 개발 단계에서는 `err instanceof Error ? err.stack : err`를 출력하여 500 에러가 어디서 터졌는지 호출 스택(`stack`)을 즉시 확인할 수 있게 해두는 것이 좋다.

### 시험해보기

```sh
# Express 5의 라우팅 로그만 골라서 본다
DEBUG=router npx tsx src/main.ts
```

서버 실행 후 `curl localhost:3000/orders/totals`와 `curl localhost:3000/orders/101`을 각각 실행해보고, 라우터 매칭 로그가 콘솔에 어떻게 출력되는지 확인한다.

### 도전 과제

#### 1. 없는 라우트의 탐색 경로 보기

`DEBUG=router`를 붙여 실행한 뒤, 존재하지 않는 라우트를 보낸다.

```sh
curl localhost:3000/not-found
```

라우터가 어디까지 탐색하고 404 미들웨어(`<anonymous>`)로 넘어가는지 확인한다.

이어서 `DEBUG=express:*`로도 실행해 보고, 라우팅 로그가 **안 나오는** 것을 직접 확인한다.

두 경우 로그가 어떻게 다른가?

**답**

1. `DEBUG=router`로 띄우면 서버가 켜질 때 `router use '/' jsonParser`, `router use '/orders' router`처럼 미들웨어·라우터가 등록되는 줄이 먼저 찍힌다.
2. `/not-found` 요청은 `router dispatching GET /not-found` → `jsonParser` → `<anonymous>`(로깅 미들웨어) → `<anonymous>`(404 미들웨어) 순으로 지나간다. 경로가 `/orders`로 시작하지 않으니 `trim prefix` 줄 없이 `/orders` 라우터를 건너뛰고, 응답은 `{"error":"Not Found"}`(404)다.
3. `DEBUG=express:*`로 띄우면 시작할 때 `express:application set "etag" to 'weak'` 같은 앱 설정 줄만 나온다. `/not-found` 요청 때는 로깅 미들웨어의 `GET /not-found → 404` 한 줄뿐이고 `dispatching` 같은 라우팅 줄은 없다.

#### 2. 경로 매개변수가 문자열로 들어오는 순간 보기

`npx tsx --inspect-brk src/main.ts`로 서버를 띄운 뒤, `ordersRouter.get("/:id")` 라우트에 브레이크포인트를 걸고 호출한다.

```sh
curl localhost:3000/orders/abc
```

`req.params.id`가 `string` 형태인 `"abc"`로 들어온 순간을 브레이크포인트로 확인한다.

`req.params.id`의 값과 타입은 무엇이고, 그다음엔 어떻게 되는가?

**답**

1. `--inspect-brk`라 시작하자마자 한 번 멈춘다. 이어서 진행(Resume)해야 서버가 떠서 curl을 받을 수 있다.
2. 핸들러 첫 줄(`const id = Number(req.params.id);`)에서 멈추면 `req.params`는 `{ id: "abc" }`이고 `typeof req.params.id`는 `"string"`이다. 이 줄은 아직 실행 전이라 Scope 패널의 `id`·`order`는 `undefined`로 보인다.
3. 이어서 진행하면 `Number("abc")`가 `NaN`이라 정수 검사에 걸리고, curl은 `{"error":"id는 정수여야 한다"}`(400)를 받는다.

## 9. 완성 확인

```sh
# 타입 검사가 성공해야 서버를 실행한다
npm run typecheck && npm run dev
```

```sh
# c: curl을 -s(진행 표시 숨김)와 -w(응답 뒤에 상태 코드 덧붙임)로 감싼 셸 함수. "$@"는 받은 인자를 그대로 넘긴다
c() { curl -s -w ' → %{http_code}\n' "$@"; }
J='Content-Type: application/json' # 자주 쓰는 헤더 문자열

c localhost:3000/health # {"ok":true} → 200
c localhost:3000/orders/totals # {"kim":17000,"lee":30000,"park":7000} → 200
c "localhost:3000/orders?paid=true" # 4건 → 200
c localhost:3000/orders/101 # {"id":101,...} → 200
c localhost:3000/orders/999 # {"error":"order 999 not found"} → 404
c localhost:3000/orders/abc # {"error":"id는 정수여야 한다"} → 400
c "localhost:3000/orders?paid=yes" # {"error":"paid: Invalid option: expected one of \"true\"|\"false\""} → 400
c -X POST localhost:3000/orders -H "$J" -d '{"user":"choi","price":9000,"paid":true}' # → 201
c localhost:3000/orders/totals # choi 9000이 더해져 있음 → 200
c localhost:3000/nothing # {"error":"Not Found"} → 404
```

- [ ] 위 curl 시나리오가 전부 기대 결과와 같다
- [ ] `next()` 누락 실험에서 "요청은 멈췄는데 서버 로그는 없는" 상황을 재현했다
- [ ] `express.json()` 위치, 라우트 순서, 에러 핸들러 인자 개수 실험을 각각 재현하고 원복했다
- [ ] 6단계의 동기 블로킹이 무관한 요청까지 막는 것과, `await`로 바꾸면 풀리는 것을 확인했다

## 10. 다음 단계

### 자가 점검

소리 내어 설명할 수 있으면 통과다.

1. 요청 100개가 동시에 오면 핸들러는 어떻게 실행되는가? 동기 루프가 5초 도는 동안 다른 요청은?

2. 미들웨어가 할 수 있는 세 가지 일은? 셋 중 아무것도 안 하면?

3. `express.json()`이 라우트보다 뒤에 있으면 왜 `req.body`가 `undefined`인가?

4. Express는 에러 핸들러를 무엇으로 식별하는가? 인자를 3개로 쓰면?

5. async 핸들러가 throw하면 Express 5에서는? 4에서는?

6. 상태 코드의 첫 자리가 4와 5일 때 책임은 각각 누구에게 있는가? 에러 핸들러가 둘을 다르게 처리하는 이유는?

7. `app.get("/orders")`와 `app.use("/orders")`는 각각 어떤 요청에 매칭되는가? 라우터를 붙일 때 `app.use`를 쓰는 이유는?

8. `orders.router.ts`에는 `"/orders"`라는 문자열이 없는데 `GET /orders`가 동작하는 이유는?

9. 마지막 미들웨어가 `next()`를 부르면 어디로 가는가? 응답도 `next()`도 하지 않으면?

10. `Number("totals")`의 값과 타입은? 그 값을 `=== NaN`으로 검사할 수 없는 이유는?

### NestJS에서는 어떻게 바뀌는가

| 여기서 직접 한 일 | NestJS에서 이에 대응하는 것 |
|---|---|
| `Router()` + `app.use("/orders", router)` | `@Controller("orders")` + `@Module` |
| `orders.store.ts`의 함수·변수 | `@Injectable()` Provider(생성자 주입, 기본 싱글턴) |
| `parseOrThrow(zod)`를 직접 호출 | DTO + `ValidationPipe` |
| `HttpError` + 4인자 에러 핸들러 | 내장 예외 클래스 + ExceptionFilter |
| 로깅 미들웨어 | Middleware 또는 Interceptor |

### 이 문서에서 다루지 않은 것

존재만 언급한다.

- 인증(세션·JWT), CORS, 보안 헤더, 요청 횟수 제한
- 정적 파일, 템플릿 엔진, 파일 업로드, 스트리밍 응답
- graceful shutdown, 클러스터