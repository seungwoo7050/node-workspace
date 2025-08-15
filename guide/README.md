# TypeScript: 주문 리포트 CLI를 TS로 옮기기

## 목표

JS로 만든 `order-report`를 그대로 TS로 옮긴다. 옮기는 과정에서 타입을 명시하고, `fetchOrders`가 가끔 이상한 모양의 데이터를 돌려주게 만들어 신뢰할 수 없는 응답을 zod로 걸러내는 것까지 더한다. 완성된 동작은 아래와 같다.

```sh
npm run typecheck && npx tsx src/main

> ts-order-report@1.0.0 typecheck
> tsc --noEmit

병렬 조회: 501.434ms
잘못된 데이터 건너뜀: page 1의 주문 103 - price: Invalid input: expected number, received string
잘못된 데이터 건너뜀: page 2의 주문 202 - paid: Invalid input: expected boolean, received undefined
실패: page 3 not found
사용자별 합계: { kim: 12000, lee: 30000 }
1위: { name: 'lee', total: 30000 }
```

`npx`는 설치된 도구를 바로 실행하는 명령이고, `tsx`는 TypeScript 파일을 컴파일 산출물 없이 바로 실행해 주는 도구다.

> TypeScript 6.x/7.x, zod 4.x 기준이다. zod 3의 에러 문구(`Expected number, received string`, `Required`)로 된 옛 예제를 보면 이 문서와 문구가 다르다.

## 0. TS에 대한 사전지식

TypeScript를 C 배경에서 접근할 때 가장 먼저 부딪히는 오해가 "C의 정적 타입과 같은 것"이라는 생각이다. 겉모습(타입 표기)은 닮았지만 타입이 언제/어떻게 검사되고 사라지는지는 근본적으로 다르다. 본문에 들어가기 전에 그 차이 3가지를 정리한다.

### 1. 타입은 컴파일 타임에만 존재하고, 실행 파일에는 전혀 남지 않는다.

C에서 `int`로 선언한 변수는 컴파일된 바이너리 안에서도 4바이트(또는 8바이트) 정수로 다뤄진다. 타입 정보가 메모리 레이아웃을 결정하고, 그 결정은 실행 시점까지 유효하다.

TypeScript의 타입 표기(`: number`, `: Order` 등)는 컴파일러(`tsc`)가 검사만 하고 지워버리는 주석에 가깝다. `tsc`나 `tsx`가 `.ts` 파일을 JS로 바꿀 때 타입 표기는 전부 삭제되고, 실행되는 JS 코드에는 타입의 흔적이 전혀 남지 않는다(Type Erasure).

```c
// C: 타입이 곧 메모리 레이아웃을 결정하고, 그 결정은 실행 파일에 그대로 남는다
int price = 12000; // 컴파일된 바이너리도 이 값을 4바이트 정수로 다룬다
```

```ts
// TS: 타입은 tsc가 검사에만 쓰고, 실행되는 JS에서는 완전히 사라진다
let price: number = 12000;
// tsc/tsx가 만드는 실제 JS 코드
let price = 12000; // ": number"는 흔적도 없이 사라진다
```

이 문서 1단계에서 "타입 에러가 잔뜩 나도 `tsx`로는 그대로 실행된다"는 것과, 5단계에서 "`tsx`는 타입을 검사하지 않고 지우기만 한다"는 것 모두 이 사실 하나에서 나온다.

가장 실용적인 결론은 "**타입 표기를 아무리 정교하게 써도, 런타임에 그 타입을 '확인'하는 코드는 저절로 생기지 않는다**"는 것이다.

> 외부에서 온 값(API 응답, 사용자 입력)이 선언한 타입과 실제로 같은 모양인지는 개발자가 직접 검사해야 하며 zod가 필요한 이유다.

### 2. 이름이 아니라 모양이 같으면 같은 타입이다(구조적 타이핑).

C에서 두 구조체는 필드가 완전히 같아도 태그(이름)가 다르면 다른 타입이다(nominal typing). `struct Point`와 `struct Coord`가 똑같이 `{ int x, y; }`여도 캐스팅 없이는 서로 대입할 수 없다.

TS는 이름이 아니라 모양(shape)이 같으면 같은 타입으로 취급한다(structural typing).

```ts
interface Point { x: number; y: number }
interface Coord { x: number; y: number }

function move(p: Point) { ... }

const c: Coord = { x: 1, y: 2 };
move(c); // 통과: 이름이 달라도 모양이 같다. C라면 컴파일 에러다
```

타입 추론(inference)이 자연스럽게 되는 것도 같은 원리다. `const c = { x: 1, y: 2 }`처럼 타입을 안 적어도 TS는 값의 모양만 보고 `{ x: number; y: number }`라는 타입을 붙이고, 그 모양이 `Point`와 같으면 `move(c)`가 통과한다.

C의 감각으로는 "이름을 선언 안 했는데 어떻게 타입이 생기지?"라는 의문이 들 수 있다. **TS는 애초에 이름이 아니라 모양으로 타입을 판단하므로 추론이 자연스럽게 된다.**

### 3. `unknown`은 캐스팅 전의 `void*`, `any`는 검증 없는 강제 캐스팅이다.

`unknown`은 C의 `void*`와 같은 위치에 있는 타입이다. "메모리는 있는데 정체는 모른다"는 뜻으로, 멤버 접근(`.price`)이나 연산을 전혀 허용하지 않고 구체적인 타입으로 좁혀야만(narrowing) 다룰 수 있다.

```c
void *raw = get_response(); // 뭔지 모르는 메모리를 가리키는 포인터
raw->price; // 컴파일 에러: void*는 멤버가 없으므로 캐스팅해야 한다
Order *o = (Order *)raw; // 캐스팅: "이건 Order야"라고 컴파일러에게 우기는 것
```

```ts
const raw: unknown = getResponse();
raw.price; // 컴파일 에러: unknown은 멤버 접근이 안 된다
const o = raw as Order; // as: "이건 Order야"라고 컴파일러를 설득하는 것. 실제 값은 검증하지 않는다
```

`raw as Order`는 C의 `(Order *)raw` 캐스팅과 정확히 같은 성격의 위험을 가진다. **컴파일은 통과하지만, 실제 메모리(값)가 정말 그 모양인지는 보장하지 않는다.**

