/**
 * Contrato OpenAPI 3.1 de la API (RNF-06).
 * Se genera a partir de la tabla OPERACIONES; la prueba openapi.test.ts verifica que cada ruta
 * declarada en los módulos esté documentada aquí y que no se documenten rutas inexistentes.
 * Se publica en GET /api/openapi.json y se explora en /api/docs.
 */

type Esquema = Record<string, unknown>;
type Metodo = "get" | "post" | "put" | "patch" | "delete";

interface Operacion {
  metodo: Metodo;
  ruta: string; // con parámetros estilo Express (:id)
  tag: string;
  resumen: string;
  roles?: string; // texto libre: quién puede usarla
  publica?: boolean;
  cuerpo?: Esquema;
  multipart?: boolean;
  query?: Record<string, Esquema>;
  respuesta?: Esquema;
  binaria?: string; // tipo MIME de una respuesta de archivo
  codigo?: number;
}

// ───────── esquemas reutilizables ─────────
const txt = (min?: number, max?: number): Esquema => ({
  type: "string",
  ...(min ? { minLength: min } : {}),
  ...(max ? { maxLength: max } : {}),
});
const ent = (min?: number, max?: number): Esquema => ({
  type: "integer",
  ...(min !== undefined ? { minimum: min } : {}),
  ...(max !== undefined ? { maximum: max } : {}),
});
const enumer = (...v: string[]): Esquema => ({ type: "string", enum: v });
const obj = (props: Record<string, Esquema>, req: string[] = [], cerrado = true): Esquema => ({
  type: "object",
  properties: props,
  ...(req.length ? { required: req } : {}),
  ...(cerrado ? { additionalProperties: false } : {}),
});
const ref = (n: string): Esquema => ({ $ref: `#/components/schemas/${n}` });
const fecha: Esquema = { type: "string", format: "date-time" };

const ESTADOS = ["ABIERTO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO"];
const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"];
const ROLES = ["USUARIO", "TECNICO", "SUPERVISOR", "ADMINISTRADOR"];
const TIPOS = ["INCIDENTE", "REQUERIMIENTO", "MANTENIMIENTO", "SOLICITUD_ACCESO", "OTROS"];
const CATEGORIAS = ["HARDWARE", "SOFTWARE", "RED", "CORREO", "PLATAFORMAS_INSTITUCIONALES"];

const paginacion: Record<string, Esquema> = { page: ent(1), pageSize: ent(1, 100) };

const filtrosCasos: Record<string, Esquema> = {
  ...paginacion,
  estado: enumer(...ESTADOS),
  prioridad: enumer(...PRIORIDADES),
  tecnicoId: ent(1),
  q: txt(0, 100),
  desde: fecha,
  hasta: fecha,
  slaVencido: enumer("true", "false"),
};

