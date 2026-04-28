import mongoose from 'mongoose';
const { Schema } = mongoose;
import { BITACORA_STATUSES } from '../utils/enums.js';

const bitacoraSchema = new Schema({
  productiveStage:  { type: Schema.Types.ObjectId, ref: 'ProductiveStage', required: true },
  apprentice:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  instructor:       { type: Schema.Types.ObjectId, ref: 'User', default: null },

  logbookNumber:    { type: Number, required: true },
  periodStart:      { type: Date, required: true },
  periodEnd:        { type: Date, required: true },
  isAdditional:     { type: Boolean, default: false },

  fileName:         { type: String, default: null },
  driveFileId:      { type: String, default: null },
  driveFileUrl:     { type: String, default: null },
  submittedAt:      { type: Date, default: null },

  status:           { type: String, enum: BITACORA_STATUSES, default: 'PENDING' },
  reviewedAt:       { type: Date, default: null },
  reviewComments: [{
    text:           { type: String, required: true },
    createdAt:      { type: Date, default: Date.now },
    author:         { type: Schema.Types.ObjectId, ref: 'User' }
  }],

  assignedHours:    { type: Number, default: null },
  isPaid:           { type: Boolean, default: false },
  paidAt:           { type: Date, default: null },

  isActive:         { type: Boolean, default: true }
}, { timestamps: true });

bitacoraSchema.index({ productiveStage: 1, logbookNumber: 1 });
bitacoraSchema.index({ apprentice: 1, status: 1 });
bitacoraSchema.index({ instructor: 1, status: 1 });
bitacoraSchema.index({ status: 1, submittedAt: 1 });

const Bitacora = mongoose.model('Bitacora', bitacoraSchema);

export default Bitacora;
