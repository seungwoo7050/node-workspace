import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError } from "./http.js";
import { broadcast } from "./realtime.js";

export type Order = { id: number; user: string; price: number; paid: boolean };

const orders: Order[] = [
  { id: 101, user: "kim", price: 12000, paid: true },
  { id: 102, user: "lee", price: 8000, paid: false },
  { id: 103, user: "kim", price: 5000, paid: true },
  { id: 201, user: "lee", price: 30000, paid: true },
  { id: 202, user: "park", price: 7000, paid: true },
];
let nextId = 203;

const OrderSchema = z.object({
  id: z.number().int(),
  user: z.string().min(1),
  price: z.number().positive(),
  paid: z.boolean(),
});
const CreateOrderSchema = OrderSchema.omit({ id: true });

export const ordersPlugin: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get("/", { schema: { querystring: z.object({ paid: z.enum(["true", "false"]).optional() }) } }, async (req) => {
    const { paid } = req.query;
    return paid === undefined ? orders : orders.filter((o) => o.paid === (paid === "true"));
  });

  fastify.get("/totals", async () => {
    return orders.filter((o) => o.paid).reduce<Record<string, number>>((acc, o) => {
      acc[o.user] = (acc[o.user] ?? 0) + o.price;
      return acc;
    }, {});
  });

  fastify.get("/:id", { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req) => {
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) throw new HttpError(404, `order ${req.params.id} not found`);
    return order;
  });

  fastify.post("/", { schema: { body: CreateOrderSchema } }, async (req, reply) => {
    const order: Order = { id: nextId++, ...req.body };
    orders.push(order);
    broadcast("order.created", order);
    reply.code(201);
    return order;
  });
};
