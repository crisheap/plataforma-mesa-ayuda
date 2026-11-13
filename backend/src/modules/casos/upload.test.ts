import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.JWT_SECRET ??= "secreto-de-prueba-secreto-de-prueba-123";
process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5432/x";

test("validación de tipo, extensión y firma de archivos (RF-CAS-05)", async () => {
  const { extensionValida, firmaValida } = await import("./upload.js");
  assert.equal(extensionValida("image/png", "foto.PNG"), true);
  assert.equal(extensionValida("image/png", "foto.exe"), false);
  assert.equal(extensionValida("application/x-msdownload", "a.exe"), false);

  const dir = mkdtempSync(path.join(tmpdir(), "mesa-"));
  const png = path.join(dir, "a.png"); writeFileSync(png, Buffer.from("89504e470d0a1a0a0000000d", "hex"));
  const falso = path.join(dir, "b.png"); writeFileSync(falso, "MZ esto no es una imagen");
  const pdf = path.join(dir, "c.pdf"); writeFileSync(pdf, "%PDF-1.7 contenido");
  assert.equal(firmaValida(png, "image/png"), true);
  assert.equal(firmaValida(falso, "image/png"), false);
  assert.equal(firmaValida(pdf, "application/pdf"), true);
  assert.equal(firmaValida(pdf, "image/jpeg"), false);
});
