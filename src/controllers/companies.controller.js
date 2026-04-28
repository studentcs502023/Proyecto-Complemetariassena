// GET / 404 3.705 ms - 139
import CompanyService from '../services/companies.service.js';
import { successResponse, errorResponse } from '../utils/response.util.js';

/**
 * Controlador para las rutas de Empresas
 */
class CompanyController {
  /**
   * Crear empresa individual
   */
  async create(req, res) {
    try {
      const company = await CompanyService.createCompany(req.body, req.user._id);
      return successResponse(res, 201, 'Empresa creada exitosamente', company);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Obtener todas las empresas con filtros
   */
  async getAll(req, res) {
    try {
      const result = await CompanyService.getAllCompanies(req.query, req.user);
      return successResponse(res, 200, 'Empresas recuperadas exitosamente', result);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Obtener una empresa por su ID
   */
  async getById(req, res) {
    try {
      const company = await CompanyService.getCompanyById(req.params.id);
      
      // Lógica de restricción para Instructores (Spec: Solo empresas de sus aprendices)
      // Nota: Esta validación completa requiere ProductiveStage. Por ahora es genérica.
      if (req.user.role === 'INSTRUCTOR') {
        // TODO: Validar vinculación con aprendices del instructor
      }

      return successResponse(res, 200, 'Empresa recuperada exitosamente', company);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Actualizar datos básicos de empresa
   */
  async update(req, res) {
    try {
      const company = await CompanyService.updateCompany(req.params.id, req.body, req.user._id);
      return successResponse(res, 200, 'Empresa actualizada exitosamente', company);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Agregar contacto a empresa
   */
  async addContact(req, res) {
    try {
      const company = await CompanyService.addContact(req.params.id, req.body, req.user._id);
      return successResponse(res, 201, 'Contacto agregado exitosamente', company);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Actualizar contacto de empresa
   */
  async updateContact(req, res) {
    try {
      const { id, contactId } = req.params;
      const company = await CompanyService.updateContact(id, contactId, req.body, req.user._id);
      return successResponse(res, 200, 'Contacto actualizado exitosamente', company);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Eliminar contacto de empresa
   */
  async deleteContact(req, res) {
    try {
      const { id, contactId } = req.params;
      const company = await CompanyService.deleteContact(id, contactId, req.user._id);
      return successResponse(res, 200, 'Contacto eliminado exitosamente', company);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Desactivar empresa (soft-delete)
   */
  async deactivate(req, res) {
    try {
      const company = await CompanyService.deactivateCompany(req.params.id, req.user._id);
      return successResponse(res, 200, 'Empresa desactivada exitosamente', company);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Importación masiva (Placeholder)
   */
  async import(req, res) {
    return errorResponse(res, 501, 'La funcionalidad de importación masiva no ha sido implementada aún');
  }
}

export default new CompanyController();
