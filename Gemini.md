# CLAUDE.md — REPFORA E.P.
> Sistema de Registro y Seguimiento de Etapa Productiva — SENA
> Stack: Node.js + Express + MongoDB (Mongoose) + JWT

---

## 1. REGLAS ABSOLUTAS (nunca violar)

1. **Lee siempre este archivo antes de tocar código.**
2. **Lee `specs/DATA_MODEL.md`** — es la fuente de verdad de todos los schemas, campos, tipos, índices y relaciones entre colecciones. Ningún modelo se define sin consultarlo primero.
3. **Lee el spec del módulo** (`specs/<modulo>.md`) antes de implementar cualquier cosa. Si hay contradicción entre un spec y `DATA_MODEL.md`, **DATA_MODEL.md manda**.
3. **Nunca implementes lógica en controllers.** Los controllers solo orquestan: llaman al service y devuelven respuesta HTTP.
4. **Nunca accedas a MongoDB directamente desde un controller o route.** Solo desde services o models.
5. **Nunca uses `req.body` dentro de un service.** Los services reciben datos planos, no objetos HTTP.
6. **Cada endpoint debe tener su middleware de validación** (`express-validator`) antes de llegar al controller.
7. **Nunca hardcodees valores de negocio** (horas por bitácora, máx. bitácoras, seguimientos obligatorios). Siempre leen de `SystemConfig` en MongoDB.
8. **Todas las respuestas HTTP siguen el formato estándar** definido en la sección 6.
9. **Nunca elimines documentos físicamente** (no `Model.deleteOne`). Usa soft-delete con campo `isActive: false` o `deletedAt`.
10. **Toda acción crítica genera un registro en `AuditLog`** (ver sección 7).

---

## 2. ARQUITECTURA EN CAPAS

```
Request → Router → Middleware (auth + validate) → Controller → Service → Model → MongoDB
                                                       ↓
                                                  Response HTTP
```

### Responsabilidades por capa

| Capa | Archivo | Hace | NO hace |
|------|---------|------|---------|
| **Route** | `src/routes/*.routes.js` | Define verbo+path, encadena middlewares | Nada de lógica |
| **Middleware** | `src/middlewares/` | Verifica JWT, valida body, verifica rol | No toca DB |
| **Controller** | `src/controllers/*.controller.js` | Extrae params, llama service, formatea respuesta | No toca DB, no tiene reglas de negocio |
| **Service** | `src/services/*.service.js` | Toda la lógica de negocio, reglas, cálculos | No conoce `req`/`res` |
| **Model** | `src/models/*.model.js` | Schema Mongoose, validaciones de campo, índices | No tiene lógica de negocio |

---

## 3. ESTRUCTURA DE CARPETAS

```
src/
├── config/
│   ├── db.js          ✅          # Conexión mongoose
│   └── env.js           ✅        # Variables de entorno validadas
├── models/
│   ├── User.model.js ✅
│   ├── Company.model.js
│   ├── ProductiveStage.model.js
│   ├── Bitacora.model.js
│   ├── Tracking.model.js        # Seguimientos
│   ├── HourRecord.model.js      # Registro de horas instructor
│   ├── SystemConfig.model.js    # Parámetros configurables
│   ├── Notification.model.js
│   ├── AuditLog.model.js
│   ├── Novelty.model.js         # Novedades de aprendices
│   └── Document.model.js        # Documentos/certificaciones
├── controllers/
│   ├── auth.controller.js
│   ├── users.controller.js
│   ├── companies.controller.js
│   ├── productiveStages.controller.js
│   ├── bitacoras.controller.js
│   ├── trackings.controller.js
│   ├── hours.controller.js
│   ├── systemConfig.controller.js
│   ├── notifications.controller.js
│   ├── reports.controller.js
│   └── novelties.controller.js
├── services/
│   ├── auth.service.js
│   ├── users.service.js
│   ├── companies.service.js
│   ├── productiveStages.service.js
│   ├── bitacoras.service.js
│   ├── trackings.service.js
│   ├── hours.service.js
│   ├── systemConfig.service.js
│   ├── notifications.service.js
│   ├── reports.service.js
│   ├── novelties.service.js
│   ├── googleDrive.service.js   # Integración Google Drive
│   └── email.service.js         # Envío de correos
├── routes/
│   ├── auth.routes.js
│   ├── users.routes.js
│   ├── companies.routes.js
│   ├── productiveStages.routes.js
│   ├── bitacoras.routes.js
│   ├── trackings.routes.js
│   ├── hours.routes.js
│   ├── systemConfig.routes.js
│   ├── notifications.routes.js
│   ├── reports.routes.js
│   └── novelties.routes.js
├── middlewares/
│   ├── auth.middleware.js        # Verificar JWT
│   ├── role.middleware.js        # Verificar rol: checkRole('ADMIN')
│   ├── validate.middleware.js    # Ejecutar express-validator
│   └── upload.middleware.js      # Multer para archivos PDF
├── utils/
│   ├── response.util.js          # Formato estándar de respuesta
│   ├── auditLog.util.js          # Crear registros de auditoría
│   ├── dateHelper.util.js        # Helpers de fechas/vencimientos
│   └── pdfGenerator.util.js      # Generar PDF de reportes
└── app.js
```

