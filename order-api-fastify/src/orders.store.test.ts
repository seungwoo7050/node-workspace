import { describe, expect, it } from 'vitest';
import { findOrder, totalByUser } from './orders.store.js'

describe("orders.store", () => {
  it("totalByUser는 결제 완료된 주문만 사용자별로 합산한다", () => {
    expect(totalByUser()).toEqual({ kim: 17000, lee: 30000, park: 7000 });
  });

  it("findOrder는 없는 id에 대해서는 undefined를 반환한다", () => {
    expect(findOrder(999)).toBeUndefined();
  });
});