# 로그인을 붙이고 프론트와 백엔드 잇기

## 목표

NestJS의 주문 API에 로그인을 붙이고 Next.js의 화면에서 실제로 그 API를 호출해 하나로 잇는다. "주문 관리 도구"가 프론트 → 백엔드 → 응답까지 실제로 연결된다.

```sh
# -X: 요청 메서드, -H: 요청 헤더 추가, -d: 요청 본문
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -d '{"user":"choi","price":9000,"paid":true}'
{"message":"Unauthorized","statusCode":401} # ← 토큰 없이는 막힌다

curl -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"id":"kim","password":"1234"}'
{"accessToken":"eyJ..."}

# Authorization: Bearer 토큰 = "이 토큰을 가진 사람으로서 요청한다"는 표준 헤더 형식
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -H 'Authorization: Bearer eyJ...' -d '{"user":"choi","price":9000,"paid":true}'
{"id":203,"user":"choi","price":9000,"paid":true}
```

`/orders` 화면에도 "테스트 주문 만들기" 버튼이 생기고 누르면 Next.js 서버가 로그인 → 주문 생성을 대신 처리해 브라우저에 결과를 보여준다.

이미 구현한 NestJS의 주문 API와 Next.js의 화면이 실제로 동작하는 상태에서 시작한다.

이 문서는 "인증을 어떻게 붙이는가"와 "프론트와 백엔드가 서로 다른 곳에서 도는데 어떻게 통신하는가"를 다룬다. DB 연동, 테스트, 배포, 인증 심화(리프레시 토큰, 쿠키 저장 등)는 다루지 않는다.

## 0. 사전지식

이 문서에서 새로 등장하는 세 가지(JWT, NestJS의 DI 위에 얹히는 Guard/Strategy, 서버끼리의 원격 호출)를 먼저 정리한다.

### 1. JWT: 서명으로 검증하는 자기 완결적 토큰

세션 방식은 서버가 "누가 로그인했는지"를 메모리나 DB에 저장해두고(stateful) 요청마다 세션 ID로 그 저장소를 조회해 확인한다.

JWT는 반대다. 서버는 아무것도 저장하지 않고(stateless) 토큰 자체 안에 정보(`{ sub: "kim" }`)와 서버만 아는 비밀키로 만든 서명이 함께 들어 있다. 검증은 "이 서명이 진짜 내 비밀키로 만든 게 맞는가"만 확인하면 끝난다.

C에서 네트워크로 받은 패킷의 무결성을 확인할 때, 패킷 본문과 함께 온 체크섬/HMAC을 같은 키로 직접 재계산해서 비교하고, 일치하면 "이 패킷은 변조되지 않았다"고 믿어버리는 방식을 써봤다면 원리가 같다.

```c
// C: 받은 데이터와 서명을 분리해서 같은 키로 재계산한 서명과 비교한다
uint8_t computed_hmac[32];
hmac_sha256(secret_key, payload, payload_len, computed_hmac);
if (memcmp(computed_hmac, received_signature, 32) != 0) {
    return AUTH_FAILED; // 서명이 안 맞으면 payload 내용은 아예 안 믿는다
}
```

JWT의 `jwtFromRequest`/`secretOrKey` 검증도 정확히 이 과정이다. `payload`(아래 "토큰은 점으로 나뉜 세 조각이다"에서 보는 `header.payload` 부분)를 같은 비밀키로 다시 서명해보고, 요청에 실려온 서명(`.signature` 부분)과 일치하는지만 비교한다.

**payload 자체는 암호화되어 있지 않고 base64로 인코딩만 되어 있다.** 그래서 누구나 디코딩해서 내용을 읽을 수 있지만, 비밀키 없이는 서명을 위조할 수 없다.

> 만료 시각(`expiresIn`)이 필수인 이유도 여기서 나온다. 서버가 상태를 안 갖는 대신, "이 서명이 언제까지 유효한가"라는 정보까지 토큰 자체에 실어 보내야 하기 때문이다.

#### 토큰은 점으로 나뉜 세 조각이다

`eyJ...`로 시작하는 긴 문자열은 한 덩어리가 아니다. 점(`.`)으로 나뉜 세 조각이고, 각 조각은 base64url로 인코딩되어 있다.

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiJraW0iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMH0 . xxxxx
└──────────── header ──────────────┘   └──────────────────── payload ───────────────────────────────┘   └ signature ┘
  {"alg":"HS256","typ":"JWT"}            {"sub":"kim","iat":1700000000,"exp":1700003600}                  앞 두 조각을 비밀키로 서명한 값
```

| 조각 | 담긴 것 | 누가 읽을 수 있나 |
| --- | --- | --- |
| header | 어떤 알고리즘으로 서명했는지(`alg`) | 누구나 |
| payload | 실어 보내는 내용. `sub`(사용자), `iat`(발급 시각), `exp`(만료 시각)는 표준 필드 | 누구나 |
| signature | 앞 두 조각을 비밀키로 HMAC한 결과 | 검증은 비밀키를 가진 서버만 |

중요한 것은 **서명의 대상이 `header.payload` 문자열 전체**라는 점이다. 그래서 payload의 한 글자(`exp`의 숫자 하나라도)를 고치면 서명이 맞지 않게 되고, 서명까지 다시 만들려면 비밀키가 필요하다. 위에서 본 HMAC 재계산이 이 조각들에 적용되는 것이다.

앞 두 조각은 누구나 디코딩해 읽을 수 있으므로(8.3에서 직접 해본다) **payload에는 비밀을 담지 않는다.** 담아도 되는 것은 "숨길 필요는 없지만 위조되면 안 되는 값"(사용자 id, 권한 이름, 만료 시각)이다.

### 2. Guard/Strategy: DI 레지스트리에 등록되는 "인증 방식 하나"

NestJS의 DI 원리(타입 이름으로 등록된 클래스를 찾아 조립) 위에 Passport는 "인증 방식 하나 = 클래스 하나"라는 패턴을 얹는다.

`JwtStrategy`도 결국 `@Injectable()` 클래스라 DI 레지스트리에 똑같이 등록되고, `AuthGuard("jwt")`는 그 이름으로 등록된 Strategy를 찾아 요청마다 실행할 뿐이다.

새 메커니즘이 아니라 이미 아는 DI 조립 방식이 "요청 처리 전에 끼어드는 검문소"(Guard)라는 역할로 한 번 더 쓰인 것이다.

#### "Strategy"와 "Guard"는 각각 누구 말인가

두 단어는 같은 묶음처럼 쓰이지만 출신이 다르다. **Guard는 NestJS 용어이고, Strategy는 NestJS 용어가 아니다.**

Strategy는 원래 디자인 패턴 이름이다. 같은 일을 하는 여러 알고리즘을 각각 한 덩어리로 떼어내고, 쓰는 쪽은 그 덩어리를 바꿔 끼우기만 하게 만드는 방식이다. C에서 구현 함수들을 구조체에 모아 꽂아 쓰던 것과 같다.

```c
// C: "검증 방식 하나"를 구조체 하나로 떼어내고, 이름으로 골라 꽂는다
typedef struct {
    const char *name; // "jwt", "local", ...
    int (*authenticate)(const request_t *req, user_t *out);
} auth_strategy_t;

