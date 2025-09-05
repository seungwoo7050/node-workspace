import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get('/health', async() => {
  return { ok: true };
})

const PORT = Number(process.env.PORT ?? 4000);
app.listen({ port: PORT }, () => console.log(`http://localhost:${PORT}`))