# NestJS: 주문 API를 프레임워크 구조로 다시 만들기

## 목표

주문 API를 NestJS로 만든다.

```sh
curl localhost:3000/orders/totals
{"kim":17000,"lee":30000,"park":7000}
```

express와 다른 점은 **어떻게 조립되는가**다. 함수를 직접 등록하던 걸 데코레이터가 붙은 클래스로, 손으로 하던 의존성 연결을 DI 컨테이너가 대신하도록 바꾼다.

> 버전: NestJS 12(기본 HTTP 어댑터는 Express 5, Node 20 이상).

## 0. NestJS에 대한 사전지식

NestJS가 낯선 이유는 문법(`@Injectable()`, `@Controller()`)이 아니라, "**내가 직접 부르지 않은 코드가 나 대신 인스턴스를 만들고 연결해준다**"는 실행 모델 자체다.

exprss에서는 무엇을 언제 만들지 전부 직접 썼지만(`new`, 함수 호출). NestJS에서는 그 조립을 프레임워크에 맡긴다.

우선 이 문서가 설명 없이 계속 쓰게 되는 말 세 개만 못 박아둔다.

- **클래스와 인스턴스**: 클래스는 설계도, 인스턴스는 그 설계도로 실제로 만들어진 물건 하나다. C의 `struct Order`(틀)와 `struct Order o;`(실제 변수)의 관계와 같다. `new OrdersService()`를 한 번 하면 `OrdersService` 인스턴스가 하나 생기고, 그 인스턴스는 자기만의 필드 값을 가진다. 이 문서에서 "주입된다", "만들어 넣어준다"는 말은 전부 **"이 인스턴스가 생성자 인자로 들어온다"**는 뜻이다.
- **프로퍼티(property)**: 인스턴스가 가진 이름 붙은 값. `this.orders`, `this.nextId`가 프로퍼티다. C 구조체의 멤버에 해당한다. 클래스 본문에 선언한 프로퍼티를 가리킬 때 이 문서는 "필드"라고도 쓴다(같은 의미다).
- **팩토리(factory)**: 물건을 직접 만드는 대신 "만들어서 돌려주는 함수"를 가리키는 말이다. 호출하면 결과물이 나오는 함수가 팩토리다. 아래에 나오는 "데코레이터 팩토리"는 *데코레이터 함수를* 돌려주는 함수라는 뜻이다.

### 1. 데코레이터는 로드 시점에 한 번 실행되어 "표식"을 남기는 함수다.

`@Injectable()`, `@Controller("orders")` 같은 데코레이터는 **함수 호출을 감싸는 매크로가 아니라, 클래스가 정의되는 순간(모듈이 import될 때) 딱 한 번 실행되는 함수**다.

C에서 GCC 확장인 `__attribute__((constructor))`를 떠올리면 된다. `main()`이 실행되기 전에 어떤 함수가 자동으로 실행되고, 그 함수가 전역 레지스트리(배열이나 해시맵)에 "이 핸들러는 이 경로에 등록됐다"는 식으로 자기 자신을 등록해두는 플러그인 패턴과 원리가 같다.

```c
// C: 프로그램 시작 전에 자동 실행되어 전역 테이블에 자신을 등록하는 함수
static void register_orders_route(void) __attribute__((constructor));
static void register_orders_route(void) {
    route_table_add("/orders", handle_orders); // main() 실행 전에 이미 테이블에 들어가 있다
}
```

```ts
// TS: 클래스가 import되는 순간 데코레이터가 실행되어, 그 클래스에 메타데이터(표식)를 남긴다
@Controller("orders") // "이 클래스는 /orders를 담당한다"는 표식
export class OrdersController {}
```

차이는 등록하는 방식이다. C의 `constructor` 함수는 전역 부수효과(테이블에 직접 씀)로 등록을 마친다. 반면 TS 데코레이터는 대개 클래스에 메타데이터(표식)만 남기고, 그 표식을 실제로 읽어서 무언가를 하는 건 나중에 Nest 부트스트랩 과정이다.

여기서 "데코레이터 = 아래 줄의 클래스를 감싸는 래퍼 함수"라는 그림은 한 번 내려놓는 편이 낫다. 이름 때문에 "원래 것을 감싸 호출을 가로채는 함수"로 읽히지만, TS 데코레이터가 인자로 받는 것은 호출이 아니라 **대상 그 자체**이고, 받는 횟수는 정의 시점의 한 번뿐이다.

| 데코레이터 종류 | 무엇을 인자로 받는가 | 언제 실행되는가 |
|---|---|---|
| 클래스(`@Controller()`) | 그 클래스 자체 | 클래스가 정의될 때 한 번 |
| 메서드(`@Get()`) | 메서드가 속한 프로토타입 + 메서드 이름 | 클래스가 정의될 때 한 번 |
| 매개변수(`@Body()`) | 프로토타입 + 메서드 이름 + 매개변수 위치(index) | 클래스가 정의될 때 한 번 |

- 감싸는 것 자체는 문법적으로 가능하다. 클래스 데코레이터가 다른 클래스를 `return`하면 원래 클래스가 교체되고, 메서드 데코레이터가 descriptor를 바꾸면 그 메서드가 교체된다.
- 그런데 **Nest의 데코레이터는 대부분 그 일을 하지 않는다.** `@Injectable()`, `@Controller()`, `@Get()`, `@Body()`는 교체도 감싸기도 하지 않고 표식만 남긴다. 요청마다 값을 가로채 바꾸는 일(Pipe·Guard·Interceptor)은 데코레이터가 아니라, 부팅 때 그 표식을 읽고 Nest가 따로 구성해 둔 객체가 한다.
- 그래서 `@Get(":id")`가 붙은 메서드를 코드에서 직접 호출하면 경로 매칭도 Pipe도 아무것도 일어나지 않는다. 그냥 평범한 메서드 호출이다.

> "등록"과 "그 등록을 읽어 동작시키는 것"이 시간상 분리되어 있다.

### 2. DI 컨테이너는 타입 이름으로 생성자를 찾아 재귀적으로 조립하는 레지스트리다.

`constructor(private readonly ordersService: OrdersService)`만 쓰면 인스턴스가 주입된다. Nest가 부팅 시점에 "어떤 클래스가 어떤 클래스들을 필요로 하는가"를 그래프로 만들고, 필요한 것부터 먼저 만들어 채워 넣기 때문이다.

이름을 그대로 풀면 뜻이 보인다. **의존성(dependency)**은 "이 클래스가 일하려면 있어야 하는 다른 객체"다. `OrdersController`는 `OrdersService` 없이는 아무 일도 못 하므로 `OrdersService`가 그 의존성이다. **주입(injection)**은 "그 객체를 필요한 쪽이 직접 만들지 않고, 밖에서 만들어 넣어주는 것"이다. 즉 DI는 `new`를 쓰는 쪽에서 지우고, 만드는 책임을 컨테이너 한 곳으로 몰아주는 방식을 가리킨다. **DI 컨테이너**는 그 "한 곳"을 맡는 Nest 내부의 레지스트리다.

| 구분 | 직접 만들기(express) | 주입받기(Nest) |
|---|---|---|
| 인스턴스를 만드는 코드 | 쓰는 쪽에 `new OrdersService()` | 쓰는 쪽에 없다. 컨테이너가 부팅 때 만든다 |
| 인스턴스 개수 | `new`를 부른 횟수만큼 | 모듈에 선언한 provider당 하나(기본 싱글턴) |
| 다른 구현으로 바꿀 때 | 쓰는 쪽 코드를 모두 고친다 | 모듈 선언 한 줄을 고친다 |
| 연결을 빼먹으면 | 실행 중에 드러난다 | 부팅 중에 드러난다 |

C로 치면, 각 모듈이 자신이 의존하는 다른 모듈의 이름을 문자열 테이블에 등록해두고, 프로그램 시작 시 그 테이블을 위상 정렬(topological sort)해서 의존 대상부터 초기화 함수를 순서대로 호출하는 초기화 프레임워크와 같은 발상이다.

> **위상 정렬**은 "화살표 방향을 거스르지 않게 줄 세우기"다. `A → B`(A가 B를 필요로 한다)라면 B가 A보다 앞에 오도록 전체를 한 줄로 늘어놓는 것이고, 그렇게 세워 두면 앞에서부터 차례로 만들기만 해도 필요한 것은 항상 이미 만들어져 있다. `Makefile`이 소스보다 헤더를 먼저 보고, 링커가 의존 순서대로 오브젝트를 엮는 것과 같은 종류의 순서 계산이다.

- 줄을 세울 수 없는 경우가 딱 하나 있다. 화살표가 고리를 이룰 때(`A → B → A`)다. 그때는 누구를 먼저 만들어도 틀리므로 Nest는 부팅에서 실패한다. 그것이 순환 의존성이다.
- Nest가 이 순서를 실제로 계산해 인스턴스를 만들어 나가는 과정은 부팅 로그의 `InstanceLoader` 줄로 눈에 보인다.

