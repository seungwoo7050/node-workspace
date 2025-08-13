# JavaScript: 주문 리포트 CLI

## 목표

Mock API에서 주문 데이터를 비동기로 가져와 사용자별 결제 합계와 1위를 출력하는 작은 Node 스크립트를 만든다.

```sh
node main.js
# 병렬 조회: 501ms 안팎
# 실패: page 3 not found
# 사용자별 합계: { kim: 17000, lee: 30000, park: 7000 }
# 1위: { name: 'lee', total: 30000 }
```

## 0. JS에 대한 사전지식

### 1. 컴파일 단계를 거치지 않는다.

C는 `gcc main.c -o main`으로 먼저 기계어 바이너리를 만든 후에 바이너리를 실행한다. 컴파일 단계와 실행 단계가 분리되어 있고, 컴파일이 끝나야 오류(문법/타입 등)를 알 수 있다. Node는 `node main.js`를 입력하는 순간 코드를 읽으면서 곧바로 실행한다.

```sh
gcc main.c -o main && ./main # C: 컴파일(1단계) → 실행(2단계) 각각 별개의 명령이 필요하다
node main.js # Node: 읽기와 실행이 한 명령 안에서 같이 일어난다
```

정확히는 V8(Node의 JS 엔진)도 내부적으로 기계어 컴파일을 하지만(JIT, Just-In-Time 컴파일), 그 컴파일은 실행 도중 필요한 부분만 그때그때 처리되고 개발자 눈에는 보이지 않는다. 중요한 점은 C의 오탈자/타입 실수는 컴파일 시점에 걸러지지만, **JS의 실수 상당수는 그 코드가 실제로 실행되는 순간에야 드러난다**는 것이다.

> 때문에 `node --watch main.js` 따위로 저장할 때마다 재실행하며 확인하는 습관이 중요하다.

### 2. 변수가 아니라 값이 타입을 가진다(동적 타입).

C에서는 `int x;`처럼 변수를 선언하는 순간 그 변수가 담을 수 있는 타입이 고정된다. 때문에 `x`에 문자열을 대입하면 컴파일러가 컴파일 에러를 낸다.

JS의 `let x = 1;`은 `x`라는 이름에 타입이 배정되지 않는다. 타입은 그 순간 담긴 값이 가지고 있으며 같은 변수에 다른 타입의 값을 재할당해도 아무런 문제가 일어나지 않는다.

```js
let x = 1; // 지금 x가 가리키는 값은 number 타입
x = "hello"; // 같은 변수 x에 string 값을 다시 대입해도 정상적으로 동작
console.log(typeof x); // 출력: "string". 지금 담긴 값의 타입을 알려준다
```

C로 비유하자면 `union { int i; double d; char *s; ... }`처럼 모든 변수가 태그된 유니온으로서 대입할 때마다 태그가 값에 맞춰 자동으로 갱신된다고 생각하면 된다.

이러한 자유로움은 간편하기도 하지만 한편으로는 실수를 컴파일 시점에 잡아주는 방어막이 없다는 뜻이기도 하다. 숫자가 필요한 자리에 문자열이 들어와도 실행해보기 전까지는 알 수 없으며 TS가 이 위에 정적 타입 검사를 다시 얹는 이유가 이 때문이다.

#### 유니온(Union, 공용체)

C와 관련된 지식이지만 JS를 이해하는 데 도움이 된다고 생각하여 이 섹션을 작성한다.

유니온은 모든 멤버가 동일한 메모리 공간을 공유하는 데이터 구조다. 일반적인 구조체는 멤버들이 각각의 메모리를 차지하지만 유니온은 선언된 멤버 중 가장 크기가 큰 데이터 타입의 크기만큼만 메모리를 할당받아 공유한다.

##### 메모리 동작 원리

`union { int i; double d; char *s; }` 선언 시, 가장 큰 멤버(8 Byte)의 크기만큼만 메모리가 할당된다. 모든 변수가 하나의 공간을 공유하므로 한 번에 단 하나의 멤버 값만 유효하며 새 값을 적재하면 기존 값은 덮어씌워진다.

##### 태그된 유니온의 동작 방식

유니온 자체는 "현재 어떤 타입이 저장되어 있는지"를 알지 못한다. 이를 해결하기 위해 타입 식별용 태그(`enum`)와 유니온을 하나의 구조체로 묶은 방식을 태그된 유니온이라 부른다.

```c
typedef struct {
    enum { TYPE_INT, TYPE_DOUBLE, TYPE_STRING } type; // 현재 타입 식별 태그
    union {
        int i;
        double d;
        char *s;
    } value;
} Value;
```

##### 실제 동작 예시

Python, JavaScript 같은 동적 타입 언어의 내부 구현 원리가 이와 비슷하다. 변수 하나에 정수, 문자열 등 다양한 타입의 값을 자유롭게 대입할 수 있는 이유는 언어 엔진 내부의 모든 변수가 태그(현재 타입) + 유니온(실제 데이터) 형태의 구조체로 다루어지기 때문이다.

```c
Value v;

// 1. 정수 10 대입
v.type = TYPE_INT;
v.value.i = 10;
// 메모리 상태: [TYPE_INT | 10 (4 Byte) | 사용 안 함]

// 2. 실수 3.14를 재할당(기존 정수 값은 덮어씌워진다)
v.type = TYPE_DOUBLE;
v.value.d = 3.14;
// 메모리 상태: [TYPE_DOUBLE | 3.14 (8 Byte)]

// 3. 값 읽기 (태그 조건문 분기)
switch (v.type) {
    case TYPE_INT: printf("%d\n", v.value.i); break;
    case TYPE_DOUBLE: printf("%f\n", v.value.d); break;
    case TYPE_STRING: printf("%s\n", v.value.s); break;
}
```

### 3. 가비지 컬렉터가 `free()`를 대신하여 자원을 회수해준다.

C에서 `malloc`으로 할당받은 메모리는 개발자가 직접 `free()`를 호출해야 회수할 수 있다. 안 하면 메모리 누수, 두 번 하면 이중 해제(double free) 버그가 발생하므로 귀찮더라도 개발 프로세스 전반에 걸쳐 반드시 신경 써야 하는 부분이다.

JS의 객체와 배열, 클로저는 전부 힙에 할당되지만 가비지 컬렉터(GC)가 "더 이상 어디서도 참조되지 않는 메모리"를 주기적으로 찾아 자동으로 회수해주기 때문에 개발자가 해제 시점을 신경 쓸 필요가 없다.

```js
let orders = { kim: 17000 }; // 힙에 객체 생성. C의 malloc(sizeof(..))에 해당한다
orders = null; // 이 객체를 가리키는 마지막 참조를 끊었다
// free(orders)를 호출하지 않아도 '아무도 참조하지 않게 된 객체'는 언젠가 GC가 알아서 회수한다
```

> GC가 언제 도는지 정확한 시점을 개발자가 통제할 수 없고("언젠가"만 보장된다) 회수 판단 자체에 약간의 실행 비용이 든다. 대신 이중 해제나 해제된 메모리 접근(use-after-free) 같은 C의 대표적인 메모리 버그 클래스는 JS에서 구조적으로 일어나지 않는다.

### 4. 객체와 배열은 참조로, 원시값은 값으로 다루어진다.

C에서 값이 포인터로 다뤄질지 값으로 복사될지는 타입 선언이 정한다(`struct Order o2 = o1;`은 통째로 복사, `struct Order *p = &o1;`은 주소만 전달).

JS는 C와는 다르게 타입이 아닌 종류로 갈린다. 숫자, 문자열, 불리언 같은 원시값은 대입과 전달할 때마다 값이 복사되고, 객체, 배열, 함수는 항상 참조(포인터에 해당)로 다뤄진다. 이 둘을 구분하는 문법은 따로 없으며 값의 종류가 곧 규칙인 셈이다.

