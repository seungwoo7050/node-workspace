# React: 주문 관리 화면

## 목표

주문 목록을 보여주고, 하나를 고르면 비동기로 상세를 불러와 카드로 보여주는 화면을 만든다. TS로 다룬 `Order` 데이터를 그대로 화면으로 옮긴다고 생각하면 된다.

| 동작 | 결과 |
|---|---|
| 처음 열기 | 주문 4건 목록. 아래엔 "검토 완료: 없음" |
| `kim`의 101번 클릭 | "불러오는 중..." → 약 1.2초 뒤 상세 카드 |
| 104번(취소된 주문) 클릭 | 약 0.3초 뒤 "이 주문은 취소되어 상세 정보가 없습니다" |
| "검토 완료로 표시" 클릭 | 하단 요약이 갱신됨 |
| "최신순/오래된순" 토글 | 목록 순서가 뒤집힘 |

React는 브라우저에서 실행된다. 예시가 TSX인 것은 관례일 뿐, React 자체는 JS만으로도 쓸 수 있다.

## 0. React를 위한 JS/TS 사전지식

React 사용을 위해 필수적으로 알아야 할 JS/TS 6가지 핵심 개념을 정리한다. React를 비롯한 현대 프론트엔드 프레임워크는 모두 이 문법적 특성과 동작 원리 위에서 작동한다.

### 1. 구조 분해 할당과 Spread 연산자

#### 구조 분해 할당(Destructuring Assignment)

객체나 배열 안의 값을 분해하여 개별적인 독립 변수로 추출하는 문법이다. 추출된 변수는 원본 객체/배열의 참조를 유지하지 않고 별개의 변수로 동작한다.

```js
const user = { name: 'Alice', age: 25, role: 'Admin' };
// user에서 name, role 키의 값을 꺼내 같은 이름의 새 변수 두 개를 만든다(age는 안 꺼냄)
const { name, role } = user;
// 결과: name은 'Alice', role은 'Admin'
// name = 'Bob'으로 변경해도 user.name은 여전히 'Alice'다

const colors = ['red', 'green', 'blue'];
// 배열 구조 분해는 키 이름이 아니라 "순서"로 꺼낸다
const [primary, secondary] = colors;
// 결과: primary는 'red', secondary는 'green'
```

#### Spread 연산자(`...`)

객체나 배열의 요소를 하나씩 펼쳐서 새로운 객체나 배열을 생성한다. 원본 데이터를 직접 수정하지 않고 복사본을 만드는 불변성(Immutability) 패턴을 구현할 때 쓰인다.

```js
const originalArray = [1, 2, 3];
// 배열의 원소를 새 배열 리터럴 안에 펼치고, 뒤에 4를 덧붙인다
const newArray = [...originalArray, 4];
// 결과: [1, 2, 3, 4] (originalArray는 여전히 [1, 2, 3])

const originalObj = { a: 1, b: 2 };
// 같은 키(b)가 뒤에 다시 나오면 뒤의 값(99)이 앞의 값을 덮어쓴다
const updatedObj = { ...originalObj, b: 99 };
// 결과: { a: 1, b: 99 } (originalObj는 여전히 { a: 1, b: 2 })
```

#### C와 비교하면

구조 분해 할당은 구조체 멤버를 지역 변수로 따로 복사해 꺼내 쓰는 것과 같다(`int age = user.age;`처럼 포인터가 아니라 값 복사이므로 원본과 독립적이다).

Spread는 `memcpy`로 구조체 전체를 새 메모리에 복사한 뒤 일부 필드만 덮어쓰는 것에 가깝다. 단, `memcpy`가 구조체를 통째로 바이트 단위로 복사하는 것과 달리, **Spread는 한 단계(얕은 복사, shallow copy)만 복사한다**. 필드 값이 다시 객체/배열이면 그 안쪽은 여전히 같은 메모리(참조)를 공유한다.

### 2. 콜백(Callback)

JavaScript에서 함수는 숫자나 문자열처럼 값(value)으로 취급된다. 그래서 함수를 변수에 담고, 다른 함수의 인자로 넘기고, 반환값으로 돌려줄 수 있다(일급 함수, First-class function).

이렇게 다른 함수에 인자로 전달되어, 그 함수가 원하는 시점에 대신 호출해주는 함수를 콜백이라 한다. "내가 직접 부르지 않고, 상대가 필요할 때 나를 다시(back) 불러준다"는 의미다.

```js
// 함수도 값이라 변수에 담을 수 있다 (화살표 함수: 인자 => 반환할 식)
const greet = name => 'Hello, ' + name;

// callback 자리에 함수를 받아, 이 안에서 대신 호출한다
function runTwice(callback) {
  callback(); // 뒤에 ()가 붙어야 실행된다
  callback();
}

// 함수 이름만 넘긴다. 괄호를 붙이면(sayHi()) 넘기기 전에 실행돼버리니 주의
const sayHi = () => console.log('Hi');
runTwice(sayHi);
// 출력: 'Hi'가 두 번 (호출 시점과 횟수를 정한 쪽은 runTwice다)
```

#### 동기 콜백과 비동기 콜백

콜백은 언제 실행되느냐에 따라 두 종류로 나뉜다.

- 동기 콜백: 넘겨받은 함수가 즉시 순서대로 실행한다. `map`/`filter`가 여기에 해당한다.

- 비동기 콜백: 지금은 등록만 해두고, 나중에 어떤 일이 끝났을 때 실행된다. 타이머, 네트워크 응답, 사용자 클릭 등이 여기에 해당한다.

```js
console.log('1. 시작');

// setTimeout(콜백, 밀리초): "1000ms 뒤에 이 함수를 실행해줘"라고 브라우저에 예약한다
setTimeout(() => {
  console.log('3. 1초 뒤 실행'); // 비동기 콜백: 나중에 호출된다
}, 1000);

console.log('2. 끝');
// 출력: 1. 시작 → 2. 끝 → (1초 후) 3. 1초 뒤 실행
// setTimeout은 기다리지 않고 바로 다음 줄로 넘어간다. 콜백은 예약만 되어 있을 뿐이다
```

#### C와 비교하면

콜백은 C의 함수 포인터(function pointer)와 같은 개념이다. 대표적인 예가 `qsort`의 비교 함수다. `qsort`는 정렬 뼈대만 제공하고, 두 원소를 어떻게 비교할지는 호출자가 넘긴 함수 포인터에 맡긴다.

```c
// 비교 규칙을 담은 함수. qsort가 필요할 때마다 대신 호출해준다(= 콜백)
int compare(const void *a, const void *b) {
    // void*를 int*로 바꿔 값을 꺼낸다. 앞이 작으면 음수, 같으면 0, 크면 양수를 반환한다
    return *(const int *)a - *(const int *)b;
}

int arr[] = {3, 1, 2};
// 마지막 인자 compare가 함수 포인터다. 함수 이름은 그 함수의 주소로 취급된다
qsort(arr, 3, sizeof(int), compare);
```

JavaScript도 `arr.sort((a, b) => a - b)`처럼 똑같은 구조로 쓴다. 다만 결정적인 차이가 하나 있다.

- C: 함수 포인터는 코드의 주소만 담고 있다. 콜백이 주변 상태를 쓰려면 `void *userdata` 같은 인자를 따로 만들어 넘기고, 콜백 안에서 캐스팅해 꺼내야 한다.

- JavaScript: 콜백이 자신이 만들어진 주변의 변수를 **자동으로 기억한다.** 별도의 `userdata` 없이도 바깥 변수를 그냥 쓸 수 있다. 이것이 클로저다.

```js
const limit = 10; // 바깥 변수

// 콜백 안에서 바깥의 limit을 그대로 쓴다. C처럼 userdata로 따로 넘길 필요가 없다
const isSmall = n => n < limit;
console.log(isSmall(5)); // 출력: true
```

#### 콜백의 한계와 Promise의 등장

비동기 작업이 이어질수록 콜백 안에 콜백을 중첩하게 된다. 이를 콜백 지옥(Callback Hell)이라 부르며, 코드가 오른쪽으로 계속 깊어지고 에러 처리도 단계마다 따로 해야 한다.

```js
// 각각 "끝나면 마지막 인자의 콜백을 호출"한다고 가정한 가상의 비동기 함수들
getUser(1, user => {
  getOrders(user.id, orders => {
    getDetail(orders[0].id, detail => {
      console.log(detail); // 단계가 늘수록 들여쓰기가 깊어진다
    });
  });
});
```

이 문제를 해결하려고 나온 것이 `Promise`와 `async/await`이며, 5절에서 다룬다.

#### 정리

| 구분 | 설명 | 예시 |
|---|---|---|
| 콜백 | 다른 함수에 인자로 넘겨, 그 함수가 대신 호출하는 함수 | `runTwice(sayHi)` |
| 동기 콜백 | 즉시 순서대로 실행됨 | `map`, `filter`, `sort` |
| 비동기 콜백 | 작업 완료 후 나중에 실행됨 | `setTimeout`, 클릭 이벤트 |
| C 대응 개념 | 함수 포인터 (`qsort`의 `compare`) | 상태 전달은 `void *userdata` 필요 |
| JS의 차이점 | 주변 변수를 자동으로 기억(클로저) | `n => n < limit` |

### 3. 배열 메서드(`map`, `filter`)

원본 배열을 변형하지 않고(Non-mutating), 조건을 적용한 새로운 배열을 반환하는 선언형 메서드다.

#### `map`

배열의 모든 요소를 순회하며 콜백 함수의 반환값들로 구성된 동일한 길이의 새 배열을 만든다.

```js
const numbers = [1, 2, 3];
// 인자가 하나인 화살표 함수는 괄호를 생략할 수 있다
const doubled = numbers.map(num => num * 2);
// 결과: doubled는 [2, 4, 6] (numbers는 여전히 [1, 2, 3])
```

#### `filter`

콜백 함수가 `true`를 반환하는 요소만 걸러내어 새로운 배열로 만든다.

```js
const products = [
  { name: 'Apple', price: 1000 },
  { name: 'Banana', price: 500 }
];
// 화살표 함수가 => 뒤의 식 한 줄을 그대로 반환한다
const expensive = products.filter(item => item.price >= 1000);
// 결과: expensive는 [{ name: 'Apple', price: 1000 }]
```

#### C와 비교하면

C에서 배열을 가공하려면 결과를 담을 배열을 직접 `malloc`하고, `for` 루프를 돌며 인덱스를 관리하고, 조건에 맞는 원소만 손으로 채워 넣어야 한다.