```c
// C: 이름으로 초기화 함수를 찾아 의존 대상부터 순서대로 호출하는 레지스트리 발상
typedef struct { const char *name; void *(*create)(void); } Registration;
void *resolve(const char *name); // 이름으로 이미 만든 인스턴스를 찾거나, 없으면 의존성부터 만들고 나서 생성 
```

이 "이름(타입)으로 찾아서, 의존 대상을 먼저 재귀적으로 만든다"는 로직을 20줄짜리 TS 코드로 구현한 것이 이 문서 맨 끝 부록의 `resolve()` 함수다.

## 1. 준비

```sh
# @nestjs/cli: NestJS 공식 명령줄 도구. new 이름 = 새 프로젝트 뼈대를 만든다
npx @nestjs/cli new order-api-nest --package-manager npm
cd order-api-nest
# class-validator: 검증 데코레이터 모음, class-transformer: JSON을 클래스 인스턴스로 바꾸는 도구
npm install class-validator class-transformer
# 코드를 컴파일해 실행하고, 저장할 때마다 자동으로 재시작한다
npm run start:dev
```

```sh
curl localhost:3000
Hello World!
```

콘솔에 `Mapped {/, GET} route` 같은 줄이 보이면 컨트롤러가 등록된 것이다.

### 부팅 로그 한 줄의 구조

Nest가 찍는 로그는 전부 같은 모양이다. 한 줄을 조각내 보면 이렇다.

```text
[Nest] 11461  - 2025. 08. 09. 오후 1:29:21     LOG [RouterExplorer] Mapped {/, GET} route +2ms
  (1)   (2)              (3)                   (4)        (5)              (6)            (7)
```

| 조각 | 의미 |
|---|---|
| (1) `[Nest]` | 로거 이름. 기본값이 `Nest`다 |
| (2) `11461` | 프로세스 ID(pid). `kill`할 때 쓰는 그 번호다 |
| (3) 타임스탬프 | 로케일 형식이라 한국어 환경에서는 "오후 1:29:21"로 나온다 |
| (4) `LOG` | 로그 레벨: `LOG`, `WARN`, `ERROR`, `DEBUG`, `VERBOSE` |
| (5) `[RouterExplorer]` | **컨텍스트**: 이 줄을 찍은 주체 |
| (6) `Mapped {/, GET} route` | 메시지 |
| (7) `+2ms` | 같은 컨텍스트의 직전 로그로부터 흐른 시간. 부팅 중 어느 단계가 오래 걸렸는지 볼 때 쓴다 |

`Mapped {/, GET} route`는 (5)가 `RouterExplorer`, 즉 컨트롤러의 메서드를 훑어 라우트로 등록하는 Nest 내부 부품이다. 메시지는 "`{경로, HTTP 메서드}` 조합을 라우터 테이블에 올렸다"는 보고다. 그래서 이 줄은 단순한 안내가 아니라, **데코레이터가 남긴 표식을 Nest가 실제로 읽어서 등록까지 끝냈다는 확인**이다(0장에서 말한 "등록을 읽어 동작시키는" 쪽 절반). 이 줄이 없으면 컨트롤러 파일을 아무리 잘 써 두었어도 그 경로는 존재하지 않는다.

나머지 줄도 읽을 줄 알아야 한다. 외울 것은 **순서** 하나다. 부팅 로그는 매번 같은 순서로 흐르고, 어디까지 찍혔는지가 곧 "어디서 죽었는가"이기 때문이다.

| 컨텍스트 | 줄 | 무엇이 끝났다는 뜻인가 |
|---|---|---|
| `NestFactory` | `Starting Nest application...` | `NestFactory.create(AppModule)`에 들어갔다 |
| `InstanceLoader` | `AppModule dependencies initialized` | 그 모듈의 provider를 다 만들고 주입까지 끝냈다. 모듈마다 한 줄씩 |
| `RoutesResolver` | `AppController {/}:` | 이 컨트롤러를 처리하기 시작했다. `{}` 안은 컨트롤러 경로 접두사 |
| `RouterExplorer` | `Mapped {/, GET} route` | 그 컨트롤러의 메서드 하나를 경로에 등록했다. 메서드마다 한 줄씩 |
| `NestApplication` | `Nest application successfully started` | `app.listen()`까지 끝나 요청을 받는 중이다 |

- `InstanceLoader` 줄 도중에 멈췄다 → DI 조립 실패다. 마지막으로 찍힌 모듈 다음 모듈의 `providers`를 본다.
- `InstanceLoader`는 다 찍혔는데 `Mapped`가 없다 → 조립은 됐지만 라우트가 없다. 컨트롤러가 그 모듈의 `controllers`에 없거나, 모듈이 `imports`에 없다.
- `Mapped`까지 다 찍혔는데 요청이 500이다 → 조립도 등록도 끝났고 **실행**이 깨졌다. 메타데이터 누락이 전형적인 원인이다.

대괄호 안이 Nest 내부 부품 이름이 아니라 내 클래스 이름이면(나중에 만들 `[OrdersService]`처럼) 그 줄은 내 코드가 `Logger`로 찍은 것이다. 메시지도 그 클래스가 쓴 문장이므로, 거기부터는 Nest 문서가 아니라 그 코드를 읽어야 한다.

> `successfully started` **뒤에** `ERROR`가 찍힌다면 부팅 실패가 아니다. 앱은 떠 있고, 그 뒤에 일어난 어떤 동작 하나가 실패한 것이다. 둘을 섞으면 엉뚱한 곳을 고치게 된다.

### Nest 12 스캐폴드에서 먼저 눈여겨볼 것

옛 Nest 예제와 모양이 다르다.

- `package.json`에 `"type": "module"`이 있다(ESM 프로젝트다). 그래서 스캐폴드 코드도 `import { AppService } from './app.service.js';`처럼 상대경로에 `.js`를 붙이고, 이 문서의 코드도 전부 그렇게 쓴다. 빼먹으면 `tsc`가 `TS2307: Cannot find module './orders.controller' or its corresponding type declarations.`로 막는다.

- `src/main.ts`가 `await app.listen(process.env.PORT ?? 3000);`으로 포트를 환경변수에서 읽고, 마지막 줄이 `await bootstrap();`(최상위 await)이다.

- 테스트 러너는 Jest가 아니라 Vitest(`npm test`), 린터는 ESLint가 아니라 oxlint(`npm run lint`)다.

| 스크립트 | 의미 |
|---|---|
| `npm run start:dev` | 컴파일 후 실행, 저장 시 재시작. express의 `tsx watch`에 대응하지만 메타데이터를 만들어주는 컴파일러를 쓴다 |
| `npm run build` | `nest build` → `dist/` |
| `npm run start:debug` | `nest start --debug --watch`, 인스펙터를 켠 채 실행 |
| `npx tsc --noEmit` | 타입 검사만 |

`tsconfig.json`에서 `experimentalDecorators: true`, `emitDecoratorMetadata: true`가 켜져 있는지 확인한다. 없으면 Nest가 동작하지 않는다.

## 2. 1단계: 왜 생성자에 타입만 써도 주입되는가

본격적으로 만들기 전에, Nest 코드에서 가장 낯선 부분 하나를 짧게 짚는다. 곧 이렇게 쓸 것이다.

```ts
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {} // 이것만으로 주입된다
}
```

express 에서는 `new OrdersService()`를 직접 호출하거나 모듈 스코프 함수를 가져다 썼다. 여기서는 타입만 선언했는데 Nest가 알아서 인스턴스를 만들어 넣어준다. 이것을 의존성 주입(DI)이라 한다.

**모듈 스코프**는 파일 하나의 맨 바깥 범위다. ESM에서 파일은 각자 독립된 스코프를 가지므로, 파일 맨 바깥에 선언한 변수와 함수는 그 파일 안에서만 보이고 `export`한 것만 다른 파일이 `import`로 가져다 쓴다. express 버전의 `orders.store.ts`가 바로 그 모양이었다.

```ts
// express: 파일 맨 바깥 = 모듈 스코프. import하는 쪽은 export된 함수만 본다
const orders: Order[] = [ /* ... */ ]; // 이 파일 밖에서는 보이지 않는다
export function list() { return [...orders]; } // = 모듈 스코프 함수
```

모듈 본문은 프로세스당 한 번만 실행되고 그 결과가 캐시되므로, 몇 군데서 `import`해도 `orders` 배열은 하나다. "앱 전체에 인스턴스 하나"인 Nest의 싱글턴 Provider가 이 성질을 그대로 물려받는다.

| | express | Nest |
|---|---|---|
| 상태를 두는 곳 | 모듈 스코프 변수 | 인스턴스의 프로퍼티 |
| 꺼내 쓰는 방법 | `import { list }` | 생성자 주입 후 `this.ordersService.list()` |
| 하나인 이유 | 모듈 본문이 한 번만 실행된다 | 컨테이너가 provider당 하나만 만든다 |

