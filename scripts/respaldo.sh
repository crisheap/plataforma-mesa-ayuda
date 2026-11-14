#!/bin/sh
# Respaldo de la base de datos y de las evidencias (RNF-08).
# Se ejecuta dentro del servicio «respaldos» de docker-compose (imagen postgres:16), que define
# PGHOST, PGUSER, PGPASSWORD y PGDATABASE. Variables opcionales:
#   RESPALDO_CADA_HORAS (24)     frecuencia de los respaldos
#   RESPALDO_CONSERVAR_DIAS (14) días que se conservan los archivos
#   RESPALDO_UNA_VEZ (false)     true = un solo respaldo y termina
set -eu
DESTINO="${RESPALDO_DESTINO:-/respaldos}"
EVIDENCIAS="${RESPALDO_EVIDENCIAS:-/evidencias}"
CADA_HORAS="${RESPALDO_CADA_HORAS:-24}"
CONSERVAR_DIAS="${RESPALDO_CONSERVAR_DIAS:-14}"
mkdir -p "$DESTINO"

respaldar() {
  marca=$(date -u +%Y%m%dT%H%M%SZ)
  archivo="$DESTINO/mesa_ayuda_$marca.dump"
  # Formato «custom»: comprimido y restaurable por tablas con pg_restore.
  pg_dump --format=custom --no-owner --file="$archivo.tmp"
  mv "$archivo.tmp" "$archivo"
  if [ -d "$EVIDENCIAS" ] && [ -n "$(ls -A "$EVIDENCIAS" 2>/dev/null)" ]; then
    tar -czf "$DESTINO/evidencias_$marca.tar.gz" -C "$EVIDENCIAS" .
  fi
  find "$DESTINO" -maxdepth 1 \( -name 'mesa_ayuda_*.dump' -o -name 'evidencias_*.tar.gz' \) -mtime +"$CONSERVAR_DIAS" -delete
  echo "[respaldo] $(date -u +%FT%TZ) listo: $archivo ($(du -h "$archivo" | cut -f1))"
}

respaldar
[ "${RESPALDO_UNA_VEZ:-false}" = "true" ] && exit 0
while sleep $((CADA_HORAS * 3600)); do
  respaldar || echo "[respaldo] $(date -u +%FT%TZ) el respaldo falló" >&2
done
