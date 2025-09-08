import Fastify, { type FastifyError } from "fastify";
import websocketPlugin from "@fastify/websocket";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError } from "./http.js";
import { ordersPlugin } from "./orders.plugin.js";
import { addClient } from "./realtime.js";

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.setErrorHandler<FastifyError>((err, req, reply) => {
  if (err instanceof HttpError) { reply.code(err.statusCode).send({ error: err.message }); return; }
  if (err.validation) { reply.code(400).send({ error: err.message }); return; }
  if (err.statusCode && err.statusCode < 500) { reply.code(err.statusCode).send({ error: err.message }); return; }
  req.log.error(err);
  reply.code(500).send({ error: "Internal Server Error" });
});

await app.register(websocketPlugin);
app.get("/ws", { websocket: true }, (socket) => addClient(socket));

app.get(
  '/health',
  { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
  async () => ({ ok: true }));
app.register(ordersPlugin, { prefix: "/orders" });

const PORT = Number(process.env.PORT ?? 4000);
app.listen({ port: PORT }, () => console.log(`http://localhost:${PORT}`));
