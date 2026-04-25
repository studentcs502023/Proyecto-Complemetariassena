import { Router } from 'express';
import { body, param } from 'express-validator';
import CompanyController from '../controllers/companies.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { checkRole } from '../middlewares/role.middleware.js';
import { validateFields } from '../middlewares/validate.middleware.js';

const router = Router();

// Middleware global para todas las rutas de este módulo
router.use(verifyToken);

/**
 * @route   GET /api/companies
 * @desc    Obtener lista de empresas (Paginado)
 * @access  ADMIN, INSTRUCTOR
 */
router.get('/', 
  checkRole('ADMIN', 'INSTRUCTOR'),
  CompanyController.getAll
);

/**
 * @route   POST /api/companies
 * @desc    Crear empresa manualmente
 * @access  ADMIN
 */
router.post('/', 
  checkRole('ADMIN'),
  [
    body('taxId').notEmpty().withMessage('El NIT/RUT es obligatorio'),
    body('name').isLength({ min: 2, max: 200 }).withMessage('El nombre debe tener entre 2 y 200 caracteres'),
    body('email').isEmail().withMessage('Debe ser un correo electrónico válido'),
    body('phone').notEmpty().withMessage('El teléfono es obligatorio'),
    body('address').notEmpty().withMessage('La dirección es obligatoria'),
    body('contacts').optional().isArray().withMessage('Los contactos deben ser un arreglo'),
    body('contacts.*.fullName').notEmpty().withMessage('El nombre del contacto es obligatorio'),
    body('contacts.*.jobTitle').notEmpty().withMessage('El cargo del contacto es obligatorio'),
    validateFields
  ],
  CompanyController.create
);

/**
 * @route   GET /api/companies/:id
 * @desc    Obtener detalle de una empresa
 * @access  ADMIN, INSTRUCTOR
 */
router.get('/:id', 
  checkRole('ADMIN', 'INSTRUCTOR'),
  [
    param('id').isMongoId().withMessage('ID de empresa inválido'),
    validateFields
  ],
  CompanyController.getById
);

/**
 * @route   PATCH /api/companies/:id
 * @desc    Actualizar datos básicos de empresa
 * @access  ADMIN
 */
router.patch('/:id', 
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('ID de empresa inválido'),
    body('name').optional().isLength({ min: 2, max: 200 }).withMessage('El nombre debe tener entre 2 y 200 caracteres'),
    body('email').optional().isEmail().withMessage('Debe ser un correo electrónico válido'),
    validateFields
  ],
  CompanyController.update
);

/**
 * @route   DELETE /api/companies/:id
 * @desc    Desactivar empresa (soft-delete)
 * @access  ADMIN
 */
router.delete('/:id', 
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('ID de empresa inválido'),
    validateFields
  ],
  CompanyController.deactivate
);

// --- RUTAS DE CONTACTOS ---

/**
 * @route   POST /api/companies/:id/contacts
 * @desc    Agregar un contacto a la empresa
 * @access  ADMIN
 */
router.post('/:id/contacts', 
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('ID de empresa inválido'),
    body('fullName').notEmpty().withMessage('El nombre del contacto es obligatorio'),
    body('jobTitle').notEmpty().withMessage('El cargo del contacto es obligatorio'),
    validateFields
  ],
  CompanyController.addContact
);

/**
 * @route   PATCH /api/companies/:id/contacts/:contactId
 * @desc    Actualizar un contacto específico
 * @access  ADMIN
 */
router.patch('/:id/contacts/:contactId', 
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('ID de empresa inválido'),
    param('contactId').isMongoId().withMessage('ID de contacto inválido'),
    validateFields
  ],
  CompanyController.updateContact
);

/**
 * @route   DELETE /api/companies/:id/contacts/:contactId
 * @desc    Eliminar un contacto de la empresa
 * @access  ADMIN
 */
router.delete('/:id/contacts/:contactId', 
  checkRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('ID de empresa inválido'),
    param('contactId').isMongoId().withMessage('ID de contacto inválido'),
    validateFields
  ],
  CompanyController.deleteContact
);

// --- IMPORTACIÓN ---

/**
 * @route   POST /api/companies/import
 * @desc    Importación masiva desde CSV/XLSX
 * @access  ADMIN
 */
router.post('/import', 
  checkRole('ADMIN'),
  CompanyController.import
);

export default router;
