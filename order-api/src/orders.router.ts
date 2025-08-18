import { Router } from "express";
import z from "zod";
import { HttpError, parseOrThrow } from "./http.js";
import { CreateOrderSchema, addOrder, findOrder, listOrders, totalByUser } from "./orders.store.js";

export const ordersRouter = Router();

const ListQuerySchema = z.object({ paid: z.enum(["true", "false"]).optional() });

ordersRouter.get("/", (req, res) => {
  const { paid } = parseOrThrow(ListQuerySchema, req.query);
  res.json(listOrders(paid === undefined ? undefined : paid === "true"));
});

ordersRouter.get("/totals", (_req, res) => {
  res.json(totalByUser());
})

ordersRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "id는 정수여야 합니다.");
  const order = findOrder(id);
  if (!order) throw new HttpError(404, `order ${id} now found`);
  res.json(order);
});

ordersRouter.post("/", (req, res) => {
  const input = parseOrThrow(CreateOrderSchema, req.body);
  res.status(201).json(addOrder(input));
});
