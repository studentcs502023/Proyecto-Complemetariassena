import mongoose from "mongoose";
import { AUDIT_ACTIONS } from "../utils/enums.js";

const auditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: AUDIT_ACTIONS,
            required: [true, "La acción de auditoría es obligatoria"],
        },
        entity: {
            type: String,
            required: [true, "La entidad afectada es obligatoria"], // Ej: 'User', 'Bitacora'
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "El usuario que realiza la acción es obligatorio"],
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: null, // Puede guardar un JSON con los cambios realizados
        },
        ip: {
            type: String,
            default: null,
        },
    },
    {
        // Solo necesitamos createdAt para logs (inmutabilidad)
        timestamps: { createdAt: true, updatedAt: false },
    }
);

// Índices para reportes rápidos
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
