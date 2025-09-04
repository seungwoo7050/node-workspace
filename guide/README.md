# NestJS Gateway: 로그인한 사용자에게 실시간 알림 보내기

## 목표

`04-integration-and-auth` 브랜치에 주문이 생성되면 **그 주문을 만든 사용자에게만** 실시간으로 알려주는 기능을 더한다. 구조는 NestJS의 `@WebSocketGateway` + socket.io다.

```sh
node scratch-client.mjs
# 연결됨

# 다른 터미널에서 로그인 → 주문 생성
# -X: 요청 메서드, -H: 요청 헤더, -d: 요청 본문.
curl -X POST localhost:4000/orders -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJ..." -d '{"user":"choi","price":9000,"paid":true}'

# scratch-client.mjs 터미널에 즉시 찍힌다
# 알림: { id: 203, user: 'choi', price: 9000, paid: true }
```

이 프로젝트는 `04-integration-and-auth` 브랜치가 완료된 상태에서 시작한다(`order-api-nest`에 로그인(JWT)이 붙어 있고, `.env`의 `PORT=4000`으로 `http://localhost:4000`에서 돌고 있다).

> 게이트웨이도 같은 4000 포트를 함께 쓴다.

## 0. WebSocket에 대한 사전지식

지금까지의 통신은 전부 요청 하나에 응답 하나로 끝나는 HTTP였으며 서버가 먼저 클라이언트에게 말을 거는 경우는 없었다.

WebSocket은 이 모델 자체가 다르다.

### 1. 연결 하나로 양방향, 끊기 전까지 계속 열려 있다.

C로 TCP 서버를 짜봤다면(`socket()` → `bind()` → `listen()` → `accept()` 후 그 연결된 fd로 `read`/`write`를 반복하는 구조) WebSocket이 하는 일이 사실 그것과 거의 같다는 걸 바로 알아챌 수 있다.

HTTP는 매 요청마다 연결을 새로 맺고(또는 keep-alive로 재사용은 하되) "요청 → 응답 → 끝"의 형태를 반복한다. 반면 **WebSocket은 한 번 연결(핸드셰이크)하면 그 소켓을 계속 열어두고, 서버든 클라이언트든 아무 때나 먼저 데이터를 보낼 수 있다.**

```c
// C: accept 이후 연결된 fd 하나로 서버가 먼저 데이터를 보낼 수 있다. WebSocket과 같은 모양이다
int client_fd = accept(server_fd, NULL, NULL);
while (1) {
    if (order_created) {
        write(client_fd, notify_payload, len); // 클라이언트가 요청한 적 없어도 서버가 먼저 쓸 수 있다
    }
}
```

실제로 WebSocket은 처음 연결될 때 HTTP 요청(`Upgrade: websocket` 헤더)으로 시작한다.

서버가 이를 받아들이면 그 TCP 연결을 HTTP 모드에서 벗어나 순수 양방향 스트림으로 전환한다("핸드셰이크"라고 부르는 이유다).

이 문서의 `handleConnection`이 HTTP 라우트 핸들러와 전혀 다른 자리에서 실행되는 이유도 여기에 있다.

HTTP 요청 하나가 끝나는 시점이 아니라 연결이 맺어지는 시점에 딱 한 번 실행되는 별도 생명주기이기 때문이다.

#### TCP, 소켓, 핸드셰이크

HTTP도 WebSocket도 스스로 선을 타지 않는다. 둘 다 **TCP** 위에 얹혀 있는 상위 프로토콜이다.

TCP는 두 지점 사이에 바이트 스트림 하나를 깔아 주는 전송 계층 프로토콜이다.

보낸 순서대로 빠짐없이 도착하는 것은 보장하지만 "어디까지가 한 메시지인가"는 알려주지 않는다.

그 경계를 정하는 규칙이 위에 얹히는 프로토콜의 몫이다(HTTP는 헤더와 빈 줄로, WebSocket은 프레임 헤더로 메시지를 끊는다).

**소켓**은 그 TCP 연결을 코드에서 붙잡는 손잡이다.

C에서 `socket()`이 돌려준 fd가 소켓이고, 이 문서의 `handleConnection(socket)`이 받는 `socket`도 "연결 하나"를 가리킨다는 점에서 같은 것이다.

- 듣기용 소켓(`listen()`을 건 fd)과 연결된 소켓(`accept()`가 돌려준 fd)은 다르다. socket.io에서 `Server`와 `Socket`이 나뉘어 있는 이유도 같다. `Server`는 전체를 관리하고 `Socket`은 연결 하나다.

- 소켓은 프로세스 메모리 안의 자원이다. 그래서 프로세스가 죽으면 연결 목록도, 뒤에 나오는 room도 함께 사라진다.

**핸드셰이크**는 본 데이터를 주고받기 전에 "이 연결을 쓸 준비가 됐는지" 서로 확인하는 사전 왕복이다.

그리고 WebSocket 연결 하나에는 핸드셰이크가 두 번 등장한다.

| 핸드셰이크 | 계층 | 하는 일 |
|---|---|---|
| TCP 3-way handshake | TCP | `SYN` → `SYN+ACK` → `ACK`로 연결을 연다. OS가 처리하므로 코드에는 보이지 않는다 |
| WebSocket 핸드셰이크 | HTTP | 이미 열린 TCP 연결 위에서 `Upgrade: websocket` 요청과 `101 Switching Protocols` 응답을 주고받아 그 연결을 양방향 모드로 바꾼다 |

`SYN`과 `ACK`는 TCP 헤더에 있는 플래그 비트의 이름이다. 보낼 데이터가 아니라 "이 패킷이 무슨 뜻인지"를 표시하는 1비트 스위치다.

- `SYN`(synchronize): "연결을 열자. 내가 보낼 바이트의 시작 번호는 이거다." 양쪽은 각자 임의의 시작 번호(ISN)를 정해 알려주고, 이후 모든 바이트에 이어지는 번호가 붙는다. 순서대로·빠짐없이를 보장하는 근거가 이 번호다.

