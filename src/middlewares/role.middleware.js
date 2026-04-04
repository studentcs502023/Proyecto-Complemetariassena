import { errorResponse } from "../utils/response.util.js";

/**
 * Middleware factory para validar roles permitidos en una ruta.
 * @param {...String} roles - Lista de roles permitidos (ADMIN, INSTRUCTOR, APPRENTICE)
 */
export const checkRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return errorResponse(res, 401, "Error de sistema: No se encontró información del usuario en la sesión");
        }

        if (!roles.includes(req.user.role)) {
            return errorResponse(res, 403, "No tiene permisos para realizar esta acción");
        }

        next();
    };
};