static auth_strategy_t registry[8]; // 이름으로 찾아 쓰는 등록소
```

Passport는 이 패턴을 그대로 구현한 라이브러리다. 검증 방식 하나가 Strategy 객체 하나이고, `passport.use(Strategy)`로 이름과 함께 등록소에 넣는다. `passport-jwt`(토큰), `passport-local`(아이디·비밀번호), `passport-google-oauth20`(구글 로그인) 등 수백 개의 전략 패키지가 같은 인터페이스를 지키므로, 로그인 방식을 추가하는 일이 "전략 하나를 더 등록하는 일"로 줄어든다.

Guard는 Nest 쪽 말이다. Nest가 요청 하나를 처리하는 순서(수명주기) 안에 "통과시킬지 결정하는 단계"로 정식으로 들어 있고, `canActivate(context)` 하나만 구현한 클래스면 Guard다. 인증과는 아무 상관이 없어도 된다.

```ts
// Guard는 인증 전용 장치가 아니다. canActivate가 false를 돌려주면 요청이 끊긴다
@Injectable()
export class NoBotGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    // ExecutionContext: HTTP/WebSocket 등 전송 방식에 상관없이 요청을 꺼내는 공통 창구
    const req = ctx.switchToHttp().getRequest();
    return !/bot/i.test(req.headers["user-agent"] ?? "");
  }
}
```

| 말 | 누구 것 | 무엇 |
| --- | --- | --- |
| Strategy | Passport (그 위에 고전 디자인 패턴) | "검증 방식 하나"를 담은 객체. 이름으로 등록된다 |
| `AuthGuard("jwt")` | `@nestjs/passport` (둘을 잇는 접착제) | 그 이름의 Strategy를 요청마다 실행해주는 Guard 클래스를 만들어 주는 함수 |
| Guard | NestJS | 요청 수명주기의 한 단계. `canActivate`가 false면 요청을 끊는다 |

> 그래서 "JWT 검증 로직"은 Passport의 Strategy로 짜고, "그 로직을 요청 처리 중 언제 실행할지"는 Nest의 Guard가 맡는다. 파일을 나눠 만드는 이유가 이 분업이다.

### 3. 서버 액션: 함수처럼 보이지만 실제로는 원격 호출

`"use server"`가 붙은 `createTestOrder()`는 브라우저 코드에서 마치 평범한 함수처럼 호출된다(`await createTestOrder()`). 실제로는 Next.js가 빌드 시점에 이 함수를 숨겨진 HTTP 엔드포인트로 바꿔두고, 브라우저의 호출을 그 엔드포인트로의 네트워크 요청으로 바꿔치기한다.

이런 방식을 RPC(Remote Procedure Call, 원격 프로시저 호출)라고 부른다. 네트워크 통신을 "요청을 만들어 보내고 응답을 파싱한다"가 아니라 **"함수를 부른다"**로 보이게 감싸는 것이다. 호출하는 쪽에 두는 그 껍데기 함수를 스텁(stub)이라 한다.

C에서 RPC 스텁을 만들어봤다면 익숙한 모양이다. 호출하는 쪽은 `int result = call_remote_add(1, 2);`처럼 로컬 함수처럼 부르지만, 스텁 내부에서는 인자를 직렬화해 소켓으로 보내고 응답을 기다렸다가 역직렬화해서 돌려준다.

```c
// C: 로컬 함수처럼 보이지만 내부는 소켓 통신인 RPC 스텁
int call_remote_add(int a, int b) {
    send_request(sock, "add", a, b); // 실제로는 네트워크 요청
    return receive_response(sock); // 응답을 기다린 뒤 값으로 반환
}
```

스텁이 감추는 것은 늘 같은 네 가지다.

1. **어느 함수인가**: 이름이나 ID를 요청에 실어 보낸다.
2. **인자 직렬화**: 메모리 위의 값을 바이트열(JSON 등)로 바꾼다.
3. **전송과 대기**: 실제 소켓/HTTP 요청을 보내고 응답이 올 때까지 기다린다.
4. **반환값 역직렬화**: 받은 바이트열을 다시 값으로 되돌려 `return`한다.

감추지 못하는 것도 있다. 네트워크는 실패하고 느리므로, RPC 함수는 **로컬 함수에는 없던 실패와 지연을 함수 호출 자리에 그대로 들여온다**(그래서 `await`와 `try/catch`가 필요하다). 인자와 반환값도 직렬화할 수 있는 값으로 제한된다.

`createTestOrder()`도 마찬가지다. 코드만 보면 함수 호출이지만, 실행은 브라우저가 아니라 Next.js 서버에서 일어나고(그래서 `DEMO_PASSWORD` 같은 비밀값을 브라우저에 노출하지 않고 쓸 수 있다) 그 Next.js 서버가 다시 백엔드(`localhost:4000`)로 진짜 `fetch`를 보낸다.

**브라우저 → Next.js 서버는 "함수 호출처럼 보이는 RPC"로, Next.js 서버 → 백엔드는 평범한 `fetch`로** 두 단계의 서로 다른 통신이 겹쳐 있다.

> 이 둘을 구분해두면 뒤에 디버깅시 "어느 구간이 막혔는지" 좁히기 쉬워진다.

## 1. 준비

루트에 이전 단계에서 구현한 각 프론트/백엔드 프로젝트를 복사한 상태에서 시작한다.

```sh
.
├── order-api-nest
├── order-console-next
└── README.md
```

두 서버를 다른 포트로 띄운다. 백엔드(`order-api-nest`)의 `main.ts`가 이미 `process.env.PORT`를 읽으므로 포트만 바꾸면 된다.

설정값은 `.env` 파일에 모은다. `.env`는 `이름=값`을 한 줄씩 적어 두는 환경변수 파일이고, 코드에서는 `process.env.이름`으로 읽는다. 비밀 값은 코드에 직접 적지 않는다.

```sh
# order-api-nest/.env
# JWT 토큰에 서명할 때 쓰는 비밀 문자열(예시 값이므로 실제로는 길고 예측 불가능한 값을 쓴다)
# 아래 명령어로 32바이트의 안전한 난수를 쉽게 생성할 수 있다
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# openssl rand -hex 32
JWT_SECRET=change-me
# 데모용 로그인 비밀번호
DEMO_PASSWORD=1234
# CORS에서 요청을 허용할 프론트엔드 주소
FRONTEND_URL=http://localhost:3000
# 백엔드가 쓸 포트(프론트가 3000을 쓰므로 4000으로 옮긴다)
PORT=4000
```

이 프로젝트 학습용 데모 프로젝트이기 때문에 `order-api-nest/.env`를 커밋에 포함하지만 실제 서비스를 개발할 때는 `.env`를 절대 커밋하면 안된다.

`.env`는 저절로 읽히지 않는다. Node 20.6+는 `node --env-file=.env dist/main.js`처럼 별도 패키지 없이 읽을 수 있고, Nest CLI도 같은 옵션(`nest start --env-file .env`)을 지원한다. `package.json`의 스크립트에 붙여 둔다.

```sh
cd order-api-nest
# start:dev / start:debug / start:prod가 항상 .env를 읽도록 바꾼다
npm pkg set scripts.start:dev="nest start --watch --env-file .env"
npm pkg set scripts.start:debug="nest start --debug --watch --env-file .env"
npm pkg set scripts.start:prod="node --env-file=.env dist/main"
```

이 방식은 **프로세스가 시작되기 전에** 환경변수가 채워진다는 게 장점이다.

흔히 쓰는 `dotenv` 패키지는 코드 안에서 읽는다. `main.ts` 본문에서 `dotenv.config()`를 부르면, 이후의 `JwtModule.register({ secret: process.env.JWT_SECRET })`처럼 모듈을 import하는 순간 환경변수를 읽는 코드가 그보다 먼저 실행되어 `undefined`를 읽는다(ESM에서는 `import`가 파일 본문보다 먼저 전부 평가된다).

`import "dotenv/config"`를 맨 첫 import로 두면 피할 수 있지만, 순서 하나에 기대는 셈이다.

스캐폴드에 딸린 e2e 테스트(`npm run test:e2e`)도 `AppModule` 전체를 띄우므로 `.env`가 필요하다. `vitest.config.e2e.ts` 맨 위에 `process.loadEnvFile();`(Node 내장, 기본값 `./.env`) 한 줄을 넣어 둔다. 빼면 `Error: JWT_SECRET 환경변수가 없습니다.`로 실패한다.

```sh
# 터미널 1
cd order-api-nest
npm run start:dev # .env의 PORT=4000을 읽어 http://localhost:4000

# 터미널 2
cd order-console-next
npm run dev # http://localhost:3000
```

## 2. 1단계: 인증 패키지 설치

```sh
cd order-api-nest
npm install @nestjs/passport @nestjs/jwt passport passport-jwt
npm install -D @types/passport-jwt
```

인증(Authentication)은 "누구냐"(로그인 성공)를 확인하는 것이고, 인가(Authorization)는 "이 사람이 이걸 해도 되냐"(권한)를 확인하는 것이다.

> 이 프로젝트에서는 인증까지만 다룬다.

### 설치한 패키지

- `passport`, `passport-jwt`, `@nestjs/passport`: 로그인 검증 방식을 "전략(Strategy)"으로 꽂아 쓰게 해 주는 Passport 계열이다. "전략"이 Nest 용어가 아니라 Passport의 말이라는 점은 0장 2절에서 정리했다. `passport`가 등록소와 실행 절차를, `passport-jwt`가 JWT용 전략 하나를, `@nestjs/passport`가 그것을 Nest의 Guard로 잇는 접착제를 맡는다.
- `@nestjs/jwt`: JWT 토큰 발급·검증 도구다.
- `@types/passport-jwt`: `passport-jwt`의 TS 타입 정의다. 개발용 의존성(`-D`)으로 설치한다.

## 3. 2단계: JWT 검증 전략 만들기

Nest에서 "요청을 통과시킬지 결정하는 지점"은 Guard다. JWT 검증 로직은 Passport의 Strategy 패턴으로 짜고, Guard가 그 Strategy를 실행하도록 연결한다.

`src/auth/jwt.strategy.ts`

```ts
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    // 환경변수가 없으면 서버가 아예 뜨지 않게 일부러 에러를 던진다
    if (!secret) throw new Error("JWT_SECRET 환경변수가 없습니다.");
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // "Authorization: Bearer ..." 헤더에서 꺼낸다
      secretOrKey: secret,
    });
  }

  validate(payload: { sub: string }) {
    return { userId: payload.sub }; // 여기서 반환한 값이 req.user가 된다
  }
}
```

`src/auth/auth.module.ts`

```ts
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
// NestJS에서 본 ESM 규칙대로 상대경로 import에는 .js를 붙인다
import { AuthController } from "./auth.controller.js";
import { JwtStrategy } from "./jwt.strategy.js";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: "1h" } }), // 만료시간 필수
  ],
  controllers: [AuthController],
  providers: [JwtStrategy],
})
export class AuthModule {}
```

`src/app.module.ts`의 `imports`에 `AuthModule`을 추가한다(`import { AuthModule } from './auth/auth.module.js';`, `imports: [OrdersModule, AuthModule]`).

> 이후 `auth.controller.ts`를 만들기 전까지는 컴파일 에러가 나는 게 정상이다.

`JwtStrategy`가 왜 새로 등장했는지는 이미 정리했다. 여기서는 `validate` 메서드가 반환하는 값이 이후 핸들러에서 `req.user`로 쓰인다는 것만 기억하면 된다.

### Passport·JWT API

- `PassportStrategy(Strategy)`: Passport 전략을 Nest 클래스로 쓸 수 있게 감싸는 함수다. 이 함수가 돌려준 클래스를 상속(`extends`)한다. 아래 "`extends` 뒤에 함수 호출이 오는 이유"에서 다룬다.
- `Strategy`(passport-jwt): JWT 검증 전략 클래스다. 스스로 `"jwt"`라는 이름을 갖고 있다.
- `ExtractJwt.fromAuthHeaderAsBearerToken()`: 요청의 `Authorization: Bearer ...` 헤더에서 토큰을 꺼내는 방법이다.
- `secretOrKey`: 토큰의 서명을 검증할 때 쓰는 비밀 키다. 토큰을 발급할 때 쓴 값과 같아야 한다.
- `validate(payload)`: 서명이 유효하고 만료 전인 토큰이면 Passport가 토큰 안의 내용(payload)을 넣어 이 메서드를 호출한다. 아래 "토큰 하나가 `req.user`가 되기까지"에서 다룬다.
- `sub`: "subject"를 뜻하는 JWT 표준 필드다. 여기서는 사용자 id를 담는다.

#### `super(...)`는 부모 생성자를 부르는 것이다

`super`는 "상속한 쪽(부모 클래스)"을 가리키는 키워드다. 쓰임은 두 가지뿐이다.

- 생성자 안의 `super(인자)`: **부모 클래스의 생성자를 실행한다.**
- 메서드 안의 `super.메서드()`: 부모의 같은 이름 메서드를 실행한다(자식이 덮어쓴 메서드에서 원본을 부를 때).

상속한 클래스에서 생성자를 직접 쓸 때는 `this`를 건드리기 전에 `super()`를 먼저 불러야 한다. 객체를 실제로 만들어 주는 쪽이 부모 생성자이기 때문이다.

```js
class Parent {
  constructor(opts) { this.opts = opts; }
}