- `ACK`(acknowledge): "네 번호까지 잘 받았다." 핸드셰이크에서만 쓰는 것이 아니라 연결이 살아 있는 동안 모든 데이터에 계속 따라붙는다. 정해진 시간 안에 `ACK`가 안 오면 보낸 쪽이 재전송한다.

그래서 세 번이 필요하다. 1번으로 클라이언트의 번호가 서버에 전달되고, 2번(`SYN`+`ACK`를 한 패킷에 합친 것)으로 서버의 번호가 전달되면서 1번을 확인해 주고, 3번으로 클라이언트가 서버의 번호를 확인해 준다.

양쪽이 서로의 시작 번호를 확인받아야 끝나므로 두 번으로는 모자라고 네 번은 필요 없다.

```
클라이언트                                 서버
    |  SYN (seq=x)                          |  ← connect() 호출 시점
    | ------------------------------------> |
    |  SYN+ACK (seq=y, ack=x+1)             |
    | <------------------------------------ |
    |  ACK (ack=y+1)                        |  ← 여기까지 끝나야 accept()가 반환한다
    | ------------------------------------> |
    | ... 이제부터 HTTP Upgrade 요청이 간다 |
```

- C의 `accept()`가 값을 돌려주는 시점은 이 3왕복이 OS 안에서 이미 끝난 뒤다. 그래서 `SYN`/`ACK`를 코드에서 직접 다루는 일이 없다.

- 닫을 때 쓰는 플래그는 `FIN`(정상 종료 요청)과 `RST`(비정상 강제 끊기)다. 뒤에 나오는 `socket.disconnect(true)`가 클라이언트에 `연결 끊김`으로 보이는 것이 이 층에서는 `FIN`이고, 서버 프로세스가 죽어 버린 경우가 `RST`다.

이 문서에서 "핸드셰이크"는 늘 아래쪽, 즉 HTTP 업그레이드를 말한다.

뒤에 나오는 `socket.handshake.auth`도 그 업그레이드 요청에 실려 온 값이다.

> TCP 연결은 그대로 유지된 채 그 위의 말하는 방식만 HTTP에서 WebSocket으로 바뀐다. 연결을 새로 맺는 것이 아니라 용도를 바꾸는 것이라 "업그레이드"라고 부른다.

### 2. socket.io의 "room"은 소켓 목록을 그룹으로 관리하는 것뿐이다.

`server.to("user:kim").emit(...)`처럼 특정 사용자에게만 보내는 기능은 마법이 아니다.

C로 채팅 서버를 짜본 적이 있다면, 클라이언트 fd들을 배열이나 연결 리스트에 넣어두고 "이 그룹에 속한 fd들만" 순회하며 `write()`하는 구조를 만들어봤을 것이다.

socket.io의 room은 정확히 그 역할을 하는 서버 메모리 안의 자료구조다.

- `socket.join("user:kim")`: 그 소켓을 `"user:kim"`이라는 키의 목록에 추가한다.

- `server.to("user:kim").emit(...)`: 그 목록에 있는 소켓들만 순회하며 데이터를 보낸다.

DB나 별도 서버가 아니라 **지금 떠 있는 이 프로세스의 메모리에만 있는 목록**이라는 점이 중요하다.

> 서버 인스턴스가 여러 개면 room도 인스턴스마다 따로 논다.

## 1. 준비

```sh
cd order-api-nest
# @nestjs/websockets, @nestjs/platform-socket.io: Nest에서 WebSocket 게이트웨이를 쓰기 위한 패키지(socket.io는 실시간 양방향 통신 라이브러리 본체다).
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
# jsonwebtoken: 연결 시점에 토큰을 직접 검증할 때 쓴다(@nestjs/jwt가 내부에서 쓰는 라이브러리지만 직접 import하려면 직접 설치한다).
npm install jsonwebtoken
# socket.io-client는 테스트용 클라이언트로만 쓰는 개발 의존성이다. 
# @types/jsonwebtoken은 jsonwebtoken의 TS 타입 정의다.
npm install -D socket.io-client @types/jsonwebtoken
```

## 2. 1단계: 최소 게이트웨이

`src/notifications/notifications.gateway.ts`

```ts
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

@WebSocketGateway({ cors: true })
export class NotificationsGateway {
  @WebSocketServer() server!: Server; // socket.io 서버 인스턴스. Nest가 부팅 시 채워준다

  handleConnection(socket: Socket) {
    console.log("연결됨:", socket.id);
  }
}
```

`src/notifications/notifications.module.ts`

```ts
import { Module } from "@nestjs/common";
import { NotificationsGateway } from "./notifications.gateway.js";

@Module({ providers: [NotificationsGateway], exports: [NotificationsGateway] })
export class NotificationsModule {}
```

`app.module.ts`의 `imports`에 `NotificationsModule`을 추가한다.

`@WebSocketGateway()`는 `@Injectable()`처럼 데코레이터가 붙은 클래스라, NestJS에서 본 DI 원리가 그대로 적용된다.

다른 점은 생성자 대신 `handleConnection`/`handleDisconnect` 같은 연결 생명주기 메서드를 Nest가 인식해서 호출해준다는 것이다.

### NestJS 모듈

- `@Module(옵션)`: 클래스를 모듈로 등록하는 데코레이터다. 묶는 목적은 분류가 아니라 **주입할 후보를 찾을 목록을 만드는 것**이다.

#### 왜 묶는가

4단계에서 쓸 `OrdersService`의 생성자는 이렇게 생겼다.

```ts
constructor(private readonly notifications: NotificationsGateway) {}
```

적혀 있는 것은 타입 이름뿐이다. Nest는 "그래서 어느 인스턴스를 넣어야 하는가"를 어딘가에서 찾아야 하고, 그 찾는 범위가 모듈이다.

- 찾는 순서는 자기 모듈의 `providers` → 자기 모듈이 `imports`한 모듈들의 `exports`다. 거기에 없으면 부팅이 실패한다.

- 그래서 묶음은 보기 좋게 모아둔 폴더가 아니라 조회 목록 그 자체다. `providers`에 이름을 적는 행위가 곧 "이 타입으로 찾으면 이걸 주겠다"는 등록이다.

