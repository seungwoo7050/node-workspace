import { buildApp } from "./app.js";

const app = buildApp({ logger: true });
const PORT = Number(process.env.PORT ?? 4000);
app.listen({ port: PORT }, () => console.log(`http://localhost:${PORT}`));