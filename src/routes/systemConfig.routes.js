import { Router } from "express";
import { systemConfigController } from "../controllers/systemConfig.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/role.middleware.js";

const router = Router();

// --- RUTAS DE ADMINISTRACIÓN ---
// Todas las rutas requieren JWT y rol ADMIN para total seguridad

/**
 * Endpoint para obtener todas las configuraciones.
 * GET /api/system-config
 */
router.get(
    "/",
    [verifyToken, checkRole("ADMIN")],
    systemConfigController.getAllConfigs
);

/**
 * Endpoint para obtener una configuración individual por su clave.
 * GET /api/system-config/:key
 */
router.get(
    "/:key",
    [verifyToken, checkRole("ADMIN")],
    systemConfigController.getConfigByKey
);

/**
 * Endpoint para actualizar el valor de una configuración.
 * PATCH /api/system-config/:key
 */
router.patch(
    "/:key",
    [verifyToken, checkRole("ADMIN")],
    systemConfigController.updateConfig
);

export default router;
