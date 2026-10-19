# node-workspace: 주문 관리 도메인 단계별 구현 인덱스

![Language](https://img.shields.io/badge/language-TypeScript%20%7C%20JavaScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=nodedotjs&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Express%20%7C%20NestJS%20%7C%20React%20%7C%20Next.js%20%7C%20Fastify-lightgrey)

주문 관리 도메인 하나를 JavaScript 스크립트부터 실시간 알림이 붙은 API와 화면까지 단계마다 다시 구현한 저장소입니다. 단계마다 브랜치가 하나씩 있고, 이 브랜치(`main`)에는 이 인덱스 문서만 있습니다.

## 요구 환경

- Node.js와 npm이 필요합니다. 어느 브랜치의 package.json에도 engines 지정은 없습니다.
- 그 밖에 필요한 것(브라우저, Playwright 브라우저, Chrome)은 각 브랜치 `README.md`의 요구 환경에 적었습니다.

## 시작 상태

브랜치끼리 공통 조상이 없습니다. 11개 브랜치의 루트 커밋이 모두 다릅니다. 앞 단계 코드를 쓰는 브랜치는 그 소스를 파일째 가져온 커밋에서 시작합니다. 아래 표의 "시작" 열이 그 출발점입니다.

## 지원 범위

| 브랜치 | 주제 | 시작 | 내용 |
| --- | --- | --- | --- |
| [foundation/00-javascript](https://github.com/seungwoo7050/node-workspace/tree/foundation/00-javascript) | JavaScript | 빈 저장소 | 가짜 비동기 API에서 주문을 여러 페이지 받아 사용자별 결제 합계와 1위를 출력하는 Node 스크립트 |
| [foundation/01-typescript](https://github.com/seungwoo7050/node-workspace/tree/foundation/01-typescript) | TypeScript · zod | 00의 소스 | 00의 스크립트를 TypeScript로 옮기고, zod 스키마를 통과한 주문만 집계 |
| [foundation/02b-express](https://github.com/seungwoo7050/node-workspace/tree/foundation/02b-express) | Express 5 | 빈 저장소 | 주문을 조회·생성·집계하는 REST API |
| [foundation/02f-react](https://github.com/seungwoo7050/node-workspace/tree/foundation/02f-react) | React · Vite | 빈 저장소 | 주문 목록과 비동기 상세 조회 화면. 서버 없이 앱 안의 가짜 API를 씁니다 |
| [foundation/03b-nestjs](https://github.com/seungwoo7050/node-workspace/tree/foundation/03b-nestjs) | NestJS | 빈 저장소 | 주문 API를 모듈·컨트롤러·서비스 구조로 만들고, `reflect-metadata`로 작은 DI 컨테이너를 직접 구현 |
| [foundation/03f-nextjs](https://github.com/seungwoo7050/node-workspace/tree/foundation/03f-nextjs) | Next.js | 빈 저장소 | 주문 목록과 상세 화면을 App Router로 만들고, 상세 데이터를 서버 컴포넌트에서 조회 |
| [foundation/04-integration-and-auth](https://github.com/seungwoo7050/node-workspace/tree/foundation/04-integration-and-auth) | Passport JWT · 서버 액션 | 03b와 03f의 소스 | 주문 생성을 JWT 로그인으로 제한하고, Next.js 서버 액션이 로그인한 뒤 그 API에 주문을 만듭니다 |
| [foundation/05-ws-gateway](https://github.com/seungwoo7050/node-workspace/tree/foundation/05-ws-gateway) | socket.io 게이트웨이 | 04의 API 소스 | 연결할 때 JWT를 검증하고, 주문이 생성되면 요청한 사용자의 소켓에만 `order.created`를 보냅니다 |
| [appendix/01-fastify-ws](https://github.com/seungwoo7050/node-workspace/tree/appendix/01-fastify-ws) | Fastify · ws | 빈 저장소 | 주문 API를 Fastify로 만들고, 주문 생성을 WebSocket으로 연결된 모든 클라이언트에 방송 |
| [appendix/02-test-toolkit](https://github.com/seungwoo7050/node-workspace/tree/appendix/02-test-toolkit) | Vitest · Playwright · Lighthouse CI | appendix/01과 03f의 소스 | Fastify API에 단위·API 테스트를, Next.js 화면에 E2E·접근성 테스트와 성능 측정을 붙입니다 |

- `foundation`은 번호 순서대로 진행하는 본 과정입니다. `02`와 `03`은 백엔드(`b`)와 프론트엔드(`f`)로 갈라지고, `04`에서 03b의 API와 03f의 화면을 합칩니다.
- `appendix`는 같은 도메인을 다른 도구로 다시 만들거나(01), 앞 단계 결과물에 테스트 도구를 붙이는(02) 단계입니다.

## 구성

- 각 브랜치 루트에 프로젝트 폴더가 있습니다(`order-report/`, `order-api-nest/`, `order-console-next/` 등). package.json은 프로젝트 폴더마다 하나입니다.
- 각 브랜치 루트의 `README.md`에 그 단계의 요구 환경, 시작 상태, 지원 범위, 구성, 실행, 테스트를 적었습니다.
- 데이터는 모두 메모리에 있습니다. DB를 쓰지 않으므로 서버를 다시 켜면 처음 데이터로 돌아갑니다. 02f와 03f의 화면은 앱 안의 가짜 데이터를 씁니다.

## 실행

```sh
# 저장소를 둘 위치에서
git clone https://github.com/seungwoo7050/node-workspace.git
cd node-workspace
git switch foundation/04-integration-and-auth # 원하는 브랜치
```

브랜치를 바꾸면 작업 트리 전체가 그 단계로 바뀝니다. 두 단계를 나란히 두고 보려면 worktree를 씁니다.

```sh
# node-workspace 안에서
git worktree add ../02b-express foundation/02b-express
```

명령은 프로젝트 폴더 안에서 실행합니다. 설치는 `npm ci`이고, 실행 스크립트는 프로젝트마다 다릅니다(`npm run dev`, NestJS는 `npm run start:dev`). 00은 의존성이 없어 `node main.js`로 바로 실행합니다. 정확한 명령은 각 브랜치 README의 실행 절에 있습니다.

## 테스트

- 자동 테스트가 있는 것은 `appendix/02-test-toolkit`입니다(Vitest 단위·API 테스트, Playwright E2E·접근성 테스트, Lighthouse CI).
- 03b·04·05의 NestJS 프로젝트에는 스캐폴드가 만든 기본 테스트(`GET /`가 `Hello World!`를 돌려주는지)만 있습니다.
- 01·02b·appendix/01에는 `npm run typecheck`, 02f·03f에는 `npm run lint`까지만 있습니다. 00에는 검사 스크립트가 없습니다.
- 자동 테스트가 없는 부분의 동작은 `curl`·브라우저·확인용 스크립트로 직접 확인합니다.
