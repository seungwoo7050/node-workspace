import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError } from "./http.js";
import { addOrder, findOrder, listOrders, totalByUser, type Order } from "./orders.store.js";
import { broadcast } from "./realtime.js";

export type { Order };

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
    return listOrders(paid === undefined ? undefined : paid === "true");
  });

  fastify.get("/totals", async () => totalByUser());

  fastify.get("/:id", { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (req) => {
    const order = findOrder(req.params.id);
    if (!order) throw new HttpError(404, `order ${req.params.id} not found`);
    return order;
  });

  fastify.post("/", { schema: { body: CreateOrderSchema } }, async (req, reply) => {
    const order = addOrder(req.body);
    broadcast("order.created", order);
    reply.code(201);
    return order;
  });
};
