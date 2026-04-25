import express from 'express';
import { body, param, query } from 'express-validator';
import multer from 'multer';
import noveltyController from '../controllers/novelties.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { checkRole } from '../middlewares/role.middleware.js';
import { validateFields } from '../middlewares/validate.middleware.js';
import { NOVELTY_TYPES, NOVELTY_STATUSES } from '../utils/enums.js';

const router = express.Router();

// Multer configuration (in-memory storage for simple handling)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

/**
 * @route POST /api/novelties
 * @desc Create a new novelty
 * @access INSTRUCTOR only
 */
router.post('/',
  verifyToken,
  checkRole('INSTRUCTOR'),
  upload.array('files', 3),
  [
    body('productiveStageId').isMongoId().withMessage('Invalid productive stage ID'),
    body('type').isIn(NOVELTY_TYPES).withMessage('Invalid novelty type'),
    body('description').isLength({ min: 50 }).withMessage('Description must be at least 50 characters'),
    body('occurrenceDate').isISO8601().withMessage('Invalid occurrence date'),
    validateFields
  ],
  noveltyController.createNovelty
);

/**
 * @route GET /api/novelties
 * @desc Get all novelties with filters
 * @access ADMIN, INSTRUCTOR
 */
router.get('/',
  verifyToken,
  checkRole('ADMIN', 'INSTRUCTOR'),
  [
    query('status').optional().isIn(NOVELTY_STATUSES).withMessage('Invalid status filter'),
    query('type').optional().isIn(NOVELTY_TYPES).withMessage('Invalid type filter'),
    query('productiveStageId').optional().isMongoId().withMessage('Invalid EP ID filter'),
    query('apprenticeId').optional().isMongoId().withMessage('Invalid apprentice ID filter'),
    validateFields
  ],
  noveltyController.getAllNovelties
);

/**
 * @route GET /api/novelties/ep/:productiveStageId
 * @desc Get stats and list for a specific EP
 * @access ADMIN, INSTRUCTOR
 */
router.get('/ep/:productiveStageId',
  verifyToken,
  checkRole('ADMIN', 'INSTRUCTOR'),
  [
    param('productiveStageId').isMongoId().withMessage('Invalid productive stage ID'),
    validateFields
  ],
  noveltyController.getNoveltiesByEP
);

/**
 * @route GET /api/novelties/:id
 * @desc Get a single novelty by ID
 * @access ADMIN, INSTRUCTOR
 */
router.get('/:id',
  verifyToken,
  checkRole('ADMIN', 'INSTRUCTOR'),
  [
    param('id').isMongoId().withMessage('Invalid novelty ID'),
    validateFields
  ],
  noveltyController.getNoveltyById
);

/**
 * @route PATCH /api/novelties/:id/status
 * @desc Update novelty status
 * @access ADMIN only
 */
router.patch('/:id/status',
  verifyToken,
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('Invalid novelty ID'),
    body('status').isIn(NOVELTY_STATUSES).withMessage('Invalid status'),
    body('actionsTaken').isLength({ min: 20 }).withMessage('Actions taken must be at least 20 characters'),
    validateFields
  ],
  noveltyController.updateStatus
);

/**
 * @route POST /api/novelties/:id/attachments
 * @desc Add more attachments to a novelty
 * @access ADMIN, INSTRUCTOR
 */
router.post('/:id/attachments',
  verifyToken,
  checkRole('ADMIN', 'INSTRUCTOR'),
  upload.array('files', 3),
  [
    param('id').isMongoId().withMessage('Invalid novelty ID'),
    validateFields
  ],
  noveltyController.addAttachments
);

export default router;
