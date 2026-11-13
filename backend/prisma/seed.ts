import "dotenv/config";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ARTICULOS_INICIALES } from "../src/modules/asistente/conocimiento.seed";
import { SLA_POR_DEFECTO } from "../src/core/sla";
import { validarPolitica } from "../src/utils/password";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está definida en el archivo .env");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log("🌱 Cargando datos iniciales...");

  for (const nombre of ["USUARIO", "TECNICO", "SUPERVISOR", "ADMINISTRADOR"] as const) {
    await prisma.rol.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  console.log("✓ Roles verificados");

  // Administrador inicial: la contraseña sale de ADMIN_INITIAL_PASSWORD o se genera al azar (se muestra una sola vez).
  const correoAdmin = (process.env.ADMIN_EMAIL ?? "admin@mesaayuda.local").toLowerCase();
  if (!(await prisma.usuario.findUnique({ where: { correo: correoAdmin } }))) {
    let password = process.env.ADMIN_INITIAL_PASSWORD ?? "";
    let generada = false;
    if (password && validarPolitica(password).length) throw new Error(`ADMIN_INITIAL_PASSWORD no cumple la política: ${validarPolitica(password).join(", ")}`);
    if (!password) { password = `${randomBytes(9).toString("base64url")}Aa1!`; generada = true; }
    const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: "ADMINISTRADOR" } });
    await prisma.usuario.create({
      data: { nombre: "Administrador", apellido: "Sistema", correo: correoAdmin, password: await bcrypt.hash(password, 12), rolId: rol.id, debeCambiarPassword: true },
    });
    console.log(`✓ Administrador creado: ${correoAdmin}`);
    if (generada) console.log(`  ⚠ Contraseña temporal (se muestra solo ahora): ${password}`);
    console.log("  El sistema pedirá cambiarla en el primer ingreso.");
  } else {
    console.log("✓ Administrador ya existe (no se modifica su contraseña)");
  }

  for (const [prioridad, tiempoMaximo] of Object.entries(SLA_POR_DEFECTO) as ["ALTA" | "MEDIA" | "BAJA", number][]) {
    await prisma.configuracionSLA.upsert({ where: { prioridad }, update: {}, create: { prioridad, tiempoMaximo } });
  }
  console.log("✓ SLA por defecto (minutos): " + JSON.stringify(SLA_POR_DEFECTO));

  if ((await prisma.articuloConocimiento.count()) === 0) {
    await prisma.articuloConocimiento.createMany({ data: ARTICULOS_INICIALES });
    console.log(`✓ ${ARTICULOS_INICIALES.length} artículos iniciales de la base de conocimiento`);
  }
  console.log("🌱 Listo.");
}

main().catch((e) => { console.error("❌ Error en el seed:", e); process.exit(1); }).finally(() => prisma.$disconnect());