`map`/`filter`는 그 "새 배열 만들기 + 순회 + 채우기"라는 반복되는 뼈대를 라이브러리 함수 하나로 감싸고, 매 순회마다 무엇을 할지(콜백)만 넘기게 한 것이다.

> 원본 배열의 메모리는 절대 건드리지 않는다는 점이, 원본을 그 자리에서 고치는 일반적인 C `for` 루프와 가장 다르다.

### 4. 클로저(Closure)

함수가 선언될 당시의 **어휘적 환경(Lexical Environment)을 기억하여, 외부 함수의 실행이 끝난 후에도 상위 스코프의 변수에 접근할 수 있는 메커니즘**이다.

내부 함수는 자신이 생성될 때의 환경을 참조로 유지하므로, 외부 함수가 종료되어 메모리에서 사라져야 할 변수에 계속 접근하거나 값을 변경할 수 있다.

```js
function createCounter() {
  let count = 0; // 외부 함수의 변수

  // 반환되는 이름 없는 함수(익명 함수)가 count를 기억한다
  return function() { // 내부 함수 (클로저)
    count += 1;
    return count;
  };
}

// counter는 createCounter가 돌려준 함수다. 호출할 때마다 같은 count를 갱신한다
const counter = createCounter();
console.log(counter()); // 출력: 1 (createCounter가 끝났음에도 count 변수에 접근 가능)
console.log(counter()); // 출력: 2 (count 상태가 유지됨)
```

#### 렉시컬 환경(Lexical Environment)이란?

클로저가 외부 변수를 기억할 수 있는 이유는 자바스크립트 엔진이 스코프를 렉시컬 환경(Lexical Environment)이라는 내부 데이터 구조로 관리하기 때문이다.

렉시컬 환경은 코드 실행 구역(스코프)의 **"식별자-값 매핑 장부"** 역할을 하며, 크게 두 가지로 구성된다.

1. **환경 레코드(Environment Record):** 현재 스코프에 선언된 변수, 함수, 매개변수 등을 `{ 식별자: 값 }` 형태의 키-값 쌍으로 실제 저장하는 공간이다.
2. **외부 렉시컬 환경 참조(Outer Lexical Environment Reference):** 현재 함수가 정의된 상위(외부) 스코프의 렉시컬 환경을 가리키는 포인터다.

```
[내부 함수(익명) 렉시컬 환경]
 ├─ Environment Record: { (선언된 자체 변수 없음) }
 └─ Outer Reference ──────────────┐
                                  │
[createCounter 렉시컬 환경] <──────┘
 ├─ Environment Record: { count: 0 }
 └─ Outer Reference: [전역 렉시컬 환경]
```

자바스크립트는 함수가 **어디서 호출되었는지**가 아니라 **어디에 선언(작성)되었는지**에 따라 상위 스코프를 결정하는 렉시컬 스코프(Lexical Scope)를 따른다.

따라서 `createCounter` 내부에서 선언된 익명 함수는 생성되는 순간 자신을 감싸고 있던 `createCounter`의 렉시컬 환경을 자신의 **Outer Reference**로 등록하여 평생 기억하게 된다.

#### C와 비교하면

C의 `malloc`이나 힙(Heap) 메모리의 동작 방식과 비교하면 클로저의 내부 메커니즘이 명확해진다.

비유하자면 "함수 안에 동적 할당(`malloc`)을 해두고, 그 주소를 담은 포인터(내부 함수)만 밖으로 던져주는 것"과 같은 개념이다.

```c
int* createCounter() {
    // malloc(sizeof(int)): int 하나가 들어갈 만큼의 Heap 메모리를 빌리고, 그 주소를 포인터로 받는다
    int* count = (int*)malloc(sizeof(int));
    // 포인터가 가리키는 메모리 칸의 "값"에 0을 쓴다
    *count = 0;

    // 함수가 끝나도 malloc한 메모리는 남아 있으므로, 주소만 알면 계속 count를 읽고 쓸 수 있다
    return count;
}
```

- JavaScript 엔진은 내부 함수가 외부 변수를 참조(`free-variable`)하고 있는 것을 감지하면 해당 변수를 Stack이 아닌 Heap 영역(클로저 스코프)에 할당한다.

- 따라서 외부 함수가 실행을 마치고 Stack Frame에서 사라져도, Heap에 남아있는 변수는 사라지지 않는다.

#### 메모리 해제(Free)는 어떻게 될까?

C에서는 `malloc`을 했으면 반드시 `free()`를 해주어야 메모리 누수(Memory Leak)가 나지 않는다. JavaScript는 Garbage Collector(GC)가 이 역할을 대신한다.

- 참조가 남아있는 동안: 클로저(내부 함수)를 가리키는 변수가 존재하는 한, GC는 해당 변수가 있는 Heap 영역을 해제하지 않고 유지한다.

- 참조가 끊어질 때: 클로저를 담고 있는 변수에 `null`이나 `undefined`를 할당해 그 함수(와 함수가 붙든 변수)에 어디서도 도달할 수 없게 되면, 이후 GC가 돌 때 메모리를 수거(`free`)한다.

> V8의 GC는 참조 개수를 세는 방식이 아니라 루트(전역/콜 스택)에서 출발해 닿는 객체를 표시하고 나머지를 치우는 방식(mark-and-sweep 계열)이다. 그래서 회수 시점은 "도달 불가가 된 순간"이 아니라 "그 뒤 언젠가"다.

```js
let counter = createCounter(); // Heap 영역에 count 변수 유지 중
counter(); // 1
counter(); // 2

// counter가 더 이상 함수를 가리키지 않으면, 그 함수가 붙들던 count에 접근할 방법이 없어져 GC가 회수할 수 있다
counter = null; // C의 free(count)에 해당. 단, 즉시가 아니라 다음 GC 때 회수된다
```

### 5. `Promise`와 `async/await`

비동기 작업(네트워크 통신, 파일 I/O 등)의 완료 여부와 결과값을 다루는 방식이다.

#### `Promise`

비동기 작업의 미래 결과를 나타내는 객체로, `Pending`(대기), `Fulfilled`(성공), `Rejected`(실패) 중 하나의 상태를 가진다.

```js
// fetchData()는 Promise를 돌려주는 함수라고 가정한 예시다
fetchData()
  .then(data => console.log(data)) // 성공 시 결과값을 받아 실행
  .catch(error => console.error(error)); // 실패 시 실행
```

##### `then` 메서드

`Promise` 객체가 **`Fulfilled`(성공)** 상태가 되었을 때 실행될 콜백 함수를 등록하는 메서드다.

- **결과값 전달:** 이전 비동기 작업 처리가 성공하면 그 결과값(resolve 값)을 파라미터로 넘겨받는다.
- **프로미스 체이닝(Promise Chaining):** `then()`은 내부에서 값을 반환하면 자동으로 새로운 `Promise` 객체로 감싸서 반환한다. 이를 통해 여러 개의 비동기 작업을 순차적으로 연결하여 처리할 수 있다.

```js
fetchData()
  .then(data => {
    // 1. 성공적으로 받아온 데이터를 가공하여 반환한다 (자동으로 Promise로 감싸짐)
    return data.user;
  })
  .then(user => {
    // 2. 이전 then에서 반환된 user 객체를 넘겨받아 연쇄적으로 실행한다
    console.log(user.name);
  })
  .catch(error => {
    // 위 체이닝 과정 중 어느 곳에서든 에러가 발생하면 catch로 전역 포착된다
    console.error(error);
  });
```

#### `async/await`

`Promise`를 기반으로 작동하며, 비동기 코드를 동기식 코드처럼 직관적으로 작성하게 해주는 문법이다.

`async` 함수 내에서 `await`를 걸면 해당 `Promise`가 처리될 때까지 실행을 일시 정지하고, 해결된(Resolved) 결과값을 변수에 바로 담아낸다.

```js
// async 함수 안에서는 await를 쓸 수 있고, 반환값은 항상 Promise로 감싸진다
async function loadData() {
  try {
    // fetch(주소): HTTP 요청을 보내고 응답(Response) 객체를 Promise로 돌려준다
    const response = await fetch('https://api.example.com/data');
    // response.json(): 응답 본문의 JSON을 객체로 바꾼다. 이것도 Promise라 await가 필요하다
    const data = await response.json();
    return data;
  } catch (error) {
    // try 안의 await가 실패(reject)하면 이 catch 블록으로 온다
    console.error('요청 실패:', error);
  }
}
```

##### `fetch()` 함수

웹 브라우저에 내장된 API로, HTTP 요청을 보내고 `Promise`를 반환하는 표준 비동기 데이터 통신 메서드다.

- **기본 HTTP 메서드:** 첫 번째 인수로 **URL만 전달하면 기본적으로 `GET` 메서드로 요청**을 보낸다.
- **옵션 객체(Method 지정):** `POST`, `PUT`, `DELETE` 등 다른 HTTP 메서드를 사용하거나 헤더, 본문(body) 데이터를 보낼 때는 두 번째 인수로 옵션 객체를 전달한다.
- **2단계 비동기 처리:** `fetch()`가 반환하는 첫 번째 `Promise`는 HTTP 응답 헤더를 수신했을 때 해결되어 `Response` 객체를 돌려준다. 따라서 본문(body) 데이터를 파싱하기 위해서는 `response.json()` 또는 `response.text()`와 같은 추가적인 비동기 메서드 호출이 필요하다.

```js
// 1. GET 요청 (URL만 전달 시 기본값)
const response = await fetch('https://api.example.com/data');

// 2. POST 요청 (옵션 객체 전달)
const postResponse = await fetch('https://api.example.com/data', {
  method: 'POST', // HTTP 메서드 지정
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'Kim', role: 'developer' }),
});
```

### 6. TypeScript `interface`와 `type`(데이터 모양 정의)

데이터나 객체의 구조(Shape)를 미리 정의하여 타입 검사를 수행하는 핵심 도구다.

#### `interface`

객체의 구조를 정의할 때 주로 사용한다. 선언 병합(동일 이름으로 재선언 시 자동 합쳐짐)과 상속(`extends`)에 특화되어 있다.

```ts
// 객체가 가져야 할 필드와 타입을 정하는 "모양 정의". 컴파일 후엔 사라진다
interface User {
  id: string;
  name: string;
}

// extends: User의 필드(id, name)를 물려받고 role 필드를 더한다
interface AdminUser extends User {
  role: 'ADMIN' | 'SUPER_ADMIN'; // 두 문자열 중 하나만 허용하는 문자열 리터럴 유니온 타입
}
```

#### `type`(타입 별칭, Type Alias)

