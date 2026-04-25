import express from 'express';
import { body, param, query } from 'express-validator';
import multer from 'multer';
import documentsController from '../controllers/documents.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { checkRole } from '../middlewares/role.middleware.js';
import { validateFields } from '../middlewares/validate.middleware.js';
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from '../utils/enums.js';

const router = express.Router();

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

// GET /api/documents/ep/:productiveStageId/status
router.get('/ep/:productiveStageId/status',
  verifyToken,
  checkRole('ADMIN', 'INSTRUCTOR', 'APPRENTICE'),
  [
    param('productiveStageId').isMongoId().withMessage('Invalid productive stage ID'),
    validateFields
  ],
  documentsController.getEPDocumentStatus
);

// POST /api/documents
router.post('/',
  verifyToken,
  checkRole('APPRENTICE'),
  upload.single('file'),
  [
    body('productiveStageId').isMongoId().withMessage('Invalid productive stage ID'),
    body('documentType').isIn(DOCUMENT_TYPES).withMessage('Invalid document type'),
    validateFields
  ],
  documentsController.createDocument
);

// GET /api/documents
router.get('/',
  verifyToken,
  checkRole('ADMIN', 'INSTRUCTOR', 'APPRENTICE'),
  [
    query('status').optional().isIn(DOCUMENT_STATUSES).withMessage('Invalid status filter'),
    query('documentType').optional().isIn(DOCUMENT_TYPES).withMessage('Invalid type filter'),
    query('productiveStageId').optional().isMongoId().withMessage('Invalid EP ID filter'),
    validateFields
  ],
  documentsController.getDocuments
);

// GET /api/documents/:id
router.get('/:id',
  verifyToken,
  checkRole('ADMIN', 'INSTRUCTOR', 'APPRENTICE'),
  [
    param('id').isMongoId().withMessage('Invalid document ID'),
    validateFields
  ],
  documentsController.getDocumentById
);

// PATCH /api/documents/:id/approve
router.patch('/:id/approve',
  verifyToken,
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('Invalid document ID'),
    validateFields
  ],
  documentsController.approveDocument
);

// PATCH /api/documents/:id/reject
router.patch('/:id/reject',
  verifyToken,
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('Invalid document ID'),
    body('comment').isLength({ min: 10 }).withMessage('Comment must be at least 10 characters'),
    validateFields
  ],
  documentsController.rejectDocument
);

// PATCH /api/documents/:id/resubmit
router.patch('/:id/resubmit',
  verifyToken,
  checkRole('APPRENTICE'),
  upload.single('file'),
  [
    param('id').isMongoId().withMessage('Invalid document ID'),
    validateFields
  ],
  documentsController.resubmitDocument
);

// PATCH /api/documents/:id/request-deletion
router.patch('/:id/request-deletion',
  verifyToken,
  checkRole('INSTRUCTOR'),
  [
    param('id').isMongoId().withMessage('Invalid document ID'),
    body('reason').isLength({ min: 20 }).withMessage('Reason must be at least 20 characters'),
    validateFields
  ],
  documentsController.requestDeletion
);

// DELETE /api/documents/:id
router.delete('/:id',
  verifyToken,
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('Invalid document ID'),
    validateFields
  ],
  documentsController.deleteDocument
);

export default router;