```js
let a = 5;
let b = a;
b = 10;
console.log(a); // 출력: 5

let obj1 = { total: 100 };
let obj2 = obj1;
obj2.total = 99;
console.log(obj1.total); // 출력: 99
```

`reduce`가 매 호출마다 새 객체를 만들지 않고 초기값 `{}` 하나를 계속 고쳐 써도 "안전하다"고 하는 이유가 바로 이 참조 규칙이다.

`acc`는 `reduce` 내부에서 새로 만든 객체 하나를 계속 참조하는 것이라, 그 힙 메모리를 고쳐도 함수 밖의 `orders`(원본 배열)는 건드리지 않는다.

반대로 `obj2 = obj1`처럼 이미 있는 객체를 그대로 다른 변수에 대입하면 C의 포인터 대입과 같아서 원본이 같이 바뀐다. 이를 피하려면 스프레드 연산자(`{ ...obj }`)처럼 명시적으로 새 메모리(새 객체)를 만들어야 한다. 이 구분은 React의 state를 다룰 때 중요하다.

#### reduce와 콜백함수 이해하기

콜백 함수는 실행 흐름(반복/제어)은 이미 만들어진 함수에 맡기고, 그 내부에서 실행할 실제 로직(동작)만 내가 작성해서 인자(Pointer)로 전달하는 함수를 말한다.

C에서 POSIX 스레드를 만들 때 사용하는 `pthread_create`를 떠올리면 구조가 완전히 동일하다.

```c
// 프로토타입
int pthread_create(pthread_t *thread, const pthread_attr_t *attr, void *(*start_routine) (void *), void *arg);

// 사용 예시

// 1. 개발자가 직접 작성한 "콜백 함수"
// (스레드가 만들어지면 C 라이브러리가 나중에 이 함수를 Call 한다)
void* my_thread_work(void* arg) {
    printf("스레드가 생성되어 실제 작업 로직을 실행합니다.\n");
    return NULL;
}

int main() {
    pthread_t thread;

    // 2. pthread_create에 my_thread_work 함수 포인터를 '인자'로 전달한다.
    //    pthread_create는 스레드 인프라만 구성하고, 실제 일은 my_thread_work에 위임한다.
    pthread_create(&thread, NULL, my_thread_work, NULL);

    pthread_join(thread, NULL);
    return 0;
}
```

`pthread_create`는 스레드를 띄우는 제어 틀(Infrastructure)로서, 루프를 돌리는 JS의 `reduce`와 동등한 입장이다.

실행 기반이 갖춰진 후 내부에서 실제로 실행되는 핵심 동작 로직을 담은 `my_thread_work`가 콜백 함수이며, 아래 코드의 `myLogic`에 해당된다.

```js
// 1. reduce의 내부 구조
function reduce(callback, initialValue) {
  let acc = initialValue;
  let index = 0;

  while (index < orders.length) {
    let cur = orders[index];

    // 미리 정해진 시점(루프 내부)에서 개발자가 전달한 콜백 함수를 실행한다
    acc = callback(acc, cur);
    index++;
  }
  return acc;
}

// 2. 콜백 함수 작성
const myLogic = (acc, cur) => {
  acc[cur.id] = cur.price;
  return acc;
};

// 3. reduce 실행
reduce(myLogic, {});
```

### 5. JS는 콜백으로 시작해서 콜백으로 끝난다.

JS에서 우리가 자주 쓸 거의 모든 함수와 패턴 뒤에는 콜백이 자리 잡고 있다. 자바스크립트에서 콜백이 이토록 도배되다시피 쓰이는 이유는 크게 두 가지다.

#### 5.1 배열 메서드처럼 "할 일(로직)을 부품처럼 넘기기 위해"

`filter`, `reduce`, `map`, `forEach`, `find`, `sort` 등이 전부 이 경우에 해당한다.

자바스크립트 엔진은 "순회(반복)하는 틀"만 제공하고, "안에서 무슨 계산을 할지"는 개발자가 작성한 콜백 함수에게 맡기는 방식이다.

```js
numbers.forEach((num) => console.log(num));
numbers.sort((a, b) => a - b);
```

덕분에 개발자는 복잡한 루프문을 매번 직접 구현할 필요 없이 실행하고 싶은 로직만 작성하여 전달할 수 있게 된다.

#### 5.2 비동기 처리(기다리는 작업)를 위해

자바스크립트는 싱글 스레드(일꾼이 한 명)로 동작한다. 만약 서버에서 데이터를 가져오거나 파일 읽기, 타이머 설정 같은 오래 걸리는 작업을 할 때 일꾼이 멍하니 기다린다면 화면이 멈춰버린다.

그래서 자바스크립트는 오래 걸리는 일이 발생하는 줄에 "다 끝나면 이 콜백 함수 실행"하라는 예약을 남기고 다음 줄로 넘어간다.

```js
button.addEventListener('click', () => {
  console.log('클릭 발생!');
});

setTimeout(() => {
  console.log('2초 지남');
}, 2000);

fetch('/api/data')
  .then((response) => response.json());
```

이 모든 것은 "일급 객체(First-Class Object)"라는 특징 덕분이다.

C 같은 언어에서는 함수를 다른 함수의 인자로 전달하는 게 까다롭지만(포인터 사용), 자바스크립트에서는 "함수를 숫자나 문자열처럼 변수에 담거나 다른 함수에 전달할 수 있는 값(일급 객체)"으로 취급한다.

이 문법적 특성 덕분에 자바스크립트에서는 콜백 패턴이 자연스럽게 기본 표준으로 자리 잡았다.

> 요약:
> 배열 메서드는 "반복 로직을 유연하게 조작하기 위해", 비동기 이벤트는 "나중에 일어날 일에 대한 예약"을 위해 콜백을 사용한다.

## 1. 준비