객체 구조뿐만 아니라 유니온(Union, `A | B`), 원시 타입, 튜플, 함수 등 모든 타입 표현식에 이름을 붙일 수 있다.

```ts
// 세 문자열 중 하나만 허용하는 유니온 타입에 이름을 붙인다
type Status = 'PENDING' | 'SUCCESS' | 'FAILED';

// 객체 모양도 type으로 쓸 수 있다. 필드 status의 타입으로 위의 Status를 재사용한다
type Product = {
  id: number;
  title: string;
  status: Status;
};
```

##### 원시 타입, 유니온, 튜플

`type` 키워드를 사용하면 기본 데이터 타입부터 복잡한 조합 타입까지 모두 직관적으로 정의할 수 있다.

- **원시 타입(Primitive Type):** `string`, `number`, `boolean`, `null`, `undefined` 등 자바스크립트의 기본 데이터 타입을 가리킨다.
- **유니온 타입(Union Type, `|`):** 여러 타입 중 **하나에 해당함**을 나타내는 "OR(또는)" 개념이다. 특정 문자열이나 숫자 값 자체를 지정하는 리터럴 유니온으로도 자주 활용된다.
- **튜플(Tuple):** **"길이(요소 개수)와 인덱스별 타입 순서"가 엄격하게 고정된 특수 배열 타입**이다.
  - *배열과의 차이:* 일반 배열(`number[]`)은 길이가 자유롭고 요소들의 타입만 같으면 되지만, 튜플(`[string, number]`)은 0번째 인덱스는 `string`, 1번째 인덱스는 `number`로 위치와 개수가 정확히 정해진다.
  - *자주 쓰는 패턴:* React의 `useState` 반환값(`[state, setState]`)처럼 **서로 다른 타입의 값 몇 개를 순서대로 묶어서 반환**할 때 주로 쓰인다.

```ts
// 1. 원시 타입 별칭
type UserID = number;

// 2. 유니온 타입 (원시 타입이나 리터럴 조합)
type Result = 'SUCCESS' | 'ERROR';
type ID = string | number; // 문자열이거나 숫자인 타입

// 3. 튜플 타입 (위치와 개수가 고정된 배열 데이터 타입)
type Point2D = [number, number]; // [x, y] 좌표처럼 길이가 2인 숫자 튜플
type UserInfo = [string, number, boolean]; // [이름, 나이, 재직여부]

const user: UserInfo = ['Kim', 30, true]; // [string, number, boolean] 순서를 맞춰야 함

// (참고) readonly 튜플: 요소 변경(push, pop, 인덱스 수정)까지 완전히 막을 때 사용
type ImmutablePoint = readonly [number, number];
```

#### C와 비교하면

`interface`/`type`으로 모양을 적는 것은 C의 `struct` 선언과 같은 역할이다. 둘 다 "이 데이터는 어떤 필드를 가지는가"만 컴파일 타임에 약속해두고, 실행 파일에는 그 약속이 그대로 남지 않는다(TS는 컴파일 시 타입 표기가 전부 지워지고, C의 `struct` 태그도 디버그 정보를 빼면 바이너리엔 남지 않는다).

다만 결정적인 차이가 하나 있다. **C의 구조체는 이름(태그)이 같아야 같은 타입**이지만(nominal typing), TS는 필드 모양만 같으면 이름이 달라도 같은 타입으로 취급한다(structural typing, "구조적 타이핑").

즉 `interface Point { x: number; y: number }`와 `interface Coord { x: number; y: number }`는 TS에서 서로 대입 가능하지만, C의 `struct Point`와 `struct Coord`는 필드가 같아도 다른 타입이라 캐스팅 없이는 서로 대입할 수 없다.

`type Status = 'PENDING' | 'SUCCESS' | 'FAILED'` 같은 유니온은 C의 `enum`과 값의 집합을 제한한다는 점에서 같은 역할을 한다.

앞으로 자주 나올 판별 유니온(`{ ok: true; order: Order } | { ok: false; error: string }` 같은 패턴, 4장에서 나온다)은 C에서 `enum` 태그 필드로 어떤 멤버가 유효한지 표시해두고 `union`을 함께 두는 "태그된 유니온(tagged union)" 패턴과 정확히 같다.

```c
// C의 태그된 유니온. TS의 판별 유니온과 같은 패턴
typedef enum { OK, ERROR } ResultTag;

typedef struct {
    ResultTag tag; // TS의 `ok: true | false`에 해당하는 판별자
    union {
        Order order; // tag == OK일 때만 유효
        char *error; // tag == ERROR일 때만 유효
    };
} Result;
```

C에서는 `tag`를 확인하지 않고 `union`의 잘못된 멤버를 읽어도 컴파일러가 막아주지 않는다(개발자가 직접 `if (result.tag == OK)`로 분기해야 한다).

TS는 `if (parsed.ok)`로 분기하는 순간 컴파일러가 그 분기 안에서 `.order`/`.error` 중 실제로 존재하는 필드만 쓰도록 강제한다.

> 판별은 개발자가 하지만, "잘못된 분기에서 잘못된 필드를 읽는" 실수는 컴파일러가 잡아준다.

## 1. 준비

Vite가 요구하는 Node는 20.19 이상 또는 22.12 이상이다.

```sh
# Vite(프론트엔드 개발 도구)로 새 프로젝트 뼈대를 만든다
# -- 뒤의 인자는 Vite에게 그대로 전달된다. --template react-ts는 "React + TypeScript" 템플릿이다
npm create vite@latest order-console -- --template react-ts
cd order-console
# package.json에 적힌 의존 패키지를 모두 설치한다
npm install
# 개발 서버를 켠다(저장하면 브라우저가 자동 갱신)
npm run dev
```

`create-vite` 버전에 따라 중간에 "지금 설치하고 바로 실행할까?"를 묻기도 하는데, 위 명령으로 직접 할 것이므로 No를 골라도 된다.

`npm run dev`가 출력하는 주소(기본 `http://localhost:5173`)를 브라우저로 연다.

> 브라우저 확장 React Developer Tools를 설치해 두면 컴포넌트 트리와 props/state를 볼 수 있다.

| 스크립트 | 실제 명령 | 하는 일 |
|---|---|---|
| `npm run dev` | `vite` | 개발 서버 + HMR. 타입 검사는 하지 않는다 |
| `npm run build` | `tsc -b && vite build` | 타입 검사 후 배포용 번들 생성 |
| `npm run lint` | `oxlint` | 린터 실행 |

현재 `create-vite`의 `react-ts` 템플릿은 ESLint 대신 `oxlint`(러스트 기반, 훨씬 빠르다)를 깔아 준다(설정 파일은 `.oxlintrc.json`). 옛 템플릿이나 다른 프로젝트는 `eslint .`일 수 있다.

Hook 규칙은 둘 다 잡아 주고, 출력에는 `react-hooks(exhaustive-deps)`처럼 표시된다(oxlint 설정 파일에서 켜고 끌 때의 키는 `react/exhaustive-deps`).

TS의 원리 그대로 Vite는 변환만 하고 타입 검사는 `tsc`가 별개로 한다.

템플릿이 만든 `App.tsx`는 곧 통째로 교체할 것이다. `App.css`와 `assets/`는 쓰지 않으니 지워도 된다(`index.css`와 `main.tsx`는 그대로 둔다).

> 다른 React 프로젝트를 열어보면 `import { Dashboard } from "@/app/Dashboard"`처럼 `@/`로 시작하는 import를 보게 될 수 있다. 패키지가 아니라 `tsconfig.json`의 `paths` 설정(`"@/*": ["./src/*"]`)으로 만든 경로 별칭이다. `../../../components/...`처럼 상대경로가 길어지는 걸 피하려고 프로젝트 루트(보통 `src/`) 기준 절대경로처럼 쓰게 해둔 것이다.

## 2. 1단계: 정적 목록 렌더링

`src/api.ts`를 만들어 주문 데이터를 정의한다. 아직 fetch는 없다.

```ts
// src/api.ts
export type Order = { id: number; user: string; price: number; paid: boolean };

export const ORDERS: Order[] = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 102, user: "lee", price: 8000, paid: false },
  { id: 103, user: "kim", price: 5000, paid: true },
  { id: 104, user: "park", price: 7000, paid: true }, // 취소되어 상세 조회는 안 된다(3단계에서 쓴다)
];
```

`src/OrderList.tsx`를 만든다.

```tsx
// src/OrderList.tsx
import type { Order } from "./api";

// props: 부모 컴포넌트가 넘겨주는 입력값의 모양
type Props = { orders: Order[] };

export function OrderList({ orders }: Props) {
  return (
    <ul>
      {orders.map((o) => (
        <li key={o.id}>
          #{o.id} {o.user} - {o.price.toLocaleString()}원 {o.paid ? "(결제완료)" : "(미결제)"}
        </li>
      ))}
    </ul>
  );
}
```

템플릿의 `src/App.tsx`를 통째로 교체한다.

```tsx
// src/App.tsx
import { ORDERS } from "./api";
import { OrderList } from "./OrderList";

export default function App() {
  return (
    <main>
      <h1>주문 관리</h1>
      {/* 속성 orders={...}가 OrderList의 props로 전달된다 */}
      <OrderList orders={ORDERS} />
    </main>
  );
}
```

```sh
npm run dev
```

### 여기 쓰인 것들

#### 컴포넌트는 함수다

컴포넌트는 "화면 조각을 돌려주는 함수"다. 그 이상의 장치는 없다. `OrderList`는 `(props) => JSX`이고, 같은 `orders`를 넣으면 항상 같은 화면을 그린다. 클래스도 템플릿도 아니라서 `OrderList({ orders: ORDERS })`처럼 직접 호출해도 JSX 값이 그대로 나온다. 다만 그렇게 부르면 React가 그 호출을 독립된 컴포넌트로 인식하지 못해(뒤에 나오는 state 저장소가 따로 생기지 않는다) 실제로는 항상 `<OrderList ... />` 형태로 쓴다.

평범한 함수가 컴포넌트로 취급되는 조건은 두 가지뿐이다.

- 이름이 대문자로 시작한다. JSX에서 소문자 태그(`<li>`)는 HTML 태그로 번역되고, 대문자 태그(`<OrderList>`)만 같은 이름의 함수 호출로 번역된다.

- JSX(또는 `null`)를 돌려준다.

#### props는 함수의 인자다

