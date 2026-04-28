import Bitacora from '../models/Bitacora.model.js';
import ProductiveStage from '../models/ProductiveStage.model.js';
import User from '../models/User.model.js';
import HourRecord from '../models/HourRecord.model.js';
import hourService from './hours.service.js';
import { recordAuditLog } from '../utils/auditLog.util.js';
import { getConfig } from '../utils/configHelper.util.js';
import productiveStagesService from './productiveStages.service.js';
import { AUDIT_ACTIONS } from '../utils/enums.js';

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

class BitacoraService {
  /**
   * Apprentice submits a new logbook
   */
  async submitBitacora(reqUser, data, file) {
    const { productiveStageId, periodStart, periodEnd } = data;

    // 1. Find ProductiveStage and verify ownership
    const ep = await ProductiveStage.findById(productiveStageId);
    if (!ep) {
        const error = new Error('ProductiveStage not found');
        error.statusCode = 404;
        throw error;
    }

    if (ep.apprentice.toString() !== reqUser.id.toString()) {
        const error = new Error('Forbidden: You can only submit logbooks for your own ProductiveStage');
        error.statusCode = 403;
        throw error;
    }

    // 2. Verify EP status
    if (!['ACTIVE', 'IN_FOLLOWUP'].includes(ep.status)) {
        const error = new Error('Your productive stage is not active');
        error.statusCode = 400;
        throw error;
    }

    // 3. Count existing non-rejected bitacoras
    const existingCount = await Bitacora.countDocuments({
      productiveStage: productiveStageId,
      status: { $ne: 'REJECTED' },
      isActive: true
    });

    if (existingCount >= ep.maxBitacoras) {
        const error = new Error(`Maximum logbooks reached (${ep.maxBitacoras})`);
        error.statusCode = 400;
        throw error;
    }

    // 4. Check for duplicate period
    const duplicatePeriod = await Bitacora.findOne({
      productiveStage: productiveStageId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      isActive: true,
      status: { $ne: 'REJECTED' }
    });

    if (duplicatePeriod) {
        const error = new Error('A logbook for this period already exists');
        error.statusCode = 409;
        throw error;
    }

    // 5. Determine logbookNumber
    const logbookNumber = existingCount + 1;

    // 6. Upload PDF to Drive (Mock)
    const driveRes = await mockDriveUpload(file, `bitacoras/${ep._id}`);

    // 7. Create bitacora
    const bitacora = new Bitacora({
      productiveStage: productiveStageId,
      apprentice: reqUser.id,
      instructor: ep.followupInstructor, // Pre-assign to the followup instructor
      logbookNumber,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      fileName: file.originalname,
      driveFileId: driveRes.driveFileId,
      driveFileUrl: driveRes.driveFileUrl,
      submittedAt: new Date(),
      status: 'PENDING'
    });

    await bitacora.save();

    // 8. Notify instructor
    if (ep.followupInstructor) {
      await mockSendNotification('BITACORA_PENDING_REVIEW', {
        recipient: ep.followupInstructor,
        apprenticeId: reqUser.id,
        bitacoraId: bitacora._id
      });
    }

    // 9. Audit Log
    await recordAuditLog({
      action: 'BITACORA_SUBMITTED',
      entity: 'Bitacora',
      entityId: bitacora._id,
      performedBy: reqUser.id,
      details: { logbookNumber, productiveStageId }
    });

    return bitacora;
  }