원리는 세 가지가 겹쳐서 가능하다.

#### `emitDecoratorMetadata`가 생성자 타입을 남긴다

이 옵션을 켜면, 데코레이터가 붙은 클래스에 한해 **`tsc`가 생성자 파라미터의 타입을 런타임 값으로 남겨준다.** TS에서 "타입은 컴파일 후 전부 지워진다"고 했지만 이 옵션이 사실상 유일한 예외다.

- 단, 클래스만 남는다. `interface`/`type`은 `Object`라는 빈 껍데기로만 남는다.

- DTO를 반드시 class로 쓰는 이유, 그리고 `tsx`로 Nest를 실행하면 안 되는 이유가 여기서 나온다.

#### Nest가 부팅 때 메타데이터를 읽어 조립한다

Nest가 부팅 시점에 이 메타데이터를 읽어 인스턴스를 조립한다. express 의 `router.get(...)` 직접 등록이 "선언(데코레이터) + 읽기(Nest)" 두 단계로 나뉜 것이다.

> 더 깊이 알고 싶다면: Nest 없이 이 원리만 20줄로 직접 재현해볼 수 있다. `reflect-metadata`로 메타데이터를 직접 읽고 쓰는 미니 DI 컨테이너를 만드는 실습이다. 지금 단계에 필수는 아니므로 이 문서 맨 끝 부록에 남겨뒀다. 지금은 "`tsx`로 실행하면 이게 깨진다"는 사실만 기억하고 넘어가도 된다.

### TS 문법

- 데코레이터(`@이름`): 클래스, 메서드, 필드, 매개변수 위에 붙여서 정보를 남기거나 동작을 덧붙이는 문법이다. 언제 실행되는지는 위 "데코레이터가 표식을 남긴다"에서 봤다. `@Controller("orders")`처럼 괄호가 붙는 이유는 아래 "데코레이터 팩토리: 괄호를 붙이는 이유"에서 다룬다.
- 매개변수 프로퍼티(`constructor(private readonly ordersService: OrdersService)`): 생성자 매개변수 선언과 필드 생성을 한 번에 한다. 아래 "매개변수 프로퍼티"에서 다룬다.

#### 데코레이터 팩토리: 괄호를 붙이는 이유

데코레이터 자리(`@` 뒤)에는 "**클래스를 받아 처리하는 함수**"가 와야 한다. 그런데 `@Controller("orders")`는 경로 같은 설정값도 받아야 한다. 그래서 Nest의 데코레이터는 전부 "설정값을 받아 데코레이터 함수를 돌려주는 함수"(데코레이터 팩토리)로 만들어져 있다.

```ts
@Controller("orders") // 1) Controller("orders")를 호출해 데코레이터 함수를 받고
export class OrdersController {} // 2) 그 함수에 OrdersController 클래스를 넘긴다
```

설정값이 없는 `@Injectable()`도 팩토리라서 빈 괄호를 붙인다. 괄호를 빼먹으면 `Injectable` 자체가 클래스를 받는 셈이 되어 `tsc`가 막는다.

```ts
@Injectable // 괄호 누락
export class OrdersService {}
// error TS1238: Unable to resolve signature of class decorator when called as an expression.
//   ... Did you mean to call it?
```

| 쓴 모양 | `@` 뒤에 오는 것 |
|---|---|
| `@Injectable()` | `Injectable()`이 돌려준 데코레이터 함수 |
| `@Injectable` | `Injectable` 팩토리 자체(잘못) |

- 이 문서의 Nest 데코레이터(`@Controller`, `@Get`, `@Body`, `@IsString` 등)는 인자가 없어도 전부 괄호를 붙인다.
- 팩토리를 직접 만드는 모양은 부록의 `function Get(path: string): MethodDecorator`에서 볼 수 있다.
- `@Controller("orders")`의 `"orders"`는 따옴표가 붙은 **문자열**, 즉 URL 경로 조각이다. "이 컨트롤러는 `/orders`로 시작하는 요청을 받는다"고 Nest에 알려주는 값이라서 설정값이라고 부른다. 이후에 서비스가 갖게 되는 `orders` 배열(`private readonly orders: Order[]`)과는 **이름만 같고 아무 관계가 없다.** 전자는 경로, 후자는 주문 데이터를 담은 프로퍼티다.

> 에러 메시지에 `Did you mean to call it?`이 보이면 데코레이터 뒤 `()`부터 확인한다.

#### 매개변수 프로퍼티

생성자 매개변수 앞에 `private`, `public`, `readonly` 같은 수식어를 붙이면, TS가 같은 이름의 필드를 만들고 생성자 안에서 대입까지 해 준다. 아래 두 클래스는 같다.

```ts
// 매개변수 프로퍼티
class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}
}

// 풀어 쓴 모양
class OrdersController {
  private readonly ordersService: OrdersService;
  constructor(ordersService: OrdersService) {
    this.ordersService = ordersService;
  }
}
```

- 수식어가 하나도 없으면(`constructor(ordersService: OrdersService)`) 그냥 매개변수일 뿐이라 필드가 생기지 않는다. 메서드에서 `this.ordersService`를 쓰면 `tsc`가 `TS2339: Property 'ordersService' does not exist`로 막는다.
- `private`, `readonly`는 타입 검사용 표시라서 컴파일된 JS에는 남지 않는다(컴파일된 JS에는 `this.ordersService = ordersService` 대입만 남는다). 런타임에서 막아 주는 것은 아니다.
- Nest가 주입에 쓰는 것은 수식어가 아니라 생성자 매개변수의 타입(`OrdersService`)이다. 위 "`emitDecoratorMetadata`가 생성자 타입을 남긴다"가 그 이야기다.

> Nest 코드의 생성자가 거의 항상 `{}`로 비어 있는 이유가 이 문법이다.

### NestJS 데코레이터

- `@Controller(경로)`: "이 클래스는 이 경로의 요청을 받는 컨트롤러다"라는 표식이다. 이 표식이 있어야 Nest가 인스턴스를 만들고 생성자에 필요한 것을 넣어 준다.

## 3. 2단계: 모듈 뼈대 만들기

주문 기능을 담을 폴더를 만든다.

```sh
# -p: 중간 폴더가 없으면 함께 만든다
mkdir -p src/orders/dto
```

```ts
// src/orders/orders.service.ts
import { Injectable } from "@nestjs/common";

// Service(=Provider): 비즈니스 로직을 담는 클래스
@Injectable()
export class OrdersService {}
```

```ts
// src/orders/orders.controller.ts
import { Controller } from "@nestjs/common";

// Controller: HTTP 요청을 받는 클래스. 이 클래스의 모든 경로가 /orders로 시작한다
@Controller("orders")
export class OrdersController {}
```

`src/orders/orders.module.ts`

```ts
import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

// Module: 관련된 컨트롤러와 서비스를 한 묶음으로 선언하는 "조립도"
@Module({ controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
```

`src/app.module.ts`

```ts
// OrdersModule import와 imports 배열만 추가 (스캐폴딩 나머지는 그대로)
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { OrdersModule } from "./orders/orders.module.js";

// AppModule은 루트(최상위) 모듈이다
@Module({ imports: [OrdersModule], controllers: [AppController], providers: [AppService] })
export class AppModule {}
```

`app.module.ts`가 이 모듈들을 트리로 모은다. express 에는 이런 강제 구조가 없었다. 폴더를 어떻게 나눌지는 전부 개발자 몫이었다. 컨트롤러와 서비스가 무엇을 나눠 갖는지는 아래 "컨트롤러와 서비스는 무엇을 나눠 갖는가"에서, "트리로 모은다"가 무슨 말인지는 "모듈 트리: 루트에 매달리지 않으면 존재하지 않는다"에서 다룬다.

### NestJS 데코레이터

- `@Injectable()`: 이 클래스를 주입 대상(Provider)으로 등록하는 표식이다.

`@Module`은 기능 단위를 묶는 조립도다. 다음 항목을 선언한다.

- `controllers`: 요청을 받는 클래스들
- `providers`: 로직을 담고 주입 대상(DI 대상)이 될 클래스들
- `imports`: 필요하면 다른 모듈을 가져온다. 가져온 모듈의 기능이 이 모듈에 포함된다
- `exports`: 이 모듈의 provider를 다른 모듈에 공개한다

`imports`와 `exports`가 어떻게 맞물리는지는 아래 "모듈의 경계: `providers`, `imports`, `exports`"에서 다룬다.

#### 컨트롤러와 서비스는 무엇을 나눠 갖는가

**컨트롤러(Controller)**는 HTTP를 아는 유일한 층이다. 어떤 경로·메서드를 받을지 선언하고, 요청에서 값을 꺼내고(`@Param`, `@Query`, `@Body`), 서비스를 불러 그 결과를 돌려준다. 돌려준 값을 JSON으로 만들고 상태 코드를 붙이는 일은 Nest가 한다. 이름의 "control"은 들어온 요청을 어디로 보낼지 **지시**한다는 뜻이고, 실제 일은 하지 않는다.

