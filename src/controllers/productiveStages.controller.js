import epService from "../services/productiveStages.service.js";
import { successResponse, errorResponse } from "../utils/response.util.js";

class ProductiveStageController {
    async registerEP(req, res) {
        try {
            const ep = await epService.registerEP(req.user.id, req.body, req.user.id);
            return successResponse(res, 201, "Registro de etapa productiva exitoso. Pendiente de aprobación.", { ep });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async getEPs(req, res) {
        try {
            const data = await epService.getEPs(req.query, req.user);
            return successResponse(res, 200, "Etapas productivas obtenidas", data);
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async getMyApprenticeEP(req, res) {
        try {
            const eps = await epService.getMyApprenticeEP(req.user.id);
            return successResponse(res, 200, "Mis etapas productivas", { eps });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async getEPById(req, res) {
        try {
            const ep = await epService.getEPById(req.params.id, req.user);
            return successResponse(res, 200, "Detalle de etapa productiva", { ep });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async approveEP(req, res) {
        try {
            const ep = await epService.approveEP(req.params.id, req.body, req.user.id);
            return successResponse(res, 200, "Etapa productiva aprobada exitosamente", { ep });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async rejectEP(req, res) {
        try {
            const ep = await epService.rejectEP(req.params.id, req.body, req.user.id);
            return successResponse(res, 200, "Registro rechazado. Se ha notificado al aprendiz.", { ep });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async assignInstructors(req, res) {
        try {
            const ep = await epService.assignInstructors(req.params.id, req.body, req.user.id);
            return successResponse(res, 200, "Instructores asignados correctamente", { ep });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }

    async completeEP(req, res) {
        try {
            const ep = await epService.completeEP(req.params.id, req.user.id);
            return successResponse(res, 200, "Etapa productiva marcada como COMPLETADA", { ep });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message, error.details);
        }
    }

    async addComment(req, res) {
        try {
            const ep = await epService.addComment(req.params.id, req.body, req.user.id);
            return successResponse(res, 200, "Comentario agregado", { ep });
        } catch (error) {
            return errorResponse(res, error.statusCode || 500, error.message);
        }
    }
}

export default new ProductiveStageController();
