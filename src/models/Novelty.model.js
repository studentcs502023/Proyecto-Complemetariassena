import mongoose from 'mongoose';
const { Schema } = mongoose;
import { NOVELTY_TYPES, NOVELTY_STATUSES } from '../utils/enums.js';

const NoveltySchema = new Schema({
  productiveStage:  { type: Schema.Types.ObjectId, ref: 'ProductiveStage', required: true },
  apprentice:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reportedBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  resolvedBy:       { type: Schema.Types.ObjectId, ref: 'User', default: null },

  type:             { type: String, enum: NOVELTY_TYPES, required: true },
  description:      { type: String, required: true, minlength: 50 },
  occurrenceDate:   { type: Date, required: true },

  attachments: [{
    fileName:       { type: String },
    driveFileId:    { type: String },
    driveFileUrl:   { type: String },
    uploadedAt:     { type: Date, default: Date.now }
  }],

  status:           { type: String, enum: NOVELTY_STATUSES, default: 'PENDING' },
  actionsTaken:     { type: String, default: null },
  resolvedAt:       { type: Date, default: null },

  pdfDriveId:       { type: String, default: null },
  pdfDriveUrl:      { type: String, default: null },

  isActive:         { type: Boolean, default: true }
}, { timestamps: true });

NoveltySchema.index({ productiveStage: 1 });
NoveltySchema.index({ apprentice: 1 });
NoveltySchema.index({ reportedBy: 1, status: 1 });
NoveltySchema.index({ status: 1, createdAt: -1 });

const Novelty = mongoose.model('Novelty', NoveltySchema);

export default Novelty;