- 등록된 provider는 그 목록 안에서 인스턴스 하나로 만들어져 공유된다. `OrdersService`가 주입받는 게이트웨이가 연결을 들고 있는 바로 그 인스턴스인 이유다(새로 만들어 주는 게 아니다).

전부 전역에 두면 이 목록이 필요 없다. 대신 잃는 것이 있다.

| 모듈로 범위를 끊어서 얻는 것 | 전역이면 |
|---|---|
| 의존 관계가 코드에 드러난다(`OrdersModule`이 `NotificationsModule`을 `imports`한다고 적혀 있다) | 누가 누구를 쓰는지 생성자를 전부 뒤져야 안다 |
| 공개 범위를 고를 수 있다(`exports`에 적지 않은 provider는 밖에서 못 쓴다) | 모듈 내부용으로 둔 클래스까지 아무 데서나 주입된다 |
| 같은 타입을 다른 구현으로 갈아 끼울 수 있다 | 후보가 전역에 하나뿐이라 테스트나 환경별 교체가 어렵다 |

> 묶는 이유는 "관련된 것을 모아두면 보기 좋다"가 아니라 주입 후보를 찾는 범위를 좁히고 그 경계를 코드에 적어두는 것이다.

#### `@Module`의 네 칸

모듈 클래스의 본문은 보통 비어 있다(`export class NotificationsModule {}`). 내용은 전부 데코레이터에 넘기는 객체에 있다.

| 키 | 넣는 것 | 뜻 |
|---|---|---|
| `providers` | 주입될 클래스(서비스, 게이트웨이 등) | Nest가 인스턴스를 만들어 들고 있는다. **이 모듈 안에서만** 주입할 수 있다 |
| `exports` | `providers`에 든 것 중 일부 | 이 모듈을 `imports`한 다른 모듈에게 공개한다 |
| `imports` | 다른 모듈 | 그 모듈이 `exports`한 것을 이 모듈 안에서 주입받을 수 있게 된다 |
| `controllers` | 컨트롤러 클래스 | 그 컨트롤러의 라우트를 등록한다(게이트웨이는 여기가 아니라 `providers`에 둔다) |

`NotificationsModule`이 `providers`와 `exports`에 게이트웨이를 둘 다 적은 이유가 이것이다.

`providers`만 적으면 자기 모듈 안에서만 쓸 수 있어서, 4단계에서 `OrdersService`가 주입받지 못한다.

- 모듈은 트리를 이룬다. 루트인 `AppModule`이 `imports`로 기능 모듈들을 모으고, 그 모듈이 또 다른 모듈을 `imports`한다. `app.module.ts`에 `NotificationsModule`을 추가하는 것이 이 트리에 끼워 넣는 일이다.

- `exports`는 공개 목록일 뿐이다. 공개한 쪽과 받는 쪽 중 한쪽만 적어도 부팅 때 의존성을 못 찾는다(4단계에서 실제로 마주친다).

- 범위가 모듈 단위라서, 어디서나 쓰이는 provider를 매번 `imports`하지 않으려면 `@Global()`을 쓰는 방법이 있다. 이 문서는 쓰지 않는다.

### NestJS 게이트웨이

- `@WebSocketGateway(옵션)`: 클래스를 WebSocket 서버(게이트웨이)로 등록하는 데코레이터다. `{ cors: true }`는 다른 출처(예: `localhost:3000`의 웹 페이지)에서 오는 연결도 허용한다.

- `@WebSocketServer()`: socket.io 서버 인스턴스를 그 필드에 넣어 주는 데코레이터다.

- `handleConnection(socket)`: 클라이언트가 연결될 때마다 Nest가 자동으로 호출하는 메서드다. 이름이 정해져 있다.

#### "게이트웨이"는 이 자리를 부르는 Nest의 이름이다

HTTP 요청을 받는 자리는 컨트롤러였다. WebSocket 연결을 받는 자리가 게이트웨이다.

| | HTTP | WebSocket |
|---|---|---|
| 바깥을 받는 클래스 | 컨트롤러 | 게이트웨이 |
| 등록 데코레이터 | `@Controller()` | `@WebSocketGateway()` |
| 입구 하나하나 | `@Get()`, `@Post()` | `handleConnection` 등 생명주기 메서드 |
| 들어올 때 거치는 검사 | Guard | 직접 짠 검증(3단계에서 만든다) |

- 하는 일은 컨트롤러와 같다. 바깥에서 온 것을 받아 서비스에 넘기고 결과를 돌려준다. 다른 점은 입구가 URL과 메서드가 아니라 연결 생명주기로 나뉜다는 것이다.

- 같은 단어가 다른 층에서 쓰인다. 아래 셋은 이름만 같고 서로 다른 것이다. 구분만 해두면 된다.

| 무엇 | 어디에 있나 | 하는 일 |
|---|---|---|
| 네트워크 게이트웨이 | 라우터 등 장비(`ip route`의 기본 게이트웨이) | 서로 다른 망을 잇는 중계 지점. 내 망 밖으로 나가는 패킷이 거쳐 가는 출구다 |
| API 게이트웨이 | 여러 서비스 앞에 따로 띄우는 별도 서버(nginx, Kong 등) | 단일 입구. 들어온 요청을 뒤쪽 서비스로 라우팅하고 인증·레이트리밋 같은 공통 처리를 모아서 한다 |
| Nest 게이트웨이 | 내 앱 안의 클래스 하나 | WebSocket 연결을 받는다. 이 문서가 말하는 게이트웨이는 늘 이것이다 |

> 앞의 둘은 "트래픽이 거쳐 가는 중간 지점"이고, Nest 게이트웨이는 거쳐 가는 곳이 아니라 **도착지**다. 중계하지 않고 자기가 처리한다.

- 이 문서는 쓰지 않지만 클라이언트가 보낸 이벤트를 받는 `@SubscribeMessage()` 핸들러도 게이트웨이에 둔다.

