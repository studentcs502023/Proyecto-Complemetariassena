import userService from "../services/users.service.js";
import { successResponse, errorResponse } from "../utils/response.util.js";

class UserController {
    // === INSTRUCTORS ===

    async createInstructor(req, res) {
        try {
            const instructor = await userService.createInstructor(req.body, req.user.id);
            return successResponse(res, 201, "Instructor creado exitosamente", { instructor });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async getInstructors(req, res) {
        try {
            const data = await userService.getInstructors(req.query);
            return successResponse(res, 200, "Instructores obtenidos exitosamente", data);
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async getInstructorById(req, res) {
        try {
            const instructor = await userService.getInstructorById(req.params.id);
            return successResponse(res, 200, "Detalle de instructor obtenido", { instructor });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async updateInstructor(req, res) {
        try {
            const instructor = await userService.updateInstructor(req.params.id, req.body, req.user.id);
            return successResponse(res, 200, "Instructor actualizado exitosamente", { instructor });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async changeInstructorStatus(req, res) {
        try {
            const result = await userService.changeInstructorStatus(req.params.id, req.body, req.user.id);
            const message = req.body.status === "CONTRACT_ENDED" 
                ? "Estado cambiado. Se requiere reasignar aprendices." 
                : "Estado de instructor actualizado";
            
            return successResponse(res, 200, message, result);
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async reassignApprentices(req, res) {
        try {
            const data = {
                oldInstructorId: req.params.id,
                ...req.body
            };
            const results = await userService.reassignApprentices(data, req.user.id);
            return successResponse(res, 200, "Proceso de reasignación completado", { results });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    // === APPRENTICES ===

    async createApprentice(req, res) {
        try {
            const apprentice = await userService.createApprentice(req.body, req.user.id);
            return successResponse(res, 201, "Aprendiz creado exitosamente", { apprentice });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async getApprentices(req, res) {
        try {
            const data = await userService.getApprentices(req.query);
            return successResponse(res, 200, "Aprendices obtenidos exitosamente", data);
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async getApprenticeById(req, res) {
        try {
            // Un aprendiz solo puede verse a sí mismo. Admin puede ver a todos.
            if (req.user.role === "APPRENTICE" && req.user.id !== req.params.id) {
                return errorResponse(res, 403, "No tienes permiso para ver este perfil");
            }
            const apprentice = await userService.getApprenticeById(req.params.id); // Necesita implementarse en service
            return successResponse(res, 200, "Detalle de aprendiz obtenido", { apprentice });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async updateApprentice(req, res) {
        try {
            // Validación de permisos
            if (req.user.role === "APPRENTICE" && req.user.id !== req.params.id) {
                return errorResponse(res, 403, "No tienes permiso para editar este perfil");
            }

            const apprentice = await userService.updateApprentice(req.params.id, req.body, req.user.role, req.user.id);
            return successResponse(res, 200, "Aprendiz actualizado exitosamente", { apprentice });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async importApprentices(req, res) {
        try {
            if (!req.file) {
                return errorResponse(res, 400, "No se ha proporcionado ningún archivo");
            }
            const results = await userService.importApprentices(req.file.buffer, req.user.id);
            return successResponse(res, 200, "Proceso de importación finalizado", results);
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }
}

export default new UserController();