**서비스(Service)**는 HTTP를 모른다. 주문 목록을 들고 있고, 합계를 계산하고, 없는 주문이면 예외를 던진다. `req`도 `res`도 받지 않으므로 HTTP 없이 메서드만 불러서 쓸 수 있다.

| | 컨트롤러 | 서비스 |
|---|---|---|
| 아는 것 | 경로, 쿼리, 본문, 상태 코드 | 주문 데이터와 규칙 |
| 이 문서의 파일 | `orders.controller.ts` | `orders.service.ts` |
| 등록되는 자리 | `@Module`의 `controllers` | `@Module`의 `providers` |
| 주입 방향 | 서비스를 주입받는다 | 컨트롤러를 모른다 |
| 혼자 테스트하려면 | HTTP 요청을 만들어 보내야 한다 | 메서드를 그냥 부르면 된다 |

express에서 라우터 파일과 `orders.store.ts`를 나눴던 것과 같은 분리인데, 이번에는 프레임워크가 이름과 자리까지 정해 둔 것이다.

> 컨트롤러에 계산 로직을 쓰기 시작하면 이 경계가 무너진다.

#### 모듈 트리: 루트에 매달리지 않으면 존재하지 않는다

`AppModule`이 `imports: [OrdersModule]`을 선언하고, `OrdersModule`도 또 다른 모듈을 `imports`할 수 있다. 이렇게 "모듈이 모듈을 가져온다"는 관계가 이어지면 루트 모듈을 뿌리로 하는 트리가 된다.

```text
AppModule (루트. NestFactory.create()에 넘기는 것)
├─ imports: OrdersModule ← 여기 적어서 매달았다
│  ├─ controllers: OrdersController → /orders 라우트
│  └─ providers:   OrdersService
├─ controllers: AppController → / 라우트
└─ providers:   AppService
```

`NestFactory.create(AppModule)`에 루트 하나만 넘기는 것으로 끝나는 이유가 이것이다. Nest는 루트에서 시작해 `imports`를 따라 내려가며 트리 전체를 훑고, 만난 모듈의 `controllers`와 `providers`를 모아 조립한다. 부팅 로그에서 `InstanceLoader` 줄이 모듈마다 하나씩 찍히는 것이 이 훑기의 결과다(1단계).

뒤집으면, **트리에 매달리지 않은 모듈은 파일이 멀쩡히 있어도 앱에 존재하지 않는다.** `AppModule`의 `imports`에서 `OrdersModule`을 빼면 컴파일은 통과하고 서버도 뜨지만 `/orders`가 통째로 사라지고, 부팅 로그에서 `Mapped {/orders, GET}` 줄도 함께 사라진다.

- 엄밀히는 트리가 아니라 그래프다. 두 모듈이 같은 모듈을 `imports`할 수 있고(그래도 provider 인스턴스는 하나로 공유된다), `forwardRef()`를 쓰면 고리도 만들 수 있다. "트리"는 루트에서 `imports`를 따라 내려가는 이 모양을 가리키는 말이다.
- `imports`로 모듈을 가져왔다고 그 모듈의 provider를 전부 주입할 수 있는 것은 아니다. 공개 범위는 아래에서 다룬다.

#### 모듈의 경계: `providers`, `imports`, `exports`

`providers`에 적은 클래스는 **그 모듈 안에서만** 주입할 수 있다. 다른 모듈에서 쓰려면 두 쪽이 모두 선언해야 한다. 가진 쪽은 `exports`로 공개하고, 쓰는 쪽은 그 모듈을 `imports`로 가져온다.

예를 들어 주문 합계로 보고서를 만드는 `ReportModule`이 `OrdersService`를 주입받으려면 이렇게 된다.

```ts
@Module({ controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}

@Injectable()
export class ReportService {
  constructor(private readonly ordersService: OrdersService) {}
}

@Module({ imports: [OrdersModule], providers: [ReportService] })
export class ReportModule {}
```

| `OrdersModule`의 `exports` | `ReportModule`의 `imports` | 결과 |
|---|---|---|
| `[OrdersService]` | `[OrdersModule]` | 주입된다 |
| 없음 | `[OrdersModule]` | 부팅 실패 |
| `[OrdersService]` | 없음 | 부팅 실패 |

`exports`를 빼먹으면 `imports`는 해 두었어도 부팅 때 에러가 난다.

```sh
Nest can't resolve dependencies of the ReportService (?). Please make sure that the argument OrdersService at index [0] is available in the ReportModule module.
```

- 이 문서는 `OrdersModule` 하나만 쓰므로 `exports`가 없어도 된다. `AppModule`이 `OrdersModule`을 `imports`하는 것은 컨트롤러의 라우트를 앱에 포함시키기 위해서이고, `OrdersService`를 `AppModule`에서 쓰려는 게 아니다.
- `OrdersService`를 `ReportModule`의 `providers`에도 적으면 에러는 사라지지만, `ReportModule` 전용 인스턴스가 하나 더 생긴다. 주문 목록이 두 벌로 갈라지므로 공유가 목적이면 `exports`/`imports`로 푼다.

> C로 치면 `providers`만 적은 것은 `.c` 파일 안의 `static` 함수, `exports`는 헤더에 선언을 올리는 것, `imports`는 그 헤더를 `#include`하는 것에 가깝다. 헤더에 올리지 않은 `static` 함수는 다른 파일에서 부를 수 없다.

## 4. 3단계: 서비스에 로직 이식하기

express의 `orders.store.ts`를 `OrdersService`로 옮긴다.

```ts
// src/orders/orders.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";

export interface Order { id: number; user: string; price: number; paid: boolean; }

@Injectable() // 기본 scope는 싱글턴(앱 전체 인스턴스 1개)
export class OrdersService {
  // express의 모듈 스코프 변수 → 싱글턴 Provider의 필드. "요청 간 상태 공유"라는 성질은 그대로다
  private readonly orders: Order[] = [
    { id: 101, user: "kim", price: 12000, paid: true },
    { id: 102, user: "lee", price: 8000, paid: false },
    { id: 103, user: "kim", price: 5000, paid: true },
    { id: 201, user: "lee", price: 30000, paid: true },
    { id: 202, user: "park", price: 7000, paid: true },
  ];
  private nextId = 203;

  list(paid?: boolean): Order[] {
    return paid === undefined ? [...this.orders] : this.orders.filter((o) => o.paid === paid);
  }
  findOne(id: number): Order {
    const order = this.orders.find((o) => o.id === id);
    if (!order) throw new NotFoundException(`order ${id} not found`); // express의 HttpError(404)에 대응
    return order;
  }
  create(input: Omit<Order, "id">): Order {
    const order: Order = { id: this.nextId++, ...input };
    this.orders.push(order);
    return order;
  }
  totals(): Record<string, number> {
    // 결제 완료만 거른 뒤 사용자 이름별 합계 객체 하나로 접는다
    return this.orders.filter((o) => o.paid).reduce<Record<string, number>>((acc, o) => {
      acc[o.user] = (acc[o.user] ?? 0) + o.price;
      return acc;
    }, {});
  }
}
```

express에서 함수로 export하던 것들이 클래스의 메서드가 됐다.

`NotFoundException`처럼 Nest가 내장한 예외 클래스를 던지면, Nest의 기본 예외 필터가 알아서 상태 코드(여기서는 404)와 JSON 응답으로 바꿔준다. express에서 직접 짠 4인자 에러 핸들러가 여기선 프레임워크 안에 있다.

## 5. 4단계: 라우트 연결하기

```ts
// src/orders/orders.controller.ts
import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { OrdersService } from "./orders.service.js";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {} // 생성자 주입(1단계의 원리가 여기 쓰인다)

  @Get()
  list(@Query("paid") paid?: string) {
    return this.ordersService.list(paid === undefined ? undefined : paid === "true");
  }

  // express 같은 함정: "totals"는 ":id"보다 먼저 선언해야 한다. 선언 순서가 곧 등록 순서다
  @Get("totals")
  totals() {
    return this.ordersService.totals();
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) { // express의 Number() + isInteger 검사를 Pipe가 대신한다
    return this.ordersService.findOne(id);
  }
}
```

메서드가 값을 return하면 Nest가 그 값을 JSON 응답으로 보낸다. `res.json()`을 직접 부르지 않는다.

```sh
curl localhost:3000/orders/totals # {"kim":17000,"lee":30000,"park":7000}
curl localhost:3000/orders/abc # {"message":"Validation failed (numeric string is expected)",...} → 400
```

부팅 로그에서 `Mapped {/orders, GET}`, `Mapped {/orders/totals, GET}`, `Mapped {/orders/:id, GET}`가 이 순서로 찍히는지 확인한다.

