import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.model.js";
import { recordAuditLog } from "../utils/auditLog.util.js";
import { env } from "../config/env.js";

/**
 * Lógica principal de inicio de sesión.
 */
const login = async (nationalId, password, ip = null) => {
    const user = await User.findOne({ nationalId, isActive: true });

    if (!user) {
        throw { status: 401, message: "Credenciales inválidas" };
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingMs = user.lockedUntil - new Date();
        const minutes = Math.ceil(remainingMs / 1000 / 60);
        throw { 
            status: 401, 
            message: `Cuenta bloqueada temporalmente. Intente de nuevo en ${minutes} minuto(s)` 
        };
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
        user.failedAttempts += 1;
        if (user.failedAttempts >= env.MAX_LOGIN_ATTEMPTS) {
            user.lockedUntil = new Date(Date.now() + env.LOCK_TIME_MINUTES * 60000);
            user.failedAttempts = 0;
            await user.save();
            throw { 
                status: 401, 
                message: `Demasiados intentos fallidos. Cuenta bloqueada por ${env.LOCK_TIME_MINUTES} minutos` 
            };
        }
        await user.save();
        throw { status: 401, message: "Credenciales inválidas" };
    }

    user.failedAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    const token = jwt.sign(
        { id: user._id, nationalId: user.nationalId, role: user.role, fullName: user.fullName },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
    );

    await recordAuditLog({
        action: 'LOGIN',
        entity: 'User',
        entityId: user._id,
        performedBy: user._id,
        ip
    });

    if (user.firstLogin) {
        return { requiresPasswordChange: true, token };
    }

    return {
        token,
        user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role }
    };
};

/**
 * Cambio de contraseña obligatorio en el primer ingreso.
 */
const changeInitialPassword = async (userId, newPassword, ip = null) => {
    const user = await User.findById(userId);

    if (!user || !user.firstLogin) {
        throw { status: 400, message: "Este endpoint solo aplica para el primer inicio de sesión" };
    }

    // Hashear nueva contraseña
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.firstLogin = false;
    await user.save();

    await recordAuditLog({
        action: 'PASSWORD_CHANGED_FIRST_LOGIN',
        entity: 'User',
        entityId: user._id,
        performedBy: user._id,
        ip
    });

    return { success: true };
};

/**
 * Solicitar recuperación de contraseña (envío de token por correo).
 */
const forgotPassword = async (email) => {
    const user = await User.findOne({ email, isActive: true });

    // Respuesta genérica por seguridad (no revelar si el correo existe)
    if (!user) {
        return { message: "Si el correo existe en nuestro sistema, recibirás un enlace de recuperación" };
    }

    // Generar token aleatorio
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Guardar hash del token y expiración (24h)
    const salt = await bcrypt.genSalt(10);
    user.resetPasswordToken = await bcrypt.hash(resetToken, salt);
    user.resetPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    // TODO: Implementar envío real de email. Por ahora lo dejamos logueado.
    console.log(`📧 [Simulacro Email] Enlace de recuperación para ${email}: /reset-password?token=${resetToken}`);

    return { message: "Si el correo existe en nuestro sistema, recibirás un enlace de recuperación" };
};

/**
 * Restablecer contraseña con el token recibido por correo.
 */
const resetPassword = async (token, newPassword, ip = null) => {
    // Nota: Por eficiencia, normalmente buscarías por token. 
    // Como lo guardamos hasheado por seguridad, necesitamos encontrar usuarios con tokens activos.
    const usersWithTokens = await User.find({ 
        resetPasswordToken: { $ne: null },
        resetPasswordExpires: { $gt: new Date() }
    });

    let targetUser = null;
    for (const user of usersWithTokens) {
        const isMatch = await bcrypt.compare(token, user.resetPasswordToken);
        if (isMatch) {
            targetUser = user;
            break;
        }
    }

    if (!targetUser) {
        throw { status: 400, message: "El token es inválido o ha expirado" };
    }

    // Actualizar contraseña
    const salt = await bcrypt.genSalt(10);
    targetUser.password = await bcrypt.hash(newPassword, salt);
    
    // Limpiar campos de recuperación y flag de primer login
    targetUser.resetPasswordToken = null;
    targetUser.resetPasswordExpires = null;
    targetUser.firstLogin = false;
    await targetUser.save();

    await recordAuditLog({
        action: 'PASSWORD_RESET',
        entity: 'User',
        entityId: targetUser._id,
        performedBy: targetUser._id,
        ip
    });

    return { success: true };
};

/**
 * Cambio de contraseña voluntario (desde el perfil).
 */
const changePassword = async (userId, currentPassword, newPassword, ip = null) => {
    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: "Usuario no encontrado" };
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        throw { status: 400, message: "La contraseña actual es incorrecta" };
    }

    if (currentPassword === newPassword) {
        throw { status: 400, message: "La nueva contraseña debe ser diferente a la actual" };
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    await recordAuditLog({
        action: 'PASSWORD_CHANGED',
        entity: 'User',
        entityId: user._id,
        performedBy: user._id,
        ip
    });

    return { success: true };
};

/**
 * Obtener perfil del usuario autenticado.
 */
const getMe = async (userId) => {
    const user = await User.findById(userId).select("-password -resetPasswordToken -resetPasswordExpires");
    if (!user) {
        throw { status: 404, message: "Usuario no encontrado" };
    }
    return user;
};

export const authService = {
    login,
    changeInitialPassword,
    forgotPassword,
    resetPassword,
    changePassword,
    getMe
};
