import { fetchOrders } from "./api.js";
import { totalByUser, topUser } from "./report.js";

async function main() {
  console.time("병렬 조회");
  const results = await Promise.allSettled([1, 2, 3].map((page) => fetchOrders(page)));
  console.timeEnd("병렬 조회");

  const orders = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  results
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.warn("실패:", r.reason.message));

  const totals = totalByUser(orders);
  console.log("사용자별 합계:", totals);
  console.log("1위:", topUser(totals));
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});