import { fetchOrders } from "./api.js";
import { totalByUser, topUser, parseOrder, type Order } from "./report.js";

async function main() {
  console.time("병렬 조회");
  const results = await Promise.allSettled([1, 2, 3].map((page) => fetchOrders(page)));
  console.timeEnd("병렬 조회");

  const orders: Order[] = []
  results.forEach((r, i) => {
    const page = i + 1;
    if (r.status === "rejected") {
      console.warn("실패:", r.reason.message);
      return;
    }
    for (const raw of r.value) {
      const parsed = parseOrder(raw);
      if (parsed.ok) orders.push(parsed.order);
      else console.warn(`잘못된 데이터 건너뜀: page ${page}의 주문 ${(raw as { id?: unknown}).id} - ${parsed.error}`);
    }
  });

  const totals = totalByUser(orders);
  console.log("사용자별 합계:", totals);
  console.log("1위:", topUser(totals));
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