`props`는 JSX 속성으로 넘긴 값들을 하나의 객체로 묶은 것이다. `<OrderList orders={ORDERS} />`는 사실상 `OrderList({ orders: ORDERS })`이고, `OrderList({ orders }: Props)`의 구조 분해(0장 1절)는 그 객체에서 `orders` 키를 꺼낸 것이다.

그래서 props는 전역 변수가 아니다. 호출할 때 넘긴 인자이고, 받은 함수 안에서만 보인다. `OrderList`에서 `orders`를 쓸 수 있는 이유는 "`App`이 위쪽에서 `ORDERS`를 import해 뒀기 때문"이 아니라 "`App`이 `OrderList`를 그릴 때 인자로 넘겼기 때문"이다. `App`이 `orders={...}`를 빼면 `OrderList`는 그 값을 볼 방법이 없다.

props는 읽기 전용이기도 하다. 자식이 `orders.push(...)`나 `props.orders = []`로 받은 값을 고쳐도 부모가 가진 값이 갱신되거나 화면이 다시 그려지지 않는다(6단계에서 state를 직접 바꿨을 때와 같은 이유다).

#### 부모와 자식은 "누가 누구를 그리는가"로 정해진다

파일 위치나 import 방향으로는 알 수 없다. **JSX 안에 `<OrderList />`를 쓴 쪽이 부모**다. 여기서는 `App`의 JSX에 `<OrderList ... />`가 있으므로 `App`이 부모, `OrderList`가 자식이다. `OrderList.tsx`만 따로 읽고 부모를 알아낼 방법은 없다. 누가 부모인지는 그 컴포넌트를 import해서 JSX에 쓴 파일을 찾아야 알 수 있고, 같은 컴포넌트를 여러 곳에서 쓰면 부모도 여러 개다. 실행 중인 화면에서는 React Developer Tools의 컴포넌트 트리가 이 관계를 그대로 보여준다(10.2절).

구분해 둘 것이 하나 있다. JSX의 들여쓰기 중첩이 곧 부모-자식 관계는 아니다. `OrderList`가 그리는 `<ul>` / `<li>`는 한 컴포넌트가 돌려주는 DOM 태그의 중첩일 뿐이고, 그 셋은 모두 `OrderList` 하나가 만든다. 컴포넌트 부모-자식은 **대문자로 시작하는 컴포넌트 태그가 다른 컴포넌트의 JSX에 등장할 때** 생긴다.

```tsx
<main>               {/* App이 그리는 DOM 태그 */}
  <h1>주문 관리</h1>  {/* 역시 App이 그리는 DOM 태그 */}
  <OrderList ... />   {/* 여기서 자식 컴포넌트가 생긴다 */}
</main>
```

> 컴포넌트 태그 사이에 JSX를 끼워 넣는 `<Card><p>내용</p></Card>` 형태도 있다. 중첩된 JSX가 `props.children`이라는 이름의 props로 전달되는 것이어서, 이것도 결국 "부모가 자식에게 인자를 넘기는" 같은 이야기다. 이 문서에서는 쓰지 않는다.

#### JSX는 값을 만드는 표현식이다

브라우저는 이 문법을 모르기 때문에 빌드 단계에서 함수 호출로 바뀐다(`<li>...</li>` → `jsx("li", { children: [...] })`).

그래서 `{}` 안에는 표현식만 쓸 수 있으며 `if`/`for` 문은 못 쓰고 `map`을 쓴 이유다.

#### `key`는 반드시 고유 ID여야 한다

지금은 `o.id`를 썼다. 왜 index를 쓰면 안 되는지는 7단계에서 직접 겪는다.

#### HTML과 다른 점

- `class`가 아니라 `className`을 쓴다(지금은 안 썼지만 곧 쓴다).

- 태그는 반드시 닫는다(`<input />`).

- 컴포넌트 이름은 대문자로 시작한다.

## 3. 2단계: 선택 상태와 콜백 props

목록에서 주문을 고르면 상세를 보여줄 자리를 만든다. 아직 fetch는 없고, 고른 주문을 `ORDERS`에서 바로 찾아 보여준다.

`src/OrderList.tsx`

```tsx
// onSelect 콜백 추가
import type { Order } from "./api";

type Props = {
  orders: Order[];
  onSelect: (id: number) => void; // 자식에서 부모로 이벤트를 올리는 방법: 콜백 props
};

export function OrderList({ orders, onSelect }: Props) {
  return (
    <ul>
      {orders.map((o) => (
        <li key={o.id}>
          <button onClick={() => onSelect(o.id)}>
            #{o.id} {o.user} - {o.price.toLocaleString()}원 {o.paid ? "(결제완료)" : "(미결제)"}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// src/App.tsx
import { useState } from "react";
import { ORDERS } from "./api";
import { OrderList } from "./OrderList";

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // state가 아니라 매 렌더링마다 새로 계산하는 값이다
  const selected = ORDERS.find((o) => o.id === selectedId);

  return (
    <main>
      <h1>주문 관리</h1>
      {/* setter 자체를 넘긴다. 자식이 onSelect(101)을 부르면 selectedId가 101로 바뀌고 화면이 다시 그려진다 */}
      <OrderList orders={ORDERS} onSelect={setSelectedId} />
      {selected && <p>선택됨: #{selected.id} {selected.user}</p>}
    </main>
  );
}
```

### JSX 문법

- `onClick={함수}`: 클릭했을 때 실행할 함수를 넘긴다. `onClick={onSelect(o.id)}`처럼 쓰면 렌더링하는 순간 바로 호출되므로 `() => onSelect(o.id)`로 감싼다(0장 2절에서 본 "괄호를 붙이면 넘기기 전에 실행된다"와 같은 이야기다).
- `{조건 && <요소 />}`: 조건이 참일 때만 요소를 그린다. `selected`가 `undefined`면 아무것도 그리지 않는다. 숫자를 조건으로 쓸 때의 함정은 아래 "조건부 렌더링과 `&&`의 함정"에서 다룬다.

#### 조건부 렌더링과 `&&`의 함정

JSX의 `{}` 안에는 표현식만 들어가므로(1단계 "JSX는 값을 만드는 표현식이다"), "조건에 따라 그리기"도 `if`문이 아니라 값을 돌려주는 연산자로 쓴다.

```tsx
{selected && <p>선택됨: #{selected.id}</p>} // 참일 때만 그린다
{selected ? <p>선택됨: #{selected.id}</p> : <p>선택 안 됨</p>} // 둘 중 하나를 그린다
```

`A && B`는 JS 연산자 그대로라서 `A`가 거짓이면 **`A` 자체**를 돌려준다. React는 `false`, `null`, `undefined`, `true`는 화면에 아무것도 그리지 않지만, **숫자 `0`은 글자로 그린다.**

```tsx
const reviewed: number[] = [];
<p>{reviewed.length && <span>있음</span>}</p> // 결과 HTML: <p>0</p>
<p>{reviewed.length > 0 && <span>있음</span>}</p> // 결과 HTML: <p></p>
```

| 조건의 값 | `{조건 && <X />}` 결과 |
|---|---|
| `false`, `null`, `undefined` | 아무것도 안 그림 |
| `0` | 화면에 "0"이 찍힘 |
| `""`(빈 문자열) | 아무것도 안 보임(빈 텍스트) |
| 객체, 0이 아닌 숫자 | `<X />`를 그림 |

- `&&` 왼쪽에는 `> 0`, `!== null`처럼 결과가 `true`/`false`인 비교식을 두는 습관을 들인다. 6단계의 `reviewed.length > 0 ? ... : "없음"`도 그렇게 썼다.
- 조건이 길어지면 3단계의 조기 반환(`if (...) return <p>...</p>`)처럼 JSX 밖으로 빼는 편이 읽기 쉽다.

> C의 `&&`는 결과가 항상 `0`/`1`이지만, JS의 `&&`는 피연산자 값 자체를 돌려준다. 그 차이가 화면에 "0"으로 드러난다.

### React API

- `useState<T>(초기값)`: 화면에 영향을 주는 값(state)을 컴포넌트에 기억시키는 훅(hook)이다. `[현재 값, 값을 바꾸는 함수]` 쌍을 반환하므로 배열 구조 분해로 이름을 지어 받는다. 함수가 다시 실행돼도 값이 남는 이유는 아래 "`useState`: 함수가 다시 불려도 값이 남는 이유"에서 다룬다.

#### 훅(hook)이란

훅은 이름이 `use`로 시작하는 React 함수이고, 하는 일은 "렌더링 함수 안으로 React의 기능을 끌어오기"다. 컴포넌트는 호출될 때마다 처음부터 다시 실행되는 함수이므로(1단계 "컴포넌트는 함수다"), 그 함수 혼자서는 값을 기억하거나(`useState`), 화면 밖의 일을 시키거나(`useEffect`, 3단계), 함수의 동일성을 유지할(`useCallback`, 7단계) 수 없다. 훅은 그 일을 React에 맡기고 결과만 받아오는 창구다.

그래서 훅은 아무 데서나 부를 수 있는 유틸 함수가 아니다. "지금 이 컴포넌트를 렌더링하는 중"이라는 맥락이 있어야 동작하므로 컴포넌트 함수 본문(또는 다른 훅 안, 7단계의 커스텀 훅)에서만 부른다. 이벤트 핸들러나 일반 함수 안에서는 쓸 수 없다.

#### `useState`: 함수가 다시 불려도 값이 남는 이유

`App`은 그냥 함수이고, 리렌더링은 이 함수를 처음부터 다시 호출하는 것이다. 그런데 함수 안의 `const [selectedId, ...]`는 매번 새로 만들어지는 지역 변수인데도 이전 값을 기억한다.

값이 함수 안이 아니라 **React가 컴포넌트마다 따로 관리하는 저장소**에 있기 때문이다. React는 그 컴포넌트에서 훅이 **몇 번째로 호출됐는지**(호출 순서)로 칸을 구분해서, 매 렌더링마다 같은 순서의 칸에 든 값을 돌려준다.

```tsx
export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null); // 1번 칸
  const [reviewed, setReviewed] = useState<number[]>([]); // 2번 칸(6단계에서 추가)
  // 첫 렌더링: 칸을 만들고 초기값을 넣는다
  // 다음 렌더링부터: 초기값은 무시하고 1번 칸, 2번 칸에 든 값을 순서대로 돌려준다
}
```

여기서 "호출 순서"는 코드의 줄 번호가 아니라 **실행 중 몇 번째로 불렸는지**다. 줄 번호가 기준이라면 조건문 안에 넣어도 괜찮을 것이다. 실제로는 React가 렌더링 중에 훅이 불릴 때마다 내부 카운터를 하나씩 올리고 그 번호의 칸을 쓴다. 그래서 두 훅 사이에 주석 100줄을 끼워 넣어도 칸은 그대로지만, 앞의 훅 하나가 조건 때문에 안 불리면 뒤의 훅이 1번 칸을 가져가 버린다.

