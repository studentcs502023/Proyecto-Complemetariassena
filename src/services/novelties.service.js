import Novelty from '../models/Novelty.model.js';
import ProductiveStage from '../models/ProductiveStage.model.js';
import { recordAuditLog } from '../utils/auditLog.util.js';
import pdfGenerator from '../utils/pdfGenerator.util.js';
import { NOVELTY_STATUSES } from '../utils/enums.js';

/**
 * MOCK Services for demonstration
 * In a real project, these would be separate files
 */
const googleDriveService = {
  uploadFile: async (file, folder) => ({
    fileName: file.originalname,
    driveFileId: `drive-${Math.random().toString(36).substr(2, 9)}`,
    driveFileUrl: `https://drive.google.com/file/d/mock-${Math.random()}`
  })
};

const notificationService = {
  sendPriorityNotification: async (data) => {
    console.log('PRIORITY NOTIFICATION TO ADMIN:', data);
  },
  sendNotification: async (data) => {
    console.log('NOTIFICATION:', data);
  }
};

const createNovelty = async (noveltyData, files, reporterId) => {
  const { productiveStageId, type, description, occurrenceDate } = noveltyData;

  // 1. Find EP and verify
  const ep = await ProductiveStage.findById(productiveStageId).populate('apprentice');
  if (!ep) throw new Error('Productive stage not found');

  // Verify instructor is assigned
  const isAssigned = [
    ep.followupInstructor?.toString(),
    ep.technicalInstructor?.toString(),
    ep.projectInstructor?.toString()
  ].includes(reporterId);

  if (!isAssigned) {
    throw new Error('Forbidden: You are not assigned to this productive stage');
  }

  if (['COMPLETED', 'ARCHIVED'].includes(ep.status)) {
    throw new Error('Cannot report novelties for a completed or archived EP');
  }

  // 2. Upload attachments to Drive
  const attachments = [];
  if (files && files.length > 0) {
    for (const file of files) {
      const driveFile = await googleDriveService.uploadFile(file, `ep-${ep._id}/novedades`);
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
  await notificationService.sendPriorityNotification({
    type: 'NEW_CRITICAL_NOVELTY',
    details: {
      apprenticeName: ep.apprentice.fullName,
      noveltyType: type,
      instructorId: reporterId,
      description: description.substring(0, 200)
    }
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
};

const getAllNovelties = async (filters, role, userId) => {
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
};

const getNoveltyById = async (id, role, userId) => {
  const novelty = await Novelty.findById(id)
    .populate('apprentice', 'fullName enrollmentNumber')
    .populate('reportedBy', 'fullName')
    .populate('resolvedBy', 'fullName')
    .populate('productiveStage');

  if (!novelty) throw new Error('Novelty not found');

  if (role === 'INSTRUCTOR' && novelty.reportedBy._id.toString() !== userId) {
    throw new Error('Forbidden: You can only access your own novelties');
  }

  return novelty;
};

const updateNoveltyStatus = async (id, updateData, adminId) => {
  const { status, actionsTaken } = updateData;
  const novelty = await Novelty.findById(id).populate('apprentice');

  if (!novelty) throw new Error('Novelty not found');

  // Validate transitions
  if (novelty.status === 'RESOLVED') {
    throw new Error('Resolved novelties cannot be reopened');
  }

  const validTransitions = {
    'PENDING': ['IN_PROGRESS', 'RESOLVED'],
    'IN_PROGRESS': ['RESOLVED']
  };

  if (!validTransitions[novelty.status]?.includes(status)) {
    throw new Error(`Invalid status transition from ${novelty.status} to ${status}`);
  }

  if (['IN_PROGRESS', 'RESOLVED'].includes(status) && (!actionsTaken || actionsTaken.length < 20)) {
    throw new Error('Actions taken must be at least 20 characters when advancing status');
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
  await notificationService.sendNotification({
    recipient: novelty.reportedBy,
    message: `Novelty for ${novelty.apprentice.fullName} updated to ${status}`
  });

  // Record Audit Log
  await recordAuditLog({
    action: status === 'RESOLVED' ? 'NOVELTY_RESOLVED' : 'NOVELTY_CREATED', // Using existing actions
    entity: 'Novelty',
    entityId: novelty._id,
    performedBy: adminId,
    details: { status }
  });

  return novelty;
};

const addAttachments = async (id, files, userId, role) => {
  const novelty = await Novelty.findById(id);
  if (!novelty) throw new Error('Novelty not found');

  // Access check
  if (role === 'INSTRUCTOR' && novelty.reportedBy.toString() !== userId) {
    throw new Error('Forbidden: You can only modify your own novelties');
  }

  if (novelty.status === 'RESOLVED') {
    throw new Error('Cannot add attachments to a resolved novelty');
  }

  // Upload files
  if (files && files.length > 0) {
    for (const file of files) {
      const driveFile = await googleDriveService.uploadFile(file, `ep-${novelty.productiveStage}/novedades`);
      novelty.attachments.push(driveFile);
    }
  }

  // Regenerate PDF
  const pdfInfo = await pdfGenerator.generateNoveltyPDF(novelty);
  novelty.pdfDriveId = pdfInfo.driveFileId;
  novelty.pdfDriveUrl = pdfInfo.driveFileUrl;

  await novelty.save();

  return novelty;
};

const getNoveltiesByEP = async (productiveStageId) => {
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
};

const getNoveltyHistory = async (productiveStageId) => {
  const novelties = await Novelty.find({ productiveStage: productiveStageId, isActive: true })
    .populate('apprentice', 'fullName')
    .populate('reportedBy', 'fullName')
    .populate('resolvedBy', 'fullName')
    .sort({ createdAt: -1 });

  return novelties;
};

export default {
  createNovelty,
  getAllNovelties,
  getNoveltyById,
  updateNoveltyStatus,
  addAttachments,
  getNoveltiesByEP,
  getNoveltyHistory
};
