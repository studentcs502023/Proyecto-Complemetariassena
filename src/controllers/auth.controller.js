import { authService } from "../services/auth.service.js";
import { successResponse, errorResponse } from "../utils/response.util.js";

/**
 * Iniciar Sesión (Login)
 */
const login = async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        if (!nationalId || !password) {
            return errorResponse(res, 400, "Cédula y contraseña son requeridas");
        }

        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const result = await authService.login(nationalId, password, ip);

        if (result.requiresPasswordChange) {
            return successResponse(res, 200, "Primer ingreso detectado. Cambio de contraseña obligatorio", result);
        }

        return successResponse(res, 200, "Inicio de sesión exitoso", result);
    } catch (error) {
        console.error("❌ Login Error:", error.message);
        return errorResponse(res, error.status || 500, error.message || "Error de login");
    }
};

/**
 * Cambio de contraseña obligatorio en el primer inicio de sesión.
 */
const changePasswordFirst = async (req, res) => {
    try {
        const { newPassword } = req.body;
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        const result = await authService.changeInitialPassword(req.user.id, newPassword, ip);
        return successResponse(res, 200, "Contraseña actualizada correctamente", result);
    } catch (error) {
        return errorResponse(res, error.status || 500, error.message || "Error al cambiar contraseña inicial");
    }
};

/**
 * Solicitar recuperación de contraseña (envío de email simulado).
 */
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const result = await authService.forgotPassword(email);
        return successResponse(res, 200, result.message);
    } catch (error) {
        return errorResponse(res, error.status || 500, error.message || "Error al solicitar recuperación");
    }
};

/**
 * Restablecer contraseña con el token de correo.
 */
const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        const result = await authService.resetPassword(token, newPassword, ip);
        return successResponse(res, 200, "Contraseña restablecida correctamente", result);
    } catch (error) {
        return errorResponse(res, error.status || 500, error.message || "Error al restablecer contraseña");
    }
};

/**
 * Cambio de contraseña voluntario (Perfil).
 */
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        const result = await authService.changePassword(req.user.id, currentPassword, newPassword, ip);
        return successResponse(res, 200, "Contraseña actualizada correctamente", result);
    } catch (error) {
        return errorResponse(res, error.status || 500, error.message || "Error al cambiar contraseña");
    }
};

/**
 * Obtener perfil del usuario autenticado.
 */
const getMe = async (req, res) => {
    try {
        const result = await authService.getMe(req.user.id);
        return successResponse(res, 200, "Perfil obtenido correctamente", result);
    } catch (error) {
        return errorResponse(res, error.status || 500, error.message || "Error al obtener perfil");
    }
};

export const authController = {
    login,
    changePasswordFirst,
    forgotPassword,
    resetPassword,
    changePassword,
    getMe
};