칸이 어디에 있는지도 짚어두면, state는 컴포넌트 함수의 지역 변수(스택)가 아니라 React가 그 컴포넌트마다 하나씩 들고 있는 저장소(힙 쪽)에 있다. 그래서 함수 호출이 끝나도 값이 남고, 다음 호출에서 `useState(null)`의 초기값을 다시 넘겨도 무시된 채 저장된 값이 나온다. 이 칸이 비워지는 시점은 그 컴포넌트가 화면에서 사라질(언마운트될) 때다. 같은 컴포넌트를 두 군데에 그리면 저장소도 둘이어서 서로의 state에 영향을 주지 않는다.

그래서 훅에는 "**컴포넌트 최상위에서, 매번 같은 순서로 호출한다**"는 규칙이 있다. `if` 안에서 훅을 부르면 렌더링마다 호출 순서가 달라져 칸이 엇갈린다.

```tsx
if (selectedId !== null) {
  const [note, setNote] = useState(""); // 잘못: 조건에 따라 호출 순서가 달라진다
}
```

`npm run lint`는 이것을 에러로 잡는다(1장 준비에서 본 Hook 규칙 검사).

```text
error react-hooks(rules-of-hooks): React Hook "useState" is called conditionally. React Hooks must be called in the exact same order in every component render.
```

- 초기값(`useState(null)`의 `null`)은 첫 렌더링에서만 쓰인다. 이후 렌더링에서 다른 값을 넘겨도 무시된다.
- setter를 불러도 지금 실행 중인 함수의 `selectedId`는 바뀌지 않는다. 바뀐 값은 다음 렌더링에서 함수가 다시 호출될 때 받는다(10.1절에서 직접 확인한다).

> C로 치면 함수 안의 `static` 변수와 비슷하게 호출이 끝나도 값이 남지만, 저장 위치는 함수가 아니라 컴포넌트 인스턴스마다 하나씩 있는 배열이고 인덱스는 호출 순서다.

### 여기 쓰인 것들

#### 단방향 데이터 흐름

데이터는 부모(`App`) → 자식(`OrderList`)으로 props(`orders`, `onSelect`)로만 내려간다.

자식이 부모 state(`selectedId`)를 바꾸려면 부모가 내려준 함수(`onSelect`)를 호출해야 한다. 자식이 부모 state를 직접 건드릴 방법은 없다.

#### 콜백 props: 자식이 부른 함수가 부모에서 실행된다

`onSelect`는 자식이 새로 뚫은 통로가 아니다. 부모가 **자기 쪽 함수를 인자로 내려준 것**이고 자식은 그걸 호출만 한다. 여기서는 부모가 `setSelectedId`를 그대로 내려줬으니, 자식의 `onSelect(101)`은 부모의 `setSelectedId(101)`과 같은 호출이다.

자식이 `type Props`에 `onSelect`를 적었다고 값이 부모로 흘러가는 것도 아니다. 그 선언은 "이런 모양의 함수를 하나 받겠다"는 요구사항일 뿐이고, 실제로 무엇이 실행될지는 부모가 `onSelect={...}`에 무엇을 넘겼는지로 정해진다. 부모가 안 넘기면 타입 에러고, 다른 함수를 넘기면 다른 일이 일어난다.

```tsx
// 부모(App): 자식이 id를 올려주면 할 일을 정해서 내려준다
<OrderList orders={ORDERS} onSelect={setSelectedId} />
// 같은 뜻을 길게 쓰면 이렇다
<OrderList orders={ORDERS} onSelect={(id) => setSelectedId(id)} />

// 자식(OrderList): 받은 함수를 부른다. 그 함수가 무슨 일을 하는지는 모른다
<button onClick={() => onSelect(o.id)}>
```

값이 부모에 도달하는 것도 "공유 변수를 자식이 고쳐서"가 아니라 **인자로 올라가서**다. 자식은 `o.id`를 함수 호출의 인자로 건네고, 그 함수가 품고 있는 렉시컬 환경(0장 4절의 클로저)은 부모 쪽이므로 실행되는 코드와 바뀌는 state는 전부 부모 것이다. 자식은 부모의 `selectedId`를 읽지도 쓰지도 못한다. 자식이 그 값을 알아야 한다면 부모가 props로 따로 내려줘야 한다.

흐름을 한 줄로 정리하면 이렇다. 값은 부모에서 자식으로만 내려가고(props), 사건은 자식이 올리지만(콜백 호출) 처리와 state 변경은 부모에서 일어난다.

#### `useState`의 setter를 호출하면 리렌더링된다

`setSelectedId`가 불리면 `App` 함수가 다시 실행되어 새 `selected`를 계산하고, 화면이 그 결과로 갱신된다(Virtual DOM diffing으로 바뀐 부분만 실제 DOM에 반영).

#### `selected`는 state가 아니라 렌더링 중에 계산한 값(파생값)이다

`selectedId`만 있으면 언제든 다시 구할 수 있는 값을 별도 state로 두지 않는다. 이 원칙은 3단계에서 다시 나온다.

## 4. 3단계: 비동기 상세 조회 붙이기

지금까지는 `ORDERS`에서 바로 찾았다. 실제로는 상세 정보를 서버에서 따로 가져온다고 가정하고, `api.ts`에 Mock 비동기 조회를 추가한다.

```ts
// src/api.ts에 추가
const DB = ORDERS.filter((o) => o.id !== 104); // 104는 취소되어 상세 조회 대상에서 빠져 있다

// 주문마다 응답 시간을 다르게. 
// 101은 느리고 102는 빠르다(4단계의 경쟁 상태를 만들기 위한 장치).
const LATENCY: Record<number, number> = { 101: 1200, 102: 200, 103: 600 };
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchOrder(id: number): Promise<Order> {
  await delay(LATENCY[id] ?? 300); // 표에 없는 id면 기본 300ms
  const order = DB.find((o) => o.id === id);
  // 화면에 그대로 보여 줄 문구라서 사용자용 문장으로 던진다(목표 표의 104번 동작)
  if (!order) throw new Error("이 주문은 취소되어 상세 정보가 없습니다");
  return order;
}
```

상세를 보여줄 `OrderDetail.tsx`를 만든다.

```tsx
// src/OrderDetail.tsx
import { useEffect, useState } from "react";
import { fetchOrder, type Order } from "./api";

type Props = { orderId: number };

// 결과에 "어느 orderId에 대한 것인지"를 같이 저장한다(아래의 "로딩 중" 판단과 4단계의 경쟁 상태에서 쓰인다).
type Loaded =
  | { id: number; ok: true; order: Order }
  | { id: number; ok: false; error: string };

export function OrderDetail({ orderId }: Props) {
  // 아직 응답이 안 왔을 때는 null
  const [result, setResult] = useState<Loaded | null>(null);

  useEffect(() => {
    fetchOrder(orderId)
      .then((order) => setResult({ id: orderId, ok: true, order }))
      // e는 unknown이라 Error인지 확인한 뒤 message를 꺼낸다
      .catch((e: unknown) =>
        setResult({ id: orderId, ok: false, error: e instanceof Error ? e.message : String(e) }),
      );
  }, [orderId]); // orderId가 바뀔 때만 재실행

  // 응답이 없거나, 응답이 이전 주문 것이면 "로딩 중"으로 본다
  if (result === null || result.id !== orderId) return <p>불러오는 중...</p>;
  if (!result.ok) return <p role="alert">{result.error}</p>;

  // 위에서 실패 경우를 걸러냈으므로 여기서는 TS가 result.order가 있다고 안다(타입 좁히기)
  return (
    <div>
      <h2>#{result.order.id} {result.order.user}</h2>
      <p>{result.order.price.toLocaleString()}원 · {result.order.paid ? "결제완료" : "미결제"}</p>
    </div>
  );
}
```

`App.tsx`에서 `selected` 계산 대신 이 컴포넌트를 쓴다.

```tsx
// src/App.tsx
import { useState } from "react";
import { ORDERS } from "./api";
import { OrderList } from "./OrderList";
import { OrderDetail } from "./OrderDetail";

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <main>
      <h1>주문 관리</h1>
      <OrderList orders={ORDERS} onSelect={setSelectedId} />
      {/* selectedId가 null이 아닐 때만 그린다. 이 안에서는 TS가 selectedId를 number로 좁혀 준다 */}
      {selectedId !== null && <OrderDetail orderId={selectedId} />}
    </main>
  );
}
```

101번을 클릭하면 "불러오는 중..." 후 약 1.2초 뒤 카드가 뜨고, 104번을 클릭하면 약 0.3초 뒤 에러 문구가 뜬다.

### JSX 문법

- 조기 반환(`if (...) return <p>...</p>`): 컴포넌트도 함수라서 조건에 따라 다른 JSX를 일찍 반환할 수 있다. `{}` 안의 `&&`/삼항과 함께 조건부 렌더링을 쓰는 방법이다(2단계 "조건부 렌더링과 `&&`의 함정").
- `role="alert"`: 스크린 리더가 즉시 읽어 주는 알림 영역이라는 표시다.

### React API

`useEffect`를 쓰는 이유와 의존성 배열의 의미는 아래 "여기 쓰인 것들"에서 다룬다.

- `useEffect(함수, 의존성 배열)`: 데이터 요청이나 타이머처럼 "화면을 그리는 것 외의 일"을 컴포넌트가 화면에 그려진 뒤 실행한다. effect 안에서 `await` 대신 `.then`을 쓴 이유는 아래 "effect 함수에 `async`를 바로 붙이지 않는 이유"에서 다룬다.

#### effect 함수에 `async`를 바로 붙이지 않는 이유

0장 5절의 `async/await`를 배웠으니 `useEffect(async () => { ... })`로 쓰고 싶어진다. 하지만 effect 함수가 돌려줄 수 있는 것은 **아무것도 없거나(`undefined`), cleanup 함수** 둘뿐이다(cleanup은 4단계에서 쓴다). `async` 함수는 항상 Promise를 돌려주므로 이 약속을 깬다.

```tsx
// 잘못: async 함수는 Promise를 돌려준다. React는 이것을 cleanup 함수로 받으려 한다
useEffect(async () => {
  const order = await fetchOrder(orderId);
  setResult({ id: orderId, ok: true, order });
}, [orderId]);
```

이렇게 쓰면 세 군데에서 막힌다.

