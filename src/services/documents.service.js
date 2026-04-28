import Document from '../models/Document.model.js';
import ProductiveStage from '../models/ProductiveStage.model.js';
import hourService from './hours.service.js';
import { recordAuditLog } from '../utils/auditLog.util.js';
import { getConfig } from '../utils/configHelper.util.js';

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

export const createDocument = async (reqUser, productiveStageId, documentType, file) => {
  if (!productiveStageId || !documentType || !file) {
      throw new Error('400|Missing required fields: productiveStageId, documentType, file');
  }

  const ep = await ProductiveStage.findById(productiveStageId).populate('apprentice');
  if (!ep) throw new Error('404|ProductiveStage not found');

  if (ep.apprentice._id.toString() !== reqUser.id.toString()) {
    throw new Error('403|Forbidden: You can only submit documents for your own ProductiveStage');
  }

  if (ep.status !== 'CERTIFICATION') {
    throw new Error('400|Documents can only be submitted when your EP is in certification stage');
  }

  const existing = await Document.findOne({
    productiveStage: productiveStageId,
    documentType,
    status: { $ne: 'REJECTED' },
    isActive: true
  });

  if (existing) {
    throw new Error('409|A document of this type already exists. If rejected, you can resubmit it');
  }

  const driveRes = await mockDriveUpload(file, `certificacion/${documentType}`);

  const document = new Document({
    productiveStage: productiveStageId,
    apprentice: ep.apprentice._id,
    uploadedBy: reqUser.id,
    documentType,
    fileName: file.originalname,
    driveFileId: driveRes.driveFileId,
    driveFileUrl: driveRes.driveFileUrl
  });

  await document.save();

  await mockSendNotification('DOCUMENTS_REMINDER', {
    message: `New document submitted: ${documentType} by ${ep.apprentice.fullName}`
  });

  await recordAuditLog({
    action: 'DOCUMENT_SUBMITTED',
    entity: 'Document',
    entityId: document._id,
    performedBy: reqUser.id,
    details: { documentType, productiveStageId }
  });

  return document;
};

export const getDocuments = async (reqUser, query) => {
  const { productiveStageId, status, documentType } = query;
  
  let filter = { isActive: true };

  if (status) filter.status = status;
  if (documentType) filter.documentType = documentType;

  if (reqUser.role === 'APPRENTICE') {
    filter.apprentice = reqUser.id;
    if (productiveStageId) filter.productiveStage = productiveStageId;
  } else if (reqUser.role === 'INSTRUCTOR') {
    if (!productiveStageId) throw new Error('400|productiveStageId is required for instructors');
    
    const ep = await ProductiveStage.findById(productiveStageId);
    if (!ep) throw new Error('404|ProductiveStage not found');
    
    const isAssigned = [
        ep.followupInstructor?.toString(),
        ep.technicalInstructor?.toString(),
        ep.projectInstructor?.toString()
    ].includes(reqUser.id.toString());

    if (!isAssigned) {
      throw new Error('403|Forbidden: You are not assigned to this ProductiveStage');
    }
    filter.productiveStage = productiveStageId;
  } else if (reqUser.role === 'ADMIN') {
    if (productiveStageId) filter.productiveStage = productiveStageId;
  }

  const documents = await Document.find(filter)
    .populate('uploadedBy', 'fullName')
    .populate('reviewedBy', 'fullName')
    .sort({ createdAt: -1 });

  return documents;
};

export const getDocumentById = async (reqUser, id) => {
  const document = await Document.findOne({ _id: id, isActive: true })
    .populate('uploadedBy', 'fullName')
    .populate('reviewedBy', 'fullName')
    .populate('comments.author', 'fullName')
    .populate('productiveStage');

  if (!document) throw new Error('404|Document not found');

  if (reqUser.role === 'APPRENTICE') {
    if (document.apprentice.toString() !== reqUser.id.toString()) {
      throw new Error('403|Forbidden: Document belongs to another apprentice');
    }
  } else if (reqUser.role === 'INSTRUCTOR') {
    const ep = document.productiveStage;
    const isAssigned = [
        ep.followupInstructor?.toString(),
        ep.technicalInstructor?.toString(),
        ep.projectInstructor?.toString()
    ].includes(reqUser.id.toString());

    if (!isAssigned) {
      throw new Error('403|Forbidden: You are not assigned to this ProductiveStage');
    }
  }

  return document;
};

