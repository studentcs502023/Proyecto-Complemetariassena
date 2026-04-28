import bitacoraService from '../services/bitacoras.service.js';
import { successResponse, errorResponse } from '../utils/response.util.js';
import { getConfig } from '../utils/configHelper.util.js';

class BitacoraController {
  async submitBitacora(req, res) {
    try {
      if (!req.file) {
        return errorResponse(res, 400, 'File is required (PDF only)');
      }
      const bitacora = await bitacoraService.submitBitacora(req.user, req.body, req.file);
      return successResponse(res, 201, 'Logbook submitted successfully', { bitacora });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async getBitacoras(req, res) {
    try {
      const data = await bitacoraService.getBitacoras(req.user, req.query);
      return successResponse(res, 200, 'Logbooks retrieved successfully', data);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async getBitacoraById(req, res) {
    try {
      const bitacora = await bitacoraService.getBitacoraById(req.user, req.params.id);
      return successResponse(res, 200, 'Logbook details retrieved', { bitacora });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async approveBitacora(req, res) {
    try {
      const bitacora = await bitacoraService.approveBitacora(req.user, req.params.id);
      return successResponse(res, 200, 'Logbook approved successfully', { bitacora });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async rejectBitacora(req, res) {
    try {
      const bitacora = await bitacoraService.rejectBitacora(req.user, req.params.id, req.body.comment);
      return successResponse(res, 200, 'Logbook rejected', { bitacora });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async resubmitBitacora(req, res) {
    try {
      if (!req.file) {
        return errorResponse(res, 400, 'File is required');
      }
      const bitacora = await bitacoraService.resubmitBitacora(req.user, req.params.id, req.file);
      return successResponse(res, 200, 'Logbook resubmitted successfully', { bitacora });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async createAdditionalBitacora(req, res) {
    try {
      const bitacora = await bitacoraService.createAdditionalBitacora(req.user, req.body);
      return successResponse(res, 201, 'Additional logbook requested', { bitacora });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async getTemplate(req, res) {
    try {
      const templateUrl = await getConfig('LOGBOOK_TEMPLATE_DRIVE_URL');
      return successResponse(res, 200, 'Template URL retrieved', { templateUrl });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }
}

export default new BitacoraController();