`@Get("totals")`를 `@Get(":id")` 아래로 옮기고 다시 실행하면 `curl localhost:3000/orders/totals`가 `ParseIntPipe`에 걸려 400이 된다. express와 같은 함정이 여기서도 선언 순서 문제로 재현된다. 원복한다.

### NestJS 데코레이터

- `@Get(경로)`: 그 경로의 GET 요청을 이 메서드가 처리한다. 경로를 생략하면 컨트롤러 경로(`/orders`) 자체다. `:id`처럼 콜론 뒤는 경로 매개변수다.
- `@Query(이름)`: 쿼리스트링 `?paid=...`의 값을 매개변수로 받는다. 값은 문자열이고, 없으면 `undefined`다. `list`가 `paid === "true"`로 비교하는 이유는 아래 "쿼리스트링과 경로 매개변수는 문자열이다"에서 다룬다.
- `@Param(이름, 파이프)`: 경로 매개변수를 꺼내고, 넘긴 Pipe로 변환한다.

#### 쿼리스트링과 경로 매개변수는 문자열이다

URL은 글자일 뿐이라 `?paid=true`의 `true`도, `/orders/101`의 `101`도 Nest에 **문자열로** 들어온다. 그래서 `list`는 `paid`를 `string`으로 받고 `"true"`와 직접 비교한다.

```ts
list(@Query("paid") paid?: string) {
  return this.ordersService.list(paid === undefined ? undefined : paid === "true");
}
```

`Boolean(paid)`로 바꾸고 싶어지지만, 비어 있지 않은 문자열은 전부 참이라 `?paid=false`도 `true`가 된다.

```js
const paid = "false";
console.log(Boolean(paid)); // 출력: true
console.log(paid === "true"); // 출력: false
```

매개변수 타입을 `number`나 `boolean`으로 적어도 값이 바뀌지는 않는다. 타입 표기는 검사에만 쓰이고, 런타임에 문자열을 숫자로 바꿔 주는 코드는 저절로 생기지 않는다.

- 문자열을 다른 타입으로 바꾸는 일은 Pipe가 한다. `findOne`의 `ParseIntPipe`가 그 예이며, 아래 "Pipe: 핸들러에 닿기 전에 값을 바꾸고 거른다"에서 다룬다.
- 쿼리 값이 없으면 `undefined`라서 `paid?: string`처럼 선택 매개변수로 받는다.

> `?paid=false`에서 `false`를 받으려면 `"false"`라는 문자열과 비교해야 한다. 타입을 `boolean`으로 적는 것만으로는 바뀌지 않는다.

### NestJS API

- `ParseIntPipe`: 문자열을 정수로 바꾸고, 실패하면 400을 내는 내장 Pipe다. Pipe가 무엇인지는 아래 "Pipe: 핸들러에 닿기 전에 값을 바꾸고 거른다"에서 다룬다.

#### Pipe: 핸들러에 닿기 전에 값을 바꾸고 거른다

Pipe는 요청에서 꺼낸 값이 **컨트롤러 메서드에 인자로 들어가기 직전에** 한 번 거치는 단계다. 값을 다른 타입으로 바꾸거나(변환), 규칙에 안 맞으면 예외를 던져 메서드 실행 자체를 막는다(검증).

```ts
@Get(":id")
findOne(@Param("id", ParseIntPipe) id: number) {
  return this.ordersService.findOne(id);
}
// "/orders/101" → "101" → ParseIntPipe → 101 → findOne(101)
// "/orders/abc" → "abc" → ParseIntPipe가 400을 던진다. findOne은 호출되지 않는다
```

Pipe를 빼고 `@Param("id") id: number`로만 쓰면, 타입 표기는 `number`인데 실제 값은 문자열 `"101"`이다. 컴파일도 통과하고 서버도 뜬다. 그런데 서비스의 `o.id === id`는 `101 === "101"`이라 항상 거짓이 되어, 있는 주문인데 404가 난다.

```sh
curl localhost:3000/orders/101 # Pipe를 뺐을 때
# {"message":"order 101 not found","error":"Not Found","statusCode":404}
```

| 구분 | express | NestJS |
|---|---|---|
| 문자열 → 숫자 | 핸들러 안에서 `Number()` | `ParseIntPipe` |
| 실패 처리 | 핸들러가 직접 `isInteger` 검사 후 에러 | Pipe가 400 예외를 던진다 |
| 핸들러가 받는 값 | 핸들러가 직접 바꾼 값 | 이미 바뀐 `number` |

- Pipe는 `@Param`, `@Query`, `@Body`의 두 번째 인자로 그 매개변수에만 걸 수도 있고, 이후의 `app.useGlobalPipes(...)`처럼 앱 전체에 걸 수도 있다.
- 이후의 `ValidationPipe`도 같은 자리에서 동작하는 Pipe다. 변환 대신 DTO 규칙으로 검증하는 쪽에 무게가 있다.

> 400과 404는 원인이 다르다. "abc"처럼 형식이 틀린 값은 Pipe가 400으로 막고, 형식은 맞는데 없는 주문은 서비스가 404를 던진다.

## 6. 5단계: DTO와 ValidationPipe로 검증하기

```ts
// src/orders/dto/create-order.dto.ts
import { IsBoolean, IsNotEmpty, IsNumber, IsPositive, IsString } from "class-validator";

// express의 CreateOrderSchema(zod)에 대응. class 하나가 "타입"이자 "런타임 검증 규칙"이다(interface로는 안 된다)
export class CreateOrderDto {
  @IsString() @IsNotEmpty() user!: string;
  @IsNumber() @IsPositive() price!: number;
  @IsBoolean() paid!: boolean;
}
```

DTO(Data Transfer Object, 데이터 전송 객체)는 요청 본문이 어떤 모양이어야 하는지 정의한 클래스다. 이름의 "전송"은 **경계를 넘어 오가는 데이터**라는 뜻이다. 클라이언트가 보낸 JSON은 아직 믿을 수 없는 바깥 데이터이고, DTO는 그것을 받아들일 모양과 규칙을 적어 둔 입구다. 그래서 DTO에는 로직을 두지 않고 필드와 검증 데코레이터뿐이다.

3단계에서 서비스에 쓴 `Order`와 비교하면 역할이 갈린다.

| | `CreateOrderDto` | `Order` |
|---|---|---|
| 무엇의 모양인가 | 밖에서 들어오는 요청 본문 | 앱이 안에서 들고 있는 주문 |
| `id` | 없다(서버가 붙인다) | 있다 |
| class냐 interface냐 | class여야 한다(런타임에 검증 규칙을 읽기 때문) | interface로 충분(검증에 쓰이지 않는다) |

> 그래서 `create(@Body() dto: CreateOrderDto)`가 받은 값을 서비스의 `create(input: Omit<Order, "id">)`에 그대로 넘길 수 있다. 두 모양이 `id`만 빼고 같기 때문이다.

`OrdersService.create`는 3단계에서 이미 옮겨 두었으니, `OrdersController`에 POST만 추가한다.

`orders.controller.ts`

```ts
// 맨 위 import를 이렇게 바꾼다(Body, Post 추가, DTO import 추가)
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { CreateOrderDto } from "./dto/create-order.dto.js";
import { OrdersService } from "./orders.service.js";

// 클래스 안, findOne 아래에 추가
@Post() // POST의 기본 응답 코드는 201
create(@Body() dto: CreateOrderDto) {
  return this.ordersService.create(dto);
}
```

`main.ts`에 전역 `ValidationPipe`를 등록한다. **이 한 줄이 없으면 DTO의 검증 데코레이터는 아무 일도 하지 않는다.**

```ts
// src/main.ts
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // 환경변수 PORT가 있으면 그 포트, 없으면 3000
  await app.listen(process.env.PORT ?? 3000);
}
// 서버를 시작한다. ESM이라 최상위에서 await할 수 있다
await bootstrap();
```

```sh
# -X: 메서드 지정, -H: 요청 헤더 추가, -d: 요청 본문
curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"choi","price":9000,"paid":true}'
# {"id":203,"user":"choi","price":9000,"paid":true} → 201
curl -X POST localhost:3000/orders -H "Content-Type: application/json" -d '{"user":"","price":-5}'
# {"message":["user should not be empty","price must be a positive number","paid must be a boolean value"],"error":"Bad Request","statusCode":400} → 400
```

express와 에러 본문의 모양이 다르다(`{"error": "..."}` vs `{"message", "error", "statusCode"}`). Nest의 기본 예외 필터가 정한 형식이다.

### TS 문법

- 확정 할당 단언(`user!: string`): "초기값이 없어도 나중에 반드시 채워진다"고 컴파일러에게 알린다. 여기서는 Nest가 요청 데이터로 채운다. 이 프로젝트에서 꼭 필요한지는 아래 "확정 할당 단언(`!`)이 하는 일"에서 다룬다.

#### 확정 할당 단언(`!`)이 하는 일

