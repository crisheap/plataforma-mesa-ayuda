# Documentación

| Documento | Para quién | Contenido |
|---|---|---|
| [ERS y documentación técnica v2.2](Plataforma_Mesa_de_Ayuda_ERS_y_Documentacion_Tecnica_v2.2.docx) | Equipo técnico y evaluadores | Requerimientos (RF, RNF, historias de usuario) con su estado actual, arquitectura y ADR, diseño UX/UI, UML de alto nivel, manual técnico, hallazgos corregidos, plan por fases y matriz de trazabilidad (Anexo C). |
| [Manual de instalación v2.2](Manual_de_Instalacion_Mesa_de_Ayuda_v2.2.docx) | Quien instala la plataforma | Guía paso a paso para principiantes: instalación en Windows, macOS o Linux (o con Docker), recorrido de prueba, PWA, uso diario, pruebas, respaldos, documentación de la API, métricas y solución de problemas. |
| [Manual de usuario v2.2](Manual_de_Usuario_Mesa_de_Ayuda_v2.2.docx) | Usuarios, técnicos, supervisores y administradores | Ingreso, cómo reportar correctamente un caso, seguimiento, confirmación de la solución, Botito, notificaciones, uso sin conexión y las tareas de cada rol. |

La carpeta [`img/`](img/) contiene las capturas usadas en el README y en los manuales.

## Versiones

- **v2.2 (noviembre de 2026):** calidad y operación. Análisis estático y formato con Biome, contrato OpenAPI, retención de conversaciones de Botito, respaldos con restauración verificada, registros y métricas, y pruebas de carga, accesibilidad y Lighthouse en la integración continua. Se redibujó la figura 2 del ERS. Nuevo: número de contacto opcional del solicitante en los casos (RF-CAS-14), incluido en el manual de usuario v2.2.
- **v2.1 (noviembre de 2026):** el ERS se alineó con el código implementado. Los estados de los requerimientos reflejan lo construido y verificado por las pruebas automáticas; los hallazgos H-01 a H-17 se conservan como línea base del backend v1, cada uno con el ajuste aplicado. Se agregó el manual de usuario por rol.
- **v2.0:** reestructuración del ERS, nuevos requerimientos (PWA, asistente, tema, identidad visual, nombre completo), arquitectura, UML, manual técnico y análisis de brechas.