class Child extends Parent {
  constructor() {
    // this.name = "x"; // ReferenceError: Must call super constructor in derived class
    super({ a: 1 }); // 부모 생성자가 여기서 실행되고, 이 시점에 this가 생긴다
    this.name = "x"; // super 뒤에서만 this를 쓸 수 있다
  }
}

class NoCtor extends Parent {} // 생성자를 생략하면 constructor(...args) { super(...args); }가 암묵적으로 들어간다
console.log(new NoCtor({ a: 1 }).opts); // 출력: { a: 1 }
```

`this`만 못 쓸 뿐, `super()` 앞에서 지역 변수를 계산하거나 `throw`하는 것은 된다. `JwtStrategy` 생성자가 그 모양이다.

```ts
constructor() {
  const secret = process.env.JWT_SECRET; // this를 안 건드리므로 super 앞에서 가능하다
  if (!secret) throw new Error("JWT_SECRET 환경변수가 없습니다."); // 부모를 만들기도 전에 끊는다
  super({ jwtFromRequest: ..., secretOrKey: secret }); // 이 객체는 passport-jwt Strategy의 옵션이다
}
```

그래서 이 파일이 하는 일은 결국 **"부모에게 설정을 넘기고(`super`), 자식은 빈칸 하나를 채운다(`validate`)"**로 요약된다. 토큰을 어디서 꺼내고 어떤 키로 검증할지는 부모(passport-jwt의 `Strategy`)가 보관하고 실행한다. 생성자를 직접 쓴 유일한 이유는 그 사이에 환경변수 검사를 끼워 넣기 위해서다.

상속이 없는 C에서 공통 초기화를 먼저 부르고 자기 몫을 채우던 패턴과 같다.

```c
// C: 공통 부분을 먼저 초기화하고(super에 해당) 그 뒤 자기 몫을 채운다
int jwt_strategy_init(jwt_strategy_t *self, const char *secret) {
    if (!secret) return -EINVAL;      // super 앞의 검사
    strategy_init(&self->base, secret); // super(...)
    self->validate = jwt_validate;      // 자식이 더하는 몫
    return 0;
}
```

> `super()`를 안 불렀거나 인자를 빼먹으면 Nest/Passport 에러가 아니라 JS 수준의 `ReferenceError`나 "옵션이 없다"는 passport-jwt의 에러로 나타난다. 부팅 자체가 실패하므로 금방 드러난다.

#### `extends` 뒤에 함수 호출이 오는 이유

JS의 클래스는 값(함수 객체)이다. 그래서 `extends` 뒤에는 클래스 이름뿐 아니라 **클래스를 돌려주는 식**도 올 수 있다. `PassportStrategy(Strategy)`는 passport-jwt의 `Strategy`를 상속한 새 클래스를 그 자리에서 만들어 돌려주고, `JwtStrategy`는 그 클래스를 상속한다. 이렇게 클래스를 받아 기능을 덧붙인 클래스를 돌려주는 함수를 믹스인(mixin)이라 부른다.

```js
class Base {
  constructor(options) { this.options = options; }
}

// 클래스를 받아, 그것을 상속한 새 클래스를 돌려주는 함수
function Wrap(Strategy) {
  return class extends Strategy {
    constructor(...args) {
      super(...args);
      console.log("등록:", this.options.name); // 생성되는 순간 할 일을 끼워 넣는다
    }
  };
}

class My extends Wrap(Base) {
  constructor() { super({ name: "jwt" }); }
}

new My(); // 출력: 등록: jwt
console.log(typeof Wrap(Base)); // 출력: function
```

`PassportStrategy`가 만든 중간 클래스도 같은 구조로 생성자에서 두 가지를 한다.

- `super(옵션, 콜백)`으로 passport-jwt의 `Strategy`를 만들면서, 콜백 자리에 "`this.validate`를 불러 그 결과를 Passport에 넘기는 함수"를 끼워 넣는다. 그래서 `JwtStrategy`는 `super`에 옵션만 넘기고 `validate` 메서드만 쓰면 된다.
- 만들어진 인스턴스를 Passport에 이름으로 등록한다(`passport.use`). 이름은 passport-jwt의 `Strategy`가 갖고 있는 `"jwt"`이고, `PassportStrategy(Strategy, "admin-jwt")`처럼 둘째 인자로 바꿀 수 있다.

앞서 말한 "DI 레지스트리에 등록되는 인증 방식 하나"가 실제로는 이 생성자 안에서 일어난다. 그래서 **Nest가 `JwtStrategy`를 만들어야 이름이 생기고**, Nest는 `providers`에 적힌 클래스만 만든다. 이후의 `AuthGuard("jwt")`는 요청이 올 때 이 이름을 찾는다.

| 실수 | 결과 |
| --- | --- |
| `providers: [JwtStrategy]`를 빠뜨림 | 서버는 뜬다. 요청하면 500, 서버 터미널에 `Unknown authentication strategy "jwt"` |
| `AuthGuard("jwtt")`처럼 이름 오타 | 서버는 뜬다. 요청하면 500, 서버 터미널에 `Unknown authentication strategy "jwtt"` |

> 두 실수 모두 컴파일과 부팅을 통과하고 첫 요청에서야 드러난다. 토큰 문제라면 401이 와야 하므로, 500이 오면 이 표부터 확인한다.

#### `Authorization: Bearer`는 헤더의 문법이다

`Bearer`는 JWT의 일부가 아니다. 토큰을 **어느 헤더에 어떤 형식으로 실어 보내는가**에 관한 HTTP 쪽 약속이고, 형식은 두 칸짜리다.

```
Authorization: <인증 방식> <자격 증명>
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
               └─ 방식 ┘ └─ 토큰 문자열 ────┘
```

`Bearer`는 "소지자"라는 뜻이다. **이 문자열을 가진 사람이 곧 권한을 가진 사람**이라는 선언이라서, 서버는 "누가 보냈는지"를 따지지 않고 토큰의 서명만 본다. 인증 방식 자리에 올 수 있는 값은 여러 개이고, 어떤 자격 증명을 쓰는지에 따라 고른다.

| 인증 방식 | 자격 증명 자리에 오는 것 |
| --- | --- |
| `Bearer` | 토큰 문자열. 서버는 그 토큰만 보고 판단한다 |
| `Basic` | `base64(아이디:비밀번호)`. 요청마다 비밀번호 자체를 보낸다 |

- 토큰이 JWT일 필요는 없다. 서버만 알아볼 수 있는 임의의 문자열(불투명 토큰)이어도 `Bearer`로 보낸다. 거꾸로 JWT를 쿠키나 요청 본문에 담아 보낼 수도 있다. **헤더 형식과 토큰 형식은 별개다.**
- 방식 이름은 대소문자를 가리지 않는다(HTTP 명세가 그렇게 정했다). 아래 표에서 `bearer eyJ...`가 통과하는 이유다. 반대로 `Bearer `라는 접두사 자체를 빼면 `fromAuthHeaderAsBearerToken()`이 토큰을 못 찾아 401이 된다.
- 쿠키와 달리 **브라우저가 알아서 붙여주지 않는다.** 보내는 쪽이 매번 직접 넣어야 한다(이후의 서버 액션이 `headers`에 직접 적는 이유). 이 헤더를 붙이는 순간 교차 출처 요청이 "단순 요청" 조건을 벗어나 예비 요청이 생기는 것은 이후에 다룬다.

"가진 사람이 곧 권한자"라는 성질이 곧 위험이기도 하다. 토큰이 유출되면 그걸 주운 쪽이 그대로 그 사용자가 된다. 그래서 전송 구간을 HTTPS로 감싸고, 만료 시각을 짧게 두는 것이 기본이다(9장의 "만료시간 제거" 실험이 이 이야기다).

#### 토큰 하나가 `req.user`가 되기까지

`AuthGuard("jwt")`가 걸린 핸들러로 요청이 오면, passport-jwt는 `super`에 넘긴 옵션대로 아래 순서를 밟는다.

1. `jwtFromRequest`로 토큰을 꺼낸다. `Authorization` 헤더가 없거나 `Bearer ` 없이 토큰만 보내면 여기서 실패한다.
2. `secretOrKey`로 서명을 다시 계산해 비교한다. 다른 키로 서명했거나 토큰이 한 글자라도 바뀌었으면 실패한다.
3. payload의 `exp`가 지났는지 본다. 지났으면 실패한다.
4. 모두 통과하면 payload를 넣어 `validate`를 부르고, 반환값을 `req.user`에 넣은 뒤 핸들러로 넘어간다.

| 보낸 요청 | 응답 |
| --- | --- |
| `Authorization` 헤더 없음 | 401 |
| `Authorization: eyJ...`(`Bearer ` 빠짐) | 401 |
| 다른 비밀키로 서명한 토큰 | 401 |
| `exp`가 지난 토큰 | 401 |
| `Authorization: bearer eyJ...`(소문자) | 201(접두사의 대소문자는 가리지 않는다) |

- 실패한 경우는 전부 같은 본문 `{"message":"Unauthorized","statusCode":401}`이 온다. 응답만으로는 1~3 중 어디서 막혔는지 알 수 없다.
- `validate`가 `null`이나 `false`를 돌려줘도 401이다. 실제 서비스에서는 여기서 DB를 조회해 탈퇴한 사용자를 막는 식으로 쓴다.
- 핸들러에서 `@Req() req`로 요청 객체를 받으면 `req.user.userId`로 로그인한 사용자를 꺼낼 수 있다. 이 문서의 핸들러는 아직 쓰지 않는다.

> 401이 오는데 이유를 모르겠다면 토큰 내용(`exp`)과 비밀키가 읽혔는지를 나누어 확인한다.

### NestJS·JWT API

- `JwtModule.register(옵션)`: 토큰 발급(sign)/검증에 쓰는 `JwtService`를 제공하는 모듈을 설정한다. `secret`은 서명용 비밀 키, `expiresIn`은 토큰 유효 시간(`"1h"` = 1시간)이다. 값을 적는 규칙은 아래 "`expiresIn`의 단위"에서 다룬다.
- `providers: [JwtStrategy]`: `JwtStrategy`를 주입 대상으로 등록한다. 등록해 두어야 Nest/Passport가 이 전략을 찾아 쓸 수 있다. 빠뜨렸을 때의 증상은 위 "`extends` 뒤에 함수 호출이 오는 이유"의 표에 있다.

#### 프로바이더는 Nest가 만들어서 넣어주는 객체다

"프로바이더(provider)"는 **Nest가 대신 만들어 두고 필요한 곳에 넣어주는 객체**를 가리키는 Nest 용어다. 쓰는 쪽이 `new`로 만들지 않고 Nest가 공급(provide)하기 때문에 그렇게 부른다. 객체를 만드는 주도권이 쓰는 쪽에서 프레임워크로 넘어가는 이 뒤집힘을 IoC(Inversion of Control, 제어의 역전)라고 부른다. 무엇이 프로바이더인지는 모듈의 `providers` 배열에 적힌 것이 전부다.

`providers: [JwtStrategy]`는 축약형이고, 원래 모양은 "키 → 만드는 방법"의 짝이다.

```ts
providers: [JwtStrategy]
// 위는 아래의 축약이다. 키(provide)와 만드는 방법(useClass)이 둘 다 클래스 자신인 경우
providers: [{ provide: JwtStrategy, useClass: JwtStrategy }]

