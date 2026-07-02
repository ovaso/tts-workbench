import { buildApp } from "./app";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const app = await buildApp({
  logger: true
});

await app.listen({
  port,
  host
});