> 게이트웨이는 별도 포트를 열지 않는다. socket.io가 Nest의 HTTP 서버에 올라타기 때문에 컨트롤러와 같은 4000 포트를 함께 쓴다.

#### `@WebSocketServer()` 필드는 생성자에서 아직 비어 있다

`server!: Server`의 `!`는 "이 필드는 생성자에서 값을 넣지 않지만 나중에 반드시 채워진다"고 컴파일러에게 약속하는 표기다. 

실제로 채우는 쪽은 Nest이며 Nest는 먼저 `new NotificationsGateway()`로 인스턴스를 만들고, 그다음 socket.io 서버를 띄워 `@WebSocketServer()`가 붙은 필드에 넣는다.

```ts
@WebSocketGateway({ cors: true })
export class NotificationsGateway {
  @WebSocketServer() server!: Server;

  constructor() {
    console.log(this.server); // 출력: undefined (아직 Nest가 넣기 전이다)
  }

  handleConnection(socket: Socket) {
    console.log(this.server.sockets.sockets.size); // 여기서는 채워져 있다
  }
}
```

- 연결이 들어오는 시점(`handleConnection`)이나 다른 서비스가 호출하는 시점에는 앱이 이미 떠 있으므로 `server`가 채워져 있다.

- 생성자에서 `this.server.on(...)` 같은 걸 하면 `Cannot read properties of undefined`로 부팅이 실패한다. 서버가 준비된 직후에 할 일이 있다면 Nest가 제공하는 `afterInit(server)` 생명주기 메서드에 둔다.

> `!`는 검사를 끄는 표기일 뿐 값을 만들어 주지 않는다. "누가, 언제 채우는가"를 알고 써야 한다.

### socket.io API

- `Server` / `Socket`: `Server`는 socket.io 서버, `Socket`은 클라이언트 한 명과의 연결이다.

- `socket.id`: 연결마다 자동으로 붙는 고유 id다.

### 연결 확인

`scratch-client.mjs`는 `order-api-nest` 폴더 바로 아래(`package.json` 옆)에 만든다. 그래야 방금 설치한 `socket.io-client`를 찾는다.

```js
// scratch-client.mjs
import { io } from "socket.io-client";

const socket = io("http://localhost:4000"); // 게이트웨이는 HTTP 서버와 같은 포트(4000)를 쓴다
socket.on("connect", () => console.log("연결됨"));
```

```sh
npm run start:dev # 터미널 1
node scratch-client.mjs # 터미널 2: "연결됨"이 양쪽 콘솔에 찍힌다(서버 쪽은 "연결됨: <socket.id>")
```

클라이언트는 연결을 유지한 채 끝나지 않는다. 확인했으면 `Ctrl+C`로 끈다.

#### 확장자를 `.mjs`로 둔 이유

`.mjs`는 "이 파일은 ES 모듈"이라는 뜻의 확장자다. Node는 확장자를 먼저 보고, `.js`일 때만 같은 폴더의 `package.json`의 `"type"`을 찾아본다.

| 확장자 | Node가 보는 방식 |
|---|---|
| `.mjs` | 항상 ES 모듈(`import`/`export`, 최상위 `await`) |
| `.cjs` | 항상 CommonJS(`require`) |
| `.js` | `package.json`의 `"type"`에 따라 갈린다(`"module"`이면 ESM, 없거나 `"commonjs"`면 CJS) |

`order-api-nest`의 `package.json`에는 `"type": "module"`이 있어서 이 프로젝트에서는 `.js`로 써도 똑같이 동작한다.

그래도 `.mjs`로 두는 이유는 두 가지다.

- `package.json`을 안 보고도 판단이 끝난다. 
  
  - 이후 이 파일 맨 위에 `await fetch(...)`를 쓰는데(최상위 `await`는 ESM에서만 된다), `"type"` 설정에 걸려 `Cannot use import statement outside a module`이 날 여지가 없다(다른 프로젝트에 그대로 복사해도 돈다).

- 빌드 대상과 구분된다. `src/`의 `.ts`는 tsc가 컴파일하는 소스이고, 이 파일은 컴파일 없이 `node`가 바로 실행하는 일회용 확인 스크립트다. 확장자가 달라서 섞이지 않는다.

> `scratch-`라는 접두사와 같은 역할이다. 빌드에 들어가지 않고 언제든 지워도 되는 파일임을 이름으로 드러낸다.

### socket.io-client API

- `io(주소)`: 서버에 WebSocket 연결을 시도하고 소켓을 돌려준다.

- `socket.on(이벤트 이름, 콜백)`: 해당 이벤트가 오면 콜백을 실행한다. `"connect"`는 연결이 성공했을 때 발생한다.

## 3. 2단계: 인증 없이 열려 있다는 함정

지금 상태를 그대로 두고 생각해보자. `04-integration-and-auth`에서 `POST /orders`는 `@UseGuards(AuthGuard("jwt"))`로 막아뒀다.

그런데 방금 `scratch-client.mjs`는 **토큰을 하나도 안 보냈는데 연결에 성공했다.**

`AuthGuard`는 HTTP 라우트를 통과할 때만 실행된다. 

WebSocket 연결은 `POST`/`GET` 같은 HTTP 요청이 아닌 별도의 핸드셰이크 과정이라서 HTTP 파이프라인에 걸어둔 Guard가 관여하지 않는다.

즉 지금 이 게이트웨이는 로그인 여부와 무관하게 아무나 연결하고 들을 수 있는 상태다.

> NestJS를 통해 학습한 "데코레이터를 빼먹으면 조용히 안 걸린다"는 성질보다 한 단계 더 근본적인 함정이다. 애초에 걸어둘 자리가 다르다.

## 4. 3단계: 연결 시점에 직접 검증하기

HTTP의 Guard에 대응하는 것을 WebSocket에서는 `handleConnection` 안에서 직접 짠다.

로그인 토큰을 만들 때 쓴 것과 같은 `JWT_SECRET`으로 검증한다.

`src/notifications/notifications.gateway.ts`

