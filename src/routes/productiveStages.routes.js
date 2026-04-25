import { Router } from "express";
import { body, query } from "express-validator";
import epController from "../controllers/productiveStages.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/role.middleware.js";
import { validateFields } from "../middlewares/validate.middleware.js";
import { EP_MODALITIES, EP_STATUSES } from "../utils/enums.js";

const router = Router();

router.use(verifyToken);

// === RUTAS APRENDIZ ===

router.post("/",
    checkRole("APPRENTICE"),
    [
        body("modality").isIn(EP_MODALITIES).withMessage("Modalidad inválida"),
        body("companyId").isMongoId().withMessage("ID de empresa inválido"),
        body("companySnapshot.apprenticeJobTitle").notEmpty().withMessage("El cargo es obligatorio"),
        body("companySnapshot.supervisorName").notEmpty().withMessage("El nombre del jefe inmediato es obligatorio"),
        body("startDate").isISO8601().withMessage("Fecha de inicio inválida"),
        body("estimatedEndDate").isISO8601().withMessage("Fecha de fin estimada inválida"),
        validateFields
    ],
    epController.registerEP
);

router.get("/my",
    checkRole("APPRENTICE"),
    epController.getMyApprenticeEP
);

// === RUTAS ADMIN / INSTRUCTOR ===

router.get("/",
    checkRole("ADMIN", "INSTRUCTOR"),
    [
        query("status").optional().isIn(EP_STATUSES),
        query("modality").optional().isIn(EP_MODALITIES),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        validateFields
    ],
    epController.getEPs
);

router.get("/:id",
    checkRole("ADMIN", "INSTRUCTOR", "APPRENTICE"),
    epController.getEPById
);

router.patch("/:id/approve",
    checkRole("ADMIN"),
    [
        body("startDate").optional().isISO8601(),
        body("estimatedEndDate").optional().isISO8601(),
        validateFields
    ],
    epController.approveEP
);

router.patch("/:id/reject",
    checkRole("ADMIN"),
    [
        body("reason").isString().isLength({ min: 10 }).withMessage("Debe proporcionar una razón válida (mínimo 10 caracteres)"),
        validateFields
    ],
    epController.rejectEP
);

router.patch("/:id/assign-instructors",
    checkRole("ADMIN"),
    [
        body("followupInstructorId").isMongoId().withMessage("ID de instructor de seguimiento inválido"),
        body("technicalInstructorId").optional().isMongoId(),
        body("projectInstructorId").optional().isMongoId(),
        validateFields
    ],
    epController.assignInstructors
);

router.patch("/:id/complete",
    checkRole("ADMIN"),
    epController.completeEP
);

router.post("/:id/comments",
    checkRole("ADMIN", "APPRENTICE"),
    [
        body("text").isString().isLength({ min: 5, max: 1000 }).withMessage("El comentario debe tener entre 5 y 1000 caracteres"),
        validateFields
    ],
    epController.addComment
);

export default router;