먼저 Node.js를 설치해야 하므로 [nodejs.org](https://nodejs.org/ko)에서 LTS(장기 지원) 버전을 설치한다.

```sh
node -v && npm -v
```

> 이 저장소는 Node 24에서 검증했다(20 이상이면 동작한다).

프로젝트를 만들고 초기 설정을 한다.

```sh
mkdir order-report && cd order-report
npm init -y
npm pkg set type=module
```

`"type": "module"`을 설정하지 않으면 Node가 `.js`를 CommonJS(옛 모듈 방식)로 해석하기 때문에 `import`문을 사용할 수 없게 된다(보통 `Cannot use import statement outside a module` 에러를 뱉어낸다).

```sh
# 인자 없이 node만 치면 REPL(한 줄 입력 후 바로 결과가 나오는 대화형 모드)이 열린다
node
# --watch 옵션은 파일이 바뀔 때마다 Node가 스크립트를 자동으로 다시 실행한다
node --watch main.js
```

## 2. 1단계: 주문 데이터와 집계

`report.js` 파일을 만든다.

비동기/네트워크는 다루지 않으므로 이미 존재하는 배열을 다루는 함수만 작성한다.

```js
// report.js

export function totalByUser(orders) {
  return orders
    // orders 배열에서 paid 속성이 true인 주문만 골라내어 새로운 배열을 만들어 반환한다
    .filter((o) => o.paid)
    // 결제 완료된 주문 배열을 순회하며 하나의 결과 객체(acc)로 합친다
    .reduce((acc, o) => {
      // acc는 여기서 만든 새 객체라 변경해도 안전하다
      acc[o.user] = (acc[o.user] ?? 0) + o.price;
      // 누적 결과를 다음 순회로 전달하기 위해 acc 객체를 반환한다
      return acc;
    }, {});
}

export function topUser(totals) {
  // 정렬된 배열의 첫 번째 요소를 구조 분해 할당으로 가져온다
  const [top] = Object.entries(totals).sort(([, a], [, b]) => b - a); // 합계 내림차순
  return top ? { name: top[0], total: top[1] } : null;
}
```

### JS 문법

- `export`: 이 함수를 다른 파일에서 import해서 쓸 수 있게 내보낸다.
- 화살표 함수(`(o) => o.paid`): `(매개변수) => 반환값` 형태의 짧은 함수다. 본문이 식 하나뿐이면 `{}`와 `return`을 생략할 수 있다.
- 배열 구조 분해(`const [top] = 배열`): 배열의 첫 번째 요소를 꺼내 `top`에 담는다. 배열이 비어 있으면 `top`은 `undefined`가 된다.
- 삼항 연산자(`조건 ? A : B`): 조건이 참이면 `A`, 거짓이면 `B`가 되는 식이다.

#### 배열의 구조 분해 할당

배열의 순서(인덱스)를 기준으로 필요한 요소를 추출하여 변수에 할당하는 문법이다.

- **빈 배열 처리**: 추출할 위치에 요소가 없으면 변수에는 `undefined`가 할당된다.
- **순서 건너뛰기 (`const [, second] = 배열`)**: 쉼표(`,`)로 앞쪽 자리를 비워두면 원하는 인덱스의 요소만 골라서 꺼낼 수 있다.

##### 기본 할당과 단일 요소 추출 (`const [first] = 배열`)

대괄호 안에 변수를 하나만 지정하면 뒤쪽의 나머지 요소는 무시하고 오직 첫 번째 요소(`index 0`)만 꺼낸다. `top`이나 `first` 같은 일반 변수명을 사용하며, 정렬 후 1위 값만 뽑아낼 때 유용하다.

```javascript
const ranks = [['Alice', 4000], ['Bob', 2000], ['Charlie', 1500]];

// 0번 인덱스의 요소만 top 변수에 할당
const [top] = ranks;

console.log(top); // ['Alice', 4000]
```

##### 중첩 구조 분해 (2차원 배열 다루기)

대괄호를 중첩하여 쓰면 중간 배열 단계를 거치지 않고 내부 배열의 요소까지 한 번에 각각의 변수로 꺼낼 수 있다.

```javascript
const ranks = [['Alice', 4000], ['Bob', 2000]];

// 2차원 배열 내부의 '이름'과 '금액'을 즉시 변수로 추출
const [[name, total]] = ranks;

console.log(name);  // 'Alice'
console.log(total); // 4000
```

##### Rest 문법(`...`)과 얕은 복사(Shallow Copy) 주의점

첫 번째 요소를 꺼내고 남은 요소들을 `...`을 통해 새 배열로 묶을 수 있다. 단, 구조 분해 할당은 데이터의 위치를 찾아 가져오는 추출 문법이므로, 내부 요소가 객체나 배열(참조 타입)인 경우 원본과 메모리 주소를 공유한다.

```javascript
const original = [[1, 2], [3, 4]];

// first에는 [1, 2] 배열의 참조값이 할당됨
const [first, ...rest] = original;

// first 내부의 값을 변경하면 원본(original)에도 그대로 반영됨
first[0] = 999;

console.log(original); // [[999, 2], [3, 4]]
```

### 내장 API

- `.sort(비교 함수)`: 비교 함수가 음수를 반환하면 `a`를, 양수를 반환하면 `b`를 앞에 둔다. 새 배열을 만들지 않고 원본 배열을 직접 바꾼다.

### 왜 이렇게 생겼는가

#### 배열 메서드 체이닝

데이터를 한 단계씩 처리하는 파이프라인(생산 라인) 방식이다. 원본 데이터를 변경하지 않고 매 단계마다 새로운 결과물을 만들어 다음 메서드로 전달한다.

- `.filter()`: 조건에 맞는 데이터만 추출하여 다음 단계로 넘긴다.

- `.reduce()`: 배열의 여러 데이터를 하나의 결과(여기서는 집계 객체)로 차곡차곡 축약한다.

#### 널 병합 연산자(`??`, nullish coalescing)

`acc[o.user] ?? 0`은 "기존 집계 값이 없으면(`null` or `undefined`) 기본값 `0`에서 시작하라"는 의미이다.

- `??` vs `||`: `||` 연산자는 `0`이나 `""` 같은 Falsy 값도 무효로 처리하지만, `??`는 오직 값이 '아예 없을 때'만 작동한다.

- 버그 방지: 기존 누적 금액이 숫자 `0`인 경우에도 이를 정상적인 값으로 인정하여 의도치 않은 초기화를 막는다.

#### `Object.entries()`와 구조 분해 정렬

객체를 배열로 변환한 뒤, 원하는 값만 추출하여 정렬하는 기법이다.

- `Object.entries(totals)`: `{ kim: 17000 }` 객체를 `[['kim', 17000]]` 형태의 `[key, value]` 2차원 배열로 펼친다.

- `([, a], [, b]) => b - a`: 비어 있는 첫 번째 쉼표(`,`)로 이름(키)은 무시하고, 두 번째 항목인 결제 금액(`a`, `b`)만 추출하여 내림차순(큰 값 → 작은 값)으로 정렬한다.

### 시험해보기

REPL이나 `node --watch scratch.js`로 아래 소스코드를 직접 돌려본다.

```js
// scratch.js

console.log(0 || 10, 0 ?? 10); // 출력: 10 0. 결제액이 0원인 사용자가 있다면 이 차이로 버그가 갈린다
console.log([10, 9, 1].sort()); // 출력: [1, 10, 9]. 의도와 다르다
console.log([10, 9, 1].sort((a, b) => a - b)); // 출력: [1, 9, 10]
```

`topUser`의 정렬이 `sort()`를 인자 없이 썼다면 각 `[이름, 금액]` 쌍이 `"kim,17000"` 같은 문자열로 바뀌어 비교되므로, 금액이 아니라 이름 순서(kim → lee → park)로 정렬되어 1위가 kim으로 잘못 나왔을 것이다. `([, a], [, b]) => b - a`처럼 비교 함수를 넘겨야 숫자 크기로 정렬된다.

## 3. 2단계: Mock 비동기 API 붙이기

실제 서버 없이 네트워크 지연을 흉내 내는 `api.js`를 만든다.

```js
// api.js

// ms(밀리초)만큼 기다렸다가 완료되는 Promise를 반환한다. 네트워크 지연을 흉내 내는 데 쓴다
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock 데이터. 페이지 번호를 키로, 그 페이지의 주문 목록을 값으로 갖는다
const ORDERS = {
  1: [
    { id: 101, user: "kim", price: 12000, paid: true },
    { id: 102, user: "lee", price: 8000, paid: false },
    { id: 103, user: "kim", price: 5000, paid: true },
  ],
  2: [
    { id: 201, user: "lee", price: 30000, paid: true },
    { id: 202, user: "park", price: 7000, paid: true },
  ],
  // 3페이지는 일부러 없다. 곧 실패 케이스로 쓴다
};

export async function fetchOrders(page) {
  // 실제 서버 통신처럼 500ms 동안 대기한다
  await delay(500);

  // ORDERS[3]처럼 없는 키를 읽으면 에러가 아니라 undefined가 나온다
  const orders = ORDERS[page];
  if (!orders) throw new Error(`page ${page} not found`);

  // async 함수에서 return한 값은 자동으로 Promise에 담겨 전달된다
  return orders;
}
```

### JS 문법

`Promise`, `async`, `await`는 아래 "왜 이렇게 생겼는가"에서 다룬다.

- `!orders`: `undefined`는 falsy 값이라 `!`를 붙이면 `true`가 된다. "값이 없으면"을 확인할 때 흔히 쓴다.
- `throw new Error(메시지)`: 에러 객체를 만들어 던지고, 함수는 그 자리에서 중단된다. async 함수 안에서 던지면 그 함수가 반환한 Promise가 실패(rejected) 상태가 된다.
- 템플릿 리터럴(`` `page ${page} not found` ``): 백틱(`` ` ``)으로 감싼 문자열 안에 `${식}`으로 값을 끼워 넣는다.

#### JavaScript 데이터 구조: 객체(`{}`)와 배열(`[]`)

JavaScript의 모든 복합 데이터 타입은 근본적으로 **객체(Object)** 기반이다. 데이터를 식별하는 방식(Key vs Index)과 사용 목적에 따라 객체와 배열로 나뉜다.

* **콜론(`:`) 문법**: 객체 리터럴 `{}` 내부에서 `Key: Value` 쌍을 구분하기 위한 전용 문법이다.
* **문자열 Key 자동 변환**: 객체의 Key 위치에 `1`, `2` 같은 숫자를 써도 내부적으로는 문자열 `"1"`, `"2"`로 자동 평가되어 해시 맵의 Key로 등록된다.

##### 객체(`{}`) vs 배열(`[]`)의 구조적 차이

| 구분 | `{}` (Object / Key-Value) | `[]` (Array / Index-Value) |
| --- | --- | --- |
| **자료구조** | 해시 맵 (Hash Map / Associative Array) | Continuous Memory / Indexed List |
| **식별자** | 문자열 Key (`id`, `user`, `"1"`) | 0부터 시작하는 연쇄 숫자 Index (`0`, `1`, `2`...) |
| **주 목적** | 속성에 이름표(Key)를 붙여 그룹화할 때 | 데이터의 **순서**가 중요하거나 반복문(Iterate)을 돌릴 때 |

##### "모든 것은 객체다": 배열(`[]`)의 내부 실체

C/C++ 관점에서 배열이 연속된 메모리 공간의 포인터 연산이라면, JavaScript에서 배열은 "Key가 `0, 1, 2...` 숫자로 고정되어 있고 `length` 프로퍼티를 가진 특수 객체"에 불과하다.

`typeof []`를 실행하면 `"array"`가 아닌 `"object"`가 반환되는 이유가 바로 이 때문이다.

```javascript
// 배열 형태의 실체는 아래 특수 객체와 구조적으로 유사함
const arr = ['a', 'b'];
// 내부 구조 개념: { '0': 'a', '1': 'b', length: 2 }

console.log(typeof []);        // "object"
console.log(Array.isArray([])); // true (배열 판별 시에는 isArray 사용)
```

##### 중첩 데이터 구조의 탐색 (Object-Array Chain)

객체 내부에 배열이 오고, 그 배열 내부에 다시 객체가 오는 중첩 구조는 실무 API 응답의 대표적인 패턴이다. 각 단계의 인덱스와 Key를 체이닝하여 접근한다.

```javascript
const ORDERS = {
  1: [ // Key "1" (테이블/그룹 번호) -> Value: 주문 객체 배열
    { id: 101, user: "kim", price: 12000, paid: true },
    { id: 102, user: "lee", price: 8000, paid: false }
  ],
  2: [ // Key "2"
    { id: 201, user: "lee", price: 30000, paid: true }
  ]
};

// 1. ORDERS[1]     -> Key "1"에 접근하여 배열 반환
// 2. [0]           -> 배열의 0번 인덱스 객체 반환
// 3. .price        -> 객체의 price Key 값 추출
const firstPrice = ORDERS[1][0].price; // 12000
```

### 내장 API

- `setTimeout(함수, ms)`: ms밀리초 뒤에 함수를 한 번 실행하도록 예약한다. `delay`에서는 그 함수가 `resolve`라서, 시간이 지나면 Promise가 완료된다.

### 왜 이렇게 생겼는가

#### Promise 구조와 동작 원리

Promise는 비동기 작업의 최종 완료 또는 실패와 그 결과값을 나타내는 객체다.

* **단방향 상태 전이**: 상태는 `pending`(대기)에서 시작하여 `fulfilled`(성공) 또는 `rejected`(실패)로만 전이되며, 한 번 결정된 상태는 다시 변하지 않는다.
* **Executor 동기 실행**: `new Promise(...)` 호출 시 인자로 전달한 콜백 함수(Executor)는 객체 생성과 동시에 동기적으로 즉시 실행된다.

##### Promise는 "미래 값을 담는 메모리 버퍼(객체)"다

C 언어에서 `pthread`로 생성한 스레드의 작업 완료를 기다리거나, 시스템 콜의 비동기 I/O 상태를 다루는 데이터 구조체와 개념적으로 유사하다.

`new Promise((resolve) => setTimeout(resolve, ms))` 구조는 전달받은 함수 포인터(`resolve`)를 비동기 작업에 등록해 두고, 특정 시점에 결과값을 해당 메모리 공간에 채워 넣는 방식으로 동작한다.

##### `resolve`는 성공 상태로 전환하는 "함수 포인터(콜백)"다

`new Promise((resolve, reject) => ...)` 호출 시 JavaScript 엔진이 첫 번째 인자로 실제 실행 가능한 성공 처리 함수 주소(포인터)를 주입한다.

* **매개변수일 뿐인 이름**: `resolve`라는 이름은 커뮤니티 관례일 뿐, 엔진 입장에서는 첫 번째 매개변수 위치에 들어오는 콜백 함수다.
* **결과 등록 및 상태 전환**: `resolve(value)`를 호출하면 내부 버퍼에 결과값이 들어가고, Promise 상태가 `fulfilled`로 즉시 전환된다.
* **실패 처리**: 작업 실패 시에는 두 번째 인자로 주입된 `reject` 함수 포인터를 호출하여 `rejected` 상태로 전환한다. `delay`처럼 에러 처리가 필요 없는 비동기 작업에서는 첫 번째 인자(`resolve`)만 선언하여 두 번째 인자를 무시할 수 있다.

> 엔진은 new Promise(executor) 내부에서 executor 콜백을 실행할 때, 매개변수 선언 개수와 상관없이 항상 2개의 함수 포인터를 무조건 넘겨준다.

#### `await`는 "논블로킹 `pthread_join`과 같은 실행 제어자"다

단순 표기용이 아니라, 해당 Promise가 완료될 때까지 `async` 함수 내부의 진행을 일시 정지(yield)하고 완료 후 결과 값을 반환받는다. 단, 함수 밖의 메인 스레드는 차단되지 않고 계속 실행된다.

이전의 `.then()` 체이닝 방식(콜백 등록) 대신, 마치 동기식 C 코드처럼 위에서 아래로 순차 실행되도록 가독성을 맞춰준다.

> 이벤트 루프 전체가 멈추는 블로킹 I/O가 아니라, 해당 `async` 함수 문맥만 제어권을 넘기고 대기하는 방식이다.

#### `async` 함수는 항상 Promise를 반환한다

"이 함수의 반환값(Return Value)은 무조건 Promise가 된다"는 것을 의미한다. 함수 내부에서 명시적으로 Promise 객체를 생성하지 않고 일반 값(number, string, object 등)을 반환하더라도, JavaScript 엔진이 이를 자동으로 Promise.resolve(반환값) 형태로 감싸서 반환한다.

`fetchOrders` 내에서 `return orders;`로 값을 반환해도, 호출부는 C의 구조체 포인터를 전달받듯 `Promise<Order[]>` 객체를 받는다.

#### 모듈(ESM)

`export async function`으로 내보내고 `import { fetchOrders } from "./api.js"`로 가져온다.

> Node ESM은 헤더 파일이나 소스 파일 경로를 명시하듯 상대경로 import에 확장자(`.js`)를 반드시 붙여야 한다.

#### C로 대입해 본 비동기 개념

| 개념 | 실제 정체 | C 언어로 대입한 역할 |
| --- | --- | --- |
| `Promise` | 객체 (Object) | 결과값, 에러 상태, 콜백 목록을 관리하는 비동기 I/O 구조체 (`struct`) |
| `resolve` | 콜백 함수 (Function) | 작업 완료 시 호출하여 구조체 내부 상태를 성공으로 바꾸는 함수 포인터 |
| `await` | 키워드 (Keyword) | 비동기 작업 완료 시까지 현재 함수 실행을 `yield`하고 대기하는 실행 제어문 |

### 시험해보기

```js
// scratch.js
import { fetchOrders } from "./api.js";

const orders = await fetchOrders(1); // 최상위 await: 모듈 파일에서는 async 함수 없이도 쓸 수 있다
console.log(orders);

// try 안에서 던져진 에러는 catch가 받는다. await한 Promise가 실패해도 마찬가지다
try {
  await fetchOrders(3);
} catch (err) {
  console.log("실패:", err.message); // 출력: 실패: page 3 not found
}
```

```sh
node scratch.js
```

### `fetch`가 해결하는 문제

웹 개발에서 `fetch`는 "서버에서 데이터를 가져오거나(Fetch), 서버로 데이터를 보낼 때 사용하는 자바스크립트의 표준 비동기 HTTP 요청 도구(API)"를 의미한다.

과거에는 `XMLHttpRequest`나 외부 라이브러리인 `jQuery.ajax`, `axios` 등을 주로 사용했지만, 현재는 자바스크립트 자체에 표준 브라우저 API로 `fetch`가 내장되어 있어 별도의 설치 없이 바로 사용할 수 있다.

웹 페이지를 새로고침하지 않고도, 배경에서 조용히 서버와 통신하여 필요한 데이터만 받아온 뒤 화면의 일부만 업데이트(AJAX)하기 위해 사용한다. 예를 들면 다음과 같은 경우다.

- 쇼핑몰에서 "더보기" 버튼을 누르면 페이지 전환 없이 상품이 아래에 새로 추가될 때

- 댓글을 작성하고 "등록"을 눌렀을 때 화면 전체가 바뀌지 않고 댓글 목록에만 추가될 때

- 검색창에 단어를 칠 때마다 아래에 추천 검색어가 실시간으로 뜰 때

#### 기본적인 사용법

`fetch`는 처리 결과를 `Promise` 객체로 반환하므로, `.then()` 문법이나 `async / await` 문법과 함께 사용한다. 아래는 가장 많이 쓰이는 `async / await` 방식이다.

```js
async function getUserData() {
  try {
    // 1. fetch로 서버 주소에 요청을 보낸다 (기본값은 GET 요청)
    const response = await fetch('https://api.example.com/users/1');

    // 2. 응답받은 데이터를 JSON 형식으로 변환한다 (이 또한 비동기 작업)
    const data = await response.json();

    // 3. 변환된 데이터를 사용한다
    console.log(data);
  } catch (error) {
    // 네트워크 에러 등이 발생했을 때 처리한다
    console.error('데이터를 가져오는 중 에러 발생:', error);
  }
}
```

#### HTTP 메서드 지정 (GET, POST, PUT, DELETE)

기본적으로 데이터를 조회하는 `GET` 방식으로 동작하지만, 옵션 객체를 전달하여 데이터를 새로 등록하거나 수정/삭제할 수 있다.

```js
// POST 요청: 서버로 새 데이터 전송
fetch('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json', // 보내는 데이터가 JSON임을 명시
  },
  body: JSON.stringify({
    name: '홍길동',
    age: 25,
  }),
});
```

#### HTTP 에러와 `catch`의 관계

`fetch`는 서버가 `404 Not Found`나 `500 Internal Server Error` 같은 에러 응답을 보내더라도 **`catch` 블록으로 이동하지 않고 성공(`resolve`)으로 처리**한다. 네트워크 연결이 아예 끊기거나 주소가 잘못되었을 때만 `catch`로 들어간다.

따라서 개발자가 직접 `response.ok` 속성을 통해 정상 응답인지 체크해야 한다.

```js
const response = await fetch('/api/data');

