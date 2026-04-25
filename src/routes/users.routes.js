import { Router } from "express";
import { body, query } from "express-validator";
import userController from "../controllers/users.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/role.middleware.js";
import { validateFields } from "../middlewares/validate.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";
import { INSTRUCTOR_TYPES, INSTRUCTOR_STATUSES, TRAINING_LEVELS } from "../utils/enums.js";

const router = Router();

// Todas las rutas de este archivo requieren autenticación
router.use(verifyToken);

// === RUTAS DE INSTRUCTORES (Solo ADMIN) ===

router.post("/instructors",
    checkRole("ADMIN"),
    [
        body("nationalId").isString().isLength({ min: 7, max: 12 }).withMessage("ID nacional inválido"),
        body("fullName").isString().isLength({ min: 3, max: 100 }).withMessage("Nombre inválido"),
        body("email").isEmail().withMessage("Correo electrónico inválido"),
        body("phone").optional().isString(),
        body("instructorType").isIn(INSTRUCTOR_TYPES).withMessage("Tipo de instructor inválido"),
        body("knowledgeArea").isString().notEmpty().withMessage("El área de conocimiento es obligatoria"),
        validateFields
    ],
    userController.createInstructor
);

router.get("/instructors",
    checkRole("ADMIN"),
    [
        query("status").optional().isIn(INSTRUCTOR_STATUSES),
        query("instructorType").optional().isIn(INSTRUCTOR_TYPES),
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        validateFields
    ],
    userController.getInstructors
);

router.get("/instructors/:id",
    checkRole("ADMIN"),
    userController.getInstructorById
);

router.patch("/instructors/:id",
    checkRole("ADMIN"),
    [
        body("fullName").optional().isString().isLength({ min: 3 }),
        body("email").optional().isEmail(),
        body("phone").optional().isString(),
        body("instructorType").optional().isIn(INSTRUCTOR_TYPES),
        body("knowledgeArea").optional().isString(),
        validateFields
    ],
    userController.updateInstructor
);

router.patch("/instructors/:id/status",
    checkRole("ADMIN"),
    [
        body("status").isIn(INSTRUCTOR_STATUSES).withMessage("Estado inválido"),
        body("reason").isString().notEmpty().withMessage("La razón del cambio es obligatoria"),
        validateFields
    ],
    userController.changeInstructorStatus
);

router.post("/instructors/:id/reassign",
    checkRole("ADMIN"),
    [
        body("newInstructorId").isMongoId().withMessage("ID de instructor inválido"),
        body("productiveStageIds").isArray().withMessage("Debe proporcionar una lista de etapas productivas"),
        body("productiveStageIds.*").isMongoId().withMessage("ID de etapa inválido"),
        validateFields
    ],
    userController.reassignApprentices
);

// === RUTAS DE APRENDICES ===

router.post("/apprentices",
    checkRole("ADMIN"),
    [
        body("nationalId").isString().isLength({ min: 7, max: 12 }),
        body("fullName").isString().isLength({ min: 3 }),
        body("email").isEmail(),
        body("phone").optional().isString(),
        body("enrollmentNumber").isString().notEmpty(),
        body("program").isString().notEmpty(),
        body("trainingLevel").isIn(TRAINING_LEVELS),
        body("trainingCenter").isString().notEmpty(),
        body("enrollmentExpiryDate").isISO8601().withMessage("Fecha de vencimiento inválida"),
        body("isPreNov2024").isBoolean(),
        validateFields
    ],
    userController.createApprentice
);

router.post("/apprentices/import",
    checkRole("ADMIN"),
    upload.single("file"),
    userController.importApprentices
);

router.get("/apprentices",
    checkRole("ADMIN"),
    [
        query("page").optional().isInt({ min: 1 }),
        query("limit").optional().isInt({ min: 1, max: 100 }),
        validateFields
    ],
    userController.getApprentices
);

router.get("/apprentices/:id",
    checkRole("ADMIN", "APPRENTICE"),
    userController.getApprenticeById
);

router.patch("/apprentices/:id",
    checkRole("ADMIN", "APPRENTICE"),
    [
        body("fullName").optional().isString(),
        body("email").optional().isEmail(),
        body("phone").optional().isString(),
        body("enrollmentNumber").optional().isString(),
        body("program").optional().isString(),
        body("trainingLevel").optional().isIn(TRAINING_LEVELS),
        validateFields
    ],
    userController.updateApprentice
);

export default router;