---

## 4. ROLES Y PERMISOS

```
ADMIN       → acceso total al sistema
INSTRUCTOR  → solo sus aprendices asignados, sin acceso a config del sistema
APRENDIZ    → solo su propia etapa productiva, bitácoras y documentos
```

### Middleware de roles
```javascript
// Uso en routes:
router.patch('/instructors/:id/status',
  authMiddleware,
  checkRole('ADMIN'),
  validate(changeStatusRules),
  usersController.changeInstructorStatus
);

// Para múltiples roles:
checkRole('ADMIN', 'INSTRUCTOR')
```

### Reglas de visibilidad críticas
- **Instructor**: `ProductiveStage.find({ assignedInstructor: req.user.id })` — nunca devuelve aprendices de otros instructores.
- **Aprendiz**: `ProductiveStage.findOne({ apprentice: req.user.id })` — solo su propio registro.
- **Admin**: acceso sin filtro de asignación.

---

## 5. MODELOS CLAVE — RESUMEN

> **Los schemas completos están en `specs/DATA_MODEL.md`.**
> Aquí solo se listan las reglas de negocio que afectan a todos los modelos.

### Reglas que aplican a TODOS los modelos
- **Soft-delete obligatorio:** usar `isActive: false` — nunca `deleteOne` ni `findByIdAndDelete`.
- **Todos los enums** se importan desde `src/utils/enums.js` — nunca redefinir strings inline.
- **Google Drive:** siempre guardar el `driveId` (para operaciones) Y la `driveUrl` (para el usuario). Son campos separados.
- **Desnormalización intencional:** `apprentice` e `instructor` aparecen en `Bitacora`, `Tracking`, `Document` y `Novelty` además de en `ProductiveStage`. Es a propósito — evita doble `populate`.
- **HourRecord** nunca se crea manualmente — lo generan automáticamente los services de `Bitacora`, `Tracking` y `Document` al aprobar una actividad.
- **AuditLog** usa `{ timestamps: { createdAt: true, updatedAt: false } }` — los logs nunca se modifican ni eliminan.

---

## 6. FORMATO ESTÁNDAR DE RESPUESTAS

```javascript
// utils/response.util.js
const success = (res, data, message = 'OK', statusCode = 200) => {
  res.status(statusCode).json({ success: true, message, data });
};

const error = (res, message, statusCode = 400, errors = null) => {
  res.status(statusCode).json({ success: false, message, errors });
};

// Uso en controller:
return response.success(res, { instructor }, 'Instructor actualizado', 200);
return response.error(res, 'Instructor no encontrado', 404);
```

### Códigos HTTP usados
| Código | Cuándo |
|--------|--------|
| 200 | GET exitoso, PUT/PATCH exitoso |
| 201 | POST que crea un recurso |
| 400 | Validación fallida, regla de negocio violada |
| 401 | Sin token o token inválido |
| 403 | Token válido pero rol insuficiente |
| 404 | Recurso no encontrado |
| 409 | Conflicto (ej: correo duplicado) |
| 500 | Error inesperado del servidor |

---

## 7. AUDITORÍA — AuditLog

Toda acción crítica debe registrarse. Usa `auditLog.util.js`:

```javascript
// utils/auditLog.util.js
await createAuditLog({
  action: 'INSTRUCTOR_STATUS_CHANGED',
  entity: 'User',
  entityId: instructor._id,
  performedBy: req.user.id,
  details: { previousStatus: 'ACTIVO', newStatus: 'INACTIVO' }
});
```

### Acciones que SIEMPRE requieren AuditLog
- Cambio de estado de instructor (ACTIVO/INACTIVO/TERMINADO_CONTRATO)
- Aprobación/rechazo de bitácora
- Aprobación/rechazo de documentos de certificación
- Asignación/reasignación de instructores a aprendices
- Descuento de horas (marcado como pagadas)
- Aprobación de seguimiento extraordinario
- Marcado de etapa productiva como COMPLETADA
- Eliminación de documentos (solo admin)
- Cambio de contraseña

---

## 8. NOTIFICACIONES

Las notificaciones son **duales**: correo electrónico + notificación en plataforma.

```javascript
// Siempre crear Notification en DB + enviar correo:
await notificationService.send({
  tipo: 'ASIGNACION_APRENDIZ',          // enum definido en Notification.model.js
  destinatarios: [instructorId],         // array de ObjectId de usuarios
  titulo: 'Nuevo aprendiz asignado',
  mensaje: `Se te asignó a ${aprendiz.nombre}...`,
  metadata: { aprendizId, etapaProductivaId }
});
```

El correo sale desde la cuenta configurada en `SystemConfig.CORREO_NOTIFICACIONES`.

---

## 9. INTEGRACIÓN GOOGLE DRIVE

