import { Router } from 'express';
import { body, query } from 'express-validator';
import trackingController from '../controllers/trackings.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { checkRole } from '../middlewares/role.middleware.js';
import { validateFields } from '../middlewares/validate.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';
import { TRACKING_STATUSES, TRACKING_TYPES } from '../utils/enums.js';

const router = Router();

router.use(verifyToken);

// Common
router.get('/',
    [
        query('status').optional().isIn(TRACKING_STATUSES),
        query('isExtraordinary').optional().isBoolean(),
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        validateFields
    ],
    trackingController.getTrackings
);

router.get('/template', trackingController.getTemplate);
router.get('/summary/:productiveStageId', trackingController.getTrackingSummary);
router.get('/:id', trackingController.getTrackingById);

// Instructor actions
router.post('/',
    checkRole('INSTRUCTOR'),
    [
        body('productiveStageId').isMongoId(),
        body('type').isIn(['IN_PERSON', 'VIRTUAL']),
        body('scheduledDate').isISO8601(),
        validateFields
    ],
    trackingController.scheduleTracking
);

router.post('/extraordinary/request',
    checkRole('INSTRUCTOR'),
    [
        body('productiveStageId').isMongoId(),
        body('type').isIn(TRACKING_TYPES),
        body('scheduledDate').isISO8601(),
        body('extraordinaryReason').isString().isLength({ min: 50 }),
        validateFields
    ],
    trackingController.requestExtraordinaryTracking
);

router.patch('/:id/upload-pdf',
    checkRole('INSTRUCTOR'),
    upload.single('file'),
    trackingController.uploadPDF
);

router.patch('/:id/validate-signature',
    checkRole('INSTRUCTOR'),
    [
        body('signedByInstructor').isBoolean(),
        body('signedByApprentice').isBoolean(),
        validateFields
    ],
    trackingController.validateSignature
);

router.patch('/:id/execute',
    checkRole('INSTRUCTOR'),
    trackingController.executeTracking
);

router.patch('/:id/mark-paid',
    checkRole('INSTRUCTOR'),
    trackingController.markPaid
);

// Admin actions
router.patch('/:id/approve-extraordinary',
    checkRole('ADMIN'),
    trackingController.approveExtraordinaryTracking
);

export default router;
