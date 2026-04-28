import Tracking from '../models/Tracking.model.js';
import ProductiveStage from '../models/ProductiveStage.model.js';
import User from '../models/User.model.js';
import HourRecord from '../models/HourRecord.model.js';
import hourService from './hours.service.js';
import { recordAuditLog } from '../utils/auditLog.util.js';
import { getConfig } from '../utils/configHelper.util.js';
import productiveStagesService from './productiveStages.service.js';

// MOCK: Google Drive integration
const mockDriveUpload = async (file, folderPath) => {
  return {
    driveFileId: `mock_drive_id_${Date.now()}`,
    driveFileUrl: `https://drive.google.com/file/d/mock_drive_id_${Date.now()}/view`
  };
};

// MOCK: Notifications integration
const mockSendNotification = async (type, payload) => {
  console.log(`[MOCK NOTIFICATION] ${type}:`, payload);
};

class TrackingService {
  /**
   * Schedule a new ordinary tracking
   */
  async scheduleTracking(reqUser, data) {
    const { productiveStageId, type, scheduledDate, notes } = data;

    if (!['IN_PERSON', 'VIRTUAL'].includes(type)) {
      const error = new Error('Only IN_PERSON or VIRTUAL types are allowed for ordinary trackings');
      error.statusCode = 400;
      throw error;
    }

    const ep = await ProductiveStage.findById(productiveStageId);
    if (!ep) {
      const error = new Error('ProductiveStage not found');
      error.statusCode = 404;
      throw error;
    }

    // Verify instructor assignment
    const isAssigned = [
      ep.followupInstructor?.toString(),
      ep.technicalInstructor?.toString(),
      ep.projectInstructor?.toString()
    ].includes(reqUser.id.toString());

    if (!isAssigned) {
      const error = new Error('Forbidden: You are not assigned to this ProductiveStage');
      error.statusCode = 403;
      throw error;
    }

    // Verify EP status
    if (!['ACTIVE', 'IN_FOLLOWUP'].includes(ep.status)) {
      const error = new Error('The productive stage is not active');
      error.statusCode = 400;
      throw error;
    }

    // Count existing non-extraordinary trackings
    const existingCount = await Tracking.countDocuments({
      productiveStage: productiveStageId,
      isExtraordinary: false,
      isActive: true
    });

    if (existingCount >= ep.requiredTrackings) {
      const error = new Error(`All required trackings already scheduled (${ep.requiredTrackings})`);
      error.statusCode = 400;
      throw error;
    }

    // Check for duplicate date
    const startOfDay = new Date(scheduledDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(scheduledDate);
    endOfDay.setHours(23, 59, 59, 999);

    const duplicateDate = await Tracking.findOne({
      productiveStage: productiveStageId,
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      isActive: true
    });

    if (duplicateDate) {
      const error = new Error('A tracking is already scheduled for this date');
      error.statusCode = 409;
      throw error;
    }

    const tracking = new Tracking({
      productiveStage: productiveStageId,
      apprentice: ep.apprentice,
      instructor: reqUser.id,
      trackingNumber: existingCount + 1,
      type,
      scheduledDate: new Date(scheduledDate),
      notes,
      status: 'SCHEDULED'
    });

    await tracking.save();

    // Notify apprentice
    await mockSendNotification('TRACKING_REMINDER', {
      recipient: ep.apprentice,
      scheduledDate,
      type
    });

    // Audit Log
    await recordAuditLog({
      action: 'TRACKING_CREATED',
      entity: 'Tracking',
      entityId: tracking._id,
      performedBy: reqUser.id,
      details: { trackingNumber: tracking.trackingNumber, type }
    });

    return tracking;
  }

  /**
   * Request an extraordinary tracking
   */
  async requestExtraordinaryTracking(reqUser, data) {
    const { productiveStageId, type, scheduledDate, extraordinaryReason } = data;

    if (!extraordinaryReason || extraordinaryReason.length < 50) {
      const error = new Error('extraordinaryReason must be at least 50 characters');
      error.statusCode = 400;
      throw error;
    }

    const ep = await ProductiveStage.findById(productiveStageId);
    if (!ep) {
      const error = new Error('ProductiveStage not found');
      error.statusCode = 404;
      throw error;
    }

    const isAssigned = [
      ep.followupInstructor?.toString(),
      ep.technicalInstructor?.toString(),
      ep.projectInstructor?.toString()
    ].includes(reqUser.id.toString());

    if (!isAssigned) {
      const error = new Error('Forbidden: You are not assigned to this ProductiveStage');
      error.statusCode = 403;
      throw error;
    }

    const existingExtraCount = await Tracking.countDocuments({
      productiveStage: productiveStageId,
      isExtraordinary: true,
      isActive: true
    });

    const tracking = new Tracking({
      productiveStage: productiveStageId,
      apprentice: ep.apprentice,
      instructor: reqUser.id,
      trackingNumber: existingExtraCount + 1,
      type,
      scheduledDate: new Date(scheduledDate),
      isExtraordinary: true,
      extraordinaryReason,
      approvedByAdmin: false,
      status: 'SCHEDULED'
    });

    await tracking.save();

    // Notify ADMIN
    await mockSendNotification('NEW_CRITICAL_NOVELTY', {
      message: 'New extraordinary tracking request',
      instructorId: reqUser.id,
      apprenticeId: ep.apprentice,
      reason: extraordinaryReason
    });

    // Audit Log
    await recordAuditLog({
      action: 'TRACKING_EXTRAORDINARY_REQUESTED',
      entity: 'Tracking',
      entityId: tracking._id,
      performedBy: reqUser.id,
      details: { extraordinaryReason }
    });

    return tracking;
  }

  /**
   * Admin approves an extraordinary tracking
   */
  async approveExtraordinaryTracking(reqUser, id) {
    const tracking = await Tracking.findById(id);
    if (!tracking || !tracking.isActive) {
      const error = new Error('Tracking not found');
      error.statusCode = 404;
      throw error;
    }

    if (!tracking.isExtraordinary) {
      const error = new Error('This is not an extraordinary tracking');
      error.statusCode = 400;
      throw error;
    }

    if (tracking.approvedByAdmin) {
      const error = new Error('This tracking is already approved');
      error.statusCode = 400;
      throw error;
    }

    tracking.approvedByAdmin = true;
    tracking.approvedBy = reqUser.id;
    await tracking.save();

    // Notify instructor
    await mockSendNotification('EXTRAORDINARY_TRACKING_APPROVED', {
      recipient: tracking.instructor,
      trackingId: tracking._id
    });

    // Audit Log
    await recordAuditLog({
      action: 'TRACKING_EXTRAORDINARY_APPROVED',
      entity: 'Tracking',
      entityId: tracking._id,
      performedBy: reqUser.id
    });

    return tracking;
  }

  /**
   * Upload signed PDF
   */
  async uploadPDF(reqUser, id, file) {
    const tracking = await Tracking.findById(id);
    if (!tracking || !tracking.isActive) {
      const error = new Error('Tracking not found');
      error.statusCode = 404;
      throw error;
    }

    if (tracking.instructor.toString() !== reqUser.id.toString()) {
      const error = new Error('Forbidden: You are not the owner of this tracking');
      error.statusCode = 403;
      throw error;
    }

    if (tracking.status !== 'SCHEDULED') {
      const error = new Error('Cannot upload PDF for a tracking that is already executed');
      error.statusCode = 400;
      throw error;
    }

    if (tracking.isExtraordinary && !tracking.approvedByAdmin) {
      const error = new Error('Extraordinary tracking must be approved by admin before uploading');
      error.statusCode = 400;
      throw error;
    }

    const driveRes = await mockDriveUpload(file, `trackings/${tracking.productiveStage}`);
    
    tracking.fileName = file.originalname;
    tracking.driveFileId = driveRes.driveFileId;
    tracking.driveFileUrl = driveRes.driveFileUrl;
    await tracking.save();

    return tracking;
  }

  /**
   * Validate signatures
   */
  async validateSignature(reqUser, id, data) {
    const { signedByInstructor, signedByApprentice } = data;
    const tracking = await Tracking.findById(id);
    if (!tracking || !tracking.isActive) {
      const error = new Error('Tracking not found');
      error.statusCode = 404;
      throw error;
    }

    if (tracking.instructor.toString() !== reqUser.id.toString()) {
      const error = new Error('Forbidden: You are not the owner of this tracking');
      error.statusCode = 403;
      throw error;
    }

    if (!tracking.driveFileId) {
      const error = new Error('Upload the signed PDF before validating signatures');
      error.statusCode = 400;
      throw error;
    }

    tracking.signedByInstructor = signedByInstructor;
    tracking.signedByApprentice = signedByApprentice;
    tracking.signatureValidatedAt = new Date();
    await tracking.save();

    return tracking;
  }

  /**
   * Mark tracking as executed
   */
  async executeTracking(reqUser, id) {
    const tracking = await Tracking.findById(id);
    if (!tracking || !tracking.isActive) {
      const error = new Error('Tracking not found');
      error.statusCode = 404;
      throw error;
    }

    if (tracking.instructor.toString() !== reqUser.id.toString()) {
      const error = new Error('Forbidden: You are not the owner of this tracking');
      error.statusCode = 403;
      throw error;
    }

    if (tracking.status !== 'SCHEDULED') {
      const error = new Error('Only scheduled trackings can be executed');
      error.statusCode = 400;
      throw error;
    }

    // Priority check for Extraordinary Approval
    if (tracking.isExtraordinary && !tracking.approvedByAdmin) {
      const error = new Error('Extraordinary tracking must be approved by admin first');
      error.statusCode = 400;
      throw error;
    }

    if (!tracking.signedByInstructor) {
      const error = new Error('Tracking must be signed by instructor before marking as executed');
      error.statusCode = 400;
      throw error;
    }

    if (!tracking.driveFileId) {
      const error = new Error('Upload the signed PDF before executing');
      error.statusCode = 400;
      throw error;
    }

    // Determine hoursKey
    let hoursKey = 'HOURS_PER_VIRTUAL_TRACKING';
    if (tracking.isExtraordinary) {
      hoursKey = 'HOURS_PER_EXTRAORDINARY_TRACKING';
    } else if (tracking.type === 'IN_PERSON') {
      hoursKey = 'HOURS_PER_IN_PERSON_TRACKING';
    }

    const hoursToAssign = await getConfig(hoursKey) || (tracking.isExtraordinary ? 4 : 2);

    // Update tracking
    tracking.status = 'EXECUTED';
    tracking.executedDate = new Date();
    tracking.assignedHours = Number(hoursToAssign);
    await tracking.save();

    // Update EP progress if not extraordinary
    const ep = await ProductiveStage.findById(tracking.productiveStage);
    if (!tracking.isExtraordinary) {
      ep.completedTrackings += 1;
      await ep.save();
    }

    // Update instructor's HourRecord
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    await hourService.addHours({
      instructorId: reqUser.id,
      month,
      year,
      field: tracking.isExtraordinary ? 'extraordinaryHours' : 'trackingHours',
      amount: tracking.assignedHours
    });

    // Advance EP status
    await productiveStagesService.checkAndAdvanceStatus(ep._id);

    // Audit Log
    await recordAuditLog({
      action: 'TRACKING_STATUS_UPDATED',
      entity: 'Tracking',
      entityId: tracking._id,
      performedBy: reqUser.id,
      details: { status: 'EXECUTED', assignedHours: tracking.assignedHours }
    });

    return tracking;
  }

  /**
   * Mark as paid
   */
  async markPaid(reqUser, id) {
    const tracking = await Tracking.findById(id);
    if (!tracking || !tracking.isActive) {
      const error = new Error('Tracking not found');
      error.statusCode = 404;
      throw error;
    }

    if (tracking.instructor.toString() !== reqUser.id.toString()) {
      const error = new Error('Forbidden: Only the instructor can mark their tracking as paid');
      error.statusCode = 403;
      throw error;
    }

    if (tracking.status !== 'EXECUTED') {
      const error = new Error('Only executed trackings can be marked as paid');
      error.statusCode = 400;
      throw error;
    }

    if (tracking.isPaid) {
      const error = new Error('This tracking has already been marked as paid');
      error.statusCode = 400;
      throw error;
    }

    tracking.isPaid = true;
    tracking.paidAt = new Date();
    tracking.status = 'PAID';
    await tracking.save();

    // Update HourRecord
    const executedDate = tracking.executedDate || tracking.updatedAt;
    const month = executedDate.getMonth() + 1;
    const year = executedDate.getFullYear();

    await hourService.markHoursPaidInternal({
      instructorId: reqUser.id,
      month,
      year,
      amount: tracking.assignedHours
    });

    // Audit Log
    await recordAuditLog({
      action: 'TRACKING_STATUS_UPDATED',
      entity: 'Tracking',
      entityId: tracking._id,
      performedBy: reqUser.id,
      details: { status: 'PAID' }
    });

    return tracking;
  }

  /**
   * List trackings
   */
  async getTrackings(reqUser, query) {
    const { productiveStageId, status, isExtraordinary, page = 1, limit = 20 } = query;
    let filter = { isActive: true };

    if (status) filter.status = status;
    if (isExtraordinary !== undefined) filter.isExtraordinary = isExtraordinary === 'true';

    if (reqUser.role === 'APPRENTICE') {
      filter.apprentice = reqUser.id;
      if (productiveStageId) filter.productiveStage = productiveStageId;
    } else if (reqUser.role === 'INSTRUCTOR') {
      filter.instructor = reqUser.id;
      if (productiveStageId) filter.productiveStage = productiveStageId;
    } else if (reqUser.role === 'ADMIN') {
      if (productiveStageId) filter.productiveStage = productiveStageId;
    }

    const skip = (page - 1) * limit;
    const [trackings, total] = await Promise.all([
      Tracking.find(filter)
        .populate('apprentice', 'fullName enrollmentNumber')
        .populate('instructor', 'fullName')
        .sort({ scheduledDate: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Tracking.countDocuments(filter)
    ]);

    return {
      trackings,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getTrackingById(reqUser, id) {
    const tracking = await Tracking.findById(id)
      .populate('apprentice', 'fullName enrollmentNumber')
      .populate('instructor', 'fullName');

    if (!tracking || !tracking.isActive) {
      const error = new Error('Tracking not found');
      error.statusCode = 404;
      throw error;
    }

    // Access control
    if (reqUser.role === 'APPRENTICE' && tracking.apprentice._id.toString() !== reqUser.id.toString()) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }
    if (reqUser.role === 'INSTRUCTOR' && tracking.instructor._id.toString() !== reqUser.id.toString()) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    return tracking;
  }

  async getTrackingSummary(reqUser, productiveStageId) {
    const ep = await ProductiveStage.findById(productiveStageId);
    if (!ep) {
      const error = new Error('ProductiveStage not found');
      error.statusCode = 404;
      throw error;
    }

    // Access control check
    if (reqUser.role === 'APPRENTICE' && ep.apprentice.toString() !== reqUser.id.toString()) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }
    
    if (reqUser.role === 'INSTRUCTOR') {
      const isAssigned = [
        ep.followupInstructor?.toString(),
        ep.technicalInstructor?.toString(),
        ep.projectInstructor?.toString()
      ].includes(reqUser.id.toString());
      if (!isAssigned) {
        const error = new Error('Forbidden');
        error.statusCode = 403;
        throw error;
      }
    }

    const trackings = await Tracking.find({ productiveStage: productiveStageId, isActive: true })
      .sort({ trackingNumber: 1 });

    const completed = trackings.filter(t => !t.isExtraordinary && t.status !== 'SCHEDULED').length;

    return {
      required: ep.requiredTrackings,
      completed,
      pending: ep.requiredTrackings - completed,
      trackings
    };
  }
}

export default new TrackingService();