- Reemplaza OneDrive del SRS original.
- **Estructura de carpetas**: `REPFORA/{INSTRUCTOR_NOMBRE_CEDULA}/{FICHA_APRENDIZ_CEDULA}/`
- Al crear instructor → crear carpeta en Drive.
- Al asignar aprendiz → crear subcarpeta en carpeta del instructor.
- Al reasignar → mover subcarpeta al nuevo instructor.
- Los PDFs (bitácoras aprobadas, seguimientos, certificaciones) se suben a Drive automáticamente.
- El sistema guarda la URL de Drive en el documento correspondiente en MongoDB.

```javascript
// googleDrive.service.js expone:
createFolder(name, parentFolderId)
uploadFile(fileBuffer, fileName, mimeType, folderId)
moveFolder(folderId, newParentFolderId)
getFileUrl(fileId)
```

---

## 10. MANEJO DE ARCHIVOS (PDF)

- Middleware `upload.middleware.js` (Multer) — solo acepta `application/pdf`, máx. 10MB.
- El archivo se recibe en memoria (no disco), se sube a Google Drive, y se guarda la URL en MongoDB.
- **Nunca guardar archivos en el servidor local.**

```javascript
// Validación de archivo en middleware:
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se permiten archivos PDF'));
    }
    cb(null, true);
  }
});
```

---

## 11. ANTI-PATRONES PROHIBIDOS

```javascript
// ❌ NUNCA — lógica en controller
app.post('/bitacoras/:id/approve', async (req, res) => {
  const bitacora = await Bitacora.findById(req.params.id);
  bitacora.estado = 'APROBADA';
  bitacora.horasInstructor = 2; // hardcodeado
  await bitacora.save();
  res.json({ ok: true });
});

// ✅ CORRECTO
// controller llama service, service lee config, service actualiza
const bitacora = await bitacoraService.approve(req.params.id, req.user.id);
return response.success(res, { bitacora }, 'Bitácora aprobada');

// ❌ NUNCA — valores hardcodeados
const HORAS_BITACORA = 2;

// ✅ CORRECTO
const config = await SystemConfig.findOne({ key: 'HORAS_REVISION_BITACORA' });
const horasBitacora = config.value;

// ❌ NUNCA — delete físico
await User.deleteOne({ _id: id });

// ✅ CORRECTO
await User.findByIdAndUpdate(id, { isActive: false });

// ❌ NUNCA — pasar req/res al service
await userService.createUser(req, res);

// ✅ CORRECTO
const { cedula, nombre, correo } = req.body;
await userService.createUser({ cedula, nombre, correo });

// ❌ NUNCA — catch silencioso
try { ... } catch (e) {}

// ✅ CORRECTO
try { ... } catch (e) {
  console.error('[ModuloService] error en metodo:', e);
  throw e; // o throw new AppError(e.message, 500)
}
```

---

## 12. CONVENCIONES DE NAMING

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Archivos | camelCase + sufijo | `bitacoras.service.js` |
| Modelos Mongoose | PascalCase | `ProductiveStage` |
| Variables/funciones | camelCase | `getInstructorHours` |
| Constantes | UPPER_SNAKE | `MAX_INTENTOS_LOGIN = 5` |
| Rutas API | kebab-case, plural | `/api/productive-stages` |
| Campos MongoDB | camelCase | `fechaVencimientoFicha` |
| IDs de SystemConfig | UPPER_SNAKE | `HORAS_REVISION_BITACORA` |

---

## 13. VARIABLES DE ENTORNO REQUERIDAS (.env)

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/repfora_ep
JWT_SECRET=<secreto_largo_aleatorio>
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# Google Drive
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_ROOT_FOLDER_ID=

# Email (nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=

# Seguridad
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCK_TIME_MINUTES=2
```

---

## 14. TESTS — CONVENCIONES

- Archivo de test: `tests/<modulo>.test.js`
- Usar `mongodb-memory-server` para DB en memoria
- Seed mínimo: crear 1 admin, 1 instructor, 1 aprendiz, 1 empresa, 1 etapa productiva activa
- **Cada endpoint tiene mínimo 3 tests**: éxito, sin auth, rol incorrecto
- Los tests de lógica de negocio van en `tests/services/<modulo>.service.test.js`

---

## 15. ORDEN DE IMPLEMENTACIÓN (respetar dependencias)

```
1. Auth (login, primer ingreso, recuperación)
2. SystemConfig (parámetros base del sistema)
3. Users - Admin (CRUD instructores + aprendices, importación)
4. Companies (empresas y contactos)
5. ProductiveStages (registro, aprobación, asignación instructores)
6. Bitacoras (subida, revisión, aprobación/rechazo)
7. Trackings - Seguimientos (obligatorios + extraordinarios)
8. Hours (cálculo, control, cobro)
9. Documents / Certifications (subida, validación, estados)
10. Novelties (novedades críticas)
11. Notifications (correo + web — se usa en todos los módulos)
12. Reports (PDF, estadísticas)
```

> ⚠️ No implementes el módulo N sin que el módulo N-1 esté funcional y con tests pasando.