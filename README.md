# REPFORA E.P. — Sistema de Seguimiento de Etapa Productiva

REPFORA es una solución integral diseñada para el SENA, destinada a gestionar, automatizar y auditar el ciclo completo de la Etapa Productiva de los aprendices. El sistema permite el control de bitácoras, seguimientos, documentación de certificación y la bolsa de horas de los instructores.

## 🚀 Tecnologías y Librerías Usadas

### Backend Core
*   **Node.js & Express**: Entorno de ejecución y framework web robusto.
*   **MongoDB & Mongoose**: Base de datos NoSQL y modelado de objetos para una estructura de datos flexible.
*   **ES Modules (ESM)**: Uso de `import/export` nativo para un código moderno y modular.

### Seguridad y Autenticación
*   **jsonwebtoken (JWT)**: Gestión de sesiones seguras mediante tokens.
*   **bcryptjs**: Encriptación de contraseñas con algoritmos de hash de alta seguridad.

### Gestión de Archivos y Documentos
*   **pdfkit**: Generación dinámica y programática de reportes y actas en formato PDF.
*   **multer**: Middleware para la recepción y procesamiento de archivos (multipart/form-data).
*   **xlsx / csv-parser**: Procesamiento de archivos Excel y CSV para la importación masiva de aprendices.

### Automatización y Comunicaciones
*   **nodemailer**: Envío de notificaciones automáticas por correo electrónico.
*   **node-cron**: Programación de tareas en segundo plano (alertas de vencimiento, revisiones pendientes).

---

## 🏗️ Estructura y Flujo de Desarrollo (Módulos 1-12)

El desarrollo se realizó de forma incremental, siguiendo una jerarquía de dependencias estricta:

### 1. Autenticación (`Auth`)
*   **Clave**: Gestión de roles (`ADMIN`, `INSTRUCTOR`, `APPRENTICE`) y primer inicio de sesión obligatorio.
*   **Funciones**: `login()`, `changePasswordFirstLogin()`, `verifyToken` (middleware).

### 2. Configuración del Sistema (`SystemConfig`)
*   **Clave**: Variables globales dinámicas (horas por bitácora, días de alerta).
*   **Variable**: `key` (PK), `value` (Mixed).

### 3. Usuarios (`Users`)
*   **Clave**: Gestión de perfiles y carga masiva.
*   **Funciones**: `createInstructor()`, `importApprenticesFromCSV()`.

### 4. Empresas (`Companies`)
*   **Clave**: Registro de entes coformadores y supervisores.

### 5. Etapas Productivas (`ProductiveStages`)
*   **Clave**: El núcleo del sistema. Vincula aprendiz, empresa e instructores.
*   **Lógica**: `checkAndAdvanceStatus()` — Función que evalúa el progreso para cambiar automáticamente de `ACTIVE` a `IN_FOLLOWUP` o `CERTIFICATION`.

### 6. Bitácoras (`Bitacoras`)
*   **Clave**: Entregas quincenales.
*   **Funciones**: `submitBitacora()`, `approveBitacora()`. Incrementa `completedBitacoras`.

### 7. Seguimientos (`Trackings`)
*   **Clave**: Visitas técnicas (Presenciales/Virtuales) y extraordinarias.
*   **Lógica**: Requiere validación de firmas (`signedByInstructor`, `signedByApprentice`) antes de la ejecución.

### 8. Bolsa de Horas (`Hours`)
*   **Clave**: Registro mensual de la labor del instructor.
*   **Funciones**: `addHours()` (centralizada), `carryOver()` (traslado de excedentes).

### 9. Documentos de Certificación (`Documents`)
*   **Clave**: Flujo final de 3 documentos obligatorios.
*   **Regla**: Solo se activan horas de certificación si los 3 documentos están en estado `APPROVED`.

### 10. Novedades (`Novelties`)
*   **Clave**: Reporte de incidentes críticos (deserción, etc.).
*   **Punto Clave**: Generación inmediata de acta PDF al reportar.

