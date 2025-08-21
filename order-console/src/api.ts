export type Order = { id: number; user: string; price: number; paid: boolean };

export const ORDERS: Order[] = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 102, user: "lee", price: 8000, paid: false },
  { id: 103, user: "kim", price: 5000, paid: true },
  { id: 104, user: "park", price: 7000, paid: true },
];

const DB = ORDERS.filter((o) => o.id != 104)

const LATENCY: Record<number, number> = { 101: 1200, 102: 200, 103: 600 };
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchOrder(id: number): Promise<Order> {
  await delay(LATENCY[id] ?? 300);
  const order = DB.find((o) => o.id === id);
  if (!order) throw new Error("이 주문은 취소되어 상세 정보가 없습니다.");
  return order;
}