- `npm run build`의 타입 검사(`tsc`): `Type 'Promise<void>' is not assignable to type 'void | Destructor'.`(TS2345)
- `npm run lint`: `react-hooks(exhaustive-deps): Effect callbacks are synchronous to prevent race conditions.` 경고
- 실행 중: 개발 모드 콘솔에 `useEffect must not return anything besides a function, which is used for clean-up.` 경고가 찍히고, 컴포넌트가 사라질 때 React가 Promise를 cleanup으로 호출하려다 `TypeError: destroy is not a function`이 난다.

`await`를 쓰고 싶다면 effect 안에 `async` 함수를 따로 만들고 바로 호출한다. 이 문서처럼 `.then`/`.catch`로 쓰는 것과 동작은 같다.

```tsx
useEffect(() => {
  async function load() {
    try {
      const order = await fetchOrder(orderId);
      setResult({ id: orderId, ok: true, order });
    } catch (e: unknown) {
      setResult({ id: orderId, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  load(); // effect 함수 자체는 아무것도 돌려주지 않는다
}, [orderId]);
```

> effect 함수의 반환값 자리는 "정리할 때 부를 함수"를 위해 예약되어 있다. Promise를 그 자리에 넣을 수 없어서 `async`를 한 단계 안으로 넣는다.

### 여기 쓰인 것들

#### `useEffect`는 렌더링 밖의 일(부작용)을 처리하는 자리다

컴포넌트 함수 본문에서 직접 `fetchOrder()`를 호출하면 렌더될 때마다 실행돼버린다. 반드시 `useEffect` 안에서 한다.

#### 의존성 배열 `[orderId]`

`orderId`가 바뀔 때만 effect를 다시 실행한다. 빠뜨리면 어떻게 되는지는 5단계에서 겪는다.

#### 로딩 여부를 state로 따로 두지 않았다

"로딩 중인가?"는 `result`와 현재 `orderId`를 비교해서 계산할 수 있는 정보다(`result === null || result.id !== orderId`).

이미 가진 값으로 계산 가능한 걸 별도 state로 두면 두 state를 항상 맞춰 줘야 하는 부담이 생긴다(하나만 갱신하고 잊으면 화면이 거짓말을 한다). effect 안에서 `setLoading(true)`를 부르느라 렌더도 한 번 더 일어난다.

> React 공식 문서의 "You Might Not Need an Effect"가 권하는 원칙이 이것이다.

#### `Loaded`는 판별 유니온이다

`ok`로 분기하면 각 분기에서 `.order`/`.error`가 안전하게 좁혀진다.

## 5. 4단계: 경쟁 상태를 만들고 고치기

지금 코드에는 버그가 하나 숨어 있다. **101번(느림, 1.2초)을 클릭하고 1초가 지나기 전에 102번(빠름, 0.2초)을 클릭**해본다.

1. 102번 응답이 먼저 도착해 카드가 "lee"로 바뀐다.
2. 약 1.2초 시점에 101번의 뒤늦은 응답이 도착해 `result`를 101번 것으로 덮어쓴다.
3. 이 코드에는 `result.id !== orderId` 검사가 있어서 101번 카드가 뜨지는 않지만, 대신 화면이 "불러오는 중..."으로 되돌아가 그대로 멈춘다(102번 응답은 이미 덮어써져 사라졌고, 더 올 응답도 없다).

id 검사가 없었다면 사용자가 102번을 골랐는데 101번 카드가 떴을 것이다.

> 어느 쪽이든 원인은 같다. 응답이 보낸 순서대로 도착한다는 보장이 없어서 생기는 경쟁 상태다.

`useEffect`에 cleanup을 추가해서 고친다.

```tsx
// src/OrderDetail.tsx
useEffect(() => {
  let cancelled = false; // 이 effect가 "여전히 유효한지" 표시하는 플래그
  fetchOrder(orderId)
    // then 콜백은 나중에 실행되지만 cancelled를 계속 기억한다(클로저)
    .then((order) => { if (!cancelled) setResult({ id: orderId, ok: true, order }); })
    .catch((e: unknown) => {
      if (!cancelled) setResult({ id: orderId, ok: false, error: e instanceof Error ? e.message : String(e) });
    });
  // effect가 반환한 함수가 cleanup이다
  return () => {
    cancelled = true; // orderId가 바뀌거나 언마운트되면 실행(이전 요청의 응답은 이제 무시)
  };
}, [orderId]);
```

같은 순서로 다시 클릭해본다. 이번엔 101번의 뒤늦은 응답이 `cancelled`에 걸려 무시되고, 102번(lee) 상태가 그대로 유지된다.

### 왜 이런가

React는 `orderId`가 바뀌어 effect를 다시 실행하기 전에, 이전 effect가 반환한 cleanup 함수를 먼저 호출한다. 컴포넌트가 사라질 때도 호출한다.

그 안에서 `cancelled = true`로 표시해두면, 나중에 도착하는 이전 요청의 `.then`이 `if (!cancelled)`에 걸려 `setResult`를 건너뛴다.

> React 17까지 있던 "언마운트된 컴포넌트에 setState" 경고는 18에서 제거됐다. 이 패턴이 막는 건 경고가 아니라 실제 데이터 덮어쓰기다.

## 6. 5단계: 의존성 배열을 빠뜨리면

`useEffect(..., [orderId])`의 `[orderId]`를 잠깐 `[]`로 바꾸고 확인한다.

101번을 클릭하면 정상 동작한다. 이어서 102번을 클릭하면 **"불러오는 중..."에서 멈춘 채 넘어가지 않는다.**

effect가 최초 렌더 시점의 `orderId`(101)를 붙든 채 다시 실행되지 않기 때문이다(클로저가 오래된 값을 붙드는 현상). `npm run lint`를 돌리면 `orderId`가 의존성에서 빠졌다고 알려준다.

```text
src/OrderDetail.tsx:16:16: warning react-hooks(exhaustive-deps): React Hook useEffect has a missing dependency: 'orderId' help: Either include it or remove the dependency array.
```

경고(warning)라서 종료 코드는 0이다. 린트 출력을 읽지 않으면 놓친다.

> ESLint를 쓰는 프로젝트라면 같은 검사가 `react-hooks/exhaustive-deps`라는 이름으로 나온다.

`[orderId]`로 원복한다.

## 7. 6단계: state를 직접 바꾸면

"검토 완료" 표시 기능을 추가한다. 먼저 일부러 틀리게 만들어서 문제를 본다.

```tsx
// src/App.tsx
import { useState } from "react";
import { ORDERS } from "./api";
import { OrderList } from "./OrderList";
import { OrderDetail } from "./OrderDetail";

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState<number[]>([]);

  function handleReview(id: number) {
    reviewed.push(id); // 잘못: 배열을 그 자리에서 직접 변경
    setReviewed(reviewed); // 잘못: 같은 참조를 그대로 넘김
  }

  return (
    <main>
      <h1>주문 관리</h1>
      <OrderList orders={ORDERS} onSelect={setSelectedId} />
      {selectedId !== null && (
        <>
          <OrderDetail orderId={selectedId} />
          <button onClick={() => handleReview(selectedId)}>검토 완료로 표시</button>
        </>
      )}
      <p>검토 완료: {reviewed.length > 0 ? reviewed.join(", ") : "없음"}</p>
    </main>
  );
}
```

101번을 고르고 "검토 완료로 표시"를 눌러본다. "검토 완료: 없음" 그대로다.

그런데 다른 이유로 `App`이 리렌더링되면(예: 다른 주문을 클릭해 `selectedId`가 바뀌거나, 다음 단계에서 만들 정렬 토글을 누르면) 그제서야 "101"이 나타난다.

값은 이미 바뀌어 있었는데 화면은 갱신되지 않은 것이다.

- `reviewed.push(id)`는 같은 배열을 그 자리에서 변경한다.

- `setReviewed(reviewed)`는 React 입장에서 "이전과 같은 참조"를 받는다.

- React는 참조 비교로 변경 여부를 판단하므로 리렌더링을 건너뛴다.

> JavaScript의 "객체는 참조 공유" 원리가 여기서 그대로 문제가 된다.

새 배열을 만들어 넘기도록 고친다.

```tsx
function handleReview(id: number) {
  // setter에 함수를 넘기면 최신 state가 prev로 들어오고, 반환값이 새 state가 된다
  // [...prev, id]는 새 배열이라 참조가 달라져 리렌더링된다. 이미 있으면 prev를 그대로 둔다
  setReviewed((prev) => (prev.includes(id) ? prev : [...prev, id]));
}
```

이제 버튼을 누르면 즉시 "검토 완료: 101"로 바뀐다.

### JSX 문법

- Fragment(`<> ... </>`): 화면에 태그를 추가하지 않고 여러 요소를 하나로 묶는 빈 껍데기다. JSX는 최상위 요소가 하나여야 해서 쓴다. JSX 하나가 함수 호출 하나로 바뀌는 값이기 때문이다(1단계 "JSX는 값을 만드는 표현식이다").

## 8. 7단계: 정렬 토글과 key 함정

"최신순/오래된순" 토글 버튼을 추가한다. 로직 재사용을 위해 커스텀 훅으로 뺀다.

```ts
// src/useToggle.ts
import { useCallback, useState } from "react";

export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  // as const: [boolean, () => void] 순서가 고정된 튜플로 추론시켜 [value, toggle]로 구조 분해해 쓰게 한다
  return [value, toggle] as const;
}
```

`OrderList.tsx`에 체크박스를 하나 추가해서, 정렬이 바뀔 때 항목별 상태가 어떻게 되는지 눈으로 볼 수 있게 한다. **먼저 index를 key로 써서 문제를 만든다.**

`src/OrderList.tsx`