export const approveDocument = async (reqUser, id) => {
  if (reqUser.role !== 'ADMIN') throw new Error('403|Forbidden: Only ADMIN can approve documents');

  const document = await Document.findOne({ _id: id, isActive: true })
    .populate('productiveStage');
    
  if (!document) throw new Error('404|Document not found');
  if (document.status !== 'SUBMITTED' && document.status !== 'IN_VALIDATION') {
    throw new Error('400|Document must be SUBMITTED or IN_VALIDATION to be approved');
  }

  document.status = 'APPROVED';
  document.reviewedAt = new Date();
  document.reviewedBy = reqUser.id;
  await document.save();

  const required = ['EP_CERTIFICATE', 'PERFORMANCE_EVALUATION', 'COMMITMENT_LETTER'];
  const approvedDocs = await Document.find({
    productiveStage: document.productiveStage._id,
    documentType: { $in: required },
    status: 'APPROVED',
    isActive: true
  });

  const allApproved = required.every(type => approvedDocs.some(d => d.documentType === type));

  if (allApproved) {
    const ep = await ProductiveStage.findById(document.productiveStage._id);
    if (ep && ep.followupInstructor) {
      const hoursConfig = await getConfig('HOURS_PER_CERTIFICATION');
      const amount = hoursConfig ? Number(hoursConfig) : 2;
      const now = new Date();
      await hourService.addHours({
        instructorId: ep.followupInstructor,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        field: 'certificationHours',
        amount
      });
    }
    await mockSendNotification('DOCUMENTS_APPROVED', {
      apprenticeId: document.apprentice,
      message: 'All required documents have been approved. EP ready for final completion.'
    });
  }

  await mockSendNotification('DOCUMENTS_APPROVED', {
    apprenticeId: document.apprentice,
    message: `Document ${document.documentType} was approved.`
  });

  await recordAuditLog({
    action: 'DOCUMENT_APPROVED',
    entity: 'Document',
    entityId: document._id,
    performedBy: reqUser.id,
    details: { documentType: document.documentType }
  });

  return document;
};

export const rejectDocument = async (reqUser, id, comment) => {
  if (reqUser.role !== 'ADMIN') throw new Error('403|Forbidden: Only ADMIN can reject documents');
  if (!comment || comment.length < 10) throw new Error('400|Validation error: comment must be at least 10 characters');

  const document = await Document.findOne({ _id: id, isActive: true });
  if (!document) throw new Error('404|Document not found');
  if (document.status !== 'SUBMITTED' && document.status !== 'IN_VALIDATION') {
    throw new Error('400|Document must be SUBMITTED or IN_VALIDATION to be rejected');
  }

  document.status = 'REJECTED';
  document.reviewedAt = new Date();
  document.reviewedBy = reqUser.id;
  document.comments.push({
    text: comment,
    author: reqUser.id
  });
  
  await document.save();

  await mockSendNotification('DOCUMENTS_REJECTED', {
    apprenticeId: document.apprentice,
    message: `Document ${document.documentType} was rejected. Reason: ${comment}`
  });

  await recordAuditLog({
    action: 'DOCUMENT_REJECTED',
    entity: 'Document',
    entityId: document._id,
    performedBy: reqUser.id,
    details: { documentType: document.documentType, comment }
  });

  return document;
};

export const resubmitDocument = async (reqUser, id, file) => {
  if (reqUser.role !== 'APPRENTICE') throw new Error('403|Forbidden: Only APPRENTICE can resubmit');
  
  const document = await Document.findOne({ _id: id, isActive: true });
  if (!document) throw new Error('404|Document not found');

  if (document.apprentice.toString() !== reqUser.id.toString()) {
    throw new Error('403|Forbidden: You can only resubmit your own documents');
  }
  if (document.status !== 'REJECTED') {
    throw new Error('400|Only rejected documents can be resubmitted');
  }
  if (!file) throw new Error('400|Validation error: file is required');

  const driveRes = await mockDriveUpload(file, `certificacion/${document.documentType}_v2`);

  document.fileName = file.originalname;
  document.driveFileId = driveRes.driveFileId;
  document.driveFileUrl = driveRes.driveFileUrl;
  document.uploadedAt = new Date();
  document.status = 'SUBMITTED';

  await document.save();

  await mockSendNotification('DOCUMENTS_REMINDER', {
    message: `Document resubmitted: ${document.documentType}`
  });

  await recordAuditLog({
    action: 'DOCUMENT_SUBMITTED',
    entity: 'Document',
    entityId: document._id,
    performedBy: reqUser.id,
    details: { action: 'RESUBMIT' }
  });

  return document;
};