```ts
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";

@WebSocketGateway({ cors: true })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(socket: Socket) {
    const token = socket.handshake.auth.token as string | undefined; // 클라이언트가 연결할 때 실어 보내는 값
    if (!token) { socket.disconnect(true); return; } // 토큰이 없으면 바로 끊는다
    try {
      // jwt.verify: 서명이 맞고 만료 전이면 payload(사용자 id는 sub)를 돌려주고, 아니면 에러를 던진다
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
      socket.join(`user:${payload.sub}`); // 이 소켓을 "그 사용자 전용 방"에 넣는다
    } catch {
      socket.disconnect(true); // 서명이 안 맞거나 만료됐으면 바로 끊는다
    }
  }

  // 다른 클래스(OrdersService)가 호출해서 특정 사용자에게 알림을 보내는 메서드
  notifyUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data); // 그 방에 들어있는 소켓에만 보낸다
  }
}
```

`scratch-client.mjs`:

```js
// 토큰을 실어 보내도록 수정
import { io } from "socket.io-client";

const res = await fetch("http://localhost:4000/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: "kim", password: "1234" }),
});
const { accessToken } = await res.json();

// auth에 담은 값이 서버의 socket.handshake.auth로 전달된다
const socket = io("http://localhost:4000", { auth: { token: accessToken } });
socket.on("connect", () => console.log("연결됨"));
socket.on("disconnect", () => console.log("연결 끊김"));
```

### NestJS 게이트웨이

- `OnGatewayConnection`: "연결 이벤트를 처리한다"는 인터페이스다. `implements`로 선언하면 이 클래스가 `handleConnection`을 반드시 가져야 한다.

#### `implements`: 가진 것을 검사받겠다는 선언

`implements`는 TypeScript 키워드로 "이 클래스는 저 인터페이스가 요구하는 멤버를 전부 갖고 있다"고 선언한다.

선언만으로 끝이고 컴파일러는 그 약속이 지켜졌는지만 검사한다. 빠진 멤버나 시그니처가 다른 멤버가 있으면 컴파일 에러다.

```ts
interface OnGatewayConnection { // @nestjs/websockets가 제공하는 것을 단순화한 모양
  handleConnection(socket: any): any; // "이 이름의 메서드를 가져라"
}

class A implements OnGatewayConnection {
  handleConnection(socket: Socket) {} // OK
}

class B implements OnGatewayConnection {} // error TS2420: 'handleConnection'이 없다
```

- `extends`와 다르다. `extends`는 부모 클래스의 구현을 물려받아 안 써도 쓸 수 있게 해 주고, `implements`는 아무것도 주지 않는다. 내가 직접 다 쓰되 빠뜨리면 알려달라는 쪽이다.

- 그래서 `implements`를 지워도 동작은 똑같다. 얻는 것은 오타와 누락을 컴파일 시점에 잡아주는 검사뿐이다.

- 여러 개를 쉼표로 나열할 수 있다. 연결과 해제를 둘 다 다루면 `implements OnGatewayConnection, OnGatewayDisconnect`로 쓴다.

- 인터페이스는 타입이라 JS로 컴파일되면 사라진다. 즉 실행 중에는 `implements`의 흔적이 남지 않는다.

#### 생명주기 메서드는 이름으로 찾는다

Nest는 게이트웨이 인스턴스에 `handleConnection`이라는 **이름의 함수가 있는지만 보고** 있으면 연결마다 호출한다.

인터페이스는 타입이라 컴파일하면 사라지기 때문에 인터페이스를 `implements`했는지는 보지 않는다.

그래서 `implements` 없이 써도 동작하지만, 이름을 한 글자만 틀려도 아무 경고 없이 호출되지 않는다.

```ts
@WebSocketGateway({ cors: true })
export class NotificationsGateway {
  handleConection(socket: Socket) { // n 하나가 빠졌다: 부팅도 되고 연결도 되지만 이 메서드는 불리지 않는다
    // 토큰 검증이 통째로 빠진 채로 아무나 연결된다
  }
}
```

`implements OnGatewayConnection`을 붙이면 같은 오타가 컴파일 에러가 된다.

```sh
error TS2420: Class 'NotificationsGateway' incorrectly implements interface 'OnGatewayConnection<any>'.
  Property 'handleConnection' is missing in type 'NotificationsGateway' but required in type 'OnGatewayConnection<any>'.
```

| 메서드 | 짝이 되는 인터페이스 | 불리는 때 |
|---|---|---|
| `afterInit(server)` | `OnGatewayInit` | socket.io 서버가 준비된 직후 한 번 |
| `handleConnection(socket)` | `OnGatewayConnection` | 클라이언트가 연결될 때마다 |
| `handleDisconnect(socket)` | `OnGatewayDisconnect` | 연결이 끊길 때마다 |

> 이 자리의 오타는 "검증 코드가 실행되지 않는" 보안 구멍이 된다. Guard 함정처럼 조용히 일어나므로 `implements`로 컴파일러에게 이름 검사를 맡긴다.

### socket.io API

- `socket.handshake.auth`: 클라이언트가 연결할 때 함께 보낸 인증 정보 객체다.

- `socket.disconnect(true)`: 연결을 완전히 닫는다. `true`는 그 아래 전송 연결(engine.io)까지 닫으라는 뜻이다.

- `socket.join(방 이름)`: 이 소켓을 그 room에 넣는다.

- `server.to(방 이름).emit(이벤트 이름, 데이터)`: 그 room에 들어 있는 소켓들에게만 이벤트를 보낸다.

#### `handshake.auth`: 연결할 때 한 번 싣는 인증 정보

HTTP에서는 요청마다 `Authorization: Bearer ...` 헤더를 붙였다.

WebSocket은 요청이 핸드셰이크 한 번뿐이라 인증 정보도 그때 한 번 싣는다.

socket.io에서는 클라이언트가 `io(주소, { auth: {...} })`에 담은 객체가 서버의 `socket.handshake.auth`로 그대로 온다.

```js
// 클라이언트(scratch-client.mjs)
const socket = io("http://localhost:4000", { auth: { token: accessToken } });
```

