import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida en las variables de entorno");
}

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type Db = typeof prisma | Tx;
