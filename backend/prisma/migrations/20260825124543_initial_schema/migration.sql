-- CreateEnum
CREATE TYPE "RolNombre" AS ENUM ('USUARIO', 'TECNICO', 'SUPERVISOR', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'BLOQUEADO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "TipoCaso" AS ENUM ('INCIDENTE', 'REQUERIMIENTO', 'MANTENIMIENTO', 'SOLICITUD_ACCESO', 'OTROS');

-- CreateEnum
CREATE TYPE "CategoriaCaso" AS ENUM ('HARDWARE', 'SOFTWARE', 'RED', 'CORREO', 'PLATAFORMAS_INSTITUCIONALES');

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "EstadoCaso" AS ENUM ('ABIERTO', 'ASIGNADO', 'EN_PROCESO', 'RESUELTO', 'CERRADO');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "nombre" "RolNombre" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'ACTIVO',
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "ultimoAcceso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rolId" INTEGER NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos" (
    "id" SERIAL NOT NULL,
    "numeroCaso" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo" "TipoCaso" NOT NULL,
    "categoria" "CategoriaCaso" NOT NULL,
    "prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoCaso" NOT NULL DEFAULT 'ABIERTO',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaAsignacion" TIMESTAMP(3),
    "fechaResolucion" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "usuarioId" INTEGER NOT NULL,
    "tecnicoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_casos" (
    "id" SERIAL NOT NULL,
    "estadoAnterior" "EstadoCaso",
    "estadoNuevo" "EstadoCaso" NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "casoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "historial_casos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias" (
    "id" SERIAL NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "rutaArchivo" TEXT NOT NULL,
    "tipoArchivo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "casoId" INTEGER NOT NULL,

    CONSTRAINT "evidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observaciones" (
    "id" SERIAL NOT NULL,
    "contenido" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "casoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "observaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calificaciones" (
    "id" SERIAL NOT NULL,
    "puntuacion" INTEGER NOT NULL,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "casoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "calificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_sla" (
    "id" SERIAL NOT NULL,
    "prioridad" "Prioridad" NOT NULL,
    "tiempoMaximo" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_sla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias" (
    "id" SERIAL NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" INTEGER,
    "descripcion" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "auditorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intentos_login" (
    "id" SERIAL NOT NULL,
    "exitoso" BOOLEAN NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,

    CONSTRAINT "intentos_login_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "casos_numeroCaso_key" ON "casos"("numeroCaso");

-- CreateIndex
CREATE UNIQUE INDEX "calificaciones_casoId_key" ON "calificaciones"("casoId");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_sla_prioridad_key" ON "configuracion_sla"("prioridad");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos" ADD CONSTRAINT "casos_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_casos" ADD CONSTRAINT "historial_casos_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "casos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_casos" ADD CONSTRAINT "historial_casos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "casos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observaciones" ADD CONSTRAINT "observaciones_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "casos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observaciones" ADD CONSTRAINT "observaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "casos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intentos_login" ADD CONSTRAINT "intentos_login_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