// 키는 클래스가 아니어도 되고, 만드는 방법도 바꿀 수 있다
providers: [{ provide: "CONFIG", useValue: { retries: 3 } }] // 이미 있는 값을 그대로 공급
providers: [{ provide: Clock, useFactory: () => new FakeClock() }] // 함수가 만들어 주는 값을 공급
```

그래서 주입은 "타입으로 찾는다"기보다 **키로 찾는다**가 정확하다. 클래스를 그대로 쓸 때는 그 클래스가 키라서 타입으로 찾는 것처럼 보인다.

알아 둘 성질이 둘 있다.

- **기본은 싱글턴이다.** 부팅할 때 하나 만들어 두고 계속 재사용하므로, 주입받는 모든 곳이 같은 객체를 공유한다. `OrdersService`의 `orders` 배열과 `nextId`가 요청 사이에 유지되는 이유가 이것이다. 필드에 담긴 상태가 사실상 서버의 상태가 된다.
  - 요청마다 새로 만들게 바꿀 수도 있다(`@Injectable({ scope: Scope.REQUEST })`). 그러면 요청별로 격리되는 대신 그 필드에 쌓아 둔 상태는 요청이 끝날 때 사라지고, 매 요청마다 생성 비용이 든다. 기본값이 싱글턴인 것은 그 반대편 선택이다.
- **등록한 모듈 안에서만 보인다.** 다른 모듈에서 쓰려면 만든 쪽이 `exports`에 넣고, 쓰는 쪽이 `imports`에 그 모듈을 넣어야 한다. `AuthModule`이 `JwtModule.register(...)`를 `imports`에 넣은 이유가 그것이다. `JwtModule`이 `JwtService`를 export하고 있으므로, 그때서야 `AuthController`의 생성자가 `JwtService`를 받을 수 있다.

`@Module`의 배열 네 개가 각각 무엇을 맡는지로 정리하면 이렇다.

| 배열 | 무엇을 적는가 |
| --- | --- |
| `providers` | 이 모듈이 만들어서 공급할 객체들 |
| `controllers` | 라우트 진입점. 주입받기는 하지만 어디에도 주입되지 않으므로 `providers`와 따로 적는다 |
| `imports` | 다른 모듈이 `exports`한 프로바이더를 끌어다 쓰겠다는 선언 |
| `exports` | 이 모듈의 프로바이더 중 밖에 공개할 것 |

`JwtStrategy`는 프로바이더 중에서도 특이한 쪽이다. **아무도 이것을 주입받지 않는다.** 생성되는 것 자체가 목적이기 때문이다("`extends` 뒤에 함수 호출이 오는 이유"에서 본 대로, 생성자가 실행되면서 자신을 Passport에 이름으로 등록한다). 그래서 `providers`에서 빠지면 Nest가 아예 만들지 않고, 그 결과가 위 표의 `Unknown authentication strategy "jwt"` 500이다.

> 바꿔 말하면 `providers`는 "주입해 줄 목록"이기도 하고 "Nest가 부팅할 때 만들 목록"이기도 하다. 후자가 필요해서 등록하는 경우도 있다.

#### `@Injectable()`이 실제로 하는 일

"DI 컨테이너에 등록하는 데코레이터"라는 설명이 흔하지만 정확하지 않다. 등록은 모듈의 `providers` 배열이 한다. `@Injectable()`이 하는 일은 "데코레이터의 작동 경로"에서 본 그대로 **메모 두 개를 남기는 것**뿐이다.

1. 클래스에 `__injectable__` 표식을 남긴다. Nest가 "이건 프로바이더로 쓰라고 만든 클래스"로 식별하는 도장이다.
2. 데코레이터가 하나라도 붙으면 TypeScript가 생성자 파라미터의 타입 목록을 `design:paramtypes` 메타데이터로 함께 내보낸다. **Nest가 "이 생성자에 무엇을 넣어야 하는지" 아는 근거는 이 목록뿐이다.**

실질적인 역할은 2번이다. 타입은 컴파일 후 사라지는데, 데코레이터가 그 타입 목록만 런타임까지 남겨 준다.

빼먹으면 어떻게 되는지를 작은 모듈로 확인한 결과는 다음과 같다.

| 클래스 | `design:paramtypes` | 부팅 | 결과 |
| --- | --- | --- | --- |
| 생성자 의존성 없음 + `@Injectable()` 없음 | 없음 | 성공 | 주입할 게 없어 아무 문제 없다 |
| 생성자 의존성 있음 + `@Injectable()` 없음 | 없음 | **성공** | 그 필드가 `undefined`로 남는다 |
| 생성자 의존성 있음 + `@Injectable()` 있음 | `["Dep"]` | 성공 | 정상 주입된다 |

가운데 행이 중요하다. "의존성을 못 찾았다"는 에러가 아니라 **의존성이 0개인 클래스로 간주되어 인자 없이 만들어진다.** 부팅 로그는 깨끗하고, 그 필드를 처음 쓰는 요청에서야 `TypeError: Cannot read properties of undefined`로 터진다. `@UseGuards`를 빼먹는 실수와 정확히 같은 종류다. 선언을 빼먹으면 선언이 없는 상태로 조용히 조립된다.

이 관점에서 보면 나머지도 설명된다.

- `JwtStrategy`는 생성자 인자가 없다. 그래서 2번 효과가 필요 없지만, 1번 표식과 관례 때문에 항상 붙인다.
- `AuthController`는 `@Injectable()` 없이 `JwtService`를 주입받는다. `@Controller()` 자체가 데코레이터라서 `design:paramtypes`가 똑같이 생기기 때문이다(실제로 확인해보면 타입 목록은 들어 있고 `__injectable__` 표식만 없다).
- 그래서 `@Injectable()`은 "주입을 켜는 스위치"가 아니라 **"생성자에 주입받을 것이 있는 클래스라면 반드시 데코레이터가 하나는 붙어 있어야 한다"는 요구사항을 채우는 가장 평범한 방법**이다.

> 두 메모 중 어느 것도 "등록"이 아니다. 등록은 `providers`가 하고, 실행 시점에 찾는 것은 Nest다. 이 분업을 섞어 기억하면 "`@Injectable()`을 붙였는데 왜 주입이 안 되냐"(= `providers`에 안 넣었다)에서 막힌다.

#### `expiresIn`의 단위

`sign`은 payload에 발급 시각 `iat`와 만료 시각 `exp`(둘 다 초 단위 UNIX 시각)를 자동으로 붙인다. `exp - iat`가 곧 `expiresIn`이다. 값은 숫자 또는 단위를 붙인 문자열로 쓰는데, **단위 없는 숫자 문자열**에서 사람들이 자주 걸린다.

```js
// @nestjs/jwt가 내부에서 쓰는 jsonwebtoken으로 토큰을 만들고 exp - iat를 찍어 본 결과
jwt.sign({ sub: "kim" }, "change-me", { expiresIn: "1h" }); // exp - iat: 3600
jwt.sign({ sub: "kim" }, "change-me", { expiresIn: 3600 }); // exp - iat: 3600
jwt.sign({ sub: "kim" }, "change-me", { expiresIn: "3600" }); // exp - iat: 3
```

| `expiresIn` 값 | 해석 | 유효 시간 |
| --- | --- | --- |
| `"1h"`, `"60s"`, `"7d"` | 단위가 붙은 문자열 | 1시간, 60초, 7일 |
| `3600` | 숫자는 초 | 1시간 |
| `"3600"` | 단위 없는 문자열은 밀리초 | 3.6초(초 단위로 버려 3초) |

- 환경변수에서 읽을 때 특히 위험하다. `process.env`의 값은 항상 문자열이라, `.env`에 `JWT_EXPIRES=3600`처럼 적고 그대로 넘기면 3초짜리 토큰이 된다. 로그인 직후 몇 초 만에 401이 나기 시작한다.
- `expiresIn`을 아예 빼면 `exp`가 붙지 않아 영원히 유효한 토큰이 된다.

> 단위를 붙인 문자열(`"1h"`, `"15m"`)로만 쓰면 헷갈릴 일이 없다.

## 4. 3단계: 로그인 엔드포인트

실제 서비스라면 DB의 사용자 테이블과 비밀번호 해시(`bcrypt`) 비교가 필요하다. 여기서는 "토큰을 어떻게 내주는가"만 보이려고 하드코딩한 사용자 하나로 줄인다.

로그인 본문도 NestJS의 `CreateOrderDto`처럼 클래스 DTO로 받는다.

`{ id: string; password: string }` 같은 객체 타입으로 적으면 런타임에 남는 게 `Object`뿐이라 `ValidationPipe`가 아무것도 검사하지 못한다. 그러면 본문 없이 호출하는 순간 `dto.id`에서 터져 500이 난다.

`src/auth/login.dto.ts`

```ts
import { IsNotEmpty, IsString } from "class-validator";

