/**
 * Estandarización de respuestas JSON para el API REPFORA
 */

/**
 * Respuesta exitosa
 * @param {Object} res - Objeto de respuesta de Express
 * @param {Number} statusCode - Código de estado HTTP (ej: 200, 201)
 * @param {String} message - Mensaje descriptivo para el usuario
 * @param {Object} data - Datos a enviar (opcional)
 */
export const successResponse = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

/**
 * Respuesta de error
 * @param {Object} res - Objeto de respuesta de Express
 * @param {Number} statusCode - Código de estado HTTP (ej: 400, 401, 500)
 * @param {String} message - Mensaje de error (generalmente en español)
 * @param {Array|Object} errors - Detalles adicionales del error (opcional)
 */
export const errorResponse = (res, statusCode, message, errors = null) => {
    return res.status(statusCode).json({
        success: false,
        message,
        errors,
    });
};
