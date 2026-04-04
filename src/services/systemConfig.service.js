import SystemConfig from "../models/SystemConfig.model.js";
import { invalidateCache } from "../utils/configHelper.util.js";
import { recordAuditLog } from "../utils/auditLog.util.js";

/**
 * Obtener todos los parámetros de configuración. (ADMIN unicamente)
 */
const getAllConfigs = async () => {
    return await SystemConfig.find().sort({ key: 1 });
};

/**
 * Obtener una configuración por su clave específica.
 */
const getConfigByKey = async (key) => {
    const uppercaseKey = key.toUpperCase();
    const config = await SystemConfig.findOne({ key: uppercaseKey });
    
    if (!config) {
        throw { status: 404, message: "Parámetro de configuración no encontrado" };
    }
    
    return config;
};

/**
 * Actualizar el valor de una configuración y registrar la auditoría.
 */
const updateConfig = async (key, newValue, userId, ip = null) => {
    const uppercaseKey = key.toUpperCase();
    
    // Buscar configuración existente
    const config = await SystemConfig.findOne({ key: uppercaseKey });
    
    if (!config) {
        throw { status: 404, message: `Config key '${uppercaseKey}' not found` };
    }

    // 1. Validar el tipo de dato antes de actualizar
    const currentType = config.valueType;
    let isValid = false;

    switch (currentType) {
        case "NUMBER":
            isValid = typeof newValue === "number" && newValue >= 0;
            break;
        case "STRING":
            isValid = typeof newValue === "string";
            break;
        case "BOOLEAN":
            isValid = typeof newValue === "boolean";
            break;
        case "JSON":
            isValid = typeof newValue === "object" && newValue !== null;
            break;
        default:
            isValid = true;
    }

    if (!isValid) {
        throw { 
            status: 400, 
            message: `El valor proporcionado debe ser de tipo ${currentType}` 
        };
    }

    // 2. Guardar valores para el log de auditoría antes de cambiar
    const previousValue = config.value;

    // 3. Actualizar la base de datos
    config.value = newValue;
    config.updatedBy = userId;
    await config.save();

    // 4. Invalidar la caché para que el cambio sea inmediato en todo el sistema
    invalidateCache(uppercaseKey);

    // 5. Registrar en la auditoría
    await recordAuditLog({
        action: 'SYSTEM_CONFIG_UPDATED',
        entity: 'SystemConfig',
        entityId: config._id,
        performedBy: userId,
        details: { key: uppercaseKey, previousValue, newValue },
        ip
    });

    return config;
};

export const systemConfigService = {
    getAllConfigs,
    getConfigByKey,
    updateConfig,
};
