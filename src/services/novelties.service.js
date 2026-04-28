import Novelty from '../models/Novelty.model.js';
import ProductiveStage from '../models/ProductiveStage.model.js';
import { recordAuditLog } from '../utils/auditLog.util.js';
import pdfGenerator from '../utils/pdfGenerator.util.js';
import { NOVELTY_STATUSES } from '../utils/enums.js';

// MOCK: Google Drive integration
const mockDriveUpload = async (file, folderPath) => {
  return {
    driveFileId: `mock_drive_id_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    driveFileUrl: `https://drive.google.com/file/d/mock_drive_id_${Date.now()}/view`,
    fileName: file.originalname
  };
};

// MOCK: Notifications integration
const mockSendNotification = async (type, payload) => {
  console.log(`[MOCK NOTIFICATION] ${type}:`, payload);
};

class NoveltyService {
  async createNovelty(noveltyData, files, reporterId) {
    const { productiveStageId, type, description, occurrenceDate } = noveltyData;

    // 1. Find EP and verify
    const ep = await ProductiveStage.findById(productiveStageId).populate('apprentice');
    if (!ep) {
        const error = new Error('Productive stage not found');
        error.statusCode = 404;
        throw error;
    }

    // Verify instructor is assigned
    const isAssigned = [
      ep.followupInstructor?.toString(),
      ep.technicalInstructor?.toString(),
      ep.projectInstructor?.toString()
    ].includes(reporterId.toString());

    if (!isAssigned) {
        const error = new Error('Forbidden: You are not assigned to this productive stage');
        error.statusCode = 403;
        throw error;
    }

    if (['COMPLETED', 'ARCHIVED'].includes(ep.status)) {
        const error = new Error('Cannot report novelties for a completed or archived EP');
        error.statusCode = 400;
        throw error;
    }

    // 2. Upload attachments to Drive
    const attachments = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const driveFile = await mockDriveUpload(file, `ep-${ep._id}/novedades`);
        attachments.push(driveFile);
      }
    }

    // 3. Create novelty
    const novelty = new Novelty({
      productiveStage: productiveStageId,
      apprentice: ep.apprentice._id,
      reportedBy: reporterId,
      type,
      description,
      occurrenceDate,
      attachments,
      status: 'PENDING'
    });

    // 4. Auto-generate PDF summary
    const pdfInfo = await pdfGenerator.generateNoveltyPDF(novelty);
    novelty.pdfDriveId = pdfInfo.driveFileId;
    novelty.pdfDriveUrl = pdfInfo.driveFileUrl;

    await novelty.save();

    // 5. Send priority notification to ADMIN
    await mockSendNotification('NEW_CRITICAL_NOVELTY', {
      apprenticeName: ep.apprentice.fullName,
      enrollmentNumber: ep.apprentice.enrollmentNumber,
      noveltyType: type,
      instructorId: reporterId,
      description: description.substring(0, 200),
      noveltyId: novelty._id
    });

    // 6. Record in AuditLog
    await recordAuditLog({
      action: 'NOVELTY_CREATED',
      entity: 'Novelty',
      entityId: novelty._id,
      performedBy: reporterId,
      details: { type, apprenticeId: ep.apprentice._id }
    });

    return novelty;
  }

  async getAllNovelties(filters, role, userId) {
    const { status, type, productiveStageId, apprenticeId, page = 1, limit = 20 } = filters;
    
    const query = { isActive: true };
    if (status) query.status = status;
    if (type) query.type = type;
    if (productiveStageId) query.productiveStage = productiveStageId;
    
    // Role-based access
    if (role === 'INSTRUCTOR') {
      query.reportedBy = userId;
    } else if (role === 'ADMIN' && apprenticeId) {
      query.apprentice = apprenticeId;
    }

    const skip = (page - 1) * limit;
    const novelties = await Novelty.find(query)
      .populate('apprentice', 'fullName enrollmentNumber')
      .populate('reportedBy', 'fullName')
      .populate('resolvedBy', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Novelty.countDocuments(query);

    return {
      novelties,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    };
  }

  async getNoveltyById(id, role, userId) {
    const novelty = await Novelty.findById(id)
      .populate('apprentice', 'fullName enrollmentNumber')
      .populate('reportedBy', 'fullName')
      .populate('resolvedBy', 'fullName')
      .populate('productiveStage');

    if (!novelty || !novelty.isActive) {
        const error = new Error('Novelty not found');
        error.statusCode = 404;
        throw error;
    }

    if (role === 'INSTRUCTOR' && novelty.reportedBy._id.toString() !== userId.toString()) {
        const error = new Error('Forbidden: You can only access your own novelties');
        error.statusCode = 403;
        throw error;
    }

    return novelty;
  }

  async updateNoveltyStatus(id, updateData, adminId) {
    const { status, actionsTaken } = updateData;
    const novelty = await Novelty.findById(id).populate('apprentice');

    if (!novelty || !novelty.isActive) {
        const error = new Error('Novelty not found');
        error.statusCode = 404;
        throw error;
    }

    // Validate transitions
    if (novelty.status === 'RESOLVED') {
        const error = new Error('Resolved novelties cannot be reopened');
        error.statusCode = 400;
        throw error;
    }

    const validTransitions = {
      'PENDING': ['IN_PROGRESS', 'RESOLVED'],
      'IN_PROGRESS': ['RESOLVED']
    };

    if (!validTransitions[novelty.status]?.includes(status)) {
        const error = new Error(`Invalid status transition from ${novelty.status} to ${status}`);
        error.statusCode = 400;
        throw error;
    }

    if (['IN_PROGRESS', 'RESOLVED'].includes(status) && (!actionsTaken || actionsTaken.length < 20)) {
        const error = new Error('Actions taken must be at least 20 characters when advancing status');
        error.statusCode = 400;
        throw error;
    }

    // Update fields
    novelty.status = status;
    novelty.actionsTaken = actionsTaken;

    if (status === 'RESOLVED') {
      novelty.resolvedBy = adminId;
      novelty.resolvedAt = new Date();
    }

    // Regenerate PDF
    const pdfInfo = await pdfGenerator.generateNoveltyPDF(novelty);
    novelty.pdfDriveId = pdfInfo.driveFileId;
    novelty.pdfDriveUrl = pdfInfo.driveFileUrl;

    await novelty.save();

    // Notify instructor
    await mockSendNotification('DOCUMENTS_REMINDER', { // Reusing a general type or specific if exists
      recipient: novelty.reportedBy,
      message: `Novelty for ${novelty.apprentice.fullName} updated to ${status}`
    });

    // Record Audit Log
    await recordAuditLog({
      action: status === 'RESOLVED' ? 'NOVELTY_RESOLVED' : 'NOVELTY_CREATED',
      entity: 'Novelty',
      entityId: novelty._id,
      performedBy: adminId,
      details: { status, actionsTaken }
    });

    return novelty;
  }

  async addAttachments(id, files, userId, role) {
    const novelty = await Novelty.findById(id);
    if (!novelty || !novelty.isActive) {
        const error = new Error('Novelty not found');
        error.statusCode = 404;
        throw error;
    }

    // Access check
    if (role === 'INSTRUCTOR' && novelty.reportedBy.toString() !== userId.toString()) {
        const error = new Error('Forbidden: You can only modify your own novelties');
        error.statusCode = 403;
        throw error;
    }

    if (novelty.status === 'RESOLVED') {
        const error = new Error('Cannot add attachments to a resolved novelty');
        error.statusCode = 400;
        throw error;
    }

    // Upload files
    if (files && files.length > 0) {
      for (const file of files) {
        const driveFile = await mockDriveUpload(file, `ep-${novelty.productiveStage}/novedades`);
        novelty.attachments.push(driveFile);
      }
    }

    // Regenerate PDF
    const pdfInfo = await pdfGenerator.generateNoveltyPDF(novelty);
    novelty.pdfDriveId = pdfInfo.driveFileId;
    novelty.pdfDriveUrl = pdfInfo.driveFileUrl;

    await novelty.save();

    return novelty;
  }

  async getNoveltiesByEP(productiveStageId) {
    const novelties = await Novelty.find({ productiveStage: productiveStageId, isActive: true })
      .sort({ createdAt: -1 });

    const stats = {
      total: novelties.length,
      pending: novelties.filter(n => n.status === 'PENDING').length,
      inProgress: novelties.filter(n => n.status === 'IN_PROGRESS').length,
      resolved: novelties.filter(n => n.status === 'RESOLVED').length,
      novelties
    };

    return stats;
  }

  async getNoveltyHistory(productiveStageId) {
    const novelties = await Novelty.find({ productiveStage: productiveStageId, isActive: true })
      .populate('apprentice', 'fullName')
      .populate('reportedBy', 'fullName')
      .populate('resolvedBy', 'fullName')
      .sort({ createdAt: -1 });

    return novelties;
  }
}

export default new NoveltyService();