if (!response.ok) {
  throw new Error(`HTTP 에러 발생! 상태 코드: ${response.status}`);
}

const data = await response.json();
```

#### SPA(Single Page Application)와 `fetch`

현대 웹 애플리케이션, 특히 SPA(Single Page Application) 구조에서는 `fetch`와 같은 비동기 통신이 핵심적인 역할을 한다.

SPA는 처음 접속할 때 하나의 HTML 페이지를 로드한 후, 페이지가 전환되거나 새로운 정보가 필요할 때 서버에서 전체 HTML을 새로 받지 않는다. 대신 `fetch`를 통해 배경에서 **필요한 데이터(주로 JSON 형식)만 비동기식으로 가져와 화면의 일부분만 동적으로 업데이트**한다. 이를 통해 앱처럼 끊김 없고 빠른 사용자 경험을 제공한다.

#### 웹 통신 방식의 차이: 전체 페이지 요청 vs 비동기 요청

웹 브라우저가 서버와 통신하는 방식은 크게 화면 전환(새로고침) 여부에 따라 두 가지로 구분할 수 있다.

1. **전체 페이지 요청 (동기식 통신)**
- 브라우저 주소창에 URL을 직접 입력하거나, `<a>` 태그 클릭, `<form>` 태그 전송 등을 수행할 때 발생한다.
- 서버는 새로운 HTML 페이지 전체를 응답하며, 브라우저는 화면 전체를 새로고침(리로드)하며 새 페이지를 그린다.

2. **비동기 데이터 요청 (`fetch` / AJAX)**
- 자바스크립트 코드 내에서 `fetch()` 등을 실행하여 배경에서 서버와 통신한다.
- 서버는 HTML 전체가 아닌 JSON 등의 데이터만 응답하며, 페이지 새로고침 없이 자바스크립트로 화면의 특정 요소만 변경한다.

#### URI와 URL의 개념 차이

`fetch`를 사용하다 보면 `URL`과 `URI`라는 용어를 자주 접하게 된다.

- **URI (Uniform Resource Identifier):** 인터넷에 있는 자원을 식별하기 위한 최상위 개념(식별자)이다.
- **URL (Uniform Resource Locator):** URI의 하위 개념으로, 자원이 어디에 위치해 있는지(주소)를 나타낸다.

예를 들어 `https://api.example.com/users/1`은 해당 자원의 네트워크 위치를 나타내므로 **URL**인 동시에, 특정 자원을 식별하므로 **URI**에도 해당한다. 실무에서는 두 단어를 혼용하여 사용하는 경우가 많지만, REST API 설계 시에는 '자원의 식별'이라는 의미를 강조하기 위해 URI라는 용어를 주로 사용한다.

