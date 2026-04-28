import mongoose from "mongoose";
import {
    ROLES,
    INSTRUCTOR_STATUSES,
    INSTRUCTOR_TYPES,
    TRAINING_LEVELS,
} from "../utils/enums.js";

const userSchema = new mongoose.Schema(
    {
        // === IDENTITY (all roles) ===
        nationalId: {
            type: String,
            required: [true, "La identificación es obligatoria"],
            unique: true,
            trim: true,
        },
        fullName: {
            type: String,
            required: [true, "El nombre completo es obligatorio"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "El correo es obligatorio"],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, "La contraseña es obligatoria"],
        },
        phone: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            enum: ROLES,
            required: true,
        },

        // === SESSION CONTROL (all roles) ===
        status: {
            type: String,
            enum: INSTRUCTOR_STATUSES,
            default: "ACTIVE",
        },
        firstLogin: {
            type: Boolean,
            default: true,
        },
        failedAttempts: {
            type: Number,
            default: 0,
        },
        lockedUntil: {
            type: Date,
            default: null,
        },
        resetPasswordToken: {
            type: String,
            default: null,
        },
        resetPasswordExpires: {
            type: Date,
            default: null,
        },

        // === INSTRUCTORS ONLY (null for other roles) ===
        instructorType: {
            type: String,
            enum: [...INSTRUCTOR_TYPES, null],
            default: null,
        },
        knowledgeArea: {
            type: String,
            default: null,
        },
        accumulatedHours: {
            type: Number,
            default: 0,
        },
        pendingPaymentHours: {
            type: Number,
            default: 0,
        },
        driveFolderId: {
            type: String,
            default: null,
        },

        // === APPRENTICES ONLY (null for other roles) ===
        enrollmentNumber: {
            type: String,
            default: null,
        },
        program: {
            type: String,
            default: null,
        },
        trainingLevel: {
            type: String,
            enum: [...TRAINING_LEVELS, null],
            default: null,
        },
        trainingCenter: {
            type: String,
            default: null,
        },
        enrollmentExpiryDate: {
            type: Date,
            default: null,
        },
        isPreNov2024: {
            type: Boolean,
            default: null,
        },

        // === SOFT DELETE ===
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Aplicar índices para búsquedas optimizadas
userSchema.index({ role: 1, status: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ enrollmentNumber: 1 });

// Seguridad: Ocultar password y tokens de las respuestas del servidor
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpires;
    return obj;
};

const User = mongoose.model("User", userSchema);

export default User;