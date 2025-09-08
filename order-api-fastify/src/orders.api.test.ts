import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { __resetForTests } from "./orders.store.js";

beforeEach(() => { __resetForTests(); });

describe("orders API", () => {
  it("GET /orders/totals는 200과 사용자별 합계를 반환한다", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/orders/totals" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kim: 17000, lee: 30000, park: 7000 });
  });
  
  it("POST /orders로 주문을 만들면 201과 새 id를 받는다", async () => {
  const app = buildApp();
  const res = await app.inject({
    method: "POST", url: "/orders",
    payload: { user: "choi", price: 9000, paid: true },
  });
  expect(res.statusCode).toBe(201);
  expect(res.json()).toEqual({ id: 203, user: "choi", price: 9000, paid: true });
});
});