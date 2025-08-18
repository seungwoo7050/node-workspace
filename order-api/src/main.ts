import express from "express";
import type { NextFunction, Request, Response } from "express";
import { ordersRouter } from "./orders.router.js";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`));
  next();
});

app.get("/health", (_req, res) => { res.json({ ok: true }); });
app.use("/orders", ordersRouter);

app.use((_req, res) => { res.status(404).json({ error: "Not Found" }); });

function statusOf(err: unknown): number {
  if (typeof err === "object" && err !== null && "status" in err && typeof err.status === "number") return err.status;
  return 500;
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = statusOf(err);
  if (status >= 500) console.error(err);
  const message = status < 500 && err instanceof Error ? err.message : "Internal Server Error";
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));