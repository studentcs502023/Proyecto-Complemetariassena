import mongoose from 'mongoose';
const { Schema } = mongoose;
import { TRACKING_STATUSES, TRACKING_TYPES } from '../utils/enums.js';

const trackingSchema = new Schema({
  productiveStage:      { type: Schema.Types.ObjectId, ref: 'ProductiveStage', required: true },
  apprentice:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  instructor:           { type: Schema.Types.ObjectId, ref: 'User', required: true },

  trackingNumber:       { type: Number, required: true },
  type:                 { type: String, enum: TRACKING_TYPES, required: true },
  isExtraordinary:      { type: Boolean, default: false },
  extraordinaryReason:  { type: String, default: null },
  approvedByAdmin:      { type: Boolean, default: false },
  approvedBy:           { type: Schema.Types.ObjectId, ref: 'User', default: null },

  scheduledDate:        { type: Date, required: true },
  executedDate:         { type: Date, default: null },

  fileName:             { type: String, default: null },
  driveFileId:          { type: String, default: null },
  driveFileUrl:         { type: String, default: null },

  signedByInstructor:   { type: Boolean, default: false },
  signedByApprentice:   { type: Boolean, default: false },
  signatureValidatedAt: { type: Date, default: null },

  status:               { type: String, enum: TRACKING_STATUSES, default: 'SCHEDULED' },
  assignedHours:        { type: Number, default: null },
  isPaid:               { type: Boolean, default: false },
  paidAt:               { type: Date, default: null },

  notes:                { type: String, default: null },

  isActive:             { type: Boolean, default: true }
}, { timestamps: true });

trackingSchema.index({ productiveStage: 1, trackingNumber: 1 });
trackingSchema.index({ instructor: 1, status: 1 });
trackingSchema.index({ apprentice: 1 });
trackingSchema.index({ isExtraordinary: 1, approvedByAdmin: 1 });
trackingSchema.index({ scheduledDate: 1 });

const Tracking = mongoose.model('Tracking', trackingSchema);

export default Tracking;
