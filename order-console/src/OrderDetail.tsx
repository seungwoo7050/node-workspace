import { useEffect, useState } from "react";
import { fetchOrder, type Order } from "./api";

type Props = { orderId: number };
type Loaded = 
  | { id: number; ok: true; order: Order }
  | { id: number; ok: false; error: string };

export function OrderDetail({ orderId }: Props) {
  const [result, setResult] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrder(orderId)
      .then((order) => { if (!cancelled) setResult({ id: orderId, ok: true, order }); })
      .catch((e: unknown) => {
        if (!cancelled) setResult({ id: orderId, ok: false, error: e instanceof Error ? e.message : String(e)})
      });
    return () => {
      cancelled = true;
    }
  }, [orderId]);

  if (result === null || result.id !== orderId) return <p>불러오는 중...</p>;
  if (!result.ok) return <p role="alert">{result.error}</p>;

  return (
    <div>
      <h2>#{result.order.id} {result.order.user}</h2>
      <p>{result.order.price.toLocaleString()}원 / {result.order.paid ? "결제완료" : "미결제" }</p>
    </div>
  );
}