export class LoginDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() @IsNotEmpty() password!: string;
}
```

`src/auth/auth.controller.ts`

```ts
import { Body, Controller, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { LoginDto } from "./login.dto.js";

@Controller("auth")
export class AuthController {
  // JwtModule이 제공하는 JwtService를 주입받는다
  constructor(private readonly jwtService: JwtService) {}

  @Post("login")
  // POST의 기본 응답 코드는 201(Created)이지만, 로그인은 무언가를 "만든" 게 아니므로 200으로 바꾼다
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    // 데모용: 하드코딩된 사용자 "kim"과 환경변수의 비밀번호와 비교한다
    if (dto.id !== "kim" || dto.password !== process.env.DEMO_PASSWORD) {
      throw new UnauthorizedException("id 또는 password가 틀렸다");
    }
    return { accessToken: this.jwtService.sign({ sub: dto.id }) };
  }
}
```

```sh
# 로그인 요청. 성공하면 accessToken이 든 JSON이 돌아온다
curl -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"id":"kim","password":"1234"}'
{"accessToken":"eyJ..."} → 200

# 비밀번호가 틀리면
curl -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"id":"kim","password":"nope"}'
{"message":"id 또는 password가 틀렸다","error":"Unauthorized","statusCode":401}

# 본문이 없으면 LoginDto 검증에서 걸린다
curl -X POST localhost:4000/auth/login
{"message":["id should not be empty","id must be a string","password should not be empty","password must be a string"],"error":"Bad Request","statusCode":400}
```

이후 예시의 `eyJ...` 자리에는 실제로 받은 토큰을 붙여 넣는다. 매번 복사하기 번거로우면 셸 변수에 담아 둔다.

```sh
# $( ... ): 명령의 출력을 값으로 쓴다. node -pe는 표준입력의 JSON을 읽어 accessToken만 출력한다
TOKEN=$(curl -s -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"id":"kim","password":"1234"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"user":"choi","price":9000,"paid":true}'
```

### NestJS·JWT API

- `@HttpCode(상태 코드)`: 응답 상태 코드를 바꾸는 데코레이터다.
- `UnauthorizedException`: 401 Unauthorized 응답을 만드는 예외다.
- `jwtService.sign(payload)`: payload에 서명을 붙여 JWT 문자열을 만든다. 여기서는 `sub`에 사용자 id를 담는다. `iat`/`exp`가 자동으로 붙는 것은 "`expiresIn`의 단위"에서 봤다.

## 5. 4단계: 주문 생성을 인증으로 막기

`orders.controller.ts`의 POST에 Guard를 건다.

```ts
// 기존 "@nestjs/common" import 목록에 UseGuards를 추가하고, AuthGuard import 줄을 새로 넣는다
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
// ...
@Post()
@UseGuards(AuthGuard("jwt")) // 2단계의 JwtStrategy를 이 이름("jwt")으로 찾는다
create(@Body() dto: CreateOrderDto) {
  return this.ordersService.create(dto);
}
```

```sh
# 토큰 없이 요청 → Guard가 막는다
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -d '{"user":"choi","price":9000,"paid":true}'
{"message":"Unauthorized","statusCode":401} → 401

curl -X POST localhost:4000/orders -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJ...' -d '{"user":"choi","price":9000,"paid":true}'
{"id":203,"user":"choi","price":9000,"paid":true} → 201
```

### NestJS·Passport API

- `@UseGuards(Guard)`: 컨트롤러 메서드에 Guard를 붙이는 데코레이터다. Guard는 "이 요청을 통과시킬까?"를 결정하는 관문이다. 다른 검사와의 순서는 아래 "Guard는 `ValidationPipe`보다 먼저 실행된다"에서 다룬다.
- `AuthGuard("jwt")`: 그 이름으로 등록된 Passport 전략을 실행하는 Guard를 만들어 준다. 이름이 어디서 오는지는 "`extends` 뒤에 함수 호출이 오는 이유"에서 봤다.

#### Guard는 `ValidationPipe`보다 먼저 실행된다

Nest는 요청 하나를 Guard → Pipe(`ValidationPipe`, `ParseIntPipe` 등) → 핸들러 순서로 처리한다. Guard가 막으면 그 뒤의 본문 검증은 아예 실행되지 않는다.

```sh
# 토큰 없이 빈 본문: Guard에서 먼저 막혀 400이 아니라 401이다
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -d '{}'
{"message":"Unauthorized","statusCode":401}

# 토큰을 붙인 빈 본문: Guard를 통과한 뒤 CreateOrderDto 검증에서 400이다
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{}'
{"message":["user should not be empty","user must be a string",...],"error":"Bad Request","statusCode":400}
```

- 인증되지 않은 요청에는 본문이 어떻게 틀렸는지도 알려 주지 않는다. 로그인하지 않은 사람에게 DTO 구조를 흘리지 않는 효과도 있다.
- `/auth/login`에는 Guard가 없으므로 빈 본문이 바로 400이 된다.
- `@UseGuards`를 메서드가 아니라 컨트롤러 클래스에 붙이면 그 컨트롤러의 모든 핸들러에 걸린다. 여기서는 조회(GET)는 열어 두고 생성(POST)만 막으려고 메서드에 붙였다.

> C로 치면 함수 맨 앞에서 권한 검사(`if (!authorized) return -EACCES;`)를 인자 검사보다 먼저 하는 것과 같다.

#### 데코레이터의 작동 경로

`@UseGuards(...)`는 요청이 올 때마다 실행되는 코드가 아니다. **데코레이터는 클래스가 정의되는 순간 딱 한 번 실행되고, 하는 일은 대개 "메모를 남기는 것"뿐이다.** `@Post()`, `@HttpCode(200)`, `@Body()`, `@Injectable()` 모두 같다.

`@데코레이터`는 문법 설탕이라서, 아래 두 코드는 사실상 같다.

```ts
class OrdersController {
  @UseGuards(AuthGuard("jwt"))
  create(@Body() dto: CreateOrderDto) { /* ... */ }
}

// 위 코드가 평가될 때 실제로 일어나는 일(개념적으로)
const guard = AuthGuard("jwt"); // 1) 먼저 인자가 평가되어 Guard 클래스가 만들어진다
const decorate = UseGuards(guard); // 2) 데코레이터 팩토리가 "적용 함수"를 돌려준다
decorate(OrdersController.prototype, "create", descriptor); // 3) 그 함수가 메서드에 적용된다
```

`3)`이 하는 일은 `Reflect.defineMetadata("__guards__", [guard], descriptor.value)` 한 줄, 즉 `create` 함수에 "이 메서드엔 이 Guard가 붙어 있다"를 적어두는 것이다. 검사 로직은 이 시점에 한 줄도 실행되지 않는다.

```
[1] 모듈 로드 시점(파일이 평가될 때 딱 한 번)
    @UseGuards(AuthGuard("jwt"))
        │
        │  AuthGuard("jwt") 가 먼저 평가 → Guard 클래스 하나 생성
        ▼
    UseGuards(Guard)  → 적용 함수를 반환
        │
        │  (prototype, "create", descriptor) 를 받아 호출
        ▼
    Reflect.defineMetadata("__guards__", [Guard], create)
        │
        ▼
    메모만 남는다. 아무 검사도 실행되지 않는다

[2] 부팅 시점(NestFactory.create() → app.listen())
    Nest가 모든 컨트롤러의 모든 메서드를 훑는다
        │
        │  Reflect.getMetadata("__guards__", create) → [Guard]
        │  Reflect.getMetadata("path", create)       → "/"     (@Post)
        │  Reflect.getMetadata("method", create)     → POST    (@Post)
        ▼
    "POST /orders" 라우트의 실행 파이프라인을 조립해 라우터에 등록
        Guard → Interceptor → Pipe → 핸들러

[3] 요청 시점(요청 1건마다)
    POST /orders
        ▼
    조립된 파이프라인 실행
        Guard.canActivate(ctx) ──── false / throw ────▶ 401 (핸들러 미실행)
                │ true
                ▼
        ValidationPipe → create(dto) → OrdersService
