import { Router } from 'express';
import { query, param } from 'express-validator';
import reportController from '../controllers/reports.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { checkRole } from '../middlewares/role.middleware.js';
import { validateFields } from '../middlewares/validate.middleware.js';
import { EP_MODALITIES, EP_STATUSES } from '../utils/enums.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole('ADMIN'));

// EP Summary
router.get('/ep-summary',
    [
        query('year').optional().isInt({ min: 2020 }),
        query('modality').optional().isIn(EP_MODALITIES),
        query('status').optional().isIn(EP_STATUSES),
        query('instructorId').optional().isMongoId(),
        validateFields
    ],
    reportController.getEPSummary
);

router.get('/ep-summary/export',
    [
        query('year').optional().isInt({ min: 2020 }),
        query('modality').optional().isIn(EP_MODALITIES),
        query('status').optional().isIn(EP_STATUSES),
        validateFields
    ],
    reportController.exportEPSummary
);

// Instructor Hours
router.get('/instructor-hours',
    [
        query('year').optional().isInt({ min: 2020 }),
        query('month').optional().isInt({ min: 1, max: 12 }),
        query('instructorId').optional().isMongoId(),
        validateFields
    ],
    reportController.getInstructorHours
);

router.get('/instructor-hours/export',
    [
        query('year').optional().isInt({ min: 2020 }),
        query('month').optional().isInt({ min: 1, max: 12 }),
        validateFields
    ],
    reportController.exportInstructorHours
);

// Apprentice Progress
router.get('/apprentice-progress/:apprenticeId',
    [
        param('apprenticeId').isMongoId(),
        validateFields
    ],
    reportController.getApprenticeProgress
);

router.get('/apprentice-progress/:apprenticeId/export',
    [
        param('apprenticeId').isMongoId(),
        validateFields
    ],
    reportController.exportApprenticeProgress
);

// Enrollment Expiry
router.get('/enrollment-expiry',
    [
        query('alertLevel').optional().isIn(['RED', 'ORANGE', 'YELLOW']),
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        validateFields
    ],
    reportController.getEnrollmentExpiry
);

export default router;
