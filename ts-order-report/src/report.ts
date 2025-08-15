import { z } from "zod";

export interface Order {
  id: number;
  user: string;
  price: number;
  paid: boolean;
}

export function totalByUser(orders: Order[]): Record<string, number> {
  return orders
    .filter((o) => o.paid)
    .reduce<Record<string, number>>((acc, o) => {
      acc[o.user] = (acc[o.user] ?? 0) + o.price
      return acc;
    }, {});
}

export function topUser(totals: Record<string, number>): { name: string; total: number } | null {
  const [top] = Object.entries(totals).sort(([, a], [, b]) => b - a);
  return top ? { name : top[0], total: top[1] } : null;
}

export const OrderSchema = z.object({
  id: z.number().int(),
  user: z.string(),
  price: z.number(),
  paid: z.boolean(),
});

export type ParsedOrder = 
  | { ok: true; order: Order }
  | { ok: false; error: string };

export function parseOrder(raw: unknown): ParsedOrder {
  const result = OrderSchema.safeParse(raw);
  return result.success
    ? { ok: true, order: result.data }
    : {
        ok: false,
        error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "),
    };
}