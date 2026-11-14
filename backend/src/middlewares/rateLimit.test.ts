import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { rateLimit } from "./rateLimit.middleware";
import { AppError } from "../utils/errors";

const res = () => ({ setHeader() {} }) as unknown as Response;
const req = (ip: string) => ({ ip }) as Request;

test("bloquea al superar el máximo por clave y no afecta a otras", () => {
  const mw = rateLimit({ ventanaMs: 60_000, max: 3 });
  let pasa = 0;
  for (let i = 0; i < 3; i++) mw(req("1.1.1.1"), res(), () => pasa++);
  assert.equal(pasa, 3);
  assert.throws(
    () => mw(req("1.1.1.1"), res(), () => pasa++),
    (e) => e instanceof AppError && e.statusCode === 429,
  );
  mw(req("2.2.2.2"), res(), () => pasa++);
  assert.equal(pasa, 4);
  mw._reset();
});
