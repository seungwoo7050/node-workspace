export function totalByUser(orders) {
  return orders
    .filter((o) => o.paid)
    .reduce((acc, o) => {
      acc[o.user] = (acc[o.user] ?? 0) + o.price
      return acc;
    }, {});
}

export function topUser(totals) {
  const [top] = Object.entries(totals).sort(([, a], [, b]) => b - a);
  return top ? { name : top[0], total: top[1] } : null;
}