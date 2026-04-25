import mongoose from "mongoose";

const systemConfigSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: [true, "La clave de configuración es obligatoria"],
            unique: true,
            uppercase: true,
            trim: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: [true, "El valor de configuración es obligatorio"],
        },
        description: {
            type: String,
            required: [true, "La descripción de la configuración es obligatoria"],
        },
        valueType: {
            type: String,
            enum: ["NUMBER", "STRING", "BOOLEAN", "JSON"],
            required: [true, "El tipo de valor es obligatorio"],
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        // Solo necesitamos timestamps para la última actualización
        timestamps: { createdAt: false, updatedAt: true },
    }
);

// Índice para búsquedas rápidas por clave
systemConfigSchema.index({ key: 1 });

const SystemConfig = mongoose.model("SystemConfig", systemConfigSchema);

export default SystemConfig;
