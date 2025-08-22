import { useState } from "react";
import { ORDERS } from "./api";
import { OrderList } from "./OrderList";
import { OrderDetail } from "./OrderDetail";
import { useToggle } from "./useToggle";

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [reversed, toggleReversed] = useToggle();
  const visibleOrders = reversed ? [...ORDERS].reverse() : ORDERS;

  function handleReview(id: number) {
    setReviewed((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  return (
    <main>
      <h1>주문 관리</h1>
      <button onClick={toggleReversed}>최신순/오래된순</button>
      <OrderList orders={visibleOrders} onSelect={setSelectedId} />
      {selectedId !== null && (
        <>
          <OrderDetail orderId={selectedId} />
          <button onClick={() => handleReview(selectedId)}>검토 완료로 표시</button>
        </>
      )}
      <p>검토 완료: {reviewed.length > 0 ? reviewed.join(", ") : "없음"}</p>
    </main>
  );
}
