import type { Order } from "./api";

type Props = {
  orders: Order[];
  onSelect: (id: number) => void;
};

export function OrderList({ orders, onSelect }: Props) {
  return (
    <ul>
      {orders.map((o) => (
        <li key={o.id}>
          <input type="checkbox" aria-label={`${o.user} 확인`} />{" "}
          <button onClick={() => onSelect(o.id)}>
            #{o.id} {o.user} - {o.price.toLocaleString()}원 {o.paid ? "(결제완료)" : "(미결제)"}
          </button>
        </li>
      ))}
    </ul>
  );
}
