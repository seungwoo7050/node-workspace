export type Order = { id: number; user: string; price: number; paid: boolean };

const initialOrders: Order[] = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 102, user: "lee", price: 8000, paid: false },
  { id: 103, user: "kim", price: 5000, paid: true },
  { id: 201, user: "lee", price: 30000, paid: true },
  { id: 202, user: "park", price: 7000, paid: true },
];

const orders: Order[] = initialOrders.map((o) => ({ ...o }));
let nextId = 203;

export function listOrders(paid?: boolean): Order[] {
  return paid === undefined ? [...orders] : orders.filter((o) => o.paid === paid);
}
export function findOrder(id: number): Order | undefined {
  return orders.find((o) => o.id === id);
}
export function addOrder(input: Omit<Order, "id">): Order {
  const order: Order = { id: nextId++, ...input };
  orders.push(order);
  return order;
}
export function totalByUser(): Record<string, number> {
  return orders.filter((o) => o.paid).reduce<Record<string, number>>((acc, o) => {
    acc[o.user] = (acc[o.user] ?? 0) + o.price;
    return acc;
  }, {});
}