```ts
// 서버(handleConnection)
socket.handshake.auth; // { token: "eyJ..." }
socket.handshake.headers.authorization; // undefined: 헤더로 보낸 게 아니다
```

- 헤더 대신 이 자리를 쓰는 이유: 브라우저의 WebSocket API는 연결 요청에 임의의 헤더를 붙일 수 없다. socket.io는 그래서 인증 정보를 실을 `auth` 자리를 따로 둔다.

- `auth`의 타입은 `{ [key: string]: any }`라서 `as string | undefined`는 검증이 아니라 단언이다. 클라이언트가 무엇을 보냈든 통과하고, 진짜 검사는 다음 줄의 `jwt.verify`가 한다.

- 검사는 연결 시점에 한 번뿐이다. 이 코드는 연결된 뒤 토큰이 만료돼도 이미 열린 소켓을 끊지 않는다.

> HTTP의 Guard는 "요청마다" 검사하고, 게이트웨이의 `handleConnection`은 "연결마다" 검사한다. 검사 단위가 다르다.

#### `emit`은 누구에게 가는가

`emit`은 "이벤트 이름 + 데이터"를 보내는 함수이고, **어디에서 부르느냐로 받는 범위가 정해진다.**

| 호출 | 받는 쪽 |
|---|---|
| `socket.emit(이벤트, 데이터)` | 그 소켓 하나 |
| `server.emit(이벤트, 데이터)` | 연결된 모든 소켓 |
| `server.to(방).emit(이벤트, 데이터)` | 그 room에 든 소켓 전부 |
| `socket.to(방).emit(이벤트, 데이터)` | 그 room에 든 소켓 중 자기 자신을 뺀 나머지 |

이 문서는 "그 주문을 만든 사용자에게만" 보내야 하므로 ``server.to(`user:${userId}`)``를 쓴다.

`server.emit`으로 쓰면 다른 사용자의 주문 알림까지 모두에게 간다.

```ts
this.server.to("user:nobody").emit("order.created", order); // 아무도 없는 room: 에러 없이 그냥 아무에게도 안 간다
```

- room이 비어 있어도, room 이름을 틀려도 에러가 나지 않는다. room은 이름을 키로 한 목록일 뿐이라 없는 키를 순회하면 보낼 대상이 0개일 뿐이다.

- 이벤트 이름도 그냥 문자열이다. 서버가 `"order.created"`를 보내는데 클라이언트가 `socket.on("order.create", ...)`로 듣고 있으면 역시 아무 일도 일어나지 않는다.

> "알림이 안 온다"는 증상은 room이 비었거나 이벤트 이름이 어긋났거나 둘 중 하나인 경우가 많다. 둘 다 조용히 실패하므로 상태를 직접 찍어서 구분한다.

### 일부러 깨뜨려보기

`, { auth: { token: accessToken } }` 부분을 지우고(또는 `accessToken` 대신 아무 문자열이나 넣고) 다시 실행한다.

`연결됨`이 찍혔다가 곧바로 `연결 끊김`이 찍힌다. 

`disconnect` 콜백의 첫 인자를 찍어 보면 이유가 `io server disconnect`로 뜨는데 서버가 끊었다는 뜻이다.

핸드셰이크 자체는 항상 일단 성공하고(소켓이 만들어지고 `connect` 이벤트가 뜬다), `handleConnection`이 직후 검증에서 끊는 방식이라는 걸 알 수 있다.

## 5. 4단계: 주문 생성 시 알림 보내기

주문을 만든 사용자가 누구인지 컨트롤러에서 꺼내 서비스로 넘긴다.

`src/orders/orders.controller.ts`

```ts
// 기존 "@nestjs/common" import 목록에 Req를 추가하고 express의 Request 타입 import를 새로 넣는다
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
// ...
@Post()
@UseGuards(AuthGuard("jwt"))
create(@Body() dto: CreateOrderDto, @Req() req: Request) {
  // req.user: JWT 검증을 통과하면 Passport가 채워 주는 필드
  const userId = (req.user as { userId: string }).userId; // JwtStrategy.validate가 반환한 값
  return this.ordersService.create(dto, userId);
}
```

> 데코레이터가 붙은 메서드의 매개변수 타입을 일반 import로 가져오면 `isolatedModules` + `emitDecoratorMetadata` 조합에서 tsc가 에러낸다.  
> 때문에 `Request`는 `import type`으로 가져와야 한다.  
> `import type`이면 메타데이터에는 `Object`로 남는다.

`OrdersService`가 `NotificationsGateway`를 주입받아 생성 직후 호출한다.

`src/orders/orders.service.ts`

```ts
import { NotificationsGateway } from "../notifications/notifications.gateway.js";
// ...
@Injectable()
export class OrdersService {
  // ... orders 배열, nextId 필드는 그대로 ...

  constructor(private readonly notifications: NotificationsGateway) {} // Nest가 게이트웨이 인스턴스를 주입해 준다
  // ...
  // creatorId: 주문을 만든 사용자의 id
  create(input: Omit<Order, "id">, creatorId: string): Order {
    const order: Order = { id: this.nextId++, ...input };
    this.orders.push(order);
    // 주문을 만든 사용자의 방에 "order.created" 이벤트와 주문 데이터를 보낸다
    this.notifications.notifyUser(creatorId, "order.created", order);
    return order;
  }
}
```

`OrdersModule`이 `NotificationsGateway`를 쓸 수 있으려면 `NotificationsModule`을 `imports`해야 한다.

NestJS 학습 때 본 `exports` 원리가 모듈을 하나 건너서 그대로 적용된다(`NotificationsModule`이 `exports`로 공개하고, `OrdersModule`이 `imports`로 받는다).

> 둘 중 하나라도 빠지면 부팅 때 `Nest can't resolve dependencies of the OrdersService (?)` 에러가 난다.

```ts
// src/orders/orders.module.ts
import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [NotificationsModule], // NotificationsModule이 exports한 NotificationsGateway를 주입받을 수 있게 된다
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
```

먼저 `scratch-client.mjs` 맨 아래에 `order.created` 리스너를 추가한다.

