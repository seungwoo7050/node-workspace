# node-workspace

![Language](https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white)
![Runtime](https://img.shields.io/badge/runtime-Node.js%20%7C%20ESM-lightgrey)
![Package](https://img.shields.io/badge/package-npm-lightgrey)

하나의 주문 관리 도메인을 JavaScript 스크립트부터 실시간 알림이 붙은 프론트엔드 · 백엔드까지 단계마다 다시 구현한 저장소입니다. 단계마다 독립된 브랜치를 쓰며, 브랜치끼리 공통 조상이 없는 별개의 루트 히스토리입니다. 이 브랜치(`main`)에는 이 인덱스 문서만 있습니다.

## 프로젝트

| 단계 | 주제 | 설명 |
| --- | --- | --- |
| [foundation/00-javascript](https://github.com/seungwoo7050/node-workspace/tree/foundation/00-javascript) | JavaScript | 가짜 비동기 API에서 주문을 병렬로 받아 사용자별 결제 합계와 1위를 출력하는 Node 스크립트 |
| [foundation/01-typescript](https://github.com/seungwoo7050/node-workspace/tree/foundation/01-typescript) | TypeScript · zod | 00단계를 TypeScript로 옮기고, 모양이 어긋난 응답을 zod로 걸러낸 뒤 집계 |
| [foundation/02b-express](https://github.com/seungwoo7050/node-workspace/tree/foundation/02b-express) | Express 5 | 주문을 조회 · 생성 · 집계하는 REST API |
| [foundation/02f-react](https://github.com/seungwoo7050/node-workspace/tree/foundation/02f-react) | React · Vite | 주문 목록과 비동기 상세 조회 화면 |
| [foundation/03b-nestjs](https://github.com/seungwoo7050/node-workspace/tree/foundation/03b-nestjs) | NestJS 12 | Express 주문 API를 같은 동작 그대로 모듈 · 컨트롤러 · 서비스 구조로 재구현 |
| [foundation/03f-nextjs](https://github.com/seungwoo7050/node-workspace/tree/foundation/03f-nextjs) | Next.js 16 | 주문 화면을 App Router로 옮겨 서버 컴포넌트에서 데이터를 직접 조회 |
| [foundation/04-integration-and-auth](https://github.com/seungwoo7050/node-workspace/tree/foundation/04-integration-and-auth) | Passport JWT · 서버 액션 | 주문 생성을 JWT로 막고, Next.js 서버 액션이 토큰을 붙여 그 API를 호출 |
| [foundation/05-ws-gateway](https://github.com/seungwoo7050/node-workspace/tree/foundation/05-ws-gateway) | NestJS Gateway · socket.io | 핸드셰이크에서 JWT를 검증하고, 주문을 만든 사용자에게만 실시간 알림 |
| [appendix/01-fastify-ws](https://github.com/seungwoo7050/node-workspace/tree/appendix/01-fastify-ws) | Fastify · ws | 주문 API를 Fastify 플러그인 구조로 다시 만들고 주문 생성을 WebSocket으로 방송 |
| [appendix/02-test-toolkit](https://github.com/seungwoo7050/node-workspace/tree/appendix/02-test-toolkit) | Vitest · Playwright · Lighthouse CI | 손으로 확인해 온 두 프로젝트에 단위 · API · e2e · 접근성 · 성능 측정을 붙임 |

`foundation`은 순서대로 쌓아 올리는 본 과정입니다. `02`와 `03`은 같은 번호에서 백엔드(`b`)와 프론트엔드(`f`)로 갈라지고, `04`에서 두 갈래를 하나로 잇습니다. `appendix`는 같은 도메인을 다른 선택지로 다시 만들거나 완성된 결과물에 도구를 덧붙이는 독립 단계입니다.

각 브랜치의 `README.md`에 그 단계의 지원 범위, 구성, 실행, 테스트가 정리되어 있습니다.

## 브랜치 받기

```sh
git clone https://github.com/seungwoo7050/node-workspace.git
cd node-workspace
git switch foundation/04-integration-and-auth # 원하는 단계 브랜치
```

브랜치를 바꾸면 작업 트리 전체가 해당 단계로 교체됩니다. 앞 단계와 나란히 두고 비교하려면 worktree를 쓰는 편이 편합니다.

```sh
git worktree add ../02b-express foundation/02b-express
```

## 공통 규약

모든 단계가 같은 규칙을 따릅니다.

- 00단계만 JavaScript이고 나머지는 TypeScript입니다.

- 브랜치 루트에 프로젝트 디렉터리가 있고(`order-api-nest/`, `order-console-next/` 등) `package.json`은 프로젝트마다 하나씩 둡니다. 명령은 그 디렉터리 안에서 실행합니다.

- 저장소는 메모리 배열입니다. DB도 compose도 필요 없고, 서버를 다시 켜면 처음 데이터로 돌아갑니다.

```sh
npm ci        # package-lock.json에 고정된 버전으로 설치
npm run dev   # 파일이 바뀔 때마다 다시 실행
npm run build # 컴파일 또는 프로덕션 빌드
npm start     # 빌드 결과 실행
```

검증 명령은 그 단계에 있는 것만 씁니다. 타입 검사는 `npm run typecheck`, 린트는 `npm run lint`, 테스트는 `npm test`입니다. 자동 테스트는 03b 이후의 NestJS 프로젝트와 `appendix/02-test-toolkit`에만 있고, 그 전 단계는 타입 검사까지만 한 뒤 `curl` · 브라우저 · `scratch-client.mjs`로 직접 확인합니다.

## guide

각 브랜치의 `guide/README.md`는 그 단계를 처음부터 다시 만들 수 있도록 쓴 단일 문서입니다. 모든 단계가 같은 골격을 공유합니다.

- `목표`와 `사전지식`: 그 단계가 끝났을 때 돌아가는 것과, 코드를 쓰기 전에 알아야 하는 전제.

- 단계별 구현: 코드와, 거기 쓰인 문법 · API를 따로 모은 항목, 그리고 `왜 이렇게 생겼는가` · `일부러 깨뜨려보기` · `도전 과제`.

- `디버깅`: 그 단계에서 실제로 막히는 지점을 좁히는 방법. 00의 `node --inspect`, 03b의 `design:paramtypes` 확인, 04의 CORS, appendix/02의 Playwright 트레이스.

- `완성 확인` · `자가 점검` · `이 문서에서 다루지 않은 것`: 끝났는지 판단하는 기준과, 일부러 범위에서 뺀 것.

앞 단계를 다른 도구로 다시 만드는 단계에는 직전 구현과 나란히 놓고 비교하는 절이 있습니다(03b의 `대조 정리`, appendix/01의 `Express와의 대조`).