`any`는 한 걸음 더 나아가 "이 값에 대해서는 아예 타입 검사를 하지 마라"는 선언이다. C로 치면 캐스팅조차 없이 `void*`를 아무 타입처럼 바로 써버리는 것과 같아서, `unknown`보다도 위험하다.

## 1. 준비

기존 `order-report`를 복사해서 TS 버전으로 만든다.

```sh
cp -r order-report ts-order-report && cd ts-order-report
# -D: devDependencies(개발할 때만 필요한 도구)로 설치한다
npm install -D typescript tsx @types/node
npm install zod
mkdir src
mv api.js report.js main.js src/ # 파일은 그대로, 확장자만 곧 .ts로 바꾼다
```

- `typescript`: 컴파일러(`tsc`)
- `tsx`: TS 파일 실행기
- `@types/node`: Node 내장 API의 타입 정의
- `zod`: 런타임(프로그램이 실제로 돌 때)에 데이터의 모양을 검사해 주는 라이브러리

`tsconfig.json`을 만든다. `npx tsc --init`도 되지만 생성 결과가 TS 버전마다 다르다.

예를 들어 TS 7.0의 `--init`은 `module: "nodenext"`, `target: "esnext"`, `types: []`에 `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `jsx` 같은 옵션까지 켜진 파일을 만든다. 이 문서의 코드보다 훨씬 엄격해서 처음 보는 에러가 섞여 나오므로, 최소본을 직접 쓴다.

> 아래처럼 필요한 옵션을 전부 명시해두면 설치되는 TS 버전이 뭐든 상관없다.

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "strict": true,

    // 마이그레이션 초기에는 암묵적 any를 허용하여 빨간 줄을 방지한다
    // "noImplicitAny": false,

    "skipLibCheck": true,
    "types": ["node"],
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

> `tsconfig.json`은 JSON이지만 예외적으로 `//` 주석을 쓸 수 있다(TypeScript가 그렇게 읽는다). 일반 JSON 파일에서는 안 되므로 주의하자.

`compilerOptions`는 컴파일러(`tsc`)가 코드를 어떻게 검사하고 변환할지 정하는 옵션 모음이다.

| 옵션 | 의미 |
|---|---|
| `target: ES2022` | 변환 결과로 만들 JS의 문법 버전 |
| `module: NodeNext` | Node의 ESM 규칙을 그대로 따른다. 상대경로 import에 `.js` 확장자가 필요하다는 규칙(00에서 이미 지켰다)이 여기서도 그대로 적용된다 |
| `strict` | 엄격 검사 묶음(`strictNullChecks` 포함). 끄지 않는다. 이 옵션이 꺼지면 TS의 핵심 이점(널 안전성)이 사라진다 |
| `skipLibCheck` | `node_modules`의 타입 정의 검사를 생략. 빌드 속도, 남의 타입 충돌 회피 |
| `types: ["node"]` | 배열에 적은 `@types/*` 패키지만 불러온다. TS 6.0부터 `types`의 기본값이 빈 배열이라 `@types/node`가 자동으로 안 붙는다. 빼면 `process` 같은 Node 전역에서 "이름을 찾을 수 없다" 에러가 난다(`setTimeout`은 기본으로 들어오는 브라우저(DOM) 타입에도 있어서 에러가 안 난다) |
| `rootDir` / `outDir` | TS 소스가 있는 폴더(`src`)와 변환된 JS를 저장할 폴더(`dist`) |
| `include` | 컴파일 대상에 포함할 경로(`src` 폴더 안의 모든 파일) |

`package.json`의 `scripts`를 채운다. `scripts`는 `npm run 이름`으로 실행할 명령어에 이름을 붙여 두는 자리다(`npm pkg set scripts.typecheck="tsc --noEmit"`처럼 명령으로 넣어도 된다).

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

- `dev`: `tsx watch`는 파일이 바뀔 때마다 자동으로 다시 실행한다.
- `typecheck`: `tsc --noEmit`은 타입 검사만 하고 JS 파일은 만들지 않는다.
- `build`: `tsc`는 검사 후 `tsconfig`의 `outDir`(`dist`)에 `.js` 파일을 만든다.
- `start`: 빌드로 만든 JS를 Node로 실행한다.

## 2. 1단계: 확장자만 바꿔서 통과시키기

`src/api.js` → `src/api.ts`, `report.js` → `report.ts`, `main.js` → `main.ts`로 이름만 바꾼다(내용은 아직 그대로).

import 구문의 `./api.js`, `./report.js`도 그대로 둔다. 실제 파일이 `.ts`여도 `nodenext` 모듈 해석은 `.js`로 쓴 걸 요구한다.

```sh
npm run typecheck # 위 scripts의 typecheck(tsc --noEmit)를 실행한다
```

실행 시 `TS7006 (Parameter 'orders' implicitly has an 'any' type)` 에러가 다수 발생한다(`TS7053`, `TS18046`도 섞여 나온다). `tsconfig.json`에 설정된 `"strict": true`(`noImplicitAny`) 옵션 때문에 타입이 지정되지 않은 매개변수를 허용하지 않기 때문이다.

이 에러들은 코드의 기능 결함이 아닌, **타입 명시가 빠졌음을 알려주는 정상적인 신호**다. 다음 단계에서 파라미터에 명시적 타입을 추가하여 해결한다.

> 그런데 `npx tsx src/main.ts`로 실행해보면 정상적인 결과가 출력된다. 타입 에러가 있어도 실행은 된다. TS에서 "**타입은 검사만 하고 지워진다**"가 눈앞에서 확인되는 순간이다.

## 3. 2단계: 타입을 명시하기

`report.ts`에 `Order` 타입을 만들고 함수 시그니처에 붙인다.

```ts
// report.ts

export interface Order {
  id: number;
  user: string;
  price: number;
  paid: boolean;
}

export function totalByUser(orders: Order[]): Record<string, number> {
  return orders
    .filter((o) => o.paid)
    .reduce<Record<string, number>>((acc, o) => {
      acc[o.user] = (acc[o.user] ?? 0) + o.price;
      return acc;
    }, {});
}

export function topUser(totals: Record<string, number>): { name: string; total: number } | null {
  // Object.entries(totals)의 타입은 [string, number][]로 추론된다
  const [top] = Object.entries(totals).sort(([, a], [, b]) => b - a);
  return top ? { name: top[0], total: top[1] } : null;
}
```