```tsx
// 일부러 index를 key로 (import와 Props 타입은 그대로 둔다)
export function OrderList({ orders, onSelect }: Props) {
  return (
    <ul>
      {/* map 콜백의 두 번째 인자 i는 배열 위치(0, 1, 2...) */}
      {orders.map((o, i) => (
        // 잘못: key가 위치(i)라서 목록 순서가 바뀌면 React가 "n번째 칸"을 기준으로 DOM을 잘못 재사용한다
        <li key={i}>
          <input type="checkbox" aria-label={`${o.user} 확인`} />{" "}
          <button onClick={() => onSelect(o.id)}>
            #{o.id} {o.user} - {o.price.toLocaleString()}원 {o.paid ? "(결제완료)" : "(미결제)"}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`src/App.tsx`

```tsx
// 토글 추가 (import는 맨 위, 나머지 두 줄은 App 함수 안 useState들 아래, 버튼은 <OrderList> 바로 위)
import { useToggle } from "./useToggle";
// ...
const [reversed, toggleReversed] = useToggle();
// reverse는 원본을 바꾸므로 먼저 spread로 복사본을 만든 뒤 뒤집는다
const visibleOrders = reversed ? [...ORDERS].reverse() : ORDERS;
// ...
<button onClick={toggleReversed}>최신순/오래된순</button>
<OrderList orders={visibleOrders} onSelect={setSelectedId} />
```

첫 번째 항목(101번)의 체크박스를 체크한 뒤 "최신순/오래된순"을 눌러본다. 체크는 **101번을 따라가지 않고 맨 위 칸에 남아**, 이제 그 자리에 온 104번 옆에 체크된 것처럼 보인다.

key가 "n번째 칸"이면 React는 DOM을 위치 기준으로 재사용하기 때문에, 체크박스의 내부 상태가 항목이 아니라 자리에 남는다.

`key={i}`를 `key={o.id}`로 고친다. 같은 순서로 다시 해보면 이번엔 체크가 101번을 따라 이동한다.

### JSX 문법

- `aria-label`: 화면에는 안 보이지만 스크린 리더가 읽는 이름이다.
- `{" "}`: JSX에서 공백 한 칸을 넣는 방법이다. 왜 필요한지는 아래 "JSX의 공백 처리"에서 다룬다.

#### JSX의 공백 처리

HTML은 태그 사이의 줄바꿈과 들여쓰기를 공백 한 칸으로 줄여서 보여 준다. JSX는 다르다. **줄바꿈이 들어간 공백은 통째로 지운다.** 그래서 코드를 보기 좋게 줄을 나눠 쓰면 요소들이 공백 없이 붙어 버린다.

```tsx
<li>
  <input type="checkbox" />
  <button>#101</button>
</li>
// 결과 HTML: <li><input type="checkbox"/><button>#101</button></li>

<li>
  <input type="checkbox" />{" "}
  <button>#101</button>
</li>
// 결과 HTML: <li><input type="checkbox"/> <button>#101</button></li>
```

- 같은 줄 안의 공백은 남는다. `#{o.id} {o.user}`에서 `}`와 `{` 사이의 공백이 화면에 보이는 이유다.
- `{" "}`는 "공백 한 칸짜리 문자열 값"을 넣는 것이라 줄바꿈 규칙에 지워지지 않는다.

> 화면에서 체크박스와 버튼이 딱 붙어 보이면 이 규칙을 먼저 의심한다. 간격을 넓히고 싶다면 공백 대신 CSS로 조정하는 편이 낫다.

### React API

- 커스텀 훅(`useToggle`): `use`로 시작하는 함수다. 여러 컴포넌트에서 반복되는 state 로직을 함수로 뽑아 재사용한다. state까지 공유되지는 않으며, 아래 "커스텀 훅은 로직을 나누지 state를 나누지 않는다"에서 다룬다.
- `useCallback(함수, 의존성 배열)`: 함수를 렌더링마다 새로 만들지 않고 같은 함수를 재사용하게 기억시킨다. 의존성 배열이 `[]`이면 처음 한 번만 만든다. 아래 "`useCallback`과 함수의 참조"에서 다룬다.

#### 커스텀 훅은 로직을 나누지 state를 나누지 않는다

`useToggle`은 특별한 React 기능이 아니라, 안에서 `useState`와 `useCallback`을 부르는 평범한 함수다. 이름이 `use`로 시작해야 하는 이유는, 린터가 이 함수를 훅 규칙(2단계 "`useState`: 함수가 다시 불려도 값이 남는 이유")을 지켜야 하는 함수로 알아보게 하기 위해서다.

여러 컴포넌트가 `useToggle()`을 부르면, 각 호출이 **자기 컴포넌트의 칸에 따로** `useState`를 만든다. 코드를 함께 쓸 뿐 값은 공유하지 않는다.

```tsx
function A() { const [open, toggleOpen] = useToggle(); /* ... */ }
function B() { const [open, toggleOpen] = useToggle(); /* ... */ }
// A에서 toggleOpen()을 불러도 A의 open만 true가 되고 B의 open은 false 그대로다
```

> C로 치면 함수 안의 `static` 변수가 아니라, 호출한 쪽마다 따로 넘기는 구조체에 상태를 담는 것에 가깝다. 같은 함수를 써도 상태는 호출한 쪽마다 하나씩이다.

#### `useCallback`과 함수의 참조

컴포넌트(와 커스텀 훅)는 렌더링마다 다시 실행되므로, 그 안에서 만든 화살표 함수도 렌더링마다 **새 함수 객체**가 된다. 내용이 같아도 참조가 다르다.

```js
const f = () => {};
const g = () => {};
console.log(f === g); // 출력: false (내용이 같아도 다른 객체)
console.log(f === f); // 출력: true
```

`useCallback(함수, [])`은 첫 렌더링에서 만든 함수를 저장해 두고, 의존성 배열의 값이 바뀌지 않는 한 다음 렌더링에서도 **같은 참조**를 돌려준다. 6단계에서 본 "React는 참조 비교로 변경 여부를 판단한다"는 원리와 이어지는 도구다.

여기서 의존성 배열을 `[]`로 둘 수 있는 이유는 `setValue((v) => !v)`처럼 **함수형 업데이트**를 썼기 때문이다. 현재 값 `value`를 직접 읽으면 5단계와 같은 "오래된 값을 붙드는" 문제가 생긴다.

```ts
// 잘못: 처음 만든 함수가 첫 렌더링의 value(false)를 계속 붙든다
const toggle = useCallback(() => setValue(!value), []);
// 몇 번을 눌러도 setValue(!false), 즉 true만 반복된다. 한 번 켜진 뒤로는 꺼지지 않는다

// 맞음: 최신 값은 React가 v로 넣어 준다
const toggle = useCallback(() => setValue((v) => !v), []);
```

- `useCallback`은 함수 생성 자체를 막는 게 아니라 "이전에 만든 것을 돌려줄지"를 고를 뿐이라 성능 이득은 크지 않다. 이 문서 규모에서는 없어도 동작이 같다.
- 어디서 효과가 나는지(`memo`, 다른 effect의 의존성 등)는 이 문서 범위 밖이다(12장 "이 문서가 다루지 않은 것").

> 의존성 배열에 값을 빼려면 그 값을 함수 안에서 읽지 않아야 한다. 함수형 업데이트가 그 방법이다.

## 9. 8단계: 개발 모드에서 두 번 실행되는 effect

`OrderDetail.tsx`의 effect 첫 줄에 `console.log("fetch 시작:", orderId);`를 추가하고, 페이지를 새로고침한 뒤 콘솔(F12)을 열고 아무 주문이나 클릭한다.

`fetch 시작: 101`이 **두 번** 찍힌다.

`src/main.tsx`가 앱을 `<StrictMode>`로 감싸고 있고, 개발 모드의 StrictMode는 컴포넌트가 처음 나타날 때 effect를 "실행 → cleanup → 다시 실행"해서 cleanup이 제대로 짜였는지 시험한다. 4단계에서 만든 `cancelled` cleanup 덕에 첫 번째 실행의 결과는 버려지고 화면은 정상이다.

> `npm run build && npm run preview`로 프로덕션 빌드를 열면 한 번만 찍힌다. 개발 모드에서만 있는 현상이지 버그가 아니다.

## 10. 9단계: React 화면과 비동기 흐름이 꼬일 때 디버깅하기

JS/TS의 `console.table`, DevTools, 브레이크포인트 디버깅은 React에서도 그대로 쓴다.

하지만 React는 "컴포넌트 렌더링 주기", "상태(state) 변경에 따른 리렌더링", "비동기 effect의 실행 순서"라는 레이어가 하나 더 얹혀 있다. 화면이 생각대로 그려지지 않거나 비동기 데이터가 꼬일 때 원인을 좁히는 최소한의 디버깅 방법을 정리한다.

### 10.1 상태 변경 흐름 눈으로 보기: `console.log` 위치의 차이

React 디버깅에서 가장 많이 하는 실수가 `setState` 바로 다음 줄에 `console.log`를 찍고 "왜 값이 안 바뀌었지?" 하고 당황하는 것이다.

```tsx
function handleReview(id: number) {
  setReviewed((prev) => [...prev, id]);
  // setState는 "지금 렌더링의 reviewed"를 바꾸지 않는다. 변경은 다음 렌더링 때 반영된다
  console.log(reviewed); // 잘못: 여전히 변경 전 상태가 찍힌다 (setState는 비동기적으로 동작)
}
```

상태가 정말 바뀌었는지 보려면 함수 내부가 아니라 **컴포넌트 본문(렌더링 영역)이나 `useEffect` 안**에서 찍어야 한다.

`src/App.tsx`

```tsx
// 기존 코드는 그대로 두고 아래 두 부분만 추가한다. useEffect는 "react"에서 import에 추가한다
export default function App() {
  const [reviewed, setReviewed] = useState<number[]>([]);

  // 맞음: 컴포넌트 본문은 렌더링될 때마다 실행되므로, 매 렌더링의 '진짜 최신 상태'가 보인다
  console.log("현재 reviewed 상태:", reviewed);

  useEffect(() => {
    // 맞음: reviewed 상태가 실제로 변경된 직후 후속 작업을 확인
    console.log("reviewed가 변경됨:", reviewed);
  }, [reviewed]); // reviewed가 바뀐 렌더링 직후에만 실행된다
  // ... return (...)은 그대로
}
```

### 10.2 React Developer Tools로 Props와 State 들여다보기

`console.log`를 일일이 찍는 대신 브라우저 확장 프로그램인 React Developer Tools의 Components 탭을 활용한다.

1. F12 개발자 도구를 열고 Components 탭으로 이동한다.
2. 좌측 트리에서 `OrderDetail` 또는 `OrderList` 컴포넌트를 클릭한다.
3. 우측 패널에서 현재 컴포넌트가 전달받은 Props, 보유하고 있는 State, 자신을 리렌더링하게 만든 Hook 상태를 실시간으로 확인한다.

비동기 응답 도착 전 `result` state가 `null`인지, `orderId` prop이 제대로 바뀌어 전달되었는지 코드 수정 없이 그 자리에서 확인할 수 있다.

### 10.3 브라우저 DevTools로 이벤트와 useEffect 한 줄씩 실행하기

