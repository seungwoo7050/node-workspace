import "reflect-metadata";

function Get(path: string): MethodDecorator {
  return (target, key) => Reflect.defineMetadata("route", { method: "GET", path }, target, key);
}
function Injectable(): ClassDecorator {
  return() => {};
}

@Injectable()
class Repo { find() { return ["a", "b"]; } }

@Injectable()
class Controller {
  constructor(private readonly repo: Repo) {}
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