`strict` 모드의 `tsc`는 클래스 필드가 생성자에서 값을 받지 않으면 "초기화되지 않은 필드"로 막는다(`strictPropertyInitialization`). DTO는 생성자가 없고, 값은 Nest가 요청 본문으로 나중에 채우므로 이 검사에 걸린다. `!`는 "채워지는 걸 내가 보장한다"며 그 필드만 검사에서 빼 달라는 표시다.

```ts
export class CreateOrderDto {
  user: string; // error TS2564: Property 'user' has no initializer and is not definitely assigned in the constructor.
  price!: number; // 통과
}
```

그런데 Nest 스캐폴드의 `tsconfig.json`에는 `"strictPropertyInitialization": false`가 들어 있어서, 이 프로젝트에서는 `!`를 빼도 `tsc`가 통과한다. 그래도 붙여 두면 이 검사가 켜진 프로젝트로 옮겨도 그대로 컴파일되고, "이 필드는 밖에서 채워진다"는 의도가 코드에 남는다.

| `strictPropertyInitialization` | `user: string` | `user!: string` |
|---|---|---|
| `true`(`strict` 기본값) | TS2564 에러 | 통과 |
| `false`(Nest 스캐폴드) | 통과 | 통과 |

- `!`도 타입 표기라서 컴파일하면 사라진다. 런타임에 값이 정말 들어 있는지는 확인하지 않는다.
- 값이 정말 들어 있는지 확인하는 것은 `ValidationPipe`의 몫이다. 파이프가 빠지면 `user`가 `undefined`인 채로 서비스까지 간다(아래 "일부러 깨뜨려보기").

> `!`는 컴파일러의 검사를 끄는 표시이지 검증이 아니다. 실제 보장은 `ValidationPipe`와 검증 데코레이터가 한다.

### class-validator 데코레이터

- `@IsString()`, `@IsNotEmpty()`, `@IsNumber()`, `@IsPositive()`, `@IsBoolean()`: 필드 위에 붙이는 검증 규칙이다. 이름 그대로 문자열인지, 비어 있지 않은지, 숫자인지, 양수인지, 불리언인지 검사한다. 한 필드에 여러 개를 나란히 붙일 수 있다.

### NestJS 데코레이터

- `@Post(경로)`: 그 경로의 POST 요청을 처리한다.
- `@Body()`: 요청 본문(JSON)을 꺼내 매개변수 타입(`CreateOrderDto`) 모양으로 받는다. 검증은 `ValidationPipe`가 이 클래스의 데코레이터를 보고 한다. 매개변수가 정말 `CreateOrderDto` 인스턴스인지는 아래 "`ValidationPipe`가 본문을 다루는 순서"에서 다룬다.

### NestJS API

- `NestFactory.create(루트 모듈)`: 모듈 트리를 읽어 의존성을 조립하고 앱 객체를 만든다.
- `app.useGlobalPipes(Pipe)`: 앱 전체 요청에 Pipe를 적용한다. Pipe는 컨트롤러에 도달하기 전에 입력을 검사·변환하는 단계다.
- `new ValidationPipe({ whitelist: true })`: DTO의 검증 데코레이터로 본문을 검사한다. `whitelist: true`면 검증 데코레이터가 없는 필드는 자동으로 제거한다. 동작 순서는 아래 "`ValidationPipe`가 본문을 다루는 순서"에서 다룬다.
- `app.listen(포트)`: 그 포트에서 요청을 받기 시작한다.

#### `ValidationPipe`가 본문을 다루는 순서

`ValidationPipe`도 4단계 "Pipe: 핸들러에 닿기 전에 값을 바꾸고 거른다"에서 본 Pipe다. `@Body() dto: CreateOrderDto`에 대해 이렇게 동작한다.

1. 매개변수 타입 정보(`emitDecoratorMetadata`가 남긴 `CreateOrderDto` 클래스 값)를 읽는다.
2. JSON 본문을 `class-transformer`로 `CreateOrderDto` 인스턴스로 바꾼다. 그래야 필드에 붙은 검증 데코레이터를 찾을 수 있다.
3. `class-validator`로 각 필드를 검사한다. 하나라도 실패하면 실패 메시지를 모아 400을 던지고, 메서드는 호출되지 않는다.
4. 통과하면 메서드에 값을 넘긴다. `whitelist: true`면 데코레이터가 없는 필드를 지운 뒤 넘긴다.

4번에서 넘기는 값은 **`CreateOrderDto` 인스턴스가 아니라 평범한 객체**다. 타입 표기는 `CreateOrderDto`지만, 인스턴스로 받으려면 `transform: true` 옵션이 따로 필요하다.

```ts
create(@Body() dto: CreateOrderDto) {
  console.log(dto instanceof CreateOrderDto);
  // new ValidationPipe({ whitelist: true }) → false: { user: 'choi', price: 9000, paid: true }
  // new ValidationPipe({ whitelist: true, transform: true }) → true: CreateOrderDto { user: 'choi', ... }
}
```

| 옵션 | 메서드가 받는 값 | 모르는 필드(`admin`) |
|---|---|---|
| `{}` | 원래 JSON 객체 그대로 | 남는다 |
| `{ whitelist: true }` | 평범한 객체 | 지워진다 |
| `{ whitelist: true, transform: true }` | `CreateOrderDto` 인스턴스 | 지워진다 |

- 이 문서의 DTO는 필드만 있고 메서드가 없으므로 인스턴스가 아니어도 문제가 없다. DTO에 메서드를 두고 부르려면 `transform: true`가 필요하다.
- `transform`은 문자열을 숫자로 바꿔 주는 옵션이 아니다. `"price":"9000"`처럼 숫자를 문자열로 보내면 `@IsNumber()`에 걸려 400이 난다(`price must be a number conforming to the specified constraints`).
- `ValidationPipe`가 1번에서 클래스 값을 읽기 때문에 DTO를 `interface`로 쓰면 검증할 규칙을 찾지 못한다(1단계, 도전 과제 2).

> `ValidationPipe`의 일은 "규칙에 맞는지 확인하고 거르는 것"이다. 인스턴스로 바꿔 받는 것은 옵션으로 따로 켠다.

### 일부러 깨뜨려보기

#### 1. `ValidationPipe` 빼기

`main.ts`의 `app.useGlobalPipes(...)` 줄을 주석 처리한다. 잘못된 값(`{"user":"","price":-5}`)이 그대로 `201`로 저장된다.

DTO에 검증 데코레이터가 다 있어도 Pipe가 없으면 조용히 통과한다. express에서는 핸들러가 `parseOrThrow`를 직접 불러서 이런 누락이 구조적으로 없었다.

> 여기서는 "선언은 했는데 스위치를 안 켠" 상태가 에러 없이 존재할 수 있다.

되돌린다.

#### 2. `whitelist` 끄기

`whitelist: true`를 지우고 `{"user":"x","price":1,"paid":true,"admin":true}`로 POST해본다. 응답에 `"admin":true`가 그대로 들어간다.

데코레이터가 없는 필드는 `whitelist`가 꺼져 있으면 통과한다. express의 zod는 모르는 키를 기본으로 버렸지만, Nest는 옵트인이다.

되돌린다.

## 7. 6단계: DI가 깨지면 언제 드러나는가

`orders.module.ts`의 `providers: [OrdersService]`를 `providers: []`로 바꾼다.

```sh
# providers를 비운 채 서버를 켜면 부팅 단계에서 DI 에러가 난다
npm run start:dev
```

서버가 부팅 단계에서 아래 메시지로 죽는다(뒤에 `Potential solutions:` 목록이 이어진다).

```
Nest can't resolve dependencies of the OrdersController (?). Please make sure that the argument OrdersService at index [0] is available in the OrdersModule module.
```

express에서 `next()`를 빼먹었을 때는 "요청이 조용히 멈추고 로그도 안 남는" 것이었다. DI는 부팅 시점에 의존성 그래프 전체를 검증하므로, **같은 종류의 실수가 요청이 오기도 전에 드러난다.**

`providers: [OrdersService]`로 되돌린다.

> 다른 모듈이 이 서비스를 쓰려면 `exports: [OrdersService]`도 필요하다. 빼먹으면 같은 문구의 에러가 나는데, 원인 찾기가 이보다 헷갈린다.

## 8. 7단계: `tsx`로 실행하면 왜 깨지는가

1단계에서 예고한 것을 직접 확인한다. 서버를 끄고, 스캐폴드에는 `tsx`가 없으니 설치한 뒤 실행해본다.

```sh
npm install -D tsx
# tsx는 타입을 지우기만 하고 데코레이터 메타데이터를 만들지 않으므로 Nest의 DI가 깨진다
npx tsx src/main.ts
```

서버는 뜬다. 라우트 매핑 로그도, `Nest application successfully started`도 찍힌다.