## 4. 3단계: main()으로 조립하기

세 페이지를 한 번에 가져와서, 성공한 것만 리포트로 만드는 `main.js`를 작성한다.

```js
// main.js
import { fetchOrders } from "./api.js";
import { totalByUser, topUser } from "./report.js";

async function main() {
  console.time("병렬 조회");

  // map 안에서 await하지 않으므로 세 요청이 기다리지 않고 동시에 출발한다
  const results = await Promise.allSettled([1, 2, 3].map((page) => fetchOrders(page)));

  console.timeEnd("병렬 조회");

  // 성공한 결과만 골라 페이지별 주문 배열을 하나의 배열로 합친다
  const orders = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // 실패한 요청은 경고로 남긴다
  results
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.warn("실패:", r.reason.message));

  const totals = totalByUser(orders);
  console.log("사용자별 합계:", totals);

  console.log("1위:", topUser(totals));
}

// 치명적 에러가 나면 로그를 남기고 프로세스를 에러로 종료한다
main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
```

#### 내장 API

`Promise.allSettled`와 `main().catch`는 아래 "여기서 무슨 일이 있었나"에서 다룬다.

- `console.time(이름)` / `console.timeEnd(이름)`: 같은 이름을 쓴 두 호출 사이의 경과 시간을 출력한다.
- `.map(함수)`: 각 요소에 함수를 적용한 결과로 새 배열을 만든다. 여기서는 Promise 3개가 든 배열이 만들어진다.
- `.flatMap(함수)`: map한 뒤 결과를 한 겹 펼친다. `[[a, b], [c]]` → `[a, b, c]`
- `.forEach(함수)`: 각 요소에 함수를 실행만 하고, 새 배열은 만들지 않는다.
- `console.warn` / `console.error`: `console.log`와 같지만 표준 출력(stdout)이 아니라 표준 에러(stderr)로 나간다.
- `process.exit(코드)`: 프로세스를 즉시 끝낸다. `0`은 정상 종료, 0이 아닌 값은 에러 종료다.