```js
// scratch-client.mjs
// 서버가 "order.created"를 보내면 받은 주문을 찍는다
socket.on("order.created", (o) => console.log("알림:", o));
```

```sh
node scratch-client.mjs # 터미널 1: 로그인 후 연결, "연결됨"

# 터미널 2: 로그인해서 accessToken을 받는다
curl -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"id":"kim","password":"1234"}'

# 받은 토큰을 Authorization 헤더에 붙여 주문을 만든다
curl -X POST localhost:4000/orders -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJ...' -d '{"user":"choi","price":9000,"paid":true}'
```

터미널 1에 즉시 `알림: { id: 203, user: 'choi', price: 9000, paid: true }`가 찍힌다.

### NestJS 데코레이터

- `@Req()`: 요청 객체(`req`) 전체를 매개변수로 받는다.

## 6. 5단계: 연결과 room 상태를 눈으로 확인하며 디버깅하기

WebSocket 디버깅이 HTTP와 다른 이유는 단순하다.

curl 한 번으로 끝나는 요청이 아니라, **연결 상태가 시간에 걸쳐 이어진다.**

"지금 몇 명이 붙어 있는가", "이 소켓이 어느 room에 들어있는가" 같은 질문에 답하려면 그 순간의 상태를 들여다봐야 한다.

### 6.1 연결 실패의 두 가지 모양부터 구분한다.

WebSocket 연결 문제는 항상 둘 중 하나다.

1. 핸드셰이크 자체가 안 됨: `socket.on("connect", ...)`가 아예 안 불린다. 서버가 안 떠 있거나 CORS(`@WebSocketGateway({ cors: true })` 설정), 포트가 틀렸을 때다.

2. 핸드셰이크는 되는데 곧바로 끊김: `connect`가 찍힌 직후 `disconnect`가 찍힌다. `handleConnection` 내부 검증(토큰 등)에서 거부된 것이다.

> `socket.on("connect_error", (err) => console.log(err.message))`를 클라이언트에 추가해두면 1번 케이스의 원인(대부분 `xhr poll error`나 CORS 메시지)이 바로 보인다.

### 6.2 socket.io 내장 디버그 로그 켜기

express의 `DEBUG=router`와 같은 방식으로 socket.io도 환경변수 하나로 내부 동작을 들여다볼 수 있다.

socket.io는 두 층으로 되어 있어서 네임스페이스도 둘이다.

- `socket.io:*`: room·연결 관리를 찍는다.

- `engine:*`: 그 아래 전송 계층(engine.io)으로, 실제로 선을 타고 나가는 패킷을 찍는다.

```sh
DEBUG=socket.io:*,engine:socket npm run start:dev
```

클라이언트가 연결해서 room에 들어가고, 주문 생성으로 알림이 나가는 순간 이런 줄이 찍힌다.

```sh
socket.io:socket join room user:kim
engine:socket sending packet "message" (2["order.created",{"id":203,"user":"choi","price":9000,"paid":true}])
```

`socket.io:*`만 켜면 `join room`까지는 보이지만 **서버가 보내는 이벤트는 안 보인다.**

`server.to(...).emit(...)`은 socket.io 층에서 따로 로그를 남기지 않기 때문이다.

두 네임스페이스를 함께 켜면 원하는 room에 소켓이 실제로 들어갔는지, 어떤 이벤트가 언제 전송됐는지를 코드 수정 없이 확인할 수 있다.

### 6.3 지금 연결된 소켓과 room 목록을 서버에서 직접 조회하기

`this.server`(socket.io 서버 인스턴스)는 현재 연결 상태를 메모리에 들고 있으므로 디버깅용 메서드를 잠깐 추가해 그 자리에서 들여다볼 수 있다.

```ts
// notifications.gateway.ts
// 디버깅 동안만 추가
debugState() {
  console.log("연결된 소켓 수:", this.server.sockets.sockets.size);
  console.log("user:kim room의 소켓:", this.server.sockets.adapter.rooms.get("user:kim")?.size ?? 0);
}
```

`handleConnection`이나 `notifyUser` 앞뒤에 `this.debugState()`를 잠깐 호출해본다.

"알림이 아무한테도 안 갔다"는 문제가 room에 아무도 없어서인지, 아니면 이벤트 이름(`order.created`)이 클라이언트 리스너와 안 맞아서인지 바로 갈린다.

#### socket.io API

- `server.sockets.sockets`: 지금 연결된 소켓들의 Map이다. `.size`가 연결 수다.

- `server.sockets.adapter.rooms`: room 이름을 키로, 그 room의 소켓 id 집합(Set)을 값으로 갖는 Map이다. 직접 만든 적 없는 room도 들어 있다.

##### `adapter.rooms`에는 소켓 id 이름의 room도 있다

room은 "이름을 키로 한 소켓 목록"이라고 했는데 `adapter.rooms`가 바로 그 목록이다.

그런데 `kim` 하나만 연결한 상태에서 Map 전체를 찍어 보면 room이 하나가 아니라 둘이다.

```ts
console.log(this.server.sockets.adapter.rooms); // 소켓 id는 연결마다 다르다
// Map(2) {
//   'nAA4n_GYnGUqOvk7AAAA' => Set(1) { 'nAA4n_GYnGUqOvk7AAAA' },
//   'user:kim' => Set(1) { 'nAA4n_GYnGUqOvk7AAAA' }
// }
```

socket.io는 소켓이 연결되면 **그 소켓의 id와 같은 이름의 room에 자동으로 넣는다.**

그래서 `server.to(socket.id).emit(...)`으로 소켓 하나에만 보낼 수 있다.

위의 첫 줄이 그 room이고, 두 번째 줄이 `handleConnection`에서 `join`한 room이다.

| 확인하려는 것 | 쓰는 값 |
|---|---|
| 지금 연결된 소켓 수 | `server.sockets.sockets.size` |
| 특정 room에 든 소켓 수 | `server.sockets.adapter.rooms.get(방 이름)?.size ?? 0` |
| 이 소켓이 든 room 목록 | `socket.rooms`(자기 id room 포함) |