const OPERACIONES: Operacion[] = [
  // Salud y observabilidad
  {
    metodo: "get",
    ruta: "/api/health",
    tag: "Sistema",
    resumen: "Estado del servicio; con ?deep=1 verifica la base de datos",
    publica: true,
    query: { deep: enumer("1") },
  },
  {
    metodo: "get",
    ruta: "/api/metrics",
    tag: "Sistema",
    resumen: "Métricas en formato Prometheus (requiere METRICS_TOKEN como Bearer)",
    publica: true,
    binaria: "text/plain",
  },
  { metodo: "get", ruta: "/api/openapi.json", tag: "Sistema", resumen: "Este contrato OpenAPI", publica: true },

  // Autenticación
  {
    metodo: "post",
    ruta: "/api/auth/login",
    tag: "Autenticación",
    resumen: "Iniciar sesión",
    publica: true,
    cuerpo: obj({ correo: { type: "string", format: "email" }, password: txt(1, 200) }, ["correo", "password"]),
    respuesta: ref("Sesion"),
  },
  {
    metodo: "post",
    ruta: "/api/auth/refresh",
    tag: "Autenticación",
    resumen: "Renovar el token de acceso con el token de refresco (rotativo)",
    publica: true,
    cuerpo: obj({ refreshToken: txt(20) }, ["refreshToken"]),
    respuesta: ref("Sesion"),
  },
  {
    metodo: "post",
    ruta: "/api/auth/logout",
    tag: "Autenticación",
    resumen: "Cerrar sesión y revocar el token de refresco",
    publica: true,
    cuerpo: obj({ refreshToken: txt() }),
  },
  {
    metodo: "post",
    ruta: "/api/auth/acceso/verificar",
    tag: "Autenticación",
    resumen: "Validar un enlace de acceso y obtener el nombre y el correo de la cuenta",
    publica: true,
    cuerpo: obj({ token: txt(20, 100) }, ["token"]),
  },
  {
    metodo: "post",
    ruta: "/api/auth/acceso/activar",
    tag: "Autenticación",
    resumen: "Crear la contraseña con el enlace de acceso (un solo uso)",
    publica: true,
    cuerpo: obj({ token: txt(20, 100), passwordNueva: txt(10, 200) }, ["token", "passwordNueva"]),
  },

  {
    metodo: "get",
    ruta: "/api/auth/me",
    tag: "Autenticación",
    resumen: "Perfil del usuario autenticado",
    roles: "Cualquier rol",
    respuesta: ref("Usuario"),
  },
  {
    metodo: "patch",
    ruta: "/api/auth/password",
    tag: "Autenticación",
    resumen: "Cambiar la propia contraseña (obligatorio si es temporal)",
    roles: "Cualquier rol",
    cuerpo: obj({ passwordActual: txt(1), passwordNueva: txt(10, 200) }, ["passwordActual", "passwordNueva"]),
  },
  {
    metodo: "patch",
    ruta: "/api/auth/tema",
    tag: "Autenticación",
    resumen: "Guardar la preferencia de tema",
    roles: "Cualquier rol",
    cuerpo: obj({ preferenciaTema: enumer("CLARO", "OSCURO", "SISTEMA") }, ["preferenciaTema"]),
  },

  // Usuarios y roles
  {
    metodo: "get",
    ruta: "/api/usuarios/tecnicos",
    tag: "Usuarios",
    resumen: "Técnicos activos con su número de casos activos",
    roles: "Supervisor, Administrador",
  },
  {
    metodo: "get",
    ruta: "/api/usuarios",
    tag: "Usuarios",
    resumen: "Listar usuarios",
    roles: "Administrador",
    query: {
      ...paginacion,
      q: txt(0, 80),
      rol: enumer(...ROLES),
      estado: enumer("ACTIVO", "BLOQUEADO", "INACTIVO"),
      tipoCorreo: enumer("EMPRESARIAL", "PERSONAL"),
    },
  },
  {
    metodo: "post",
    ruta: "/api/usuarios",
    tag: "Usuarios",
    resumen:
      "Crear usuario: con enviarAcceso envía la bienvenida con un enlace para crear la contraseña; si no, devuelve una contraseña temporal una sola vez",
    roles: "Administrador",
    codigo: 201,
    cuerpo: obj(
      {
        nombre: txt(2, 80),
        apellido: txt(2, 80),
        correo: { type: "string", format: "email" },
        rol: enumer(...ROLES),
        password: txt(0, 72),
        tipoCorreo: {
          ...enumer("EMPRESARIAL", "PERSONAL"),
          description: "Si se omite, se deduce del dominio (dominios empresariales configurados).",
        },
        correoPersonal: {
          type: ["string", "null"],
          format: "email",
          description: "Recibe la bienvenida y los enlaces de acceso. Solo aplica a correos de acceso empresariales.",
        },
        enviarAcceso: { type: "boolean", description: "true: envía el correo de bienvenida con el enlace de activación (48 h)." },
      },
      ["nombre", "apellido", "correo", "rol"],
    ),
  },
  {
    metodo: "get",
    ruta: "/api/usuarios/:id",
    tag: "Usuarios",
    resumen: "Detalle de un usuario",
    roles: "Administrador",
    respuesta: ref("Usuario"),
  },
  {
    metodo: "patch",
    ruta: "/api/usuarios/:id",
    tag: "Usuarios",
    resumen: "Editar nombre, apellido o rol",
    roles: "Administrador",
    cuerpo: obj({
      nombre: txt(2, 80),
      apellido: txt(2, 80),
      rol: enumer(...ROLES),
      tipoCorreo: enumer("EMPRESARIAL", "PERSONAL"),
      correoPersonal: { type: ["string", "null"], format: "email" },
    }),
  },
  {
    metodo: "patch",
    ruta: "/api/usuarios/:id/estado",
    tag: "Usuarios",
    resumen: "Activar, bloquear o dar de baja (cierra sus sesiones)",
    roles: "Administrador",
    cuerpo: obj({ estado: enumer("ACTIVO", "BLOQUEADO", "INACTIVO") }, ["estado"]),
  },
  {
    metodo: "patch",
    ruta: "/api/usuarios/:id/restablecer-password",
    tag: "Usuarios",
    resumen: "Restablecer la contraseña con una temporal",
    roles: "Administrador",
    cuerpo: obj({ passwordNueva: txt(0, 72) }),
  },
  {
    metodo: "post",
    ruta: "/api/usuarios/:id/enviar-acceso",
    tag: "Usuarios",
    resumen: "Enviar o reenviar el enlace para crear o restablecer la contraseña (anula los anteriores)",
    roles: "Administrador",
    respuesta: ref("Acceso"),
  },

  { metodo: "get", ruta: "/api/roles", tag: "Usuarios", resumen: "Catálogo de roles (solo lectura)", roles: "Administrador" },
  { metodo: "get", ruta: "/api/roles/:id", tag: "Usuarios", resumen: "Detalle de un rol", roles: "Administrador" },

  // Casos
  {
    metodo: "post",
    ruta: "/api/casos",
    tag: "Casos",
    resumen: "Registrar un caso (nace ABIERTO con prioridad MEDIA)",
    roles: "Cualquier rol",
    codigo: 201,
    cuerpo: obj(
      {
        titulo: txt(5, 150),
        descripcion: txt(10, 4000),
        tipo: enumer(...TIPOS),
        categoria: enumer(...CATEGORIAS),
        telefonoContacto: {
          type: "string",
          maxLength: 20,
          pattern: "^\\+?[\\d\\s()-]+$",
          description: "Opcional. Número para que el técnico contacte al solicitante (7 a 15 dígitos).",
          examples: ["+57 300 123 4567"],
        },
      },
      ["titulo", "descripcion", "tipo", "categoria"],
    ),
    respuesta: ref("Caso"),
  },
  {
    metodo: "get",
    ruta: "/api/casos",
    tag: "Casos",
    resumen: "Todos los casos con filtros",
    roles: "Supervisor, Administrador",
    query: filtrosCasos,
  },
  {
    metodo: "get",
    ruta: "/api/casos/mis-casos",
    tag: "Casos",
    resumen: "Casos creados por el usuario autenticado",
    roles: "Cualquier rol",
    query: filtrosCasos,
  },
  {
    metodo: "get",
    ruta: "/api/casos/asignados",
    tag: "Casos",
    resumen: "Casos asignados al técnico, ordenados por SLA y prioridad",
    roles: "Técnico",
    query: filtrosCasos,
  },
  {
    metodo: "get",
    ruta: "/api/casos/por-numero/:numero",
    tag: "Casos",
    resumen: "Buscar un caso por su número (CASO-AAAA-NNNNNN)",
    roles: "Con acceso al caso",
    respuesta: ref("Caso"),
  },
  {
    metodo: "get",
    ruta: "/api/casos/:id",
    tag: "Casos",
    resumen: "Detalle del caso (un caso ajeno responde 404)",
    roles: "Con acceso al caso",
    respuesta: ref("Caso"),
  },
  { metodo: "get", ruta: "/api/casos/:id/historial", tag: "Casos", resumen: "Historial de cambios de estado", roles: "Con acceso al caso" },
  {
    metodo: "patch",
    ruta: "/api/casos/:id/asignar",
    tag: "Casos",
    resumen: "Asignar o reasignar técnico y prioridad",
    roles: "Supervisor, Administrador",
    cuerpo: obj({ tecnicoId: ent(1), prioridad: enumer(...PRIORIDADES) }, ["tecnicoId"]),
    respuesta: ref("Caso"),
  },
  {
    metodo: "patch",
    ruta: "/api/casos/:id/prioridad",
    tag: "Casos",
    resumen: "Cambiar la prioridad (recalcula el SLA)",
    roles: "Supervisor, Administrador",
    cuerpo: obj({ prioridad: enumer(...PRIORIDADES) }, ["prioridad"]),
    respuesta: ref("Caso"),
  },
  {
    metodo: "patch",
    ruta: "/api/casos/:id/estado",
    tag: "Casos",
    resumen: "Cambiar el estado según el rol (ver máquina de estados)",
    roles: "Técnico asignado, creador, Supervisor, Administrador",
    cuerpo: obj({ estado: enumer(...ESTADOS), solucion: txt(10, 4000), motivo: txt(5, 1000) }, ["estado"]),
    respuesta: ref("Caso"),
  },
  {
    metodo: "get",
    ruta: "/api/casos/:id/observaciones",
    tag: "Casos",
    resumen: "Comentarios del caso (el solicitante no ve los internos)",
    roles: "Con acceso al caso",
  },
  {
    metodo: "post",
    ruta: "/api/casos/:id/observaciones",
    tag: "Casos",
    resumen: "Agregar un comentario público o una nota interna",
    roles: "Con acceso al caso",
    codigo: 201,
    cuerpo: obj({ contenido: txt(2, 2000), visibilidad: enumer("PUBLICA", "INTERNA") }, ["contenido"]),
  },
  {
    metodo: "post",
    ruta: "/api/casos/:id/calificacion",
    tag: "Casos",
    resumen: "Calificar la atención de un caso cerrado (una sola vez)",
    roles: "Creador del caso",
    codigo: 201,
    cuerpo: obj({ puntuacion: ent(1, 5), comentario: txt(0, 1000) }, ["puntuacion"]),
  },
  {
    metodo: "get",
    ruta: "/api/casos/:id/evidencias",
    tag: "Evidencias",
    resumen: "Listar evidencias del caso",
    roles: "Con acceso al caso",
  },
  {
    metodo: "post",
    ruta: "/api/casos/:id/evidencias",
    tag: "Evidencias",
    resumen: "Adjuntar hasta 5 archivos (se valida tipo, tamaño y firma)",
    roles: "Con acceso al caso",
    codigo: 201,
    multipart: true,
  },
  {
    metodo: "get",
    ruta: "/api/casos/:id/evidencias/:evidenciaId/descargar",
    tag: "Evidencias",
    resumen: "Descargar una evidencia",
    roles: "Con acceso al caso",
    binaria: "application/octet-stream",
  },

  // SLA, reportes y auditoría
  {
    metodo: "get",
    ruta: "/api/configuracion/correo",
    tag: "Administración",
    resumen: "Dominios de correo empresariales, estado del correo saliente y vigencia de los enlaces",
    roles: "Administrador",
  },
  {
    metodo: "put",
    ruta: "/api/configuracion/correo",
    tag: "Administración",
    resumen: "Guardar los dominios empresariales; con reclasificar, actualiza el tipo de correo de las cuentas",
    roles: "Administrador",
    cuerpo: obj(
      {
        dominiosEmpresariales: { type: "array", maxItems: 50, items: { type: "string", examples: ["sena.edu.co"] } },
        reclasificar: { type: "boolean" },
      },
      ["dominiosEmpresariales"],
    ),
  },
  { metodo: "get", ruta: "/api/sla", tag: "Administración", resumen: "Tiempos de SLA por prioridad", roles: "Supervisor, Administrador" },
  {
    metodo: "put",
    ruta: "/api/sla",
    tag: "Administración",
    resumen: "Configurar tiempos de SLA (recalcula los casos abiertos)",
    roles: "Administrador",
    cuerpo: obj(
      {
        configuraciones: {
          type: "array",
          minItems: 1,
          items: obj({ prioridad: enumer(...PRIORIDADES), tiempoMaximo: ent(5, 43200), activo: { type: "boolean" } }, [
            "prioridad",
            "tiempoMaximo",
          ]),
        },
      },
      ["configuraciones"],
    ),
  },
  {
    metodo: "get",
    ruta: "/api/reportes/kpis",
    tag: "Reportes",
    resumen: "Indicadores: casos por estado, prioridad y técnico, tiempos, SLA y satisfacción",
    roles: "Supervisor, Administrador",
    query: { desde: fecha, hasta: fecha, tecnicoId: ent(1), prioridad: enumer(...PRIORIDADES), estado: enumer(...ESTADOS) },
  },
  {
    metodo: "get",
    ruta: "/api/reportes/casos.xlsx",
    tag: "Reportes",
    resumen: "Reporte de casos en Excel (hojas Casos y Resumen)",
    roles: "Supervisor, Administrador",
    query: { desde: fecha, hasta: fecha, tecnicoId: ent(1), prioridad: enumer(...PRIORIDADES), estado: enumer(...ESTADOS) },
    binaria: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    metodo: "get",
    ruta: "/api/auditoria",
    tag: "Reportes",
    resumen: "Bitácora de auditoría (solo lectura)",
    roles: "Supervisor, Administrador",
    query: { ...paginacion, accion: txt(0, 60), entidad: txt(0, 60), usuarioId: ent(1), desde: fecha, hasta: fecha },
  },

  // Notificaciones
  {
    metodo: "get",
    ruta: "/api/notificaciones",
    tag: "Notificaciones",
    resumen: "Notificaciones del usuario y contador de no leídas",
    roles: "Cualquier rol",
    query: { ...paginacion, soloNoLeidas: enumer("true", "false") },
  },
  {
    metodo: "patch",
    ruta: "/api/notificaciones/leer-todas",
    tag: "Notificaciones",
    resumen: "Marcar todas como leídas",
    roles: "Cualquier rol",
  },
  {
    metodo: "patch",
    ruta: "/api/notificaciones/:id/leida",
    tag: "Notificaciones",
    resumen: "Marcar una notificación como leída",
    roles: "Cualquier rol",
  },
  {
    metodo: "get",
    ruta: "/api/push/clave-publica",
    tag: "Notificaciones",
    resumen: "Clave pública VAPID para suscribirse a push",
    roles: "Cualquier rol",
  },
  {
    metodo: "post",
    ruta: "/api/push/suscripciones",
    tag: "Notificaciones",
    resumen: "Registrar una suscripción push",
    roles: "Cualquier rol",
    codigo: 201,
    cuerpo: obj(
      { endpoint: { type: "string", format: "uri" }, keys: obj({ p256dh: txt(10, 300), auth: txt(5, 100) }, ["p256dh", "auth"]) },
      ["endpoint", "keys"],
    ),
  },
  {
    metodo: "delete",
    ruta: "/api/push/suscripciones",
    tag: "Notificaciones",
    resumen: "Eliminar una suscripción push",
    roles: "Cualquier rol",
    cuerpo: obj({ endpoint: { type: "string", format: "uri" } }, ["endpoint"]),
  },

  // Asistente
  {
    metodo: "post",
    ruta: "/api/asistente/conversaciones",
    tag: "Asistente",
    resumen: "Iniciar una conversación con Botito (incluye el saludo)",
    roles: "Cualquier rol",
    codigo: 201,
  },
  {
    metodo: "get",
    ruta: "/api/asistente/conversaciones/:id",
    tag: "Asistente",
    resumen: "Conversación propia con sus mensajes",
    roles: "Dueño de la conversación",
  },
  {
    metodo: "post",
    ruta: "/api/asistente/conversaciones/:id/mensajes",
    tag: "Asistente",
    resumen: "Enviar un mensaje y recibir la respuesta del asistente",
    roles: "Dueño de la conversación",
    cuerpo: obj({ contenido: txt(1, 1500) }, ["contenido"]),
  },
  {
    metodo: "patch",
    ruta: "/api/asistente/conversaciones/:id/mensajes/:mid/util",
    tag: "Asistente",
    resumen: "Marcar si una respuesta fue útil",
    roles: "Dueño de la conversación",
    cuerpo: obj({ util: { type: "boolean" } }, ["util"]),
  },
  {
    metodo: "patch",
    ruta: "/api/asistente/conversaciones/:id/caso",
    tag: "Asistente",
    resumen: "Vincular la conversación con el caso creado desde ella",
    roles: "Dueño de la conversación",
    cuerpo: obj({ casoId: ent(1) }, ["casoId"]),
  },
  {
    metodo: "post",
    ruta: "/api/asistente/sugerencia-caso",
    tag: "Asistente",
    resumen: "Proponer título, tipo y categoría a partir de un texto",
    roles: "Cualquier rol",
    cuerpo: obj({ texto: txt(5, 3000) }, ["texto"]),
  },
  {
    metodo: "get",
    ruta: "/api/asistente/conocimiento",
    tag: "Asistente",
    resumen: "Artículos de la base de conocimiento",
    roles: "Administrador",
  },
  {
    metodo: "post",
    ruta: "/api/asistente/conocimiento",
    tag: "Asistente",
    resumen: "Crear artículo",
    roles: "Administrador",
    codigo: 201,
    cuerpo: ref("Articulo"),
  },
  {
    metodo: "patch",
    ruta: "/api/asistente/conocimiento/:id",
    tag: "Asistente",
    resumen: "Editar o desactivar un artículo",
    roles: "Administrador",
    cuerpo: ref("Articulo"),
  },
];