실행하면 목표에서 본 출력이 나온다.

```sh
node main.js
# 병렬 조회: 501ms 안팎
# 실패: page 3 not found
# 사용자별 합계: { kim: 17000, lee: 30000, park: 7000 }
# 1위: { name: 'lee', total: 30000 }
```

### 여기서 무슨 일이 있었나

#### `Promise.allSettled`

배열의 Promise를 동시에 시작하고, 하나가 실패해도 나머지를 기다린다. 각 결과는 `{ status: "fulfilled", value }` 또는 `{ status: "rejected", reason }`이다.

3페이지가 실패해도 1/2페이지 결과는 살아남는 이유가 이것이다.

#### 왜 500ms가 아니라 501ms 안팎인가

세 개의 `fetchOrders`가 동시에 시작해서 동시에 끝나기 때문이다. 순차였다면 1.5초대가 된다(아래 도전 과제 2에서 직접 비교한다).

`await`가 멈추는 건 `main` 함수 하나뿐이고, 그 사이 세 개의 타이머는 런타임이 각자 진행시킨다.

#### 최상위 `.catch`

`main()`이 예상 못 한 이유로 reject하면(버그 등) 아무도 안 잡은 rejection이 된다. Node는 이런 경우(unhandled rejection) 프로세스를 종료시킨다(Node 15+ 기본 동작).

그 전에 로그를 남기고 종료 코드를 정하려고 `.catch`를 달아둔다.

### 도전 과제

하나씩 고치고 원복하며 확인한다.

#### 1. `Promise.all`로 바꾸기

`main.js`의 `Promise.allSettled`를 `Promise.all`로 바꿔 실행한다.

3페이지 하나 때문에 무슨 일이 생기는가?

**답**

`Promise.all`은 하나라도 reject하면 전체가 reject한다.

1. `await Promise.all(...)`이 throw해서 `console.timeEnd` 줄조차 실행되지 않는다.
2. 곧장 맨 아래 `main().catch`로 떨어져 `치명적 오류: Error: page 3 not found`와 스택이 찍힌다.
3. 종료 코드 1로 끝난다.

> 1, 2페이지는 성공했는데도 리포트가 한 줄도 안 나온다.

#### 2. 순차 실행으로 바꾸기

`Promise.allSettled([...])` 부분을 아래처럼 `for...of` + `await`로 바꾸고, `console.time`으로 시간을 잰다.

```js
// allSettled가 만들어 주던 { status, value/reason } 모양을 손으로 흉내 낸다
const results = [];
// for...of: 배열의 원소를 하나씩 꺼내 반복한다
for (const page of [1, 2, 3]) {
  try {
    // await가 반복문 안에 있으므로 앞 페이지가 끝나야 다음 페이지 요청이 시작된다
    results.push({ status: "fulfilled", value: await fetchOrders(page) });
  } catch (reason) {
    results.push({ status: "rejected", reason });
  }
}
```

왜 1.5초대로 느려지는가?

**답**

앞 페이지의 `await`가 끝나야 다음 요청이 시작되므로 순차 실행이 된다. 500ms짜리 요청 세 개가 차례로 이어져 1.5초대가 걸린다.

#### 3. 처리하지 않은 rejection 만들기

`main.js` 맨 아래, `main().catch(...)` 앞에 아래 한 줄을 `await`도 `.catch()`도 없이 추가하고 실행한다.

```js
fetchOrders(3);
```

Node가 어떻게 종료되는가?

**답**

1. 약 500ms 뒤 그 Promise가 reject된다.
2. 아무도 처리하지 않은 rejection이므로 Node가 에러와 스택을 찍는다.
3. 종료 코드 1로 즉시 죽는다.

> `main()`은 이미 돌고 있었지만 리포트를 출력할 기회조차 없다. 6단계 7.7에서 이 동작을 바꿔 가며 다시 본다.

## 5. 4단계: 흔히 나는 실수 재현하기

지금까지 만든 코드가 정상 동작하는 걸 확인했으니, 이번엔 일부러 같은 종류의 버그를 내서 왜 문제인지 눈으로 본다.

### 5.1 `forEach` 안에서 `await`

`main.js`의 리포트 출력 부분 위에 아래를 추가하고 실행한다.

```js
orders.forEach(async (o) => {
  await new Promise((r) => setTimeout(r, 100)); // 100ms짜리 타이머를 Promise로 감싸 기다린다(r은 resolve)
  console.log("처리:", o.id);
});
console.log("forEach 직후");
```

`"forEach 직후"`가 `"처리: ..."`보다 먼저 찍힌다.

`forEach`는 콜백이 반환한 Promise를 기다리지 않기 때문이다. 콜백이 `async`여도 마찬가지다.

> 순차 처리가 필요하면 `for...of` + `await`, 병렬이 필요하면 `await Promise.all(arr.map(async (o) => ...))`를 쓴다(방금 도전 과제 2가 그 예다).

### 5.2 `this` 유실

`scratch.js`에 메서드가 있는 객체를 하나 만들어 실험한다(`report.js`에 넣으면 `main.js`가 import할 때마다 같이 실행되니 따로 둔다). `node scratch.js`로 실행한다.

```js
// scratch.js
const counter = { count: 0, inc() { this.count++; return this.count; } };
const { inc } = counter; // 메서드를 객체에서 떼어낸다
try {
  // counter.inc()가 아니라 inc()로 호출하면 붙은 객체가 없으므로 this가 undefined다(모듈은 strict 모드)
  inc();
} catch (e) {
  console.log("this 유실:", e.message); // 출력: this 유실: Cannot read properties of undefined (reading 'count')
}
```

이 스크립트에는 메서드를 콜백으로 넘기는 코드가 없어서 지금까지 안 만났을 뿐, React의 이벤트 핸들러나 Express의 라우트 핸들러를 클래스 메서드로 등록할 때 그대로 다시 나온다.

#### JS 문법

- 메서드 축약(`inc() { ... }`): `inc: function () { ... }`를 줄여 쓴 것이다.
- 객체 구조 분해(`const { inc } = counter`): `counter.inc`를 같은 이름의 변수 `inc`에 꺼내 담는다. 함수만 복사될 뿐, `counter`와의 연결은 따라오지 않는다.

`this`는 함수가 어떻게 호출됐는지로 정해진다. `counter.inc()`로 부르면 `this`가 `counter`지만, `inc()`처럼 객체에서 떼어내 부르면 `this`를 잃는다.

> 콜백으로 넘길 땐 화살표 함수(`() => counter.inc()`)나 `.bind(counter)`를 쓴다.

### 5.3 `var`의 스코프

