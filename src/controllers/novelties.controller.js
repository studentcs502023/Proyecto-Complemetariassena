import noveltyService from '../services/novelties.service.js';
import { successResponse, errorResponse } from '../utils/response.util.js';

const createNovelty = async (req, res) => {
  try {
    const novelty = await noveltyService.createNovelty(req.body, req.files, req.user.id);
    return successResponse(res, 201, 'Novelty reported successfully', novelty);
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 400;
    return errorResponse(res, status, error.message);
  }
};

const getAllNovelties = async (req, res) => {
  try {
    const data = await noveltyService.getAllNovelties(req.query, req.user.role, req.user.id);
    return successResponse(res, 200, 'Novelties retrieved successfully', data);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

const getNoveltyById = async (req, res) => {
  try {
    const novelty = await noveltyService.getNoveltyById(req.params.id, req.user.role, req.user.id);
    return successResponse(res, 200, 'Novelty retrieved successfully', novelty);
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 404;
    return errorResponse(res, status, error.message);
  }
};

const updateStatus = async (req, res) => {
  try {
    const novelty = await noveltyService.updateNoveltyStatus(req.params.id, req.body, req.user.id);
    return successResponse(res, 200, 'Novelty status updated successfully', novelty);
  } catch (error) {
    const status = error.message.includes('Invalid status transition') ? 400 : 404;
    return errorResponse(res, status, error.message);
  }
};

const addAttachments = async (req, res) => {
  try {
    const novelty = await noveltyService.addAttachments(req.params.id, req.files, req.user.id, req.user.role);
    return successResponse(res, 200, 'Attachments added successfully', novelty);
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403 : 400;
    return errorResponse(res, status, error.message);
  }
};

const getNoveltiesByEP = async (req, res) => {
  try {
    const data = await noveltyService.getNoveltiesByEP(req.params.productiveStageId);
    return successResponse(res, 200, 'EP novelties retrieved successfully', data);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export default {
  createNovelty,
  getAllNovelties,
  getNoveltyById,
  updateStatus,
  addAttachments,
  getNoveltiesByEP
};