### 11. Notificaciones (`Notifications`)
*   **Clave**: Sistema dual.
*   **Funciones**: `notificationService.send()` — Despacha a la base de datos y por Email simultáneamente sin bloquear el flujo principal.

### 12. Reportes (`Reports`)
*   **Clave**: Inteligencia de datos y exportación.
*   **Funciones**: `getEPSummary()`, `exportToPdf()`.

---

## 🛠️ Puntos Clave de Implementación

### Generación de PDFs (`pdfGenerator.util.js`)
Se implementó un motor genérico basado en **PDFKit** que recibe secciones de datos y genera un buffer listo para descarga o almacenamiento en Drive.
*   **Función**: `generatePdf({ title, sections, summary })`.
*   **Uso**: Reportes administrativos, actas de novedades y certificados de horas.

### Gestión de Archivos (`Files`)
El sistema utiliza **Multer** para recibir archivos. Aunque el backend procesa el archivo, la arquitectura está preparada para integrarse con **Google Drive API**, utilizando un patrón de "Mocks" en desarrollo que simula el almacenamiento permanente y genera URLs de acceso.

### Trazabilidad (`AuditLog`)
Cada acción crítica (borrar un documento, cambiar un estado, pagar horas) queda registrada en la colección `audit_logs`.
*   **Campos**: `action`, `performedBy`, `entityId`, `details`.

### Automatización (`Cron Jobs`)
En `src/jobs/alerts.job.js` residen las tareas que corren diariamente a las 8:00 AM para:
*   Notificar bitácoras no entregadas.
*   Alertar a Admins sobre instructores con revisiones atrasadas (> 7 días).
*   Avisar sobre vencimientos de fichas.

---

## 🚦 Cómo ejecutar el proyecto

1.  **Instalar dependencias**: `npm install`
2.  **Configurar entorno**: Crear un archivo `.env` con:
    *   `MONGODB_URI`, `JWT_SECRET`, `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`.