REPL이나 scratch 파일에서 실행한다.

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log("var", i)); // 출력: var 3 / var 3 / var 3
for (let j = 0; j < 3; j++) setTimeout(() => console.log("let", j)); // 출력: let 0 / let 1 / let 2
```

`setTimeout`에 시간을 생략하면 0ms로 취급하지만, 콜백은 그래도 지금 실행 중인 코드(여기서는 반복문)가 다 끝난 뒤에 실행된다.

`var`는 블록이 아니라 함수 단위 스코프라, 반복문 안의 콜백 세 개가 전부 같은 `i`를 공유한다(콜백이 나중에 실행될 때 `i`는 이미 3).

`let`은 반복마다 새 바인딩이라 각 콜백이 자기 시점의 값을 붙든다(클로저).

이 문서 전체가 `const`/`let`만 쓴 이유이자, `var`를 쓰지 않는 이유다.

> 이러한 이유로 현대 개발에서 직접 코드 작성 시 `var`는 금지 수준으로 지양하며, `const`를 기본으로 쓰고 값 재할당이 필요한 경우에만 `let`을 사용한다. 그럼에도 `var`이 존재하는 이유는 웹의 역사와 하위 호환성을 지키기 위함이며, 최신 코드가 구형 환경용으로 변환될 때 내부적으로 활용된다.

## 6. 5단계: 실행 순서를 눈으로 확인하기

지금까지 "동시에 시작한다", "그 사이 다른 코드는 계속 실행된다"는 말을 여러 번 썼다. 왜 그런지 최소 예제로 한 번만 확인한다.

```js
console.log("1 동기");
setTimeout(() => console.log("4 매크로태스크(타이머)"), 0); // 0ms여도 큐를 거친다
Promise.resolve().then(() => console.log("3 마이크로태스크(Promise)")); // Promise.resolve(): 이미 완료된 Promise를 만든다
console.log("2 동기");
// 출력: 1 → 2 → 3 → 4
```

JS는 한 번에 하나의 코드만 실행한다(콜 스택 1개). `setTimeout`이나 `fetch`처럼 오래 걸리는 일은 런타임이 대신 처리하고, 끝나면 결과를 큐에 넣는다.

콜 스택이 비면 큐에서 꺼내 실행하는데, Promise의 `.then`/`await` 이후 코드(마이크로태스크)를 `setTimeout`류(매크로태스크)보다 먼저, 전부 비운다.

`main.js`에서 세 타이머(매크로태스크)가 끝나 `Promise.allSettled`가 완료되면, `await` 다음 줄은 또 다른 타이머를 기다리지 않고 마이크로태스크로 곧바로 이어 실행되는 이유가 이것이다.

> 더 복잡한 순서(중첩된 `then`, 여러 타이머가 섞인 경우)가 궁금해지면, 그건 이 스크립트 수준을 넘는 것이니 필요해질 때 찾아본다.

## 7. 6단계: 문제가 생겼을 때 디버깅하기

지금까지 만든 스크립트는 문제없이 돌아갔지만, 실제로는 `console.log`를 여기저기 찍어보다가 지쳐서 포기하는 경우가 더 많다. 이 스크립트를 기준으로, `console.log` 다음 단계로 넘어가는 데 필요한 최소한의 디버깅 방법만 정리한다.

### 7.1 `console`은 `log` 하나만 있는 게 아니다.

```js
// scratch.js
const totals = { kim: 17000, lee: 30000, park: 7000 };
const orders = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 201, user: "lee", price: 30000, paid: true },
];

console.table(orders); // 배열과 객체를 표 형태로. 필드가 여러 개일 때 log보다 훨씬 읽기 쉽다
console.dir(totals, { depth: null }); // 중첩 객체를 끝까지 펼쳐서 본다(기본은 2단계까지만)
console.warn("경고:", "3페이지 없음"); // stderr로 나간다(브라우저 DevTools에서는 노란 표시). 실패지만 중단은 아닐 때
console.error("에러:", new Error("치명적")); // stderr로 나간다(브라우저 DevTools에서는 빨간 표시). 진짜 실패일 때
console.trace("여기까지 어떻게 왔나"); // 지금 위치까지의 호출 스택을 출력한다
```

`main.js`에서 이미 `console.warn`(실패 로그)과 `console.error`(치명적 오류)를 용도에 맞게 나눠 썼다.

> `log` 하나로 다 찍으면 나중에 "이게 경고였는지 에러였는지" 로그만 보고는 알 수 없다.

### 7.2 에러가 나면 `message`가 아니라 `stack`부터 본다.

```js
try {
  await fetchOrders(3);
} catch (err) {
  console.log(err.message); // 출력: page 3 not found. "무엇이" 잘못됐는지만 알려준다
  console.log(err.stack); // "어디서" 잘못됐는지, 에러가 만들어진 위치와 호출 경로가 줄줄이 찍힌다
}
```

`err.message`는 `main.js`의 `console.warn("실패:", r.reason.message)`처럼 사용자에게 보여줄 요약이고, `err.stack`은 개발자가 원인을 추적할 때 본다.

> 에러 위치를 못 찾겠으면 `message` 대신 `stack`을 먼저 찍어보는 습관을 들인다.

`err.stack`은 C에서 세그폴트 후 `gdb`의 `bt`(backtrace) 명령으로 보는 호출 스택과 같은 정보다. 다만 C는 크래시 후 코어 덤프를 열어야 그 스택을 볼 수 있는 반면, JS는 `Error` 객체가 만들어지는 순간 스택을 문자열로 이미 담아 들고 있다.

### 7.3 `node --inspect`로 실제 디버거 붙이기

`console.log`를 지웠다 다시 넣었다 반복하는 대신, 실행을 멈추고 그 시점의 변수 값을 직접 들여다볼 수 있다.

`gdb ./main`으로 프로세스를 띄우고 `break`로 정지점을 건 뒤 `print 변수명`으로 값을 들여다보던 것과 같은 작업을, Node는 Chrome DevTools를 프론트엔드로 빌려서 한다.

```sh
# --inspect-brk: Node에 디버거를 붙일 수 있게 열고, 첫 줄에서 실행을 멈춰 세운다 (gdb의 "run 직후 첫 줄에서 break"와 같다)
node --inspect-brk main.js
```

실행하면 터미널에 `chrome://inspect`로 접속하라는 안내가 뜬다. Chrome에서 그 주소로 들어가면 "Open dedicated DevTools for Node"가 뜨고, 소스 패널에서 `main.js`를 열어 원하는 줄 왼쪽을 클릭해 브레이크포인트를 찍을 수 있다.

- `--inspect-brk`: 첫 줄에서 바로 멈춘다(`gdb`의 `break main` + `run`).

- `--inspect`: 브레이크포인트를 만날 때까지 정상 실행된다(`gdb`에서 원하는 줄에만 `break`를 걸고 `run`하는 것과 같다).

멈춘 상태에서는 다음을 할 수 있다.

- 코드에 마우스를 올려 변수 값 확인

- 콘솔 탭에서 `totals`, `orders` 같은 변수를 직접 입력해 조회

- Step Over(한 줄씩) / Step Into(함수 안으로) 버튼으로 한 줄씩 진행

`Promise.allSettled`처럼 "그 순간에 `results` 배열 안에 정확히 뭐가 들어있는지" 궁금할 때, log를 추가하고 저장하고 재실행하는 것보다 훨씬 빠르다.

### 7.4 코드 안에 `debugger;` 심어두기

브레이크포인트를 매번 클릭으로 찍기 번거로우면, 코드에 직접 표시해둔다.

```js
const totals = totalByUser(orders);
debugger; // 여기서 실행이 멈춘다 (단, --inspect 계열로 실행했을 때만)
console.log("사용자별 합계:", totals);
```

`node main.js`로 그냥 실행하면 `debugger;`는 아무 일도 하지 않고 지나간다. `node --inspect-brk main.js`로 실행했을 때만 DevTools가 그 줄에서 멈춘다.

> 그래서 커밋에 남아 있어도 상대적으로 안전하지만, 확인이 끝나면 지우는 게 맞다.

### 7.5 VS Code에서 바로 디버깅하기

터미널/Chrome을 오가지 않고 에디터 안에서 끝내는 방법이다.

