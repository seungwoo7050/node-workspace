const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
};

export async function fetchOrders(page) {
  await delay(500);
  const orders = ORDERS[page];
  if (!orders) throw new Error(`page ${page} not found`);
  return orders;
}