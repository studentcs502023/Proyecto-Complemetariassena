import { Router } from 'express';
import { body, query } from 'express-validator';
import bitacoraController from '../controllers/bitacoras.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { checkRole } from '../middlewares/role.middleware.js';
import { validateFields } from '../middlewares/validate.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';
import { BITACORA_STATUSES } from '../utils/enums.js';

const router = Router();

router.use(verifyToken);

// Template
router.get('/template', bitacoraController.getTemplate);

// List/Detail
router.get('/', 
    [
        query('productiveStageId').optional().isMongoId(),
        query('status').optional().isIn(BITACORA_STATUSES),
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        validateFields
    ],
    bitacoraController.getBitacoras
);

router.get('/:id', bitacoraController.getBitacoraById);

// Apprentice actions
router.post('/',
    checkRole('APPRENTICE'),
    upload.single('file'),
    [
        body('productiveStageId').isMongoId().withMessage('Invalid ProductiveStage ID'),
        body('periodStart').isISO8601().withMessage('Invalid period start date'),
        body('periodEnd').isISO8601().withMessage('Invalid period end date'),
        validateFields
    ],
    bitacoraController.submitBitacora
);

router.patch('/:id/resubmit',
    checkRole('APPRENTICE'),
    upload.single('file'),
    bitacoraController.resubmitBitacora
);

// Instructor actions
router.patch('/:id/approve',
    checkRole('INSTRUCTOR'),
    bitacoraController.approveBitacora
);

router.patch('/:id/reject',
    checkRole('INSTRUCTOR'),
    [
        body('comment').isString().isLength({ min: 10 }).withMessage('Comment must be at least 10 characters'),
        validateFields
    ],
    bitacoraController.rejectBitacora
);

router.post('/additional',
    checkRole('INSTRUCTOR'),
    [
        body('productiveStageId').isMongoId(),
        body('periodStart').isISO8601(),
        body('periodEnd').isISO8601(),
        body('reason').isString().isLength({ min: 20 }),
        validateFields
    ],
    bitacoraController.createAdditionalBitacora
);

export default router;
