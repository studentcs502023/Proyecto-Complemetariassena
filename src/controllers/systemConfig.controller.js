import { systemConfigService } from "../services/systemConfig.service.js";
import { successResponse, errorResponse } from "../utils/response.util.js";

/**
 * Obtener todas las configuraciones para el panel administrativo.
 */
const getAllConfigs = async (req, res) => {
    try {
        const configs = await systemConfigService.getAllConfigs();
        return successResponse(res, 200, "Configuraciones obtenidas correctamente", { configs });
    } catch (error) {
        return errorResponse(res, error.status || 500, error.message || "Error al obtener configuraciones");
    }
};

/**
 * Obtener una configuración por su clave técnica (Key).
 */
const getConfigByKey = async (req, res) => {
    try {
        const { key } = req.params;
        const config = await systemConfigService.getConfigByKey(key);
        return successResponse(res, 200, "Configuración obtenida correctamente", config);
    } catch (error) {
        return errorResponse(res, error.status || 500, error.message || "Error al obtener configuración");
    }
};

/**
 * Actualizar una configuración del sistema.
 */
const updateConfig = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        if (value === undefined || value === null) {
            return errorResponse(res, 400, "El valor es obligatorio");
        }

        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        const updatedConfig = await systemConfigService.updateConfig(key, value, req.user.id, ip);
        
        return successResponse(res, 200, "Configuración actualizada correctamente", updatedConfig);
    } catch (error) {
        return errorResponse(res, error.status || 500, error.message || "Error al actualizar configuración");
    }
};

export const systemConfigController = {
    getAllConfigs,
    getConfigByKey,
    updateConfig,
};
