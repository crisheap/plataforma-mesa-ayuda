import { defineConfig, devices } from "@playwright/test";

/** Pruebas de extremo a extremo de la PWA (accesibilidad con axe y comportamiento PWA). */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:4000", trace: "retain-on-failure", locale: "es-CO" },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
    // Celular angosto (360 px, muy común en Android de gama media y baja)
    { name: "celular-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } } },
  ],
});