- `adapter.rooms.size`는 "room 개수"가 아니라 "소켓 id room + 직접 만든 room"의 합이다. 연결 수나 사용자 수로 읽으면 틀린다.

- 없는 room을 `get`하면 `undefined`다. `debugState`에서 `?.size ?? 0`을 붙인 이유다.

- room에 든 소켓이 모두 끊기면 그 room 항목도 Map에서 사라진다.

> 그래서 `debugState`는 Map 전체가 아니라 `get("user:kim")`으로 관심 있는 room 하나만 집어서 본다.

### 6.4 브라우저에서는 Network 탭의 WS 프레임을 직접 읽는다.

`scratch-client.mjs`(Node) 대신 브라우저에서 붙는 클라이언트를 디버깅할 때는 개발자 도구 Network 탭에서 프로토콜이 `websocket`인 연결을 클릭하면 Messages(또는 Frames) 탭에서 오간 데이터를 실시간으로 볼 수 있다.

`curl -i`로 HTTP 응답 헤더를 까보던 것의 WebSocket 버전이라고 생각하면 된다.

요청 자체가 아니라, 연결이 유지되는 동안 오가는 각 프레임(메시지)을 하나씩 확인한다.

### 6.5 `handleConnection`에 브레이크포인트로 토큰 검증 과정 추적하기

JS의 `--inspect-brk`가 여기서도 그대로 통한다.

```sh
npm run start:debug # --env-file .env를 붙여 둔 nest start --debug --watch
```

`handleConnection`의 `jwt.verify(...)` 호출 다음 줄에 브레이크포인트를 찍고 `scratch-client.mjs`를 실행한다.

`payload.sub`에 실제로 어떤 사용자 ID가 들어오는지, `socket.join(...)`이 어떤 room 이름으로 호출되는지 그 자리에서 확인할 수 있다.

### 시험해보기

```sh
DEBUG=socket.io:*,engine:socket npm run start:dev
```

`scratch-client.mjs`로 연결한 뒤 주문을 하나 생성한다.

`join room user:kim`과 `sending packet "message" (2["order.created",...])`가 서버 콘솔에 순서대로 찍히는지 확인한다.

### 도전 과제

#### 1. 인증 여부에 따른 room 비교하기

6.3의 `debugState()`를 `notifyUser` 안 첫 줄에 넣는다.

토큰 없이 연결을 시도한 소켓과 정상 로그인한 소켓 각각의 경우에 room의 소켓 수가 어떻게 다른지 비교한다.

두 경우에 room의 소켓 수는 각각 몇인가?

**답**

1. 토큰 없이 연결한 클라이언트만 띄우고 주문을 만들면 `연결된 소켓 수: 0`, `user:kim room의 소켓: 0`이 찍힌다. 클라이언트에는 `연결됨` 뒤에 `연결 끊김`만 찍히고 알림은 오지 않는다.

2. 정상 로그인한 클라이언트를 띄우고 주문을 만들면 `연결된 소켓 수: 1`, `user:kim room의 소켓: 1`이 찍히고 클라이언트에 `알림: { ... }`이 온다.

3. 둘을 함께 띄워도 숫자는 `1`, `1`이다. 토큰 없는 소켓은 `handleConnection`에서 room에 들어가기 전에 끊겨서 연결 목록에도 room에도 남지 않는다.

> 서버가 먼저 끊은 연결(`io server disconnect`)은 socket.io 클라이언트가 자동으로 다시 연결하지 않는다(토큰 없는 클라이언트는 끊긴 채로 남는다).

#### 2. 한 사용자의 여러 연결에 알림 보내기

`scratch-client.mjs`를 두 개의 다른 터미널에서 동시에 실행한다(둘 다 `kim`으로 로그인). 

그 다음 주문을 하나 생성한다.

`user:kim` room에 소켓이 2개 들어있어 양쪽 모두에게 알림이 가는지 확인한다.

알림은 몇 군데에 도착하는가?

**답**

1. 두 클라이언트 모두 `연결됨`을 찍고 주문을 만들면 양쪽 터미널에 같은 `알림: { id: 203, user: 'choi', price: 9000, paid: true }`가 찍힌다.

2. 도전 과제 1의 `debugState()`를 넣어 둔 채로 하면 `연결된 소켓 수: 2`, `user:kim room의 소켓: 2`가 찍힌다.

> room은 사용자 id가 아니라 소켓을 담는다.  
> 같은 사용자가 탭이나 기기를 여러 개 열면 그 소켓이 전부 `user:kim`에 들어가고 `server.to("user:kim").emit(...)` 한 번으로 모두에게 간다.

## 7. 완성 확인

- [ ] 토큰 없이 연결하면 바로 끊긴다(3단계)

- [ ] 유효한 토큰으로 연결하면 유지된다

- [ ] 로그인한 사용자가 주문을 생성하면 그 사용자의 소켓에 `order.created` 알림이 온다

- [ ] `AuthGuard`가 HTTP 라우트만 보호하고 WebSocket 핸드셰이크에는 관여하지 않는다는 것을 설명할 수 있다

## 8. 다음 단계

### 자가 점검

1. `AuthGuard("jwt")`가 `POST /orders`는 막으면서 WebSocket 연결은 못 막는 이유는?

2. `handleConnection`에서 검증을 안 하면 무슨 일이 생기는가? 지금 코드는 그걸 어떻게 막는가?

3. ``socket.join(`user:${payload.sub}`)``과 `server.to(...).emit(...)`은 각각 무슨 일을 하는가?

4. `OrdersService`가 `NotificationsGateway`를 주입받으려면 왜 `OrdersModule`이 `NotificationsModule`을 `imports`해야 하는가?

### 이 문서에서 다루지 않은 것

존재만 언급한다.

- 서버 인스턴스가 여러 개일 때 방(room) 상태를 어떻게 공유하는가(Redis Pub/Sub, socket.io 어댑터)

- 재연결 로직, 좀 더 세분화된 room 설계

- `handleDisconnect`로 연결 종료 시 정리하기