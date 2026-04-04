import SystemConfig from "../models/SystemConfig.model.js";

/**
 * Caché en memoria para evitar consultas repetitivas a la base de datos.
 */
let cache = {};

/**
 * Obtener un valor de configuración de forma eficiente (con caché).
 * 
 * @param {String} key - Clave de la configuración
 * @returns {any} Valor de la configuración
 */
export const getConfig = async (key) => {
    const uppercaseKey = key.toUpperCase();
    
    // Ver si está en caché
    if (cache[uppercaseKey] !== undefined) {
        return cache[uppercaseKey];
    }

    // Buscar en la base de datos
    const config = await SystemConfig.findOne({ key: uppercaseKey });
    
    if (!config) {
        console.error(`❌ La clave de configuración '${uppercaseKey}' no se encontró en la base de datos.`);
        throw new Error(`Config key '${uppercaseKey}' not found`);
    }

    // Guardar en caché y retornar
    cache[uppercaseKey] = config.value;
    return config.value;
};

/**
 * Invalidar la caché de una clave específica o de todas.
 * 
 * @param {String} key - (Opcional) Clave a eliminar de la caché.
 */
export const invalidateCache = (key = null) => {
    if (key) {
        delete cache[key.toUpperCase()];
    } else {
        cache = {};
    }
};