그런데 `curl localhost:3000/orders`를 보내면 `{"statusCode":500,"message":"Internal server error"}`가 오고, 콘솔에 `TypeError: Cannot read properties of undefined (reading 'list')`가 찍힌다. `curl localhost:3000`이면 스캐폴드의 `AppController`도 똑같이 `reading 'getHello'`로 깨진다.

`tsx`(esbuild)는 타입 표기를 지우기만 하고 `emitDecoratorMetadata`를 처리하지 않는다. 데코레이터(`route` 등록 등)는 정상 동작하지만 **생성자 타입 메타데이터만 안 만들어져서**, `OrdersController`가 `ordersService` 없이 만들어진 것이다.

`npm run start:dev`(`nest start`가 내부적으로 `tsc`를 쓴다)로 다시 실행하면 정상으로 돌아온다.

이 원리가 Nest에서 만드는 규칙은 세 가지로 요약된다.

1. 메타데이터를 발행하는 컴파일러(`tsc`/swc)로 실행한다.
2. DI 대상·DTO는 `interface`가 아니라 class로 쓴다.
3. 생성자 주입이 필요한 클래스에는 `@Injectable()`을 붙인다.

## 9. 8단계: 부팅 실패와 DI 그래프를 디버깅하기

express의 디버깅 기법(`--inspect-brk`, VS Code 브레이크포인트)은 Nest에서도 그대로 쓴다.

다른 점은 Nest는 요청이 오기 전, 부팅 단계에서부터 실패할 수 있다는 것이다(6단계에서 이미 겪었다).

> 그래서 Nest 디버깅의 첫 단추는 "이게 부팅 실패인가, 요청 실패인가"부터 구분하는 것이다.

### 9.1 부팅 실패 메시지를 구조대로 읽는다.

6단계에서 본 에러를 다시 본다.

```
Nest can't resolve dependencies of the OrdersController (?). Please make sure that the argument OrdersService at index [0] is available in the OrdersModule module.
```

이 문장은 항상 같은 구조다.

- 어떤 클래스가: `OrdersController`
- 몇 번째 생성자 인자를: `index [0]`
- 어떤 타입으로 찾다가 실패했는가: `OrdersService`

생성자 인자가 여러 개면 괄호 안에 인자들이 나열되고, 문제의 인자만 `?`로 표시된다. 그 위치가 곧 index다.

C의 링커 에러(`undefined reference to 'foo'`)는 "어떤 심볼을 찾다가 실패했는가"만 알려주고, 어디서 그 심볼을 써야 했는지는 개발자가 역추적해야 한다. Nest는 사용처(어떤 클래스의 몇 번째 인자)까지 짚어준다는 점이 더 친절하다.

### 9.2 `nest start --debug`로 인스펙터 붙이기

Nest 코드도 결국 Node 프로세스에서 실행되므로, 지금까지 써온 인스펙터 플래그가 그대로 통한다. Nest CLI는 전용 플래그도 제공한다.

```sh
npm run start:debug # = nest start --debug --watch (스캐폴드에 이미 있다)
# 또는 00-javascript에서 쓴 것과 동일하게, 빌드 후 컴파일된 JS를 직접 붙인다
node --inspect-brk dist/main.js
```

`chrome://inspect`로 연결한 뒤 `OrdersService.create` 메서드 첫 줄에 브레이크포인트를 찍고 POST 요청을 보낸다. `this.orders`(싱글턴 필드)에 실제로 몇 개가 쌓여 있는지, DTO가 정확히 어떤 모양으로 들어왔는지 그 자리에서 확인할 수 있다.

### 9.3 컴파일된 코드에서 메타데이터가 실제로 있는지 확인하기

7단계의 "`tsx`로 실행하면 깨진다"는 문제를 코드 수정 없이도 미리 확인할 수 있다.

```sh
npm run build
# -A2: 매칭된 줄과 그 아래 2줄을 함께 출력한다
grep -A2 "OrdersController = __decorate" dist/orders/orders.controller.js
# OrdersController = __decorate([
#     Controller("orders"),
#     __metadata("design:paramtypes", [OrdersService])
```

`OrdersService`가 문자열이 아니라 실제 클래스 값으로 들어 있으면 메타데이터가 정상 발행된 것이다.

여기 `Object`만 덩그러니 있다면(타입을 `interface`로 썼거나 컴파일러 옵션이 빠진 경우) DI가 그 인자를 무엇으로 채워야 할지 모른다는 뜻이다.

> 런타임에 요청을 보내보기 전에 빌드 산출물만 grep해서 미리 잡아낼 수 있는 문제다.

### 9.4 Nest 내장 Logger로 요청 흐름 들여다보기

`console.log`를 여기저기 흩뿌리는 대신, Nest가 제공하는 `Logger`를 쓰면 어느 클래스에서 찍은 로그인지 태그가 자동으로 붙는다.

```ts
// orders.service.ts
import { Injectable, Logger, NotFoundException } from "@nestjs/common";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name); // 태그 = 클래스 이름

  create(input: Omit<Order, "id">): Order {
    const order: Order = { id: this.nextId++, ...input };
    this.orders.push(order);
    this.logger.log(`주문 생성: #${order.id} (${order.user})`); // [OrdersService] 태그가 자동으로 붙는다
    return order;
  }
}
```

부팅 로그(`Mapped {...} route`)와 비즈니스 로직 로그가 같은 형식으로 섞여 나온다. 그래서 어떤 요청이 어떤 라우트를 거쳐 어떤 서비스 메서드까지 도달했는지 한 터미널에서 시간순으로 추적할 수 있다.

### 9.5 순환 의존성(Circular Dependency): DI 그래프가 만드는 새로운 에러 유형

express에는 없던, DI 특유의 에러 하나만 존재를 알아둔다.

`A`가 생성자에서 `B`를 필요로 하고 `B`도 생성자에서 `A`를 필요로 하면, Nest는 "누구를 먼저 만들어야 할지" 판단하지 못해 부팅 시점에 순환 의존성 에러를 낸다.

이 문서의 `OrdersController`/`OrdersService`처럼 한쪽 방향으로만 의존하는 구조에서는 나타나지 않는다. 하지만 인증 모듈을 붙이며 모듈 간 참조가 늘어나면 마주칠 수 있다.

> 그때는 `forwardRef()`로 해소한다는 것만 지금은 알아둔다.

### 시험해보기

```sh
npm run start:debug
```

`chrome://inspect`로 연결한 뒤 `OrdersController.findOne`에 브레이크포인트를 찍고 `curl localhost:3000/orders/101`을 호출한다. `ParseIntPipe`를 통과한 `id`가 정말 `number` 타입(101)으로 들어오는지 직접 확인한다.

### 도전 과제

#### 1. DI 에러 메시지 분석하기

`orders.module.ts`의 `providers: [OrdersService]`를 다시 `providers: []`로 바꾸고 실행한다.

9.1의 구조(어떤 클래스 + 몇 번째 인자 + 어떤 타입)로 에러 메시지를 직접 분석해본다. 확인 후 원복한다.

세 요소는 각각 무엇이고, 에러는 언제 나는가?

**답**

1. 부팅 로그에 `AppModule dependencies initialized`까지만 찍힌 뒤 `UnknownDependenciesException`과 함께 6단계의 메시지가 나오고, 프로세스가 종료 코드 1로 끝난다. 라우트 매핑 로그는 하나도 찍히지 않는다.
2. 어떤 클래스: `OrdersController`. 몇 번째 인자: `(?)`가 하나뿐이고 `index [0]`이니 생성자의 첫 번째 인자다. 어떤 타입: `OrdersService`.
3. 메시지 아래 붙는 객체에도 같은 내용이 `type: 'OrdersController'`, `context: { index: 0, name: [class OrdersService] }`로 들어 있다.
4. `Potential solutions:`의 두 번째 줄(`If OrdersService is a provider, is it part of the current OrdersModule?`)이 이번 원인이다. `providers`에 `OrdersService`를 되돌리면 정상 부팅한다.

> 요청을 하나도 보내지 않았는데 죽는다. 부팅 실패라는 뜻이다.

#### 2. 메서드의 `design:paramtypes` 구분하기

9.3의 `grep` 명령을 `AppController`에도 돌려보고, 이어서 `orders.controller.js` 파일 전체를 훑어본다.

```sh
grep -A2 "AppController = __decorate" dist/app.controller.js
grep "design:paramtypes" dist/orders/orders.controller.js
```

메서드마다 붙은 `design:paramtypes`(예: `findOne`의 `[Number]`, `create`의 `[CreateOrderDto]`)와 클래스 생성자의 것을 구분해 본다.

> `ValidationPipe`가 `CreateOrderDto`라는 클래스 값을 보고 검증 규칙을 찾는다는 것도 여기서 보인다.

둘은 어떻게 구분되는가?

**답**

