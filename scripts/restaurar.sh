#!/bin/sh
# Restaura un respaldo creado por respaldo.sh (RNF-08).
# Uso (con la API detenida: docker compose stop api):
#   docker compose --profile respaldos run --rm --entrypoint sh respaldos /scripts/restaurar.sh /respaldos/mesa_ayuda_AAAAMMDDTHHMMSSZ.dump
# Para probar sin tocar la base principal, define PGDATABASE con otra base ya creada.
set -eu
ARCHIVO="${1:?Indica el archivo .dump a restaurar}"
[ -f "$ARCHIVO" ] || { echo "No existe $ARCHIVO" >&2; exit 1; }
echo "[restaurar] restaurando $ARCHIVO en la base «$PGDATABASE» de $PGHOST…"
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$PGDATABASE" "$ARCHIVO"
EVID="$(dirname "$ARCHIVO")/evidencias_$(basename "$ARCHIVO" .dump | sed 's/^mesa_ayuda_//').tar.gz"
if [ -f "$EVID" ] && [ -d "${RESPALDO_EVIDENCIAS:-/evidencias}" ] && [ -w "${RESPALDO_EVIDENCIAS:-/evidencias}" ]; then
  tar -xzf "$EVID" -C "${RESPALDO_EVIDENCIAS:-/evidencias}"
  echo "[restaurar] evidencias restauradas desde $EVID"
fi
echo "[restaurar] listo"
