import { validationResult } from "express-validator";
import { errorResponse } from "../utils/response.util.js";

/**
 * Middleware para capturar errores de express-validator y
 * devolver una respuesta estandarizada.
 */
export const validateFields = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const firstError = errors.array()[0].msg;
        return errorResponse(res, 400, firstError, errors.array());
    }

    next();
};
