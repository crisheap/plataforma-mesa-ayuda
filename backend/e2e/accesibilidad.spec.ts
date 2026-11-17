/**
 * Accesibilidad (RNF-10, WCAG 2.2 AA) con axe-core y comportamiento PWA (RNF-11).
 * Requiere la aplicación en ejecución y el archivo de credenciales de carga/preparar.mjs
 * (variable CREDENCIALES).  Ejecución:  npx playwright test
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";

const cred = JSON.parse(readFileSync(process.env.CREDENCIALES ?? "credenciales.json", "utf8")) as {
  admin: { correo: string; password: string };
  usuario: { correo: string; password: string };
  casoId: number;
};

async function revisar(page: Page, nombre: string) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of r.violations) {
    console.log(
      `[axe] ${nombre}: ${v.impact} · ${v.id} · ${v.help} · ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
    );
  }
  expect(
    graves.map((v) => `${v.id} (${v.nodes.length})`),
    `violaciones graves en ${nombre}`,
  ).toEqual([]);
}

async function ingresar(page: Page, correo: string, password: string) {
  await page.goto("/");
  await page.locator('input[name="correo"]').fill(correo);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  // Primer ingreso: autorización de datos personales (RF-DAT-01), que también se revisa con axe.
  await expect(page.locator("#nav a, #autorizar-datos").first()).toBeVisible();
  if (await page.locator("#autorizar-datos").isVisible()) {
    await expect(page.getByText(/1581 de 2012/).first()).toBeVisible();
    await revisar(page, "autorización de datos");
    await page.getByLabel(/Autorizo de manera previa/).check();
    await page.getByRole("button", { name: "Aceptar y continuar" }).click();
  }
  await expect(page.locator("#nav a").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Manual de usuario (PDF)" })).toBeVisible();
}

for (const esquema of ["light", "dark"] as const) {
  test.describe(`tema ${esquema === "light" ? "claro" : "oscuro"}`, () => {
    test.use({ colorScheme: esquema });

    test("inicio de sesión", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('input[name="correo"]')).toBeVisible();
      await revisar(page, `login (${esquema})`);
    });

    test("pantallas del usuario", async ({ page }) => {
      await ingresar(page, cred.usuario.correo, cred.usuario.password);
      for (const ruta of ["inicio", "casos/nuevo", "mis-casos", `casos/${cred.casoId}`, "notificaciones", "perfil"]) {
        await page.goto(`/#/${ruta}`);
        await revisar(page, `${ruta} (${esquema})`);
      }
      await page
        .getByRole("button", { name: /asistente/i })
        .first()
        .click();
      await expect(page.getByRole("textbox", { name: /mensaje/i })).toBeVisible();
      await revisar(page, `Botito (${esquema})`);
    });

    test("pantallas de administración", async ({ page }) => {
      await ingresar(page, cred.admin.correo, cred.admin.password);
      for (const ruta of ["casos", "dashboard", "auditoria", "usuarios", "centros", "sla", "conocimiento", "configuracion"]) {
        await page.goto(`/#/${ruta}`);
        await revisar(page, `${ruta} (${esquema})`);
      }
    });
  });
}

test("política de tratamiento de datos personales", async ({ page }) => {
  await page.goto("/#/privacidad");
  await expect(page.getByRole("heading", { name: /Tus derechos como titular/ })).toBeVisible();
  await revisar(page, "privacidad");
  const pdf = await page.request.get("/docs/manual-de-usuario.pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("pdf");
});

test("página de activación de cuenta", async ({ page }) => {
  await page.goto("/#/activar?token=enlace-que-no-existe-0000000000");
  await expect(page.getByRole("heading", { name: /no está disponible/i })).toBeVisible();
  await revisar(page, "activar (enlace no válido)");
});

test.describe("PWA", () => {
  test("manifiesto instalable y service worker activo", async ({ page, request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m.name).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBeTruthy();
    const tamanos = (m.icons as { sizes: string }[]).map((i) => i.sizes);
    expect(tamanos).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    await page.goto("/");
    const activo = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
    expect(activo).toBe(true);
  });

  test("abre sin conexión después de la primera visita", async ({ page, context }) => {
    await ingresar(page, cred.usuario.correo, cred.usuario.password);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // la página queda controlada por el service worker
    await page.goto("/#/mis-casos");
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("body")).toContainText(/Mesa de Ayuda/);
    await context.setOffline(false);
  });
});
