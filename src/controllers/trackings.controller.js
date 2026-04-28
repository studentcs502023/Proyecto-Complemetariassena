import trackingService from '../services/trackings.service.js';
import { successResponse, errorResponse } from '../utils/response.util.js';
import { getConfig } from '../utils/configHelper.util.js';

class TrackingController {
  async scheduleTracking(req, res) {
    try {
      const tracking = await trackingService.scheduleTracking(req.user, req.body);
      return successResponse(res, 201, 'Tracking scheduled successfully', { tracking });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async requestExtraordinaryTracking(req, res) {
    try {
      const tracking = await trackingService.requestExtraordinaryTracking(req.user, req.body);
      return successResponse(res, 201, 'Extraordinary tracking requested', { tracking });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async approveExtraordinaryTracking(req, res) {
    try {
      const tracking = await trackingService.approveExtraordinaryTracking(req.user, req.params.id);
      return successResponse(res, 200, 'Extraordinary tracking approved', { tracking });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async uploadPDF(req, res) {
    try {
      if (!req.file) {
        return errorResponse(res, 400, 'File is required');
      }
      const tracking = await trackingService.uploadPDF(req.user, req.params.id, req.file);
      return successResponse(res, 200, 'PDF uploaded successfully', { tracking });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async validateSignature(req, res) {
    try {
      const tracking = await trackingService.validateSignature(req.user, req.params.id, req.body);
      return successResponse(res, 200, 'Signatures validated', { tracking });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async executeTracking(req, res) {
    try {
      const tracking = await trackingService.executeTracking(req.user, req.params.id);
      return successResponse(res, 200, 'Tracking executed successfully', { tracking });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async markPaid(req, res) {
    try {
      const tracking = await trackingService.markPaid(req.user, req.params.id);
      return successResponse(res, 200, 'Tracking marked as paid', { tracking });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async getTrackings(req, res) {
    try {
      const data = await trackingService.getTrackings(req.user, req.query);
      return successResponse(res, 200, 'Trackings retrieved', data);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async getTrackingById(req, res) {
    try {
      const tracking = await trackingService.getTrackingById(req.user, req.params.id);
      return successResponse(res, 200, 'Tracking detail retrieved', { tracking });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async getTrackingSummary(req, res) {
    try {
      const data = await trackingService.getTrackingSummary(req.user, req.params.productiveStageId);
      return successResponse(res, 200, 'Tracking summary retrieved', data);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async getTemplate(req, res) {
    try {
      const templateUrl = await getConfig('TRACKING_TEMPLATE_DRIVE_URL');
      return successResponse(res, 200, 'Template URL retrieved', { templateUrl });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }
}

export default new TrackingController();
