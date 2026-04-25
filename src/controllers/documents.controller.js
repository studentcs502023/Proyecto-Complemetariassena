import * as documentsService from '../services/documents.service.js';
import { successResponse, errorResponse } from '../utils/response.util.js';

const handleServiceError = (res, error) => {
  const message = error.message || 'Internal server error';
  let status = 500;
  let text = message;
  
  if (message.includes('|')) {
    const parts = message.split('|');
    status = parseInt(parts[0], 10);
    text = parts[1];
  } else if (message.includes('Forbidden')) {
    status = 403;
  } else if (message.includes('not found') || message.includes('Not found')) {
    status = 404;
  } else if (message.includes('Validation') || message.includes('required')) {
    status = 400;
  }

  return errorResponse(res, status, text);
};

export const createDocument = async (req, res) => {
  try {
    const { productiveStageId, documentType } = req.body;
    const file = req.file;
    const doc = await documentsService.createDocument(req.user, productiveStageId, documentType, file);
    return successResponse(res, 201, 'Document submitted successfully', doc);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export const getDocuments = async (req, res) => {
  try {
    const docs = await documentsService.getDocuments(req.user, req.query);
    return successResponse(res, 200, 'Documents retrieved successfully', docs);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export const getDocumentById = async (req, res) => {
  try {
    const doc = await documentsService.getDocumentById(req.user, req.params.id);
    return successResponse(res, 200, 'Document retrieved successfully', doc);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export const approveDocument = async (req, res) => {
  try {
    const doc = await documentsService.approveDocument(req.user, req.params.id);
    return successResponse(res, 200, 'Document approved successfully', doc);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export const rejectDocument = async (req, res) => {
  try {
    const doc = await documentsService.rejectDocument(req.user, req.params.id, req.body.comment);
    return successResponse(res, 200, 'Document rejected successfully', doc);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export const resubmitDocument = async (req, res) => {
  try {
    const doc = await documentsService.resubmitDocument(req.user, req.params.id, req.file);
    return successResponse(res, 200, 'Document resubmitted successfully', doc);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export const requestDeletion = async (req, res) => {
  try {
    const doc = await documentsService.requestDeletion(req.user, req.params.id, req.body.reason);
    return successResponse(res, 200, 'Document deletion requested successfully', doc);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const doc = await documentsService.deleteDocument(req.user, req.params.id);
    return successResponse(res, 200, 'Document deleted successfully', doc);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export const getEPDocumentStatus = async (req, res) => {
  try {
    const status = await documentsService.getEPDocumentStatus(req.user, req.params.productiveStageId);
    return successResponse(res, 200, 'EP document status retrieved successfully', status);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

export default {
  createDocument,
  getDocuments,
  getDocumentById,
  approveDocument,
  rejectDocument,
  resubmitDocument,
  requestDeletion,
  deleteDocument,
  getEPDocumentStatus
};