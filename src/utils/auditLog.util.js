import AuditLog from "../models/AuditLog.model.js";

/**
 * Función centralizada para registrar logs de auditoría.
 * Se puede usar en cualquier servicio de forma rápida.
 * 
 * @param {String} action - Acción realizada (debe estar en AUDIT_ACTIONS de enums.js)
 * @param {String} entity - Nombre de la entidad afectada ('User', 'Bitacora', etc.)
 * @param {ObjectId} entityId - El ID del documento afectado (opcional)
 * @param {ObjectId} performedBy - El ID del usuario que hace la acción
 * @param {Object} details - Información adicional del evento (opcional)
 * @param {String} ip - Dirección IP desde donde se realiza la acción (opcional)
 */
export const recordAuditLog = async ({
    action,
    entity,
    entityId = null,
    performedBy,
    details = null,
    ip = null,
}) => {
    try {
        const log = new AuditLog({
            action,
            entity,
            entityId,
            performedBy,
            details,
            ip,
        });
        await log.save();
    } catch (error) {
        // Loguear el error en consola pero no detener la ejecución si falla el log
        console.error("❌ ERROR al registrar AuditLog:", error.message);
    }
};
