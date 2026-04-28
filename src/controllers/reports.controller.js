import reportService from '../services/reports.service.js';
import { successResponse, errorResponse } from '../utils/response.util.js';

class ReportController {
  async getEPSummary(req, res) {
    try {
      const data = await reportService.getEPSummary(req.query);
      return successResponse(res, 200, 'EP Summary retrieved', data);
    } catch (error) {
      return errorResponse(res, 500, error.message);
    }
  }

  async exportEPSummary(req, res) {
    try {
      const data = await reportService.getEPSummary(req.query);
      const pdfBuffer = await reportService.exportToPdf('EP_SUMMARY', data);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ep-summary-${data.year}.pdf"`);
      return res.send(pdfBuffer);
    } catch (error) {
      return errorResponse(res, 500, error.message);
    }
  }

  async getInstructorHours(req, res) {
    try {
      const data = await reportService.getInstructorHours(req.query);
      return successResponse(res, 200, 'Instructor Hours retrieved', data);
    } catch (error) {
      return errorResponse(res, 500, error.message);
    }
  }

  async exportInstructorHours(req, res) {
    try {
      const data = await reportService.getInstructorHours(req.query);
      const pdfBuffer = await reportService.exportToPdf('INSTRUCTOR_HOURS', data);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="instructor-hours-${data.period.year}.pdf"`);
      return res.send(pdfBuffer);
    } catch (error) {
      return errorResponse(res, 500, error.message);
    }
  }

  async getApprenticeProgress(req, res) {
    try {
      const data = await reportService.getApprenticeProgress(req.params.apprenticeId);
      return successResponse(res, 200, 'Apprentice Progress retrieved', data);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async exportApprenticeProgress(req, res) {
    try {
      const data = await reportService.getApprenticeProgress(req.params.apprenticeId);
      const pdfBuffer = await reportService.exportToPdf('APPRENTICE_PROGRESS', data);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="apprentice-progress-${req.params.apprenticeId}.pdf"`);
      return res.send(pdfBuffer);
    } catch (error) {
      return errorResponse(res, 500, error.message);
    }
  }

  async getEnrollmentExpiry(req, res) {
    try {
      const data = await reportService.getEnrollmentExpiry(req.query);
      return successResponse(res, 200, 'Enrollment Expiry report retrieved', data);
    } catch (error) {
      return errorResponse(res, 500, error.message);
    }
  }
}

export default new ReportController();