1. `main.js`를 연 상태에서 줄 번호 왼쪽을 클릭해 빨간 점(브레이크포인트)을 찍는다.

2. 왼쪽 사이드바의 "Run and Debug" → "Run and Debug"(또는 `F5`)를 누른다. 별도 설정 없이도 Node 프로젝트를 인식해 실행한다.

브레이크포인트에서 멈추면 왼쪽 패널에 그 시점의 모든 지역 변수(`orders`, `totals` 등)가 자동으로 펼쳐진다. `console.dir`을 코드에 넣지 않아도 된다.

### 7.6 비동기 코드를 디버깅할 때의 요령

`await` 여러 개가 얽힌 코드는 브레이크포인트로도 순서가 헷갈릴 수 있다. 그럴 땐 구조를 통째로 펼쳐 본다.

```js
const results = await Promise.allSettled([1, 2, 3].map((page) => fetchOrders(page)));
// JSON.stringify(값, 필터, 들여쓰기): 필터에 null을 주면 모든 속성을 담고, 2는 들여쓰기 2칸이다
console.log(JSON.stringify(results, null, 2));
```

`JSON.stringify(값, null, 2)`는 `console.log(값)` 한 줄로는 잘려 보이거나 `[Object]`로 뭉개지는 깊은 구조를 펼쳐 보여준다.

> 3단계 도전 과제 2에서 했던 것처럼, 의심 가는 구간만 순차 코드(`for...of` + `await`)로 잠깐 바꿔서 한 단계씩 로그를 찍어보는 것도 병렬 코드보다 원인을 좁히기 쉬운 방법이다. 원인을 찾은 뒤엔 다시 병렬로 되돌린다.

### 7.7 처리 못 한 rejection을 놓치지 않기

3단계 도전 과제 3(`fetchOrders(3);`을 `await`/`.catch()` 없이 추가하기)에서 봤듯이, Node 15+의 기본값은 **처리되지 않은 rejection = 프로세스 종료**다. 스택이 찍히고 종료 코드 1로 끝나므로 적어도 "조용히" 넘어가지는 않는다.

헷갈리는 건 그 기본값이 바뀌어 있을 때다(오래된 설정, 일부 실행 도구, `--unhandled-rejections=warn` 같은 옵션). 그때는 프로세스가 죽지 않고 경고만 남긴 채 계속 돌아서, 로그를 안 보면 실패를 놓친다.

```sh
# --unhandled-rejections=warn: rejection이 처리되지 않아도 죽지 않고 경고만 찍는다(옛 Node의 동작)
node --unhandled-rejections=warn main.js
# (node:12345) UnhandledPromiseRejectionWarning: Error: page 3 not found ...
# (Use `node --trace-warnings ...` to show where the warning was created)
# ...이후 리포트가 정상 출력되고 종료 코드 0

# --trace-warnings: 그 경고가 "어느 경로에서 만들어졌는지" 스택을 한 번 더 붙여 준다
node --unhandled-rejections=warn --trace-warnings main.js
```

경고 모드에서는 리포트가 멀쩡히 나오고 종료 코드도 0이라, CI나 모니터링이 실패를 못 알아챈다.

> 기본값(종료)을 유지하고, 의도적으로 무시할 Promise라면 `.catch(() => {})`처럼 처리했다는 흔적을 코드에 남기는 게 맞다.

`--trace-warnings`는 rejection뿐 아니라 Node가 내는 모든 경고(deprecation 등)의 출처를 찾을 때 쓴다.

### 시험해보기

```sh
# 첫 줄에서 멈춘 뒤 chrome://inspect 에서 DevTools를 열어 이어서 진행한다
node --inspect-brk main.js
```

`totalByUser` 함수 첫 줄에 브레이크포인트를 찍고, `orders` 매개변수에 정말 3페이지가 빠진 5개짜리 배열(1페이지 3건 + 2페이지 2건, 미결제 102번 포함)만 들어오는지 직접 확인한다.

### 도전 과제

#### 1. 정렬 직후 멈춰 보기

`report.js`의 `topUser` 함수 안, `sort()` 호출 다음 줄에 `debugger;`를 추가하고 실행한다.

```sh
node --inspect-brk main.js
```

정렬 직후 배열 순서가 실제로 금액 내림차순인지 확인한다.

**답**

1. `--inspect-brk`라 첫 줄에서 한 번 멈춘다. 이어서 진행(Resume)하면 리포트 앞부분이 찍힌 뒤 `debugger;` 줄에서 다시 멈춘다.
2. 정렬된 배열은 변수에 담기지 않고 첫 요소만 `top`에 담기므로, Scope 패널에는 `top`(`['lee', 30000]`)과 `totals`만 보인다.
3. 배열 전체를 보려면 콘솔에 `Object.entries(totals).sort(([, a], [, b]) => b - a)`를 직접 입력한다. `[['lee', 30000], ['kim', 17000], ['park', 7000]]`으로 금액 내림차순이다.

> 중간 결과를 디버거로 보고 싶으면 `const sorted = ...`처럼 변수에 담아 두는 편이 편하다.

#### 2. `console.warn`과 `console.log` 비교하기

`main.js`의 `console.warn("실패:", ...)`을 잠깐 `console.log`로 바꿔 실행한다. 바꾸기 전과 후 모두 `node main.js 2>/dev/null`(stderr를 버린다)로도 실행해 본다.

무엇이 달라지는가?

**답**

1. 그냥 실행하면 터미널에서는 차이가 보이지 않는다. Node는 `warn`에 색을 입히지 않는다.
2. `2>/dev/null`로 실행하면 `warn`일 때는 `실패: page 3 not found` 줄이 사라지고, `log`일 때는 남는다. `warn`은 stderr, `log`는 stdout으로 나가기 때문이다.

> 로그 수집기나 셸 리다이렉트는 두 스트림을 따로 다루므로, 경고를 `log`로 찍으면 정상 출력에 섞여 버린다.

## 8. 완성 확인

- [ ] `node main.js`가 목표(와 4장 3단계)의 기대 출력과 같다(시간은 오차가 있을 수 있다)
- [ ] 도전 과제 1, 2에서 `Promise.all`과 순차 처리의 차이를 직접 재현했다
- [ ] 5장의 세 실험(`forEach`+`await`, `this` 유실, `var` 스코프)을 직접 재현하고 원복했다
- [ ] `??`와 `||`의 차이를, 그리고 `sort()`에 비교 함수가 필요한 이유를 설명할 수 있다

## 9. 다음 단계

### 자가 점검

소리 내어 설명할 수 있으면 통과다.

1. `Promise.allSettled`와 `Promise.all`은 언제 다르게 동작하는가?

2. `main()`이 501ms 안팎에 끝나는 이유는? 순차로 바꾸면 왜 1.5초대가 되는가?

3. `arr.forEach(async ...)` 뒤의 코드가 먼저 실행되는 이유와, 대안 두 가지는?

4. 메서드를 콜백으로 넘기면 `this`가 사라지는 이유와 해결 방법 두 가지는?

5. `for (var i...)`와 `for (let j...)`의 출력이 다른 이유는?

6. 동기 코드, 마이크로태스크, 매크로태스크는 각각 언제 실행되는가?

### 이 문서에서 다루지 않은 것

필요해질 때 찾아보면 된다.

- 제너레이터/이터레이터 프로토콜, `Proxy`/`Reflect`, `Symbol`, `WeakMap`/`WeakSet`, 프로토타입 체인의 세부 동작
- 정규식, `Date`/`Intl`
- 콜백 스타일 비동기 API(`fs.readFile(path, cb)`)와 Promise로의 변환(`util.promisify`)
- 진짜 병렬 실행이 필요한 경우의 Web Worker / `worker_threads`
- 마이크로태스크와 매크로태스크가 여러 개 중첩될 때의 정확한 순서