  /**
   * List bitacoras with filters
   */
  async getBitacoras(reqUser, query) {
    const { productiveStageId, status, page = 1, limit = 20 } = query;
    let filter = { isActive: true };

    if (status) filter.status = status;

    if (reqUser.role === 'APPRENTICE') {
      filter.apprentice = reqUser.id;
      if (productiveStageId) filter.productiveStage = productiveStageId;
    } else if (reqUser.role === 'INSTRUCTOR') {
      if (!productiveStageId) {
        const error = new Error('productiveStageId is required for instructors');
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
      filter.productiveStage = productiveStageId;
    } else if (reqUser.role === 'ADMIN') {
      if (productiveStageId) filter.productiveStage = productiveStageId;
    }

    const skip = (page - 1) * limit;
    const [bitacoras, total] = await Promise.all([
      Bitacora.find(filter)
        .populate('apprentice', 'fullName enrollmentNumber')
        .populate('instructor', 'fullName')
        .sort({ logbookNumber: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Bitacora.countDocuments(filter)
    ]);

    return {
      bitacoras,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get detail of a bitacora
   */
  async getBitacoraById(reqUser, id) {
    const bitacora = await Bitacora.findOne({ _id: id, isActive: true })
      .populate('apprentice', 'fullName enrollmentNumber nationalId')
      .populate('instructor', 'fullName')
      .populate('reviewComments.author', 'fullName');

    if (!bitacora) {
        const error = new Error('Bitacora not found');
        error.statusCode = 404;
        throw error;
    }

    // Access control
    if (reqUser.role === 'APPRENTICE') {
      if (bitacora.apprentice._id.toString() !== reqUser.id.toString()) {
        const error = new Error('Forbidden: Document belongs to another apprentice');
        error.statusCode = 403;
        throw error;
      }
    } else if (reqUser.role === 'INSTRUCTOR') {
      const ep = await ProductiveStage.findById(bitacora.productiveStage);
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
    }

    return bitacora;
  }

  /**
   * Instructor approves a bitacora
   */
  async approveBitacora(reqUser, id) {
    const bitacora = await Bitacora.findOne({ _id: id, isActive: true });
    if (!bitacora) {
        const error = new Error('Bitacora not found');
        error.statusCode = 404;
        throw error;
    }

    if (!['PENDING', 'IN_REVIEW'].includes(bitacora.status)) {
        const error = new Error('Bitacora must be PENDING or IN_REVIEW to be approved');
        error.statusCode = 400;
        throw error;
    }

    const ep = await ProductiveStage.findById(bitacora.productiveStage);
    if (ep.followupInstructor?.toString() !== reqUser.id.toString()) {

        const error = new Error('Forbidden: Only the assigned followup instructor can approve logbooks');
        error.statusCode = 403;
        throw error;
    }

    // 3. Read hoursToAssign from SystemConfig
    const hoursConfig = await getConfig('HOURS_PER_LOGBOOK_REVIEW');
    const hoursToAssign = hoursConfig ? Number(hoursConfig) : 2;

    // 4. Update bitacora
    bitacora.status = 'APPROVED';
    bitacora.reviewedAt = new Date();
    bitacora.instructor = reqUser.id;
    bitacora.assignedHours = hoursToAssign;
    await bitacora.save();

    // 5. Increment ProductiveStage.completedBitacoras
    ep.completedBitacoras += 1;
    await ep.save();

    // 6. Update instructor's HourRecord
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const { isOverLimit } = await hourService.addHours({
      instructorId: reqUser.id,
      month,
      year,
      field: 'bitacoraHours',
      amount: hoursToAssign
    });

    if (isOverLimit) {
      // Notification is already handled inside addHours in a real scenario, 
      // but here we can add extra if needed.
    }

    // 7. Call checkAndAdvanceStatus
    await productiveStagesService.checkAndAdvanceStatus(ep._id);

    // 8. Notify apprentice
    await mockSendNotification('BITACORA_APPROVED', {
      recipient: bitacora.apprentice,
      bitacoraId: bitacora._id
    });

    // 9. Audit Log
    await recordAuditLog({
      action: 'BITACORA_APPROVED',
      entity: 'Bitacora',
      entityId: bitacora._id,
      performedBy: reqUser.id,
      details: { assignedHours: hoursToAssign }
    });

    return bitacora;
  }

  /**
   * Instructor rejects a bitacora
   */
  async rejectBitacora(reqUser, id, comment) {
    if (!comment || comment.length < 10) {
        const error = new Error('Validation error: comment must be at least 10 characters');
        error.statusCode = 400;
        throw error;
    }

    const bitacora = await Bitacora.findOne({ _id: id, isActive: true });
    if (!bitacora) {
        const error = new Error('Bitacora not found');
        error.statusCode = 404;
        throw error;
    }

    if (!['PENDING', 'IN_REVIEW'].includes(bitacora.status)) {
        const error = new Error('Bitacora must be PENDING or IN_REVIEW to be rejected');
        error.statusCode = 400;
        throw error;
    }

    const ep = await ProductiveStage.findById(bitacora.productiveStage);
    if (ep.followupInstructor?.toString() !== reqUser.id.toString()) {

        const error = new Error('Forbidden: Only the assigned followup instructor can reject logbooks');
        error.statusCode = 403;
        throw error;
    }

    bitacora.status = 'REJECTED';
    bitacora.reviewedAt = new Date();
    bitacora.instructor = reqUser.id;
    bitacora.reviewComments.push({
      text: comment,
      author: reqUser.id,
      createdAt: new Date()
    });

    await bitacora.save();

    // Notify apprentice
    await mockSendNotification('BITACORA_REJECTED', {
      recipient: bitacora.apprentice,
      bitacoraId: bitacora._id,
      comment
    });

    // Audit Log
    await recordAuditLog({
      action: 'BITACORA_REJECTED',
      entity: 'Bitacora',
      entityId: bitacora._id,
      performedBy: reqUser.id,
      details: { comment }
    });

    return bitacora;
  }

  /**
   * Apprentice resubmits a rejected bitacora
   */
  async resubmitBitacora(reqUser, id, file) {
    const bitacora = await Bitacora.findOne({ _id: id, isActive: true });
    if (!bitacora) {
        const error = new Error('Bitacora not found');
        error.statusCode = 404;
        throw error;
    }

    if (bitacora.apprentice.toString() !== reqUser.id) {
        const error = new Error('Forbidden: You can only resubmit your own logbooks');
        error.statusCode = 403;
        throw error;
    }

    if (bitacora.status !== 'REJECTED') {
        const error = new Error('Only rejected logbooks can be resubmitted');
        error.statusCode = 400;
        throw error;
    }

    // Upload new PDF to Drive
    const version = bitacora.reviewComments.length + 1;
    const driveRes = await mockDriveUpload(file, `bitacoras/${bitacora.productiveStage}_v${version}`);

    bitacora.fileName = file.originalname;
    bitacora.driveFileId = driveRes.driveFileId;
    bitacora.driveFileUrl = driveRes.driveFileUrl;
    bitacora.submittedAt = new Date();
    bitacora.status = 'PENDING';

    await bitacora.save();

    // Notify instructor
    const ep = await ProductiveStage.findById(bitacora.productiveStage);
    if (ep.followupInstructor) {
      await mockSendNotification('BITACORA_PENDING_REVIEW', {
        recipient: ep.followupInstructor,
        apprenticeId: reqUser.id,
        bitacoraId: bitacora._id,
        isResubmission: true
      });
    }

    return bitacora;
  }

  /**
   * Instructor creates an additional logbook
   */
  async createAdditionalBitacora(reqUser, data) {
    const { productiveStageId, periodStart, periodEnd, reason } = data;

    if (!reason || reason.length < 20) {
        const error = new Error('Validation error: reason must be at least 20 characters');
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

    const existingCount = await Bitacora.countDocuments({
      productiveStage: productiveStageId,
      isActive: true
    });

    const bitacora = new Bitacora({
      productiveStage: productiveStageId,
      apprentice: ep.apprentice,
      instructor: reqUser.id,
      logbookNumber: existingCount + 1,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      isAdditional: true,
      status: 'PENDING'
    });

    await bitacora.save();

    // Notify apprentice
    await mockSendNotification('BITACORA_REMINDER', {
      recipient: ep.apprentice,
      message: 'Instructor requested an additional logbook. Please upload the PDF.',
      reason
    });

    return bitacora;
  }
}

export default new BitacoraService();