React 컴포넌트 내부 코드도 브라우저 소스(Sources) 패널에서 브레이크포인트를 걸어 디버깅할 수 있다. Vite가 제공하는 소스맵(Source Map) 덕분에 컴파일된 JS가 아닌 `src/OrderDetail.tsx` 원본 파일에 바로 정지점을 찍을 수 있다.

`gcc -g`로 디버그 심볼(DWARF)을 넣어 빌드하면 `gdb`가 어셈블리가 아니라 `.c` 원본 줄 번호로 브레이크포인트를 걸어주는 것과 같은 원리다. 소스맵이 없으면(또는 프로덕션 빌드처럼 축소·번들된 코드라면) 압축된 JS 그대로 보이는 것도, 디버그 심볼 없이 스트립된 바이너리를 `gdb`로 열었을 때와 같은 상황이다.

- 이벤트 핸들러 디버깅: `OrderList.tsx`의 `onSelect(o.id)` 호출 줄에 브레이크포인트를 찍고 버튼을 누르면, 클릭 이벤트 발생 시점의 `o.id` 값을 스코프 변수 창에서 들여다볼 수 있다.

- Effect 실행 디버깅: `OrderDetail.tsx`의 `fetchOrder(orderId)` 호출 줄에 브레이크포인트를 찍으면, 클릭 시 effect가 발동되는 순간의 `orderId`와 cleanup 플래그(`cancelled`) 상태를 추적할 수 있다.

### 10.4 JSX 렌더링 조건과 계산된 값(파생값) 디버깅하기

화면에 원하는 UI가 뜨지 않는다면 렌더링 조건문 삼항 연산자나 `&&` 조건이 거짓(false)인지 확인해야 한다.

```tsx
// OrderDetail.tsx
// 이름표가 붙은 객체로 찍으면 어떤 값이 무엇인지 한눈에 보인다. result?.id는 result가 null이면 undefined다
console.log({ result, orderId, isSameId: result?.id === orderId });

if (result === null || result.id !== orderId) return <p>불러오는 중...</p>;
```

3단계에서 본 로딩 판단 조건문 바로 위에 객체 형태로 로그를 찍으면, "데이터는 왔는데 id가 달라서 로딩 문구에 걸린 건지", "아직 response 자체가 안 온 건지" 1초 만에 분기 원인을 좁힐 수 있다.

### 10.5 StrictMode 동작과 Cleanup 실행 순서 추적하기

8단계에서 다룬 StrictMode의 "두 번 실행" 동작이나 4단계의 경쟁 상태 Cleanup 동작이 혼란스러울 때는, lifecycle 로그를 직접 찍어 순서를 눈으로 확인한다.

```tsx
useEffect(() => {
  let cancelled = false;
  console.log(`[Effect 시작] orderId: ${orderId}`);

  fetchOrder(orderId).then((order) => {
    // 응답이 온 뒤에 실행된다. 그 사이 cleanup이 cancelled를 true로 바꿨는지 확인한다
    if (!cancelled) {
      console.log(`[성공 반영] orderId: ${orderId}`);
      setResult({ id: orderId, ok: true, order });
    } else {
      console.log(`[응답 무시됨(cancelled)] orderId: ${orderId}`);
    }
  });

  // 다음 effect가 실행되기 직전(또는 언마운트 시)에 React가 먼저 호출한다
  return () => {
    cancelled = true;
    console.log(`[Cleanup 실행] orderId: ${orderId}`);
  };
}, [orderId]);
```

101번을 누르고 1초 안에 102번을 누르면 콘솔에 다음과 같이 출력된다(프로덕션 빌드 기준).

1. `[Effect 시작] orderId: 101`
2. `[Cleanup 실행] orderId: 101` (102번 선택으로 인해 101번 effect cleanup)
3. `[Effect 시작] orderId: 102`
4. `[성공 반영] orderId: 102` (0.2초 만에 온 102번 응답 반영)
5. `[응답 무시됨(cancelled)] orderId: 101` (1.2초 시점에 뒤늦게 온 101번 응답 무시)

응답은 **요청한 순서가 아니라 도착한 순서**로 찍힌다는 게 핵심이다. 102번이 먼저 반영되고, 101번은 나중에 와서 버려진다.

> `npm run dev`(StrictMode)에서는 8단계에서 본 "실행 → cleanup → 다시 실행" 때문에 1번 앞쪽에 `[Effect 시작] 101` → `[Cleanup 실행] 101`이 한 쌍 더 찍히고, 마지막에 `[응답 무시됨(cancelled)] orderId: 101`도 두 번 찍힌다(버려진 첫 번째 실행의 응답까지 도착하기 때문이다).

### 시험해보기

1. 브라우저에서 F12를 눌러 React Developer Tools의 Components 탭을 연다.
2. 101번 주문을 클릭한 직후 `OrderDetail` 컴포넌트를 선택해 `result` state가 `null`에서 `{ id: 101, ok: true, ... }`로 변하는 과정을 우측 패널에서 관찰한다.

### 도전 과제

#### 1. effect 안에서 멈춰 보기

`OrderDetail.tsx`의 `useEffect` 안 맨 위에 `debugger;` 문을 추가하고 실행한 뒤 101번 주문을 클릭한다.

```sh
npm run dev
```

브라우저가 실행을 멈췄을 때 `orderId` 변수 값과 `cancelled` 변수의 초기값을 Sources 패널에서 확인한다.

두 변수는 각각 어떤 값으로 보이는가?

**답**

1. 101번을 클릭하면 `OrderDetail`이 처음 나타나며 effect가 실행되고 `debugger;` 줄에서 멈춘다. `orderId`는 `101`이다. effect 함수가 아니라 바깥 컴포넌트 함수의 props라서 Local이 아니라 Closure 스코프에 있다.
2. `cancelled`는 Local 스코프에 이름만 있고 값이 없다. `debugger;`가 `let cancelled = false;`보다 위에 있어 선언 줄이 아직 실행되지 않았기 때문이다. 이때 콘솔에 `cancelled`를 입력하면 ReferenceError가 난다.
3. Step over를 한 번 누르면 `let cancelled = false;` 줄에 멈출 뿐 아직 값이 없다. 한 번 더 눌러 그 줄을 지나야 `false`가 된다. 이것이 초기값이다.
4. 이어서 진행(Resume)하면 같은 자리에서 한 번 더 멈춘다. 8단계의 StrictMode가 effect를 "실행 → cleanup → 다시 실행"하기 때문이고, 프로덕션 빌드에서는 한 번만 멈춘다.

> `npm run lint`는 이 줄에 `eslint(no-debugger)` 경고를 낸다(경고라서 종료 코드는 0). 확인이 끝나면 지운다.

#### 2. index key가 재사용되는 모습 보기

`OrderList.tsx`에서 `key={o.id}`를 일부러 `key={i}`(index)로 되돌린다.

101번 체크박스를 체크하고, 브라우저 개발자 도구의 Elements 패널에서 맨 위 `li`를 선택해 둔 채 "최신순/오래된순"을 누른다. 선택해 둔 `li`가 항목을 따라 옮겨 가는지, 자리에 남아 안의 내용만 바뀌는지 관찰한다.

> key는 React가 내부에서만 쓰고 DOM 속성으로 그려지지 않아 Elements 패널에는 보이지 않는다. 각 칸의 key는 코드의 `key={i}`로 따져 본다.

선택해 둔 `li`는 어디에 있고, 순서를 뒤집기 전과 후에 각 칸의 key는 어떻게 되는가?

**답**

1. `key={i}`이면 뒤집기 전 key는 위에서부터 `0, 1, 2, 3`(101~104번)이고, 뒤집은 뒤에도 위에서부터 `0, 1, 2, 3`(104~101번)이다. key가 항목이 아니라 자리를 따라간다.
2. React는 같은 key를 같은 항목으로 보므로, 맨 위 `li`의 DOM을 그대로 두고 안의 글자만 104번 내용으로 바꾼다. 선택해 둔 `li`는 맨 위에 그대로 있다. 그래서 101번에 해 둔 체크가 맨 위 칸에 남아 104번 옆에 붙는다.
3. `key={o.id}`로 되돌리면 key가 `101~104`로 항목을 따라간다. 뒤집은 뒤 `key=101`인 `li`가 체크된 채 맨 아래로 옮겨지고, 선택해 둔 `li`도 그 노드라서 함께 맨 아래로 간다.

## 11. 완성 확인

```sh
npm run build # tsc -b && vite build. 타입 검사가 성공해야 번들을 만든다. 에러 없이 끝나야 한다
npm run lint # 에러 없이 끝나야 한다
```

- [ ] 목표의 표에 있는 모든 동작이 그대로 재현된다
- [ ] 4단계의 경쟁 상태를 직접 재현했고, cleanup으로 고쳐지는 것을 확인했다
- [ ] 6단계의 "state 직접 변경" 버그와 7단계의 "index key" 버그를 각각 직접 만들고 고쳤다
- [ ] 개발 모드에서 `fetch 시작`이 두 번 찍히는 이유와, 프로덕션에서는 한 번인 이유를 설명할 수 있다
- [ ] `OrderDetail`이 로딩 여부를 state로 두지 않고 계산하는 이유를 설명할 수 있다

## 12. 다음 단계

### 자가 점검

1. `reviewed.push(id); setReviewed(reviewed);`는 왜 화면을 갱신하지 못하는가? `setReviewed((prev) => [...prev, id])`는 왜 되는가?

2. 자식(`OrderList`)이 부모(`App`)의 state를 바꾸려면 어떻게 하는가? `OrderList.tsx`만 보고 누가 부모인지 알 수 있는가?

3. 훅의 "호출 순서"는 코드의 줄 번호와 무엇이 다른가? 조건문 안에서 훅을 부르면 왜 칸이 엇갈리는가?

4. `useEffect`의 의존성 배열이 `[]`일 때와 `[orderId]`일 때는 어떻게 다른가?

5. cleanup의 `cancelled` 플래그는 무엇을 막는가?

6. 개발 모드에서 effect가 두 번 실행되는 이유는? 그래도 앱이 깨지지 않아야 하는 이유는?

7. `key={index}`가 문제가 되는 상황과 해결책은?

### 이 문서가 다루지 않은 것

존재만 알아두면 된다.

- `useRef`, `useContext`, `useReducer`, `useMemo`/`useCallback`/`memo`(React Compiler가 상당 부분을 자동화해 준다)
- 폼 처리, React 19의 `use`/`Suspense`/`useTransition`/`useActionState`/`useOptimistic`
- 클라이언트 라우팅(React Router 등), 전역 상태 관리, TanStack Query 같은 데이터 페칭 라이브러리