const COMPONENTES = {
  securitySchemes: {
    bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Token de acceso de POST /api/auth/login (15 minutos)." },
  },
  schemas: {
    Exito: obj({ success: { type: "boolean", const: true }, message: { type: "string" }, data: {} }, ["success"]),
    Error: obj(
      {
        success: { type: "boolean", const: false },
        message: { type: "string" },
        errors: { type: "array", items: obj({ campo: { type: "string" }, mensaje: { type: "string" } }) },
      },
      ["success", "message"],
    ),
    Usuario: obj(
      {
        id: { type: "integer" },
        nombre: { type: "string" },
        apellido: { type: "string" },
        nombreCompleto: { type: "string" },
        correo: { type: "string", format: "email" },
        rol: enumer(...ROLES),
        estado: enumer("ACTIVO", "BLOQUEADO", "INACTIVO"),
        preferenciaTema: enumer("CLARO", "OSCURO", "SISTEMA"),
        tipoCorreo: enumer("EMPRESARIAL", "PERSONAL"),
        correoPersonal: { type: ["string", "null"], format: "email" },
        debeCambiarPassword: { type: "boolean" },
      },
      [],
      false,
    ),
    Sesion: obj(
      {
        token: { type: "string" },
        refreshToken: { type: "string" },
        expiresIn: { type: "string", examples: ["15m"] },
        usuario: ref("Usuario"),
      },
      [],
      false,
    ),
    Caso: obj(
      {
        id: { type: "integer" },
        numeroCaso: { type: "string", pattern: "^CASO-\\d{4}-\\d{6}$" },
        titulo: { type: "string" },
        descripcion: { type: "string" },
        tipo: enumer(...TIPOS),
        categoria: enumer(...CATEGORIAS),
        estado: enumer(...ESTADOS),
        prioridad: enumer(...PRIORIDADES),
        telefonoContacto: { type: ["string", "null"] },
        solucion: { type: ["string", "null"] },
        createdAt: fecha,
        updatedAt: fecha,
        sla: obj({
          venceEn: { type: ["string", "null"], format: "date-time" },
          minutosRestantes: { type: ["integer", "null"] },
          semaforo: enumer("EN_TIEMPO", "EN_RIESGO", "VENCIDO", "CUMPLIDO", "INCUMPLIDO", "SIN_SLA"),
        }),
      },
      [],
      false,
    ),
    Acceso: obj({
      enviadoA: { type: "string", format: "email" },
      enviado: { type: "boolean" },
      expiraEn: fecha,
      enlace: { type: "string", description: "Solo si el servidor no tiene SMTP configurado (desarrollo)." },
      error: { type: "string" },
    }),
    Articulo: obj({
      titulo: txt(5, 150),
      contenido: txt(20, 6000),
      palabrasClave: { type: "array", minItems: 1, maxItems: 20, items: txt(2, 60) },
      categoria: { type: ["string", "null"], enum: [...CATEGORIAS, null] },
      activo: { type: "boolean" },
    }),
  },
  responses: Object.fromEntries(
    [
      ["400", "Datos inválidos"],
      ["401", "Sin token, token vencido o cuenta no activa"],
      ["403", "El rol no tiene permiso, o la contraseña temporal no se ha cambiado"],
      ["404", "No existe o no tienes acceso"],
      ["429", "Demasiadas solicitudes"],
    ].map(([c, d]) => [`E${c}`, { description: d, content: { "application/json": { schema: ref("Error") } } }]),
  ),
};

