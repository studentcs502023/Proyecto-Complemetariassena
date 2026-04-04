import { Router } from "express";
import { body } from "express-validator";
import { authController } from "../controllers/auth.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { validateFields } from "../middlewares/validate.middleware.js";

const router = Router();

// --- RUTAS PÚBLICAS ---

// Iniciar sesión
router.post(
    "/login",
    [
        body("nationalId").notEmpty().withMessage("La identificación es obligatoria"),
        body("password").notEmpty().withMessage("La contraseña es obligatoria"),
        validateFields
    ],
    authController.login
);

// Solicitar recuperación de contraseña (envío de email)
router.post(
    "/forgot-password",
    [
        body("email").isEmail().withMessage("Debe proporcionar un correo electrónico válido"),
        validateFields
    ],
    authController.forgotPassword
);

// Restablecer contraseña con el token de correo
router.post(
    "/reset-password",
    [
        body("token").notEmpty().withMessage("El token es obligatorio"),
        body("newPassword")
            .isLength({ min: 8 }).withMessage("La contraseña debe tener al menos 8 caracteres")
            .matches(/[A-Z]/).withMessage("Debe contener al menos una mayúscula")
            .matches(/[a-z]/).withMessage("Debe contener al menos una minúscula")
            .matches(/\d/).withMessage("Debe contener al menos un número")
            .matches(/[@$!%*?&]/).withMessage("Debe contener al menos un carácter especial"),
        validateFields
    ],
    authController.resetPassword
);


// --- RUTAS PROTEGIDAS (Requieren Login) ---

// Obtener perfil (Me)
router.get("/me", verifyToken, authController.getMe);

// Cambio de contraseña obligatorio en primer inicio de sesión
router.post(
    "/change-password-first",
    [
        verifyToken,
        body("newPassword")
            .isLength({ min: 8 }).withMessage("La contraseña debe tener al menos 8 caracteres")
            .matches(/[A-Z]/).withMessage("Debe contener al menos una mayúscula")
            .matches(/[a-z]/).withMessage("Debe contener al menos una minúscula")
            .matches(/\d/).withMessage("Debe contener al menos un número")
            .matches(/[@$!%*?&]/).withMessage("Debe contener al menos un carácter especial"),
        body("confirmPassword").custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error("Las contraseñas no coinciden");
            }
            return true;
        }),
        validateFields
    ],
    authController.changePasswordFirst
);

// Cambio de contraseña voluntario desde perfil
router.post(
    "/change-password",
    [
        verifyToken,
        body("currentPassword").notEmpty().withMessage("La contraseña actual es obligatoria"),
        body("newPassword")
            .isLength({ min: 8 }).withMessage("La nueva contraseña debe tener al menos 8 caracteres")
            .matches(/[A-Z]/).withMessage("Debe contener al menos una mayúscula")
            .matches(/[a-z]/).withMessage("Debe contener al menos una minúscula")
            .matches(/\d/).withMessage("Debe contener al menos un número")
            .matches(/[@$!%*?&]/).withMessage("Debe contener al menos un carácter especial"),
        body("confirmPassword").custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error("Las contraseñas no coinciden");
            }
            return true;
        }),
        validateFields
    ],
    authController.changePassword
);

export default router;