3.  **Semilla de datos**: `npm run seed` (crea el Admin inicial y configuraciones).
4.  **Pruebas**: `npm test` (ejecuta los 12 suites de pruebas con Jest).




  🟢 Módulo 1: Autenticación (auth.service.js)
  ┌──────────────────────────┬──────────────────┬──────────────┬───────────────────────┐
  │ Función                  │ Descripción      │ Test         │ Metodología del Test  │
  │                          │                  │ Asociado     │                       │
  ├──────────────────────────┼──────────────────┼──────────────┼───────────────────────┤
  │ login                    │ Valida           │ auth.test.js │ Simula login con      │
  │                          │ credenciales y   │              │ nationalId y verifica │
  │                          │ genera JWT.      │              │ estructura del token. │
  │ changePasswordFirstLogin │ Fuerza cambio de │ auth.test.js │ Verifica que el flag  │
  │                          │ clave inicial.   │              │ firstLogin cambie a   │
  │                          │                  │              │ false en la DB.       │
  └──────────────────────────┴──────────────────┴──────────────┴───────────────────────┘

  🔵 Módulo 3: Usuarios (users.service.js)
  ┌──────────────────────────┬─────────────┬───────────────┬──────────────────────┐
  │ Función                  │ Descripción │ Test Asociado │ Metodología del Test │
  ├──────────────────────────┼─────────────┼───────────────┼──────────────────────┤
  │ createInstructor         │ Crea perfil │ users.test.js │ Valida que un        │
  │                          │ docente con │               │ INSTRUCTOR no tenga  │
  │                          │ roles.      │               │ permisos de ADMIN.   │
  │ importApprenticesFromCSV │ Procesa     │ users.test.js │ Carga un buffer de   │
  │                          │ archivos    │               │ texto tipo CSV y     │
  │                          │ masivos.    │               │ cuenta registros     │
  │                          │             │               │ insertados.          │
  └──────────────────────────┴─────────────┴───────────────┴──────────────────────┘

  🟠 Módulo 5: Etapas Productivas (productiveStages.service.js)
  ┌───────────────────────┬───────────────┬──────────────────────────┬─────────────────┐
  │ Función               │ Descripción   │ Test Asociado            │ Metodología del │
  │                       │               │                          │ Test            │
  ├───────────────────────┼───────────────┼──────────────────────────┼─────────────────┤
  │ checkAndAdvanceStatus │ (Crítica)     │ productiveStages.test.js │ Crea una EP y   │
  │                       │ Evalúa si el  │                          │ simula          │
  │                       │ aprendiz      │                          │ aprobación de   │
  │                       │ cumplió metas │                          │ bitácoras hasta │
  │                       │ para pasar de │                          │ ver el cambio a │
  │                       │ estado.       │                          │ IN_FOLLOWUP.    │
  └───────────────────────┴───────────────┴──────────────────────────┴─────────────────┘

  🟣 Módulo 6: Bitácoras (bitacoras.service.js)
  ┌─────────────────┬───────────────────┬───────────────────┬─────────────────────────┐
  │ Función         │ Descripción       │ Test Asociado     │ Metodología del Test    │
  ├─────────────────┼───────────────────┼───────────────────┼─────────────────────────┤
  │ submitBitacora  │ Sube PDF y valida │ bitacoras.test.js │ Intenta subir dos veces │
  │                 │ que el período no │                   │ el mismo período y      │
  │                 │ se solape.        │                   │ espera un error 409.    │
  │ approveBitacora │ Aprueba y dispara │ bitacoras.test.js │ Verifica que tras       │
  │                 │ el conteo de      │                   │ aprobar, el instructor  │
  │                 │ horas.            │                   │ tenga +2 horas en su    │
  │                 │                   │                   │ registro.               │
  └─────────────────┴───────────────────┴───────────────────┴─────────────────────────┘

  🟡 Módulo 7: Seguimientos (trackings.service.js)
  ┌──────────────────────┬────────────────┬───────────────────┬────────────────────────┐
  │ Función              │ Descripción    │ Test Asociado     │ Metodología del Test   │
  ├──────────────────────┼────────────────┼───────────────────┼────────────────────────┤
  │ executeTracking      │ Marca visita   │ trackings.test.js │ Valida que             │
  │                      │ como realizada │                   │ signedByInstructor sea │
  │                      │ tras validar   │                   │ true antes de permitir │
  │                      │ firmas.        │                   │ la ejecución.          │
  │ requestExtraordinary │ Solicita       │ trackings.test.js │ Verifica que requiera  │
  │                      │ visita extra.  │                   │ aprobación de ADMIN    │
  │                      │                │                   │ para sumar horas.      │
  └──────────────────────┴────────────────┴───────────────────┴────────────────────────┘

  💰 Módulo 8: Bolsa de Horas (hours.service.js)
  ┌───────────┬────────────────────┬───────────────┬────────────────────────────────┐
  │ Función   │ Descripción        │ Test Asociado │ Metodología del Test           │
  ├───────────┼────────────────────┼───────────────┼────────────────────────────────┤
  │ addHours  │ Centraliza la suma │ hours.test.js │ Suma horas hasta superar el    │
  │           │ de horas y detecta │               │ límite configurado y verifica  │
  │           │ sobrecupo.         │               │ el campo excessHours.          │
  │ carryOver │ Traslada horas     │ hours.test.js │ Ejecuta el traslado y valida   │
  │           │ excedentes al mes  │               │ que el mes origen quede en 0 y │
  │           │ siguiente.         │               │ el destino sume el valor.      │
  └───────────┴────────────────────┴───────────────┴────────────────────────────────┘

  📄 Módulo 9: Documentos (documents.service.js)
  ┌─────────────────┬───────────────────┬───────────────────┬─────────────────────────┐
  │ Función         │ Descripción       │ Test Asociado     │ Metodología del Test    │
  ├─────────────────┼───────────────────┼───────────────────┼─────────────────────────┤
  │ approveDocument │ Valida documentos │ documents.test.js │ Prueba que las horas de │
  │                 │ de certificación. │                   │ certificación solo se   │
  │                 │                   │                   │ den cuando los 3 docs   │
  │                 │                   │                   │ obligatorios sean       │
  │                 │                   │                   │ APPROVED.               │
  └─────────────────┴───────────────────┴───────────────────┴─────────────────────────┘

  🚨 Módulo 10: Novedades (novelties.service.js)
  ┌───────────────┬────────────────────┬───────────────────┬───────────────────────────┐
  │ Función       │ Descripción        │ Test Asociado     │ Metodología del Test      │
  ├───────────────┼────────────────────┼───────────────────┼───────────────────────────┤
  │ createNovelty │ Reporta incidentes │ novelties.test.js │ Verifica la creación y la │
  │               │ y genera PDF de    │                   │ existencia de una         │
  │               │ acta.              │                   │ pdfDriveUrl mockeada.     │
  └───────────────┴────────────────────┴───────────────────┴───────────────────────────┘

  🔔 Módulo 11: Notificaciones (notifications.service.js)
  ┌──────────┬─────────────────────┬───────────────────────┬──────────────────────────┐
  │ Función  │ Descripción         │ Test Asociado         │ Metodología del Test     │
  ├──────────┼─────────────────────┼───────────────────────┼──────────────────────────┤
  │ send     │ Envía alerta a DB y │ notifications.test.js │ Verifica la creación de  │
  │          │ dispara Email       │                       │ registros múltiples para │
  │          │ (Nodemailer).       │                       │ mensajes masivos.        │
  │ initJobs │ (Cron) Tareas       │ N/A (Manual/Logs)     │ Monitorea logs para      │
  │          │ diarias de alerta.  │                       │ asegurar que el job de   │
  │          │                     │                       │ las 8:00 AM se registre. │
  └──────────┴─────────────────────┴───────────────────────┴──────────────────────────┘

  📊 Módulo 12: Reportes (reports.service.js)
  ┌──────────────┬───────────────────────┬─────────────────┬───────────────────────────┐
  │ Función      │ Descripción           │ Test Asociado   │ Metodología del Test      │
  ├──────────────┼───────────────────────┼─────────────────┼───────────────────────────┤
  │ getEPSummary │ Agregación de datos   │ reports.test.js │ Ejecuta pipeline de       │
  │              │ por modalidad/estado. │                 │ MongoDB y valida conteos. │
  │ exportToPdf  │ Genera buffer PDF     │ reports.test.js │ Verifica que el response  │
  │              │ profesional.          │                 │ header sea                │
  │              │                       │                 │ application/pdf y el      │
  │              │                       │                 │ buffer no esté vacío.     │
  └──────────────┴───────────────────────┴─────────────────┴───────────────────────────┘
  ---

  🛠️ Puntos Clave de Especificidad Técnica

   1. Archivos (Files): Se gestionan con multer. En el service, las funciones reciben el
      objeto file, extraen originalname y buffer, y lo envían a un helper que simula (mock)
      la subida a Google Drive.
   2. PDFs: La función pdfGenerator.generatePdf es la única que toca la librería pdfkit.
      Recibe un objeto estructurado (sections, summary) para mantener los reportes limpios
      y fáciles de editar.
   3. Metodología de Tests:
       * Usamos Supertest para llamadas HTTP reales a los endpoints.
       * Usamos Mongoose con una base de datos local para asegurar limpieza total entre
         pruebas (beforeAll limpia colecciones).
       * Determinismo: Fijamos fechas (ej. Mayo 2025) para que los reportes de horas den
         resultados exactos sin importar cuándo corras el test.