```

이 세 시점이 나뉘어 있다는 사실이 바로 "데코레이터를 빼먹으면 조용히 안 걸린다"의 이유다.

| 실수 | 어디서 어긋나는가 | 증상 |
| --- | --- | --- |
| `@UseGuards`를 안 씀 | [1]에서 메모가 안 남는다 | [2]는 "Guard 없음"으로 정상 조립한다. 어디에도 기대가 없어 에러 낼 자리가 없다 → 201로 조용히 통과 |
| `AuthGuard("jwtt")` 오타 | 메모는 남고 [3]까지 간다 | 요청이 와서 그 이름의 Strategy를 찾는 순간 500 |
| `providers: [JwtStrategy]` 누락 | [2]에서 전략 등록이 안 된다 | 위와 같은 500 |

> 2단계의 표가 "컴파일과 부팅을 통과하고 첫 요청에서야 드러난다"고 한 것도 같은 이야기다. 데코레이터는 선언이지 검사가 아니므로, 빠진 선언을 컴파일러가 알아챌 방법이 없다.

Nest의 DI가 타입만 보고 생성자를 채울 수 있는 것도 같은 메모 장치 덕이다. TypeScript의 `emitDecoratorMetadata` 옵션이 켜져 있으면, 데코레이터가 하나라도 붙은 클래스에 대해 컴파일러가 생성자 파라미터의 타입 목록을 `design:paramtypes` 메타데이터로 함께 내보낸다. `AuthController`가 `JwtService`를 주입받을 수 있는 근거가 그것이다. 2단계의 "`@Injectable()`이 실제로 하는 일"에서 이 메모가 없을 때 무엇이 조용히 어긋나는지 확인했다.

> 그래서 `tsconfig.json`의 `experimentalDecorators`/`emitDecoratorMetadata`는 Nest 프로젝트에서 선택 사항이 아니다(스캐폴드의 `tsconfig.json`에 이미 켜져 있고, `Reflect.defineMetadata`를 제공하는 `reflect-metadata` 패키지는 Nest 코어가 함께 가져온다).

### 일부러 깨뜨려보기

`@UseGuards(AuthGuard("jwt"))`를 지워본다. 토큰 없는 첫 번째 요청이 이제 401이 아니라 201로 성공한다.

컴파일도 실행도 에러 없이 조용히 뚫린다. NestJS에서 본 "데코레이터를 빼먹으면 조용히 안 걸린다"는 성질이 인증에서도 그대로다.

## 6. 5단계: CORS 설정

지금까지의 curl 테스트는 전부 통과했다. 그런데 Next.js의 브라우저 화면에서 직접 이 API를 부르면 처음으로 막히는 게 CORS다.

`order-api-nest/src/main.ts`의 `bootstrap()`
```ts
// enableCors: 응답에 CORS 헤더를 붙여, 브라우저가 지정한 출처(origin)에서 오는 요청만 허용하게 한다
app.enableCors({ origin: process.env.FRONTEND_URL });
```

CORS(Cross-Origin Resource Sharing, 교차 출처 리소스 공유)는 브라우저가 "이 오리진(`localhost:3000`)의 스크립트가 저 오리진(`localhost:4000`)에 요청해도 되는가"를 서버 응답 헤더로 확인하는 규칙이다.

### 왜 기본이 "금지"인가

브라우저는 요청을 보낼 때 그 도메인의 쿠키를 자동으로 붙인다. 그래서 아무 사이트의 JS가 다른 사이트의 API를 마음대로 부를 수 있으면, 사용자가 방문한 악성 페이지가 **그 사용자의 로그인 상태로** 은행 API를 호출할 수 있다.

그래서 브라우저에는 처음부터 동일 출처 정책(Same-Origin Policy)이 있고, 다른 오리진으로의 JS 요청은 기본적으로 응답을 읽을 수 없다. CORS는 그 금지를 **서버가 "저 오리진은 괜찮다"고 명시적으로 풀어주는 예외 절차**다. 즉 CORS 설정은 문을 잠그는 게 아니라 잠긴 문을 특정 손님에게만 열어주는 쪽이다.

오리진은 **스키마 + 호스트 + 포트** 세 짝이다. 셋 중 하나만 달라도 다른 오리진이고, 경로는 상관없다.

| `http://localhost:3000`과 비교 | 같은 오리진인가 |
| --- | --- |
| `http://localhost:3000/orders` | 같다 (경로는 무관) |
| `http://localhost:4000` | 다르다 (포트) |
| `https://localhost:3000` | 다르다 (스키마) |
| `http://127.0.0.1:3000` | 다르다 (같은 기계라도 호스트 문자열이 다르면 다르다) |

> 그래서 프론트 3000, 백엔드 4000으로 포트만 나눈 이 프로젝트도 이미 교차 출처다.

### 예비 요청(preflight)

모든 교차 출처 요청이 바로 나가는 건 아니다. GET/HEAD/POST이고 헤더가 단순하며 `Content-Type`이 `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain` 중 하나이면 "단순 요청"으로 바로 보낸다.

우리가 보내는 요청은 `Content-Type: application/json`과 `Authorization` 헤더를 달고 있어 그 조건을 벗어난다. 이때 브라우저는 본 요청 전에 `OPTIONS` 요청을 한 번 먼저 보내 "이 메서드와 이 헤더로 보내도 되냐"를 묻는다. 이것이 예비 요청이다.

```
브라우저 JS          브라우저의 CORS 검사                      백엔드 4000
 fetch() ─────▶  OPTIONS /orders ───────────────────────────────▶
                 Origin: http://localhost:3000
                 Access-Control-Request-Method: POST
                 Access-Control-Request-Headers: authorization,content-type
             ◀─── 204 Access-Control-Allow-Origin: http://localhost:3000
                      Access-Control-Allow-Headers: ...
                 허용 목록과 맞는가?
                  ├── 아니다 ──▶ 본 요청을 아예 보내지 않고 실패
                  └── 맞다
                 POST /orders ──────────────────────────────────▶ (여기서야 Guard와 핸들러가 돈다)
             ◀─── 201 Access-Control-Allow-Origin: http://localhost:3000
                 응답 헤더를 한 번 더 검사
                  ├── 아니다 ──▶ 응답을 버리고 JS에는 TypeError만 전달
 .then() ◀────    └── 맞다
```

- 예비 요청은 Guard나 핸들러까지 가지 않는다. `enableCors`가 `OPTIONS`를 가로채 바로 답하므로, 토큰이 없는 `OPTIONS`가 401이 되는 일은 없다.
- 8장의 `curl -i -X OPTIONS ...`는 이 예비 요청을 손으로 흉내 내서 응답 헤더만 확인하는 것이다.

### CORS는 서버의 접근 제어가 아니다

서버는 "허락한 오리진이 무엇인지"를 헤더로 **알려줄** 뿐이고, 그에 따라 응답을 버리는 쪽은 브라우저다. 그래서 `origin`을 아무리 좁혀도 curl, 다른 서버, 스크립트의 호출은 전혀 막히지 않는다.

**CORS는 "다른 사이트의 브라우저 JS"를 막는 장치이고, 실제 접근 제어는 4단계의 Guard(인증)가 한다.** 둘을 같은 것으로 착각하면 "CORS를 걸었으니 API가 보호된다"는 잘못된 안심에 빠진다.

쿠키로 인증하는 서비스라면 프론트가 `fetch(..., { credentials: "include" })`로 보내고 서버도 `enableCors({ origin: ..., credentials: true })`로 허락해야 한다. 이 조합에서는 `origin: "*"`가 금지되어(브라우저가 거부) 오리진을 명시해야 한다. 이 프로젝트는 토큰을 헤더로 보내므로 해당 없다.

**서버끼리의 통신에는 적용되지 않는다.** curl이나 Next.js의 서버 컴포넌트가 하는 `fetch`는 여기 해당 없다. 브라우저의 클라이언트 컴포넌트가 직접 다른 오리진을 부를 때만 관여한다.

이후 만들 서버 액션은 Next.js 서버 안에서 실행되므로, 사실 이 프로젝트에서는 CORS를 안 걸어도 지금 당장은 동작한다. 그래도 걸어두는 이유는 두 가지다.

- 나중에 브라우저에서 직접 호출하는 기능이 추가될 걸 대비한다.
- `origin`을 명시하지 않으면(`"*"`) 아무 사이트의 브라우저 JS나 이 API를 불러 쓸 수 있게 된다.

## 7. 6단계: 프론트에서 호출하기

`order-console-next`에 서버 액션을 추가한다. 이 함수는 **브라우저가 아니라 Next.js 서버에서 실행**된다. 로그인과 주문 생성 요청이 전부 서버 안에서 일어나므로, 토큰이 브라우저로 내려가지 않는다.

`app/orders/actions.ts`

```ts
// "use server": 이 파일의 export 함수들이 서버에서만 실행되는 서버 액션임을 알리는 지시어(파일 맨 위에 쓴다)
"use server";

const API = process.env.API_URL ?? "http://localhost:4000";

export async function createTestOrder() {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "kim", password: process.env.DEMO_PASSWORD }),
  });
  if (!loginRes.ok) throw new Error("로그인 실패");
  const { accessToken } = await loginRes.json();

  const orderRes = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ user: "choi", price: 9000, paid: true }),
  });
  if (!orderRes.ok) throw new Error(`주문 생성 실패: ${orderRes.status}`);
  return orderRes.json();
}
```

`process.env.DEMO_PASSWORD`, `process.env.API_URL`은 서버 액션(서버에서만 실행) 안에서 읽으므로 `NEXT_PUBLIC_` 접두사가 필요 없다.

> 오히려 붙이면 브라우저 번들에 값이 그대로 노출된다. Next.js에서 다룬 규칙이 여기서 실제로 갈린다.

두 `fetch`의 식별자 필드 이름이 다른 것에 주의한다. 로그인 바디는 `id`, 주문 생성 바디는 `user`다. `LoginDto`는 `id`를, `CreateOrderDto`는 `user`를 선언했기 때문이다. 주문 생성에 `id`를 적으면 `whitelist: true`인 `ValidationPipe`가 선언되지 않은 `id`를 조용히 버리고, 남은 바디에 `user`가 없어 400이 난다. 버튼에는 `주문 생성 실패: 400`만 뜬다.

이 액션이 읽는 `API_URL`과 `DEMO_PASSWORD`를 지금 만들어 둔다. **백엔드의 `order-api-nest/.env`와는 별개 파일이다.** Next.js 서버는 다른 프로세스라 백엔드의 `.env`를 읽지 않는다.

`order-console-next/.env.local`

```bash
API_URL=http://localhost:4000
DEMO_PASSWORD=1234
```