const aOpenApi = (ruta: string) => ruta.replace(/:([A-Za-z]+)/g, "{$1}");
const idOperacion = (o: Operacion) =>
  o.metodo +
  aOpenApi(o.ruta)
    .replace(/^\/api/, "")
    .split(/[/.-]/)
    .filter(Boolean)
    .map((p) => p.replace(/[{}]/g, ""))
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");

function operacion(o: Operacion) {
  const params = [...o.ruta.matchAll(/:([A-Za-z]+)/g)].map(([, n]) => ({
    name: n,
    in: "path",
    required: true,
    schema: n === "numero" ? { type: "string" } : { type: "integer", minimum: 1 },
  }));
  const query = Object.entries(o.query ?? {}).map(([name, schema]) => ({ name, in: "query", required: false, schema }));
  const exito = o.binaria
    ? { description: "Archivo", content: { [o.binaria]: { schema: { type: "string", format: "binary" } } } }
    : {
        description: "Operación exitosa",
        content: { "application/json": { schema: o.respuesta ? { allOf: [ref("Exito"), obj({ data: o.respuesta })] } : ref("Exito") } },
      };
  const errores: Record<string, unknown> = { 400: { $ref: "#/components/responses/E400" }, 429: { $ref: "#/components/responses/E429" } };
  if (!o.publica) Object.assign(errores, { 401: { $ref: "#/components/responses/E401" }, 403: { $ref: "#/components/responses/E403" } });
  if (o.ruta.includes(":")) errores[404] = { $ref: "#/components/responses/E404" };
  return {
    operationId: idOperacion(o),
    tags: [o.tag],
    summary: o.resumen,
    ...(o.roles ? { description: `**Roles:** ${o.roles}` } : {}),
    ...(o.publica ? { security: [] } : {}),
    ...(params.length || query.length ? { parameters: [...params, ...query] } : {}),
    ...(o.cuerpo ? { requestBody: { required: true, content: { "application/json": { schema: o.cuerpo } } } } : {}),
    ...(o.multipart
      ? {
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: obj({ archivos: { type: "array", maxItems: 5, items: { type: "string", format: "binary" } } }, ["archivos"]),
              },
            },
          },
        }
      : {}),
    responses: { [o.codigo ?? 200]: exito, ...errores },
  };
}

export function construirOpenApi(version = "2.1.0") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const o of OPERACIONES) {
    const ruta = aOpenApi(o.ruta);
    paths[ruta] ??= {};
    paths[ruta][o.metodo] = operacion(o);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "API Plataforma Mesa de Ayuda – SENA",
      version,
      description:
        "API REST para registrar, asignar y resolver casos de soporte técnico, con SLA, notificaciones, reportes, auditoría y el asistente Botito. Todas las respuestas usan el formato { success, message?, data? }.",
    },
    servers: [{ url: "/", description: "Mismo origen de la aplicación" }],
    security: [{ bearer: [] }],
    tags: ["Sistema", "Autenticación", "Usuarios", "Casos", "Evidencias", "Administración", "Reportes", "Notificaciones", "Asistente"].map(
      (name) => ({ name }),
    ),
    paths,
    components: COMPONENTES,
  };
}

/** Pares "MÉTODO /ruta" documentados (para la prueba de contrato). */
export const operacionesDocumentadas = (): string[] => OPERACIONES.map((o) => `${o.metodo.toUpperCase()} ${o.ruta}`);
