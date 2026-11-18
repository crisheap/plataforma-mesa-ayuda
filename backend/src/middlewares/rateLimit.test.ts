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

test("soloFallidos: los ingresos correctos de un centro tras una misma IP no se bloquean (RNF-04)", () => {
  const avisos: string[] = [];
  const mw = rateLimit({ ventanaMs: 60_000, max: 2, soloFallidos: true, alExceder: (_r, c) => avisos.push(c) });
  const respuesta = (status: number) => {
    const fin: (() => void)[] = [];
    const r = { setHeader() {}, statusCode: status, on: (_e: string, f: () => void) => fin.push(f) } as unknown as Response;
    return {
      r,
      terminar: () => {
        for (const f of fin) f();
      },
    };
  };
  for (let i = 0; i < 50; i++) {
    const { r, terminar } = respuesta(200);
    mw(req("9.9.9.9"), r, () => undefined);
    terminar();
  }
  for (let i = 0; i < 2; i++) {
    const { r, terminar } = respuesta(401);
    mw(req("9.9.9.9"), r, () => undefined);
    terminar();
  }
  assert.throws(
    () => mw(req("9.9.9.9"), respuesta(200).r, () => undefined),
    (e) => e instanceof AppError && e.statusCode === 429,
  );
  assert.deepEqual(avisos, ["9.9.9.9"], "avisa una sola vez por ventana");
  mw._reset();
});