### TS 문법

- `interface Order { ... }`: 객체의 모양(필드와 그 타입)을 정의한다. `type`과의 차이는 아래에서 다시 다룬다.
- 타입 표기(`이름: 타입`): 변수나 매개변수 이름 뒤에 붙여 타입을 지정한다. `orders: Order[]`는 "Order 객체의 배열"이다.
- 반환 타입(`(...): 타입`): 매개변수 목록 뒤에 붙여 함수가 돌려줄 값의 타입을 적는다.
- 인라인 객체 타입(`{ name: string; total: number }`): 별도 `interface` 선언 없이 그 자리에 바로 적는 객체 타입이다.
- `Record<K, V>`: "키는 `K`, 값은 `V`인 객체"를 짧게 적는 유틸리티 타입이다. `Record<string, number>`는 "키는 문자열, 값은 숫자인 객체"다.
- 제네릭(`<...>`): 타입을 인자처럼 넘긴다. `reduce<Record<string, number>>(...)`가 그 예이며, 아래 "제네릭"에서 다룬다.
- 유니온 타입(`A | B`): 값이 여러 타입 중 하나일 수 있음을 나타낸다. 여기서는 객체 또는 `null`이며, 아래 "유니온 타입과 null"에서 다룬다.

#### interface와 type

둘 다 "이런 모양이어야 한다"는 계약이다. C의 `struct`와 달리 **필드 배치(메모리 레이아웃)를 정하지 않고** 구조적 타이핑에 따라 모양만 맞으면 통과한다. 둘 다 타입 소거로 컴파일 후 사라진다.

```ts
// interface: 확장은 extends로 한다
interface Order { id: number; user: string; price: number; paid: boolean }
interface PaidOrder extends Order { paid: true }

// type: 같은 확장을 &(교차 타입)로 한다
type PaidOrder2 = Order & { paid: true };

// type만 되는 것: 유니온에 이름 붙이기(interface로는 표현할 수 없다)
type Status = "paid" | "unpaid";
```

| 구분 | `interface` | `type` |
| --- | --- | --- |
| 객체 모양 정의 | 가능 | 가능 |
| 확장 | `extends` | `&` |
| 유니온(`A \| B`)에 이름 붙이기 | 불가 | 가능 |

> 객체 모양은 `interface`, 유니온이 필요하면 `type`으로 쓰는 팀이 많다. 팀 컨벤션에 따라 갈리므로 둘 다 읽을 줄 알아야 한다.

#### 제네릭

C에서 "어떤 타입이든 다루는 함수"는 `void *`와 캐스팅으로 만든다. 컴파일러가 타입을 확인해 주지 못하니 캐스팅을 틀려도 모른다.

제네릭은 **타입 자체를 인자로 받는** 문법이다. `<T>`에 구체적인 타입이 들어오면 그 함수와 타입 안의 `T`가 전부 그 타입으로 치환되어 검사된다.

```ts
// 제네릭 없이: 초기값 {}의 타입이 그대로 acc의 타입이 되어 acc[o.user]가 에러다(TS7053)
orders.reduce((acc, o) => { acc[o.user] = o.price; return acc; }, {});

// 제네릭으로 acc의 타입을 알려 준다
orders.reduce<Record<string, number>>((acc, o) => { acc[o.user] = o.price; return acc; }, {});
```

이미 쓰고 있던 `Order[]`도 사실 `Array<Order>`의 줄임 표기이고, `Record<string, number>`도 타입 인자 두 개를 받는 제네릭이다. `Promise<Order[]>`도 같은 문법이다.

> 제네릭 함수를 직접 만드는 법(`function f<T>(x: T)`)은 이 문서 범위 밖이다. 지금은 `<...>`가 보이면 "타입 인자를 넘기는 자리"로 읽을 수 있으면 된다.

#### 유니온 타입과 null

C의 `union`은 한 메모리를 여러 멤버가 공유하는 구조이고, 지금 어떤 멤버가 유효한지는 개발자가 직접 추적한다. TS의 유니온 타입은 메모리가 아니라 **"이 값은 A이거나 B다"라는 타입 수준의 선언**이고, 어느 쪽인지는 컴파일러가 코드 흐름을 보고 좁혀 준다.

`topUser`의 반환 타입 `{ name: string; total: number } | null`처럼 값이 없을 수 있는 경우를 타입에 그대로 드러낼 수 있다.

```ts
const result = topUser(totals);
result.name; // 컴파일 에러: 'result' is possibly 'null'. (TS18047)

if (result) {
  result.name; // 통과: 이 블록 안에서 result는 null이 아닌 쪽으로 좁혀졌다
}
```

호출하는 쪽은 `if (result)`로 좁히지 않으면 `result.name`에서 컴파일 에러를 만난다. `strictNullChecks`(`strict`에 포함)가 하는 일이다.

### 깨뜨려보기

#### 1. 타입 바꾸기

`Order`의 `price: number`를 `price: string`으로 잠깐 바꾼다.

```sh
npm run typecheck
src/api.ts(7,29): error TS2322: Type 'number' is not assignable to type 'string'.
...
src/report.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

`report.ts`의 `acc[o.user] = (acc[o.user] ?? 0) + o.price`에서 타입이 안 맞다고 잡힌다(숫자 + 문자열 = 문자열인데 `acc` 값은 숫자여야 한다). `api.ts`의 Mock 데이터도 `price`가 숫자라서 전부 잡힌다.

타입을 하나만 바꿔도 그 타입을 쓰는 모든 곳이 한꺼번에 검사된다.

#### 2. 오타 내기

`orders.filter((o) => o.paid)`를 `orders.filter((o) => o.paidd)`로 오타를 낸다(`paidd`는 없는 필드).

```sh
npm run typecheck
src/report.ts(10,22): error TS2551: Property 'paidd' does not exist on type 'Order'. Did you mean 'paid'?
```

못 잡던 오타를 `Order` 타입을 명시한 순간부터 잡아낸다. "타입이 있다는 착각"과 "진짜 타입 검사"의 차이가 이것이다.

### `api.ts`에 타입 붙이기

`api.ts`에도 같은 식으로 타입을 붙인다. `Order`는 `report.ts`에서 가져온다.

```ts
// api.ts
import type { Order } from "./report.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 키는 페이지 번호, 값은 그 페이지의 주문 배열
const ORDERS: Record<number, Order[]> = {
  1: [
    { id: 101, user: "kim", price: 12000, paid: true },
    { id: 102, user: "lee", price: 8000, paid: false },
    { id: 103, user: "kim", price: 5000, paid: true },
  ],
  2: [
    { id: 201, user: "lee", price: 30000, paid: true },
    { id: 202, user: "park", price: 7000, paid: true },
  ],
};

