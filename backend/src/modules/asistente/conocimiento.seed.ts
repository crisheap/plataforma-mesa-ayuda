import type { CategoriaCaso } from "../../generated/prisma/client";

export const ARTICULOS_INICIALES: { titulo: string; contenido: string; palabrasClave: string[]; categoria: CategoriaCaso }[] = [
  {
    titulo: "No puedo iniciar sesión en la plataforma",
    categoria: "PLATAFORMAS_INSTITUCIONALES",
    palabrasClave: ["iniciar sesion", "ingresar", "no puedo entrar", "login", "acceso", "contrasena incorrecta", "bloqueada"],
    contenido:
      "1. Revisa que escribas tu correo institucional completo, sin espacios.\n2. Verifica que las mayúsculas no estén activadas.\n3. Después de 3 intentos fallidos la cuenta se bloquea 15 minutos: espera y vuelve a intentar.\n4. Si olvidaste tu contraseña, pide a un administrador que la restablezca.\n5. Si el problema continúa, crea un caso con una captura del mensaje de error.",
  },
  {
    titulo: "Olvidé mi contraseña",
    categoria: "PLATAFORMAS_INSTITUCIONALES",
    palabrasClave: ["olvide contrasena", "recuperar contrasena", "restablecer contrasena", "cambiar contrasena", "clave olvidada"],
    contenido:
      "Por seguridad yo nunca te pediré tu contraseña. Para recuperarla:\n1. Solicita el restablecimiento a un administrador de la mesa de ayuda (puedes crear un caso de tipo «Solicitud de acceso»).\n2. Recibirás una contraseña temporal y el sistema te pedirá cambiarla al ingresar.\n3. Usa una contraseña de mínimo 10 caracteres con mayúscula, minúscula, número y símbolo.",
  },
  {
    titulo: "El WiFi o internet no funciona o va muy lento",
    categoria: "RED",
    palabrasClave: ["wifi", "internet", "red", "conexion", "lento", "sin internet", "no conecta"],
    contenido:
      "1. Activa y desactiva el WiFi (o el modo avión) de tu equipo.\n2. Olvida la red y vuelve a conectarte.\n3. Verifica si otras personas cercanas tienen el mismo problema.\n4. Reinicia el equipo.\n5. Si estás por cable, revisa que esté bien conectado.\n6. Si nada funciona, crea un caso indicando el lugar exacto y la hora en que empezó la falla.",
  },
  {
    titulo: "No puedo conectarme a la VPN",
    categoria: "RED",
    palabrasClave: ["vpn", "conexion remota", "teletrabajo", "acceso remoto"],
    contenido:
      "1. Comprueba que tengas internet sin la VPN.\n2. Cierra completamente el cliente VPN y ábrelo de nuevo.\n3. Verifica que tu usuario esté habilitado para la VPN; si no lo está, solicita acceso con un caso de tipo «Solicitud de acceso».\n4. Anota el mensaje de error para adjuntarlo al caso.",
  },
  {
    titulo: "Problemas con el correo institucional",
    categoria: "CORREO",
    palabrasClave: ["correo", "outlook", "buzon lleno", "no recibo correos", "no puedo enviar", "email"],
    contenido:
      "1. Revisa si tu buzón está lleno: elimina correos pesados y vacía la papelera.\n2. Mira la carpeta de correo no deseado.\n3. Cierra sesión y vuelve a ingresar desde el navegador para descartar fallas del cliente.\n4. Si los correos rebotan, copia el mensaje de error completo en un caso.",
  },
  {
    titulo: "La impresora no imprime",
    categoria: "HARDWARE",
    palabrasClave: ["impresora", "imprimir", "no imprime", "atasco", "toner", "cola de impresion"],
    contenido:
      "1. Verifica que la impresora esté encendida, con papel y sin atascos.\n2. Revisa que sea la impresora seleccionada en tu equipo.\n3. Cancela los trabajos pendientes en la cola de impresión.\n4. Apaga y enciende la impresora.\n5. Si aparece un código de error, anótalo y crea un caso.",
  },
  {
    titulo: "Mi computador está lento o se congela",
    categoria: "HARDWARE",
    palabrasClave: ["lento", "computador", "se congela", "se traba", "pc", "equipo lento", "portatil"],
    contenido:
      "1. Guarda tu trabajo y reinicia el equipo.\n2. Cierra programas y pestañas que no uses.\n3. Verifica que tengas espacio libre en el disco.\n4. Instala las actualizaciones pendientes.\n5. Si sigue lento, crea un caso indicando desde cuándo ocurre y qué programa usas.",
  },
  {
    titulo: "Necesito instalar un programa",
    categoria: "SOFTWARE",
    palabrasClave: ["instalar", "programa", "software", "licencia", "office", "aplicacion"],
    contenido:
      "La instalación de software requiere autorización y licencia.\n1. Crea un caso de tipo «Requerimiento» con el nombre y versión del programa y para qué lo necesitas.\n2. Un técnico validará la licencia y lo instalará o te indicará la alternativa autorizada.",
  },
  {
    titulo: "Solicitar acceso a un sistema o permiso",
    categoria: "PLATAFORMAS_INSTITUCIONALES",
    palabrasClave: ["acceso", "permiso", "habilitar", "crear usuario", "rol", "solicitud de acceso"],
    contenido:
      "1. Crea un caso de tipo «Solicitud de acceso».\n2. Indica el sistema, el permiso que necesitas y el motivo.\n3. Menciona quién autoriza tu solicitud (jefe o coordinador).",
  },
  {
    titulo: "Cómo crear un caso en la mesa de ayuda",
    categoria: "PLATAFORMAS_INSTITUCIONALES",
    palabrasClave: ["crear caso", "reportar", "nuevo caso", "abrir caso", "registrar falla", "como reporto"],
    contenido:
      "1. Entra a «Nuevo caso».\n2. Escribe un título claro y describe qué pasó, cuándo y qué intentaste.\n3. Elige el tipo y la categoría.\n4. Adjunta capturas o archivos si ayudan.\n5. Al enviarlo recibirás un número de caso (CASO-AAAA-NNNNNN) para seguimiento.",
  },
  {
    titulo: "Cómo consultar el estado de mi caso",
    categoria: "PLATAFORMAS_INSTITUCIONALES",
    palabrasClave: ["estado de mi caso", "seguimiento", "como va mi caso", "mis casos", "consultar caso"],
    contenido:
      "Entra a «Mis casos» y abre el caso para ver su estado, el técnico asignado y el historial. También puedes preguntarme por tu número de caso, por ejemplo: «¿cómo va CASO-2026-000123?».",
  },
  {
    titulo: "Cómo calificar la atención recibida",
    categoria: "PLATAFORMAS_INSTITUCIONALES",
    palabrasClave: ["calificar", "calificacion", "evaluar", "estrellas", "cerrar caso", "confirmar solucion"],
    contenido:
      "Cuando un técnico marca tu caso como resuelto, ábrelo y revisa la solución. Si funcionó, confírmala para cerrarlo y califica de 1 a 5 estrellas. Si no funcionó, recházala indicando el motivo y el caso volverá a atención.",
  },
];