export const requestDeletion = async (reqUser, id, reason) => {
  if (reqUser.role !== 'INSTRUCTOR') throw new Error('403|Forbidden: Only INSTRUCTOR can request deletion');
  if (!reason || reason.length < 20) throw new Error('400|Validation error: reason must be at least 20 characters');

  const document = await Document.findOne({ _id: id, isActive: true }).populate('productiveStage');
  if (!document) throw new Error('404|Document not found');

  const ep = document.productiveStage;
  const isAssigned = [
    ep.followupInstructor?.toString(),
    ep.technicalInstructor?.toString(),
    ep.projectInstructor?.toString()
  ].includes(reqUser.id.toString());

  if (!isAssigned) {
    throw new Error('403|Forbidden: You are not assigned to this ProductiveStage');
  }

  if (document.status !== 'APPROVED') {
    throw new Error('400|Only approved documents require a deletion request');
  }
  if (document.deletionRequested) {
    throw new Error('400|Deletion already requested');
  }

  document.deletionRequested = true;
  document.deletionReason = reason;
  await document.save();

  await mockSendNotification('NEW_CRITICAL_NOVELTY', {
    message: `Deletion requested for document ${document.documentType} by instructor`
  });

  return document;
};

export const deleteDocument = async (reqUser, id) => {
  if (reqUser.role !== 'ADMIN') throw new Error('403|Forbidden: Only ADMIN can delete documents');

  const document = await Document.findOne({ _id: id, isActive: true });
  if (!document) throw new Error('404|Document not found');

  if (document.status === 'APPROVED' && !document.deletionRequested) {
    throw new Error('403|Approved documents require a deletion request first');
  }

  document.isActive = false;
  document.deletedBy = reqUser.id;
  document.deletedAt = new Date();
  await document.save();

  await recordAuditLog({
    action: 'DOCUMENT_DELETED',
    entity: 'Document',
    entityId: document._id,
    performedBy: reqUser.id,
    details: { 
      documentType: document.documentType, 
      fileName: document.fileName, 
      reason: document.deletionReason 
    }
  });

  return document;
};

export const getEPDocumentStatus = async (reqUser, productiveStageId) => {
  const ep = await ProductiveStage.findById(productiveStageId);
  if (!ep) throw new Error('404|ProductiveStage not found');

  if (reqUser.role === 'APPRENTICE') {
    if (ep.apprentice.toString() !== reqUser.id.toString()) throw new Error('403|Forbidden: Not assigned');
  } else if (reqUser.role === 'INSTRUCTOR') {
    const isAssigned = [
        ep.followupInstructor?.toString(),
        ep.technicalInstructor?.toString(),
        ep.projectInstructor?.toString()
    ].includes(reqUser.id.toString());

    if (!isAssigned) {
      throw new Error('403|Forbidden: You are not assigned to this ProductiveStage');
    }
  }

  const required = ['EP_CERTIFICATE', 'PERFORMANCE_EVALUATION', 'COMMITMENT_LETTER'];
  const documents = await Document.find({ productiveStage: productiveStageId, isActive: true });

  const submitted = documents.map(d => ({
    documentType: d.documentType,
    status: d.status,
    driveFileUrl: d.driveFileUrl,
    id: d._id
  }));

  const approvedTypes = documents
    .filter(d => d.status === 'APPROVED')
    .map(d => d.documentType);

  const missing = required.filter(type => !approvedTypes.includes(type));

  return {
    required,
    submitted,
    missing,
    allRequiredApproved: missing.length === 0 && required.length > 0
  };
};