export async function fetchOrders(page: number): Promise<Order[]> {
  await delay(500);
  const orders = ORDERS[page];
  if (!orders) throw new Error(`page ${page} not found`);
  return orders;
}
```

`main.ts`는 손댈 필요가 없다. `fetchOrders`가 `Order[]`를 반환하니 `totalByUser(orders)`까지 타입이 그대로 흘러간다(`r.reason`은 원래 `any`라 에러가 안 난다).

이제 `npm run typecheck`가 에러 없이 끝난다(이 상태는 3단계에서 깨진다.).

### TS 문법

- `import type { Order }`: 타입만 가져온다. 타입은 컴파일하면 사라지므로(0장 1절) 이 줄도 같이 사라진다.
- `Promise<void>`: 완료되어도 넘겨줄 값이 없는 Promise다. `delay`처럼 "기다리기만 하는" 비동기 작업에 쓴다.
- `Promise<Order[]>`: async 함수의 반환 타입이다. 아래 "`Promise<T>`"에서 다룬다.

#### `Promise<T>`

JS에서 `Promise`는 "미래 값을 담는 객체"였다. TS는 그 **안에 담길 값의 타입을 `T`로 적는다.** `Promise<Order[]>`는 "완료되면 `Order[]`를 내놓는 Promise"다.

```ts
export async function fetchOrders(page: number): Promise<Order[]> {
  await delay(500);
  ...
  return orders; // 값의 타입은 Order[]인데, 반환 타입은 Promise<Order[]>다
}

const p = fetchOrders(1); // 타입: Promise<Order[]>
const orders = await fetchOrders(1); // 타입: Order[]. await가 Promise를 벗겨 낸다
```

- `async` 함수는 `return`한 값을 자동으로 Promise에 담으므로 본문에서는 `Order[]`를 돌려주고 시그니처에는 `Promise<Order[]>`를 적는다.
- `await`를 붙이면 `Promise<T>`가 `T`로 벗겨진다. `await`를 빼먹으면 `Order[]`가 필요한 자리에 `Promise<Order[]>`가 들어가 타입 에러가 난다.

> `await`를 빼먹은 실수는 JS에서는 조용히 틀린 값이 흘러가지만, TS에서는 대부분 컴파일 에러로 잡힌다.

## 4. 3단계: 신뢰할 수 없는 응답 다루기

지금까지 `fetchOrders`는 우리가 만든 Mock 데이터라 항상 올바른 모양이었다. 실제 API라면 그렇지 않다. 서버 버그, 스키마 변경, 네트워크 중간의 프록시 등으로 **모양이 다른 데이터가 섞여 올 수 있다.**

`api.ts`를 이렇게 바꿔서 그 상황을 흉내 낸다.

```ts
// api.ts
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 서버가 주는 그대로라 타입을 모른다(unknown이 정직한 표현이다)
const RAW_ORDERS: Record<number, unknown[]> = {
  1: [
    { id: 101, user: "kim", price: 12000, paid: true },
    { id: 102, user: "lee", price: 8000, paid: false },
    { id: 103, user: "kim", price: "5000", paid: true }, // price가 문자열로 옴
  ],
  2: [
    { id: 201, user: "lee", price: 30000, paid: true },
    { id: 202, user: "park", price: 7000 }, // paid 필드 누락
  ],
};

