import mongoose from 'mongoose';
const { Schema } = mongoose;
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from '../utils/enums.js';

const DocumentSchema = new Schema({
  productiveStage:    { type: Schema.Types.ObjectId, ref: 'ProductiveStage', required: true },
  apprentice:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedBy:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy:         { type: Schema.Types.ObjectId, ref: 'User', default: null },

  documentType:       { type: String, enum: DOCUMENT_TYPES, required: true },
  fileName:           { type: String, required: true },
  driveFileId:        { type: String, required: true },
  driveFileUrl:       { type: String, required: true },
  uploadedAt:         { type: Date, default: Date.now },

  status:             { type: String, enum: DOCUMENT_STATUSES, default: 'SUBMITTED' },
  reviewedAt:         { type: Date, default: null },
  comments: [{
    text:             { type: String, required: true },
    author:           { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt:        { type: Date, default: Date.now }
  }],

  deletionRequested:  { type: Boolean, default: false },
  deletionReason:     { type: String, default: null },
  deletedBy:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt:          { type: Date, default: null },

  isActive:           { type: Boolean, default: true }
}, { timestamps: true });

DocumentSchema.index({ productiveStage: 1, documentType: 1 });
DocumentSchema.index({ apprentice: 1, status: 1 });
DocumentSchema.index({ status: 1 });

export default mongoose.model('Document', DocumentSchema);
