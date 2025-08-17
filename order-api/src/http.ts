import { z } from "zod";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join(".") || ("root")}: ${i.message}`).join(" / ");
    throw new HttpError(400, detail);
  }
  return result.data;
}