이 파일을 빼먹으면 `process.env.DEMO_PASSWORD`가 `undefined`가 되고, `JSON.stringify`는 값이 `undefined`인 키를 통째로 빼버린다. 백엔드에는 `{"id":"kim"}`만 도착해 `LoginDto`의 `@IsNotEmpty()`에 걸려 400이 되고, 버튼에는 `로그인 실패`가 뜬다. 서버 액션 안에서 `throw`한 에러는 Next.js가 500으로 바꾸므로 브라우저 네트워크 탭에는 500으로 보인다(8.2).

이 액션을 호출할 버튼을 클라이언트 컴포넌트로 만든다.

`app/orders/create-test-order-button.tsx`

```tsx
// "use client": 이 파일은 브라우저에서 실행되는 클라이언트 컴포넌트다(state와 클릭 이벤트를 쓰려면 필요)
"use client";

import { useState } from "react";
// 서버 액션을 그냥 함수처럼 import해서 호출할 수 있다. 실제 실행은 서버에서 일어난다
import { createTestOrder } from "./actions";

export function CreateTestOrderButton() {
  const [result, setResult] = useState<string | null>(null);

  return (
    <div>
      <button
        onClick={async () => {
          try {
            const order = await createTestOrder();
            setResult(`생성됨: #${order.id} ${order.user}`);
          } catch (e) {
            setResult(e instanceof Error ? e.message : "실패");
          }
        }}
      >
        테스트 주문 만들기
      </button>
      {result && <p>{result}</p>}
    </div>
  );
}
```

`app/orders/page.tsx`의 `import`와 `return` 안에 추가

```tsx
import { CreateTestOrderButton } from "./create-test-order-button";
// ...
// 서버 컴포넌트(page.tsx) 안에 클라이언트 컴포넌트를 그대로 넣을 수 있다
<CreateTestOrderButton />
```

`order-console-next/.env.local`에 `API_URL=http://localhost:4000`과 `DEMO_PASSWORD=1234`를 추가하고 두 서버를 재시작한다.

`/orders`에서 버튼을 누르면 "생성됨: #203 choi"가 뜬다.

> `/orders` 목록 자체는 여전히 `lib/api.ts`의 정적 배열이라, 방금 만든 주문이 목록에는 나타나지 않는다. 목록도 백엔드에서 실시간으로 가져오게 바꾸는 것은 지금까지 배운 것(서버 컴포넌트의 `fetch`)만으로 할 수 있는 연습 과제로 남겨둔다.

### 서버 액션 호출 한 번에 실제로 일어나는 일

0장에서 서버 액션을 "함수처럼 보이는 RPC"라고 정리했다. 버튼의 `await createTestOrder()`가 실제로 무엇이 되는지 보면 그 말이 그대로 들어맞는다.

`"use client"` 파일이 `./actions`를 import하지만, **브라우저 번들에는 `createTestOrder`의 본문이 들어가지 않는다.** 들어가는 것은 "이 ID의 서버 함수를 부르는 스텁"뿐이다. 그래서 `DEMO_PASSWORD`도, 백엔드 주소도 브라우저 쪽 코드에 남지 않는다.

```
브라우저 (클라이언트 컴포넌트)        Next.js 서버 3000              백엔드 4000
 onClick
   await createTestOrder()
        │ 함수 본문이 아니라 스텁이 호출된다
        ▼
   POST /orders  ────────────────────▶ ID로 실제 함수를 찾아 실행
   (백엔드가 아니라 현재 페이지 URL)      │
   Next-Action: <빌드 때 부여된 ID>        │
   본문: 직렬화된 인자(여기선 없음)        ├── fetch /auth/login ──────▶ 200 accessToken
                                          │                       ◀────
                                          ├── fetch /orders ─────────▶ 201 {id:203,...}
                                          │   Authorization: Bearer   ◀────
                                          ▼
   ◀───────────────────────────────── 직렬화된 반환값
   order.id = 203
        ▼
   setResult("생성됨: #203 choi")
```

- 브라우저가 보내는 요청의 목적지는 백엔드가 아니라 **현재 페이지 URL(`localhost:3000/orders`)로 가는 POST**다. 어느 액션인지는 URL이 아니라 `Next-Action` 헤더의 ID로 구분한다. 8장 도전 과제에서 Network 탭에 `localhost:4000`이 전혀 안 보이는 이유가 이것이다.
- 인자와 반환값은 직렬화를 거친다. 원시값·배열·일반 객체·`Date`·`FormData` 등은 넘어가지만, 함수나 클래스 인스턴스는 넘기지 못한다. `createTestOrder`는 인자가 없고 반환값이 JSON 객체라 문제가 없다.
- 반환값까지 직렬화되므로, 서버 액션에서 백엔드 응답을 그대로 `return`하면 그 객체가 브라우저에 그대로 노출된다. 백엔드가 민감한 필드를 함께 돌려준다면 액션에서 골라 담아야 한다.

### 서버 액션은 "숨겨진" 엔드포인트지 비공개 엔드포인트가 아니다

`"use server"`는 "서버에서 실행한다"는 뜻으로 읽기 쉽지만, 더 정확히는 **"이 함수들을 외부에서 호출할 수 있는 엔드포인트로 공개한다"**는 선언이다. ID를 아는 누구든 `fetch`로 그 POST를 흉내 낼 수 있고, 그 ID는 브라우저 번들 안에 들어 있다.

그래서 서버 액션은 컨트롤러의 핸들러와 똑같이 취급해야 한다.

- 인자를 믿지 않는다. 클라이언트 컴포넌트에서 검증했든 말든, 액션 안에서 다시 검사한다.
- 권한 검사를 액션 안에서 한다. Nest의 `@UseGuards`처럼 끼워주는 장치가 없으므로, 로그인 여부 확인은 함수 본문의 첫 줄로 직접 짠다.
- `"use server"` 파일에서 export하는 함수는 전부 공개된다. 내부 전용 헬퍼는 export하지 않거나 다른 파일로 옮긴다.

```ts
// 인자를 받는 액션이라면 이런 모양이 된다(이 프로젝트에서는 만들지 않는다)
export async function createOrder(input: unknown) {
  // 브라우저가 보낸 값은 타입 선언만으로 보장되지 않는다. 런타임 검사가 필요하다
  if (typeof input !== "object" || input === null) throw new Error("잘못된 입력");
  // ... 권한 확인 후 백엔드 호출
}
```

> 이 데모의 `createTestOrder`가 인자를 하나도 받지 않는 것은 우연이 아니다. 인자를 받는 순간 위의 검증이 전부 필요해진다.

## 8. 디버깅: 로그인·연동이 실패하는 지점 좁히기

지금까지는 각 서버 안에서만 문제가 생겼다. 이 문서부터는 서버가 두 개(백엔드 4000, 프론트 3000)이고, 그 사이에 브라우저까지 끼어든다.

> "뭐가 안 되는지"보다 "어느 구간이 막혔는지"부터 좁히는 게 우선이다.

### 8.1 4단계로 나눠서 좁힌다.

문제가 생기면 항상 이 순서로 확인한다.

1. 백엔드가 떴는가: `curl localhost:4000/orders/totals`가 응답하는가? 안 되면 CORS도, 프론트도 아니고 백엔드 자체가 안 떠 있거나 죽은 것이다.
2. 로그인이 되는가: `curl -X POST localhost:4000/auth/login ...`이 `accessToken`을 주는가? 안 되면 `JWT_SECRET`/`DEMO_PASSWORD` 환경변수부터 의심한다(8.4).
3. 토큰을 붙인 요청이 되는가: 받은 토큰을 `Authorization: Bearer ...`로 붙여 `curl`했을 때 201이 오는가? curl로는 되는데 브라우저에서만 안 되면 남은 원인은 사실상 CORS나 Next.js 쪽뿐이다.
4. 브라우저에서 되는가: 여기까지 통과했는데 "테스트 주문 만들기" 버튼만 안 되면, 8.2(서버 액션 로그 위치)와 8.5(CORS)를 본다.

이렇게 curl로 백엔드 구간을 먼저 떼어놓고 확인하는 이유는, 0장에서 정리한 대로 이 시스템이 "브라우저 ↔ Next.js 서버"(RPC 모양)와 "Next.js 서버 ↔ 백엔드"(평범한 fetch) 두 구간으로 나뉘기 때문이다.

curl은 둘 중 어느 쪽도 거치지 않고 백엔드에 바로 붙어, 문제를 절반으로 줄여준다.

### 8.2 서버 액션의 에러는 브라우저 콘솔이 아니라 Next.js 서버 터미널에 찍힌다.

`createTestOrder()`는 `"use server"`가 붙은 함수다. Next.js에서 정리한 "서버 컴포넌트의 로그는 터미널에, 클라이언트 컴포넌트의 로그는 브라우저에 찍힌다"는 규칙이 서버 액션에도 그대로 적용된다.

`createTestOrder` 내부에서 `throw new Error(...)`가 나면, 그 상세 스택은 `npm run dev`를 실행 중인 프론트 터미널에 찍힌다(백엔드를 꺼 둔 채 버튼을 누르면 `⨯ [TypeError: fetch failed]`).

브라우저 쪽은 모드에 따라 다르다.

- 개발 모드: `fetch failed` 같은 메시지가 그대로 넘어온다.
- 프로덕션 빌드(`npm run build && npm run start`): 서버의 내부 정보가 새지 않도록 메시지가 가려져 `Minified React error #441; visit https://react.dev/errors/441 ...` 같은 일반 문구만 온다.

> "버튼을 눌렀는데 아무 반응이 없다"고 브라우저 콘솔만 들여다보다가 놓치기 쉬운 지점이다. 반드시 프론트 서버 터미널도 같이 본다.

### 8.3 JWT 페이로드를 검증 없이 직접 까보기

토큰이 이상해 보이면, 서버를 거치지 않고 페이로드만 눈으로 먼저 확인할 수 있다. 0장에서 정리한 대로 JWT의 payload는 암호화가 아니라 base64 인코딩일 뿐이다.