export async function fetchOrders(page: number): Promise<unknown[]> {
  await delay(500);
  const orders = RAW_ORDERS[page];
  if (!orders) throw new Error(`page ${page} not found`);
  return orders;
}
```

2단계에서 쓴 `import type { Order }`는 이제 필요 없으니 지웠다. 반환 타입이 `Order[]`가 아니라 `Promise<unknown[]>`로 바뀐 게 핵심이다.

`unknown`은 "뭔지 모른다"를 정직하게 표현하는 타입이다. `any`와 달리, 검증 없이는 프로퍼티에 접근할 수조차 없다(`npm run typecheck`가 `orders[0].user` 같은 코드를 막아준다).

`main.ts`가 지금 그대로면 `orders`(이제 `unknown[]`)를 `totalByUser(orders: Order[])`에 넘기는 자리에서 타입 에러가 난다.

```sh
npm run typecheck
src/main.ts(18,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type 'Order[]'.
  Type 'unknown' is not assignable to type 'Order'.
```

이 에러가 **신뢰 경계**다. 여기서 zod로 검증해 통과한 값만 `Order`로 인정한다.

### zod로 검증하기

`report.ts`에 스키마와 검증 함수를 추가한다. `import`는 파일 맨 위에, 나머지는 기존 코드 아래에 붙인다.

```ts
// report.ts 맨 위에 추가
import { z } from "zod";

// report.ts 맨 아래에 추가
export const OrderSchema = z.object({
  id: z.number().int(),
  user: z.string(),
  price: z.number(),
  paid: z.boolean(),
});

// 성공/실패를 ok로 구분하는 판별 유니온
export type ParsedOrder =
  | { ok: true; order: Order }
  | { ok: false; error: string };

export function parseOrder(raw: unknown): ParsedOrder {
  const result = OrderSchema.safeParse(raw);
  return result.success
    ? { ok: true, order: result.data }
    : {
        ok: false,
        // 실패한 필드마다 "경로: 메시지"를 만들어 " / "로 잇는다
        error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "),
      };
}
```

`ParsedOrder`처럼 "성공 아니면 실패"를 유니온으로 표현하고 `ok`로 분기하면, TS가 각 분기에서 안전한 필드만 쓰도록 **좁혀준다(narrowing)**. `ok: true` 분기에서는 `.order`가, `ok: false` 분기에서는 `.error`가 있다고 보장된다.

### TS 문법

- `type 이름 = ...`(타입 별칭): `interface`처럼 타입에 이름을 붙인다. 유니온처럼 `interface`로 못 쓰는 타입에도 붙일 수 있다.
- 리터럴 타입(`ok: true`): 여기서 `true`는 값이 아니라 "`true` 하나만 허용하는 타입"이다. `"paid"`, `42`처럼 특정 값 하나를 타입으로 쓸 수 있다.
- 판별 유니온(discriminated union): 공통 필드(`ok`)의 값으로 "지금 어느 쪽 모양인지" 구분하는 유니온이다. 아래에서 다룬다.
- 맨 앞의 `|`: 줄을 바꿔 쓰기 위한 표기일 뿐 의미는 없다.

#### 판별 유니온과 좁히기(narrowing)

태그된 유니온(`enum` 태그 + `union`)의 TS 버전이다. `ok`가 태그 역할을 하고, 태그 값마다 가진 필드가 다르다.

```ts
type ParsedOrder =
  | { ok: true; order: Order }    // 태그가 true일 때만 order가 있다
  | { ok: false; error: string }; // 태그가 false일 때만 error가 있다
```

C에서는 태그를 확인하지 않고 `v.value.i`를 읽어도 컴파일이 통과해서 엉뚱한 메모리를 읽게 된다. TS는 **태그를 확인한 분기 안에서만** 그 모양의 필드를 쓰게 허용한다.

```ts
const parsed = parseOrder(raw);

parsed.order; // 컴파일 에러(TS2339): 'ok: false' 쪽에는 order가 없다

if (parsed.ok) {
  parsed.order; // 통과: 이 분기에서 parsed는 { ok: true; order: Order }로 좁혀졌다
} else {
  parsed.error; // 통과: 이 분기에서는 { ok: false; error: string }이다
}
```

- 좁히기는 `if`뿐 아니라 삼항 연산자, `return`/`continue`로 빠져나간 뒤의 코드 등 **코드 흐름 전체**에서 일어난다.
- 판별에 쓸 필드는 리터럴 타입(`true`/`false`, `"success"` 등)이어야 한다. `ok: boolean`으로 적으면 분기해도 좁혀지지 않는다.

> 성공/실패를 `null`이나 예외로 표현하는 대신 이 패턴을 쓰면, "실패 처리를 빼먹는 것"이 컴파일 에러가 된다.

#### zod API

- `z.object({ ... })`: "이런 필드를 가진 객체여야 한다"는 검사 규칙(스키마)을 만든다.
- `z.number()`, `z.string()`, `z.boolean()`: 각 타입이어야 한다는 규칙이다. `z.number().int()`는 숫자이면서 정수여야 한다.
- `.safeParse(값)`: 검사 결과를 `{ success: true, data }` 또는 `{ success: false, error }`로 돌려준다. 아래에서 `parse`와 비교한다.
- `error.issues`: 어떤 필드가 왜 실패했는지 담은 배열이다. 각 항목의 `path`는 필드 위치 배열(`["price"]`), `message`는 실패 이유다.

##### `safeParse`와 `parse`

```ts
OrderSchema.parse(raw); // 실패하면 에러를 throw한다. 성공하면 검증된 값을 바로 돌려준다
OrderSchema.safeParse(raw); // 절대 throw하지 않는다. 성공/실패를 결과 객체로 돌려준다
```

`safeParse`의 결과 `{ success: true, data } | { success: false, error }`도 `success`를 태그로 쓰는 판별 유니온이다. 그래서 `result.success`로 분기하면 `result.data`와 `result.error`가 각각 안전하게 좁혀진다.

이번 프로젝트에서는 "나쁜 데이터 한 건 때문에 전체가 죽으면 안 된다"는 규정을 세웠기 때문에 `safeParse`를 쓴다. 잘못된 입력이 곧 프로그램 오류인 곳(설정 파일 로딩 등)이라면 `parse`로 즉시 터뜨리는 편이 낫다.

### `main.ts`에서 쓰기

`main.ts`에서 이걸 쓴다. `orders`를 만드는 부분을 이렇게 바꾼다.

```ts
// main.ts
import { fetchOrders } from "./api.js";
import { totalByUser, topUser, parseOrder, type Order } from "./report.js";

async function main() {
  console.time("병렬 조회");
  const results = await Promise.allSettled([1, 2, 3].map((page) => fetchOrders(page)));
  console.timeEnd("병렬 조회");

  // 검증을 통과한 주문만 모을 배열
  const orders: Order[] = [];
  results.forEach((r, i) => {
    const page = i + 1; // i는 0부터, 페이지 번호는 1부터
    // r.status로 분기하면 TS가 r의 모양을 좁혀 준다(rejected면 r.reason, fulfilled면 r.value)
    if (r.status === "rejected") {
      console.warn("실패:", r.reason.message);
      return; // 이 페이지는 건너뛴다
    }
    for (const raw of r.value) {
      const parsed = parseOrder(raw);
      // parsed.ok가 true인 분기에서는 parsed.order를, else에서는 parsed.error를 안전하게 쓸 수 있다
      if (parsed.ok) orders.push(parsed.order);
      // 로그용으로만 raw를 "id가 있을 수도 있는 객체"로 간주해 id를 읽는다
      else console.warn(`잘못된 데이터 건너뜀: page ${page}의 주문 ${(raw as { id?: unknown }).id} - ${parsed.error}`);
    }
  });

  const totals = totalByUser(orders);
  console.log("사용자별 합계:", totals);
  console.log("1위:", topUser(totals));
}

main().catch((err) => { console.error("치명적 오류:", err); process.exit(1); });
```

```sh
npx tsx src/main.ts
병렬 조회: 501.434ms
잘못된 데이터 건너뜀: page 1의 주문 103 - price: Invalid input: expected number, received string
잘못된 데이터 건너뜀: page 2의 주문 202 - paid: Invalid input: expected boolean, received undefined
실패: page 3 not found
사용자별 합계: { kim: 12000, lee: 30000 }
1위: { name: 'lee', total: 30000 }
```

103번(가격이 문자열)과 202번(paid 누락)이 리포트에서 조용히 빠지는 대신 이유가 로그로 남는다.

검증 없이 `raw as Order`로 밀어붙였다면 `acc[o.user] = ... + o.price`에서 `12000 + "5000"`처럼 문자열 이어붙이기가 되어(TS 타입 체크를 우회했으므로 컴파일은 통과) 합계가 조용히 틀렸을 것이다. 다음 단계에서 직접 재현한다.

### TS 문법

- `import { ..., type Order }`: 여러 이름을 가져오면서 `Order`만 "타입으로만 쓴다"고 표시한다. 값과 타입을 한 줄에서 같이 가져올 때 쓰며, 컴파일하면 `Order` 항목만 사라진다.
- 선택 속성(`{ id?: unknown }`): `?`를 붙인 필드는 있어도 되고 없어도 된다. 없으면 값은 `undefined`다.
- `raw as { id?: unknown }`: `raw`(`unknown`)를 "id가 있을 수도 있는 객체"로 간주한다. 로그에 id를 찍으려는 용도이고 값을 검증하지 않는다(4단계 참고).
- `allSettled` 결과의 `r.status` 분기: 판별 유니온이 다시 나온 것이다. 아래에서 다룬다.

#### `Promise.allSettled` 결과 좁히기

`allSettled`가 돌려주는 각 항목의 타입은 판별 유니온이고, `status`가 태그다.

```ts
// lib 타입 정의를 단순화한 것
type PromiseSettledResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: any };
```

`results.forEach` 안의 코드가 안전한 이유가 이것이다.

```ts
results.forEach((r, i) => {
  r.value; // 컴파일 에러: rejected 쪽에는 value가 없다

  if (r.status === "rejected") {
    console.warn("실패:", r.reason.message); // 이 분기: reason만 있다
    return; // 여기서 빠져나가므로
  }

  // 여기부터 r은 fulfilled로 좁혀진다(else를 쓰지 않아도 된다)
  for (const raw of r.value) { /* r.value: unknown[] */ }
});
```

- `return`으로 빠져나간 뒤의 코드에서는 남은 쪽 모양으로 좁혀진다. `else`로 감싸는 대신 먼저 걸러내는 방식(early return)이 흔하다.
- `r.reason`은 타입이 `any`라서 `.message`가 에러 없이 통과한다. 지금은 `fetchOrders`가 `Error`를 던진다는 걸 우리가 알고 있어서 괜찮지만, 이 자리가 타입 안전의 구멍이라는 점은 기억해 둔다.

> `fetchOrders`가 `unknown[]`을 돌려주므로 `r.value`도 `unknown[]`이다. 그래서 `for...of`로 꺼낸 `raw`는 `parseOrder`를 거치기 전까지 아무 필드도 읽을 수 없다.

## 5. 4단계: `as`로 검증을 우회하면 어떻게 되는가

`main.ts`의 검증 부분을 잠깐 아래처럼 바꾼다.

```ts
for (const raw of r.value) {
  orders.push(raw as Order); // 검증 없이 "이건 Order야"라고 우기기
}
```

```sh
npm run typecheck # 통과한다. as는 컴파일러를 설득하는 것이지 실제 검증이 아니다
npx tsx src/main.ts
사용자별 합계: { kim: '120005000', lee: 30000 } # kim의 price가 문자열로 이어붙여졌다
1위: { name: 'kim', total: '120005000' } # 1위까지 뒤바뀌었다
```

타입 검사는 **통과**했는데 실행 결과는 틀렸다.

- `12000 + "5000"`이 문자열 `"120005000"`이 되고, 정렬의 `b - a`는 그 문자열을 다시 숫자 1억 2천만으로 바꿔 비교하므로 kim이 1위가 된다.
- 202번(`paid` 누락)은 `o.paid`가 `undefined`(falsy)라 `filter`에서 조용히 빠졌다. 에러 없이 "틀린 합계"만 남는다.

> `as`는 "컴파일러야 나 믿어"일 뿐 런타임 검증이 아니다. 특히 외부 응답에 `raw as Order`를 쓰면 이런 식으로 조용히 틀린 값이 흘러간다.

## 6. 5단계: 검사와 변환은 별개다

`main.ts` 아무 곳에나 타입이 안 맞는 줄을 하나 추가한다.

```ts
const n: number = "abc";
```

세 가지를 차례로 실행해서 차이를 확인한다.

```sh
npx tsx src/main.ts # 에러 없이 실행된다. tsx(esbuild)는 타입 표기를 지우기만 한다
npm run typecheck # 타입 에러로 실패한다. tsc가 실제로 검사한다
npm run build # 에러가 출력되고 종료 코드는 실패(2)지만, dist/main.js는 그래도 생성된다
```

`tsc`도 에러가 나면 JS를 안 만들 것 같지만, 기본 설정(`noEmitOnError`의 기본값 `false`)에서는 만든다.

> 그래서 실무에서는 `typecheck`를 빌드와 별개의 CI 단계로 따로 돌리는 습관이 필요하다.

## 7. 6단계: 타입 에러와 런타임 에러를 구분해서 디버깅하기

JS의 디버깅 방법(`console.table`, `--inspect-brk`, VS Code 브레이크포인트)은 TS에서도 그대로 쓴다. 다만 TS는 "컴파일 단계"가 하나 더 있어서, 어느 단계에서 문제가 생겼는지부터 구분하는 게 우선이다.

5단계(검사와 변환은 별개다)에서 이미 그 감각을 한 번 짚었으니, 여기서는 실제로 막혔을 때 도구를 어떻게 쓰는지를 다룬다.

### 7.1 첫 질문: 타입 에러인가, 런타임 에러인가

```sh
npm run typecheck # 빨간 줄이 여기서 뜨면 타입 에러. 코드가 실행되기 전이다
npx tsx src/main.ts # 여기서 죽으면 런타임 에러. 타입은 이미 통과했다
```

둘을 섞어서 디버깅하면 엉뚱한 곳을 판다.

`typecheck`가 통과했는데 `tsx` 실행이 이상하다면, 4단계에서 본 것처럼 어딘가 `as`로 검증을 우회했거나, 타입이 실제 데이터 모양과 다르다는 뜻이다.

> 먼저 그 지점(특히 `as`, `!`, `any`가 쓰인 줄)부터 의심한다.

### 7.2 타입 에러 메시지 읽는 순서

TS 에러는 길게 늘어질 때가 많다. 위에서 아래로 읽지 말고, **에러 코드(`TSxxxx`)와 마지막 줄부터** 본다.

```ts
const parsed = parseOrder(raw);
// 일부러 낸 실수: parsed.order가 아니라 parsed를 통째로 push
// parsed는 { ok, order } 객체인데 Order 배열에는 Order만 넣을 수 있다 → 타입 에러
if (parsed.ok) orders.push(parsed);
```

```sh
src/main.ts(18,34): error TS2739: Type '{ ok: true; order: Order; }' is missing the following properties from type 'Order': id, user, price, paid
```

- 에러 코드(`TS2739`): "이 타입에는 저 타입이 요구하는 속성이 빠져 있다"는 결론이다.
- 문장 끝(`id, user, price, paid`): "무엇이 빠졌는지"의 가장 구체적인 정보로, 대개 여기에 고칠 방법이 있다. 에러가 여러 줄로 이어지면 마지막 줄이 이 역할을 한다.

`{ ok: true; order: Order; }`를 `Order` 자리에 넣었다는 걸 보고(`if (parsed.ok)` 안이라 TS가 이미 성공 쪽 모양으로 좁혀 놓았다), `orders.push(parsed.order)`가 아니라 `parsed`를 넣었다는 걸 알아챈다. 원복한다.

### 7.3 `tsc --noEmit`을 watch 모드로 켜두기

터미널을 하나 더 열어 계속 띄워둔다.

```sh
npx tsc --noEmit --watch
```

`npm run typecheck`를 저장할 때마다 다시 치는 대신, 파일을 저장하는 즉시 에러가 갱신된다.

`--noEmit`은 5단계에서 본 대로 `tsc`가 기본으로는 에러가 나도 JS를 만들어버리는 것을 막는 옵션이다.

> 디버깅 중에는 항상 이 옵션을 붙여서 "빌드 결과물"과 "타입 검사 결과"를 헷갈리지 않게 한다.

### 7.4 `unknown`/`any` 지점을 좁혀서 확인하기

3단계에서 `fetchOrders`가 `unknown[]`을 반환하도록 바꾼 이유가, 검증 전 데이터에 함부로 접근하지 못하게 막기 위해서였다. 그런데 디버깅 중에는 그 값이 실제로 어떤 모양인지 눈으로 봐야 할 때가 있다. 타입을 어기지 않으면서 확인하는 방법은 이렇다.

```ts
export async function fetchOrders(page: number): Promise<unknown[]> {
  await delay(500);
  const orders = RAW_ORDERS[page];
  if (!orders) throw new Error(`page ${page} not found`);
  console.dir(orders, { depth: null }); // 타입은 unknown 그대로, 중첩된 값까지 펼쳐서 들여다본다
  return orders;
}
```

`orders as Order[]`로 강제 변환해서 찍어보고 싶은 유혹이 들 수 있다. 하지만 4단계에서 본 것처럼 `as`는 실제 값을 바꾸지 않고 컴파일러만 속인다.

확인용이라도 `as`를 넣으면 그 줄을 지우는 걸 잊었을 때 4단계의 사고가 그대로 재현된다.

> `console.dir`/`console.table`처럼 값 자체를 보는 방법을 쓴다.

### 7.5 zod 에러를 `safeParse` 결과에서 바로 펼쳐보기

`parseOrder`가 실패 이유를 문자열로 조립해서 보여주지만(`i.path.join(".")`), 디버깅 중에는 원본 `issues` 배열을 통째로 보는 게 더 빠를 때가 있다.

```ts
export function parseOrder(raw: unknown): ParsedOrder {
  const result = OrderSchema.safeParse(raw);
  // 검증에 실패한 경우에만 진입한다. 이 안에서는 result.error를 안전하게 쓸 수 있다
  if (!result.success) {
    console.dir(result.error.issues, { depth: null }); // code, path, message(그리고 expected 같은 부가 정보)가 전부 보인다
  }
  return result.success
    ? { ok: true, order: result.data }
    : { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / ") };
}
```

103번 주문이라면 이렇게 찍힌다.

```sh
[
  {
    expected: 'number',
    code: 'invalid_type',
    path: [ 'price' ],
    message: 'Invalid input: expected number, received string'
  }
]
```

`i.code`(예: `invalid_type`)나 `i.expected`까지 보면, "왜 이 필드가 걸렸는지"를 메시지 문자열보다 정확히 알 수 있다(zod 3에 있던 `received` 필드는 zod 4에서 빠지고 메시지 안으로 들어갔다).

> 확인이 끝나면 `console.dir` 줄은 지운다. 검증 실패가 정상 흐름(103, 202번처럼)인 코드에 디버깅용 로그를 남겨두면 나중에 진짜 문제와 헷갈린다.

### 7.6 `tsx`로 브레이크포인트 걸기: `node --inspect-brk`와 거의 동일

`tsx`는 내부적으로 esbuild로 타입을 지우고 실행하는 것뿐이라, Node의 인스펙터 플래그가 그대로 통한다.

```sh
# --inspect-brk: 디버거를 열고 첫 줄에서 멈춘다
npx tsx --inspect-brk src/main.ts
```

`chrome://inspect`에서 열면 `.ts` 소스가 그대로 보인다. 소스맵 덕분에 컴파일된 JS가 아니라 원본 줄 번호에 브레이크포인트가 찍힌다.

`parseOrder` 함수 안, `safeParse` 다음 줄에 브레이크포인트를 찍고 103번 주문(`price`가 문자열)이 걸릴 때 `result`가 정확히 어떤 모양인지 그 자리에서 펼쳐본다.

VS Code라면 `.vscode/launch.json`의 `configurations` 배열에 아래 항목을 추가해두면 `F5`로 바로 같은 걸 할 수 있다.

```json
{
  "type": "node",
  // launch: 디버거가 프로그램을 직접 실행한다(이미 떠 있는 프로세스에 붙는 attach와 구분)
  "request": "launch",
  "name": "Debug main.ts",
  // npx tsx src/main.ts를 실행하는 것과 같다
  "runtimeExecutable": "npx",
  "runtimeArgs": ["tsx"],
  // ${workspaceFolder}: VS Code가 열어 둔 프로젝트 폴더 경로로 치환된다
  "program": "${workspaceFolder}/src/main.ts",
  // 출력을 VS Code 하단 통합 터미널에 보여 준다
  "console": "integratedTerminal"
}
```

### 7.7 `strict`를 잠깐 꺼서 원인 좁히기 (원복 필수)

에러가 너무 많이 쏟아져서 뭐부터 봐야 할지 모를 때, `tsconfig.json`에서 딱 하나의 하위 옵션만 켜서 범위를 좁히는 것도 방법이다.

```json
// strict를 끄고 그 하위 옵션 중 strictNullChecks(null/undefined 검사)만 개별로 켠다
{ "compilerOptions": { "strict": false, "strictNullChecks": true } }
```

이렇게 하면 "null/undefined 관련 에러"만 남기고 나머지 엄격 검사(암묵적 `any` 금지 등)는 잠깐 잠재울 수 있다.

> 원인을 찾으면 반드시 `strict: true`로 되돌린다. 1장 표에서 말했듯, 이 옵션이 꺼진 채로 커밋되면 이후 코드에서 TS의 널 안전성이 조용히 사라진다.

C에서 `-Wall -Werror`를 빌드마다 켜두다가, 원인 하나만 좁혀 보려고 잠깐 `-Wno-unused-variable`만 남기고 나머지 경고를 죽인 뒤 반드시 원복하는 것과 같은 습관이다. 디버깅용 완화는 그 세션에서만 쓰고 커밋에는 남기지 않는다.

### 시험해보기

```sh
npx tsx --inspect-brk src/main.ts
```

`main.ts`의 `for (const raw of r.value)` 루프 안, `parseOrder(raw)` 호출 다음 줄에 브레이크포인트를 찍고, 103번/202번 주문이 지나갈 때 `parsed.ok`와 `parsed.error`가 각각 어떤 값인지 직접 확인한다.

### 도전 과제

#### 1. 검사 규칙 더하기

`report.ts`의 `OrderSchema`에서 `price: z.number()`를 `price: z.number().positive()`로 바꾸고, 가격이 0 이하인 Mock 데이터를 하나 추가한다.

`result.error.issues`에 `code`가 뭐로 찍히는지 확인한다.

리포트 출력은 어떻게 달라지는가?

**답**

1. 2페이지에 `{ id: 203, user: "park", price: 0, paid: true }`를 넣으면 `positive()`에 걸린다. 0은 양수가 아니므로 0도 걸린다.
2. `issues`에는 `code: 'too_small'`이 찍힌다. 타입은 숫자로 맞으니 `invalid_type`이 아니다. 함께 `origin: 'number'`, `minimum: 0`, `inclusive: false`(0은 허용 범위에 들지 않는다)가 보인다.
3. 리포트에는 `잘못된 데이터 건너뜀: page 2의 주문 203 - price: Too small: expected number to be >0` 줄이 하나 더 찍히고, 합계는 `{ kim: 12000, lee: 30000 }` 그대로다.

> 가격이 문자열인 103번은 타입 검사에서 먼저 걸리므로 여전히 `invalid_type`이다.

#### 2. 빌드 결과를 디버깅하기

`npm run build`로 `dist/main.js`를 만들고 직접 디버깅한다.

```sh
npm run build
node --inspect-brk dist/main.js
```

`.ts` 소스 대신 컴파일된 `.js`가 보이는가?

**답**

이 문서의 최소본 `tsconfig.json`에는 `"sourceMap": true`가 없어서 `.js`가 보인다. 옵션을 추가하고 다시 빌드하면 `.ts` 원본이 보인다.

## 8. 완성 확인

- [ ] `npm run typecheck`가 에러 없이 끝난다
- [ ] `npx tsx src/main.ts`의 출력이 목표의 기대 결과와 같다(잘못된 데이터 경고 2줄 포함)
- [ ] 2단계의 두 실험(타입 불일치, 오타)에서 컴파일 에러를 직접 봤다
- [ ] 4단계에서 "컴파일은 통과했는데 데이터는 틀린" 상황을 직접 재현했다
- [ ] "타입 검사"와 "JS로의 변환"이 별개의 작업이라는 것을 설명할 수 있다

## 9. 다음 단계

### 자가 점검

소리 내어 설명할 수 있으면 통과다.

1. 1단계에서 `.js`를 `.ts`로 이름만 바꿨더니 `typecheck`는 에러를 쏟아냈는데, `npx tsx src/main.ts`는 왜 멀쩡히 실행됐는가?

2. `interface Order`를 추가한 뒤에야 오타(`paidd`)가 잡힌 이유는?

3. `fetchOrders`의 반환 타입을 `unknown[]`으로 바꾼 이유는? `any[]`였다면 무엇이 달라지는가?

4. `parseOrder`가 반환하는 유니온 타입에서 `ok`로 분기하면 왜 각 분기가 안전한가?

5. `raw as Order`가 위험한 이유를 4단계의 결과로 설명하면?

6. `npx tsx`, `npm run typecheck`, `npm run build`는 각각 무엇을 하고 무엇을 안 하는가?

### 이 문서에서 다루지 않은 것

존재만 알아두면 된다. 필요해지는 시점에 TypeScript 공식 핸드북에서 해당 항목만 찾아 읽는 것으로 충분하다.

- 제네릭 제약(`T extends ...`), 조건부 타입, 매핑 타입, `satisfies` 연산자
- 타입 선언 파일(`.d.ts`)을 직접 작성하는 법
- `enum`(문자열 리터럴 유니온으로 충분히 대체되는 경우가 많다) 등 이 프로젝트에 안 나온 문법