1. `AppController`에도 `__metadata("design:paramtypes", [AppService])`가 붙어 있다. 스캐폴드의 생성자 주입도 같은 원리로 동작한다.
2. `orders.controller.js`에서는 `design:paramtypes`가 다섯 번 나온다. 순서대로 `[String]`(`list`), `[]`(`totals`), `[Number]`(`findOne`), `[CreateOrderDto]`(`create`), `[OrdersService]`(클래스)다.
3. 메서드의 것은 `], OrdersController.prototype, "findOne", null);`처럼 끝나는 `__decorate` 블록 안에 있고, 같은 블록에 `Get(":id")`, `__param(0, ...)`, `__metadata("design:type", Function)`이 함께 붙는다. 클래스의 것은 `OrdersController = __decorate([` 블록 안에 `Controller("orders")`와 함께 있다.
4. 생성자 주입에 쓰이는 것은 클래스 블록의 `[OrdersService]`다. 메서드 블록의 `[CreateOrderDto]`는 요청마다 `ValidationPipe`가 검증 규칙을 찾을 때 쓰인다.

> `totals`처럼 매개변수가 없는 메서드에도 빈 배열 `[]`이 붙는다.

## 10. 완성 확인

```sh
# 타입 검사만 하고(결과 파일 생성 없음), 성공하면 서버를 실행한다
npx tsc --noEmit && npm run start:dev
```

```sh
# c: 응답 뒤에 HTTP 상태 코드를 붙여 출력하는 셸 함수(-s: 진행 표시줄 숨김)
c() { curl -s -w ' → %{http_code}\n' "$@"; }
J='Content-Type: application/json' # 자주 쓰는 헤더를 변수에 담아 재사용

c localhost:3000/orders/totals
c "localhost:3000/orders?paid=true"
c localhost:3000/orders/101
c localhost:3000/orders/999 # → 404
c -X POST localhost:3000/orders -H "$J" -d '{"user":"choi","price":9000,"paid":true}' # → 201
```

- [ ] 위 curl 시나리오가 express와 같은 값으로 동작한다(에러 응답의 모양만 다르다)
- [ ] `npm run build` 후 `dist/orders/orders.controller.js`에서 `__metadata("design:paramtypes", [...])`를 찾아 `OrdersService`가 값으로 들어 있는 것을 확인했다
- [ ] 5단계의 "검증 데코레이터가 있는데도 검증이 안 되는" 상황을 재현했다
- [ ] 6단계에서 DI 에러가 요청 이전(부팅 시점)에 나는 것을 확인했다
- [ ] 7단계에서 `tsx`로 실행하면 주입이 실패하는 것을 재현하고 원인을 설명할 수 있다

## 11. 다음 단계

### 자가 점검

소리 내어 설명할 수 있으면 통과다.

1. `constructor(private readonly ordersService: OrdersService)`만 써도 주입되는 원리는? 어떤 옵션과 패키지가 필요한가?

2. `tsx`로 Nest를 실행하면 왜 주입이 실패하는가?

3. DTO를 `interface`로 선언하면 무슨 일이 생기는가?

4. `providers`나 `exports`를 빼먹으면 언제 어떤 모습으로 드러나는가? express의 `next()` 누락과 어떻게 다른가?

5. Provider 기본 scope가 싱글턴이라는 것은 express의 어떤 성질과 같은가?

### 대조 정리

| 관심사 | Express | Nest |
|---|---|---|
| 라우팅 | `router.get(...)` 호출로 직접 등록 | `@Controller`/`@Get` 데코레이터를 Nest가 읽어 등록 |
| 상태·로직 | 모듈 스코프 변수와 함수 | 싱글턴 Provider의 필드와 메서드 |
| 검증 | 핸들러가 zod `parseOrThrow`를 직접 호출 | DTO 데코레이터 + 전역 `ValidationPipe`(선언적, 스위치 필요) |
| 에러 응답 | `HttpError` + 4인자 핸들러 직접 구현 | 내장 예외 + 기본 예외 필터 |
| 실수하면 | 요청이 조용히 멈춘다(`next()` 누락) | 부팅 때 DI 에러, 또는 메타데이터가 없으면 런타임 `undefined` |

### 이 문서에서 다루지 않은 것

존재만 언급한다.

- 인증(Passport·JWT)
- 설정 관리(`@nestjs/config`): `.env`를 Nest CLI의 `--env-file`로만 읽고, 이 모듈은 쓰지 않는다
- Guard·Interceptor·커스텀 Pipe·ExceptionFilter의 직접 구현, 동적 모듈, 커스텀 Provider
- 테스트(`Test.createTestingModule`), Fastify 어댑터, 마이크로서비스·GraphQL

---

## 부록: 데코레이터와 메타데이터를 직접 만들어보기 (선택)

1단계의 원리를 Nest 없이 20줄로 재현해본다.

```sh
mkdir decorator-practice && cd decorator-practice
npm init -y && npm pkg set type=module
# reflect-metadata: 클래스·메서드에 메타데이터(붙여 두는 부가 정보)를 읽고 쓰게 해 주는 라이브러리
npm install reflect-metadata
npm install -D typescript tsx @types/node
mkdir src
```

`tsconfig.json`은 최소본에 `experimentalDecorators`, `emitDecoratorMetadata` 두 줄만 추가한다.

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenest",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "rootDir": "src",
    "outDir": "dist",
    // 데코레이터 문법을 허용하고(experimentalDecorators), 생성자 타입을 런타임 메타데이터로 남긴다(emitDecoratorMetadata)
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"]
}
```

```ts
// src/mini-di.ts
import "reflect-metadata";

function Get(path: string): MethodDecorator {
  // 그 메서드에 "route" 정보를 붙여 둔다
  return (target, key) => Reflect.defineMetadata("route", { method: "GET", path }, target, key);
}
function Injectable(): ClassDecorator {
  return () => {}; // 하는 일은 없다("이 클래스의 타입 정보를 남겨라"는 표식일 뿐).
}

@Injectable()
class Repo { find() { return ["a", "b"]; } }

@Injectable()
class Controller {
  constructor(private readonly repo: Repo) {} // 이 "Repo"가 런타임에 남는다
  @Get("/list") list() { return this.repo.find(); }
}

type Class<T = unknown> = new (...args: any[]) => T;
// 이미 만든 인스턴스를 캐시해 클래스마다 하나(싱글턴)만 유지한다
const instances = new Map<Class, unknown>();
function resolve<T>(cls: Class<T>): T {
  const cached = instances.get(cls);
  if (cached) return cached as T;
  // 생성자 매개변수 타입 목록을 읽는다. 메타데이터가 없으면 인자 없이 만들게 된다
  const deps: Class[] = Reflect.getMetadata("design:paramtypes", cls) ?? [];
  // 의존하는 클래스들을 먼저 만들어 생성자 인자로 넘긴다(재귀)
  const instance = new cls(...deps.map((d) => resolve(d)));
  instances.set(cls, instance);
  return instance;
}

console.log(resolve(Controller).list()); // ['a', 'b']
```

```sh
# tsc -p .: 현재 폴더의 tsconfig.json 설정으로 컴파일한 뒤, 컴파일된 JS를 node로 실행한다
npx tsc -p . && node dist/mini-di.js
```

`['a', 'b']`가 찍힌다. `dist/mini-di.js`를 열어 `__metadata("design:paramtypes", [Repo])`를 찾아본다. 소스에는 타입 표기뿐이던 `Repo`가 값으로 남아 있다.

`npx tsx src/mini-di.ts`로 실행하면 메타데이터가 없어 `resolve`가 `Repo` 없이 `Controller`를 만들고, `this.repo.find()`에서 `TypeError: Cannot read properties of undefined (reading 'find')`로 터진다. 7단계에서 본 것과 같은 원인이다.

#### TS 문법

- 데코레이터 팩토리(`function Get(path): MethodDecorator`): `@Get("/list")`처럼 인자를 받는 데코레이터는 "데코레이터 함수를 돌려주는 함수"로 만든다. 1단계 "데코레이터 팩토리: 괄호를 붙이는 이유"에서 본 모양을 직접 만든 것이다.
- `MethodDecorator` / `ClassDecorator`: 메서드·클래스에 붙이는 데코레이터의 타입이다. 메서드 데코레이터의 `(target, key)`는 메서드가 속한 클래스(프로토타입)와 메서드 이름이다.
- 생성자 타입(`new (...args: any[]) => T`): "new로 인스턴스를 만들 수 있는 클래스"를 나타내는 타입 표기다.

#### reflect-metadata API

- `import "reflect-metadata"`: `Reflect.defineMetadata` / `Reflect.getMetadata` 같은 함수를 전역에 붙여 준다.
- `Reflect.defineMetadata(키, 값, 대상, 속성)`: 대상(의 속성)에 메타데이터를 붙여 둔다.
- `Reflect.getMetadata("design:paramtypes", cls)`: `tsc`가 `emitDecoratorMetadata` 옵션으로 남겨 둔 "생성자 매개변수 타입 목록"을 읽는다.