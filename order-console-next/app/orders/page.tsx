import Link from "next/link";
import { ORDERS } from "@/lib/api";

export default function OrdersPage() {
  return (
    <main>
      <h1>주문 관리</h1>
      <ul>
        {ORDERS.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`}>#{o.id} {o.user} - {o.price.toLocaleString()}원</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}