```sh
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJraW0iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMH0.xxxxx"
# split(".")[1]: 가운데 조각(payload). "base64url": JWT가 쓰는 URL용 base64(+ / 대신 - _, 끝의 = 생략)
node -e 'console.log(Buffer.from(process.argv[1].split(".")[1], "base64url").toString())' "$TOKEN"
# {"sub":"kim","iat":1700000000,"exp":1700003600}
```

`echo "$TOKEN" | cut -d. -f2 | base64 -d`를 쓰는 예제도 흔하다. 하지만 JWT는 끝의 `=` 패딩을 생략한 base64url이라 길이에 따라 마지막 몇 글자가 잘리거나 에러가 난다(`{"sub":"kim",...,"exp":179079399`처럼 닫는 괄호가 없는 결과가 나온다).

> 정확히 보려면 base64url을 아는 도구를 쓴다.

`sub`(로그인한 사용자)와 `exp`(만료 시각, UNIX 타임스탬프)가 기대한 값인지 여기서 바로 확인할 수 있다.

**서명(`.signature`, 세 번째 부분) 검증은 하지 않은 것이므로, 이 방법으로 "토큰 내용이 조작됐는지"는 알 수 없다.** 오직 서버(`JwtStrategy`)만 비밀키로 그걸 확인할 수 있다.

만료 시각이 지났는데도 요청이 401이 아니라면, 반대로 서버가 `secretOrKey`를 제대로 못 읽고 있다는 신호일 수 있다.

### 8.4 환경변수가 실제로 읽혔는지 부팅 로그로 확인하기

2단계에서 본 `if (!secret) throw new Error("JWT_SECRET 환경변수가 없습니다.")`는 `.env`가 안 읽혔을 때 조용히 이상한 토큰을 만드는 대신 부팅 자체를 막는 안전장치다. 그런데 `DEMO_PASSWORD`나 `FRONTEND_URL`처럼 `throw`로 지키지 않은 값은 조용히 `undefined`가 될 수 있다.

```ts
// main.ts에 bootstrap() 진입 직후 잠깐 추가(확인 후 지운다)
console.log("[ENV 확인]", {
  JWT_SECRET: process.env.JWT_SECRET ? "설정됨" : "없음",
  DEMO_PASSWORD: process.env.DEMO_PASSWORD ? "설정됨" : "없음",
  FRONTEND_URL: process.env.FRONTEND_URL,
});
```

C 프로그램이 시작할 때 `getenv("JWT_SECRET")`이 `NULL`인지 먼저 찍어보고 설정 파일 로딩을 의심하는 것과 같은 습관이다. 흔한 원인은 다음과 같다.

- `.env` 파일 자체의 오타(`JWT_SECRET=` 뒤에 공백, 따옴표 포함 등)
- 실행 스크립트에서 `--env-file .env`가 빠진 경우(1장)
- `.env`가 아닌 다른 폴더에서 서버를 실행한 경우

### 8.5 CORS 에러는 브라우저 콘솔에서만 보이고, 응답 자체는 도착해 있다.

CORS로 막히면 브라우저 콘솔(F12)에 `Access to fetch at 'http://localhost:4000/...' from origin 'http://localhost:3000' has been blocked by CORS policy`류의 메시지가 뜬다.

헷갈리기 쉬운 점은 **브라우저 Network 탭을 보면 응답이 실제로 200으로 와 있는 경우가 많다**는 것이다. 서버는 정상 응답했지만, 브라우저가 CORS 헤더(`Access-Control-Allow-Origin`)가 없거나 오리진이 안 맞는다는 이유로 그 응답을 JS 코드에 넘겨주지 않고 자기가 막은 것이다.

> 5단계에서 정리한 대로 curl에는 이 규칙이 아예 적용되지 않는다. "curl로는 되는데 브라우저에서만 CORS 에러가 난다"는 상황 자체가 정상이고, 원인은 `enableCors`의 `origin` 설정을 의심하면 된다.

### 시험해보기

```sh
curl -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"id":"kim","password":"1234"}'
```

받은 `accessToken`을 8.3의 방법으로 직접 디코딩해서 `sub`가 `"kim"`인지, `exp - iat`가 3600(1시간)인지 확인한다.

브라우저에서 CORS 헤더를 직접 보고 싶다면 브라우저의 사전 요청(preflight)을 흉내 낸다.

```sh
curl -i -X OPTIONS localhost:4000/orders -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST'
```

응답 헤더에 `Access-Control-Allow-Origin: http://localhost:3000`이 보인다.

### 도전 과제

#### 1. `DEMO_PASSWORD` 빼고 로그인하기

**백엔드** `order-api-nest/.env`의 `DEMO_PASSWORD` 줄을 잠깐 지우고 백엔드를 재시작한 뒤, `password`를 제대로 담아 `/auth/login`을 호출한다. 8.4의 로그로 원인을 확인하고 되돌린다.

어떤 에러가 나는가?

**답**

비밀번호 `"1234"`가 `undefined`와 비교되므로 로그인은 항상 401로 실패한다. 8.4의 로그에는 `DEMO_PASSWORD: "없음"`이 찍힌다.

프론트 `order-console-next/.env.local`에서 같은 줄을 지우면 상태 코드가 달라진다. 이때는 `password`가 아예 바디에서 빠져 `ValidationPipe`가 먼저 막으므로 401이 아니라 **400**이다. 즉 400이면 "보낸 쪽이 값을 안 담았다", 401이면 "담았지만 틀렸다"로 읽으면 된다.

#### 2. Network 탭으로 두 단계 통신 확인하기

브라우저에서 `/orders`를 열고 개발자 도구 Network 탭을 켠 채로 "테스트 주문 만들기"를 눌러본다.

`localhost:4000`(백엔드)으로 나가는 요청이 보이는가?

**답**

전혀 보이지 않는다. 로그인·주문 생성 `fetch`는 전부 Next.js 서버 안에서 일어나고, 브라우저에는 서버 액션 자체를 호출하는 `localhost:3000`행 요청 하나만 보인다.

> 이게 0장에서 정리한 "두 단계 통신"의 실제 모습이다.

## 9. 완성 확인

```sh
# 터미널 3
# -s: 진행 표시줄을 숨긴다
curl -v -s -X POST localhost:4000/orders -H 'Content-Type: application/json' \
  -d '{"user":"choi","price":9000,"paid":true}'
# {"message":"Unauthorized","statusCode":401}%

curl -v -s -X POST localhost:4000/auth/login -H 'Content-Type: application/json' \
  -d '{"id":"kim","password":"1234"}'
# 200, accessToken (4단계의 @HttpCode(200))

curl -v -s -X POST localhost:4000/orders -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJ...' -d '{"user":"choi","price":9000,"paid":true}'
# 201, {"id":203,"user":"choi","price":9000,"paid":true}
```

브라우저에서 `/orders`의 "테스트 주문 만들기"도 확인한다.

### 일부러 깨뜨려보기

아래를 하나씩 실험하고 되돌린다.

#### 1. 만료시간 제거

`JwtModule.register`의 `signOptions: { expiresIn: "1h" }`를 지운다.

토큰이 영원히 유효해진다. 탈취당하면 무효화할 방법이 없다는 뜻이다.

#### 2. CORS를 `*`로

`enableCors({ origin: "*" })`로 바꾼다.

아무 오리진에서나 이 API를 부를 수 있게 된다. 정적 HTML 파일 하나를 `file://`로 열어 `fetch` 코드를 넣고 확인해도 된다.

#### 3. `.env`를 안 읽고 실행

`npm run build` 후 `node dist/main.js`처럼 `--env-file` 없이 백엔드를 켠다(또는 `.env`의 `JWT_SECRET` 줄을 지우고 재시작한다).

`JwtStrategy`의 생성자에 있는 `if (!secret) throw ...`가 부팅 자체를 막는다(`ERROR [ExceptionHandler] Error: JWT_SECRET 환경변수가 없습니다.`). 환경변수를 빠뜨렸을 때 "조용히 이상하게 동작"하는 대신 "바로 안 뜬다"가 되도록 짠 것이다.

> 배포 로그에 바로 보이는 실패와, 한참 뒤 요청 처리 중 터지는 실패 중 어느 쪽이 나은지 비교해본다.

### 체크리스트

- [ ] 토큰 없이 `POST /orders`를 호출하면 401이 온다
- [ ] 로그인으로 받은 토큰을 붙이면 201로 주문이 생성된다
- [ ] `/orders`의 버튼에서 로그인 → 생성이 이어져 성공한다
- [ ] 3개의 실험을 각각 재현하고 원복했다

## 10. 자가 점검

1. 인증과 인가의 차이는? Guard는 요청 흐름의 어느 지점에 끼어드는가?

2. JWT를 세션 대신 쓰면 서버가 "기억하지 않아도 되는" 것은 무엇인가? 대신 무엇을 잃는가?

3. 지금까지의 curl 테스트는 왜 CORS 에러가 안 났는가? 서버 액션이 CORS를 거치지 않는 이유는?

4. `@UseGuards`를 빼먹으면 왜 컴파일도 실행도 에러 없이 조용히 뚫리는가? 데코레이터가 실행되는 시점과 Guard가 실행되는 시점은 각각 언제인가?

5. Strategy와 Guard는 각각 어느 라이브러리의 개념인가? `AuthGuard("jwt")`의 `"jwt"`라는 이름은 어디서 생겨서 어디서 쓰이는가?

6. `enableCors`의 `origin`을 좁게 설정해도 curl 요청은 왜 그대로 통과하는가? 그러면 API를 실제로 보호하는 것은 무엇인가?

7. 서버 액션을 호출하면 브라우저는 어느 주소로, 무엇을 담아 요청을 보내는가? 그 함수 안에서 인자 검증과 권한 확인을 직접 해야 하는 이유는?

8. `@Injectable()`이 남기는 메모 두 개는 각각 무엇인가? 생성자에 주입받을 것이 있는 클래스에서 그것을 빼먹으면 왜 부팅이 성공하는가?

5. 서버 액션 안에서 `process.env.DEMO_PASSWORD`를 읽을 때 `NEXT_PUBLIC_` 접두사가 필요 없는 이유는?