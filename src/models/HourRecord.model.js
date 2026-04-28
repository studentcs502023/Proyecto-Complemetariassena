import mongoose from 'mongoose';
const { Schema } = mongoose;
import { EP_MODALITIES } from '../utils/enums.js';

const hourRecordSchema = new Schema({
  instructor:             { type: Schema.Types.ObjectId, ref: 'User', required: true },
  month:                  { type: Number, required: true },                // 1-12
  year:                   { type: Number, required: true },
  modality:               { type: String, enum: [...EP_MODALITIES, null], default: null },

  // === HOUR BREAKDOWN ===
  bitacoraHours:          { type: Number, default: 0 },
  trackingHours:          { type: Number, default: 0 },
  certificationHours:     { type: Number, default: 0 },
  extraordinaryHours:     { type: Number, default: 0 },
  totalHours:             { type: Number, default: 0 },

  // === EXCESS ===
  excessHours:            { type: Number, default: 0 },
  carriedOverHours:       { type: Number, default: 0 },

  // === PAYMENT ===
  paidHours:              { type: Number, default: 0 },
  pendingPaymentHours:    { type: Number, default: 0 },
  lastPaymentDate:        { type: Date, default: null },

  // === REPORT ===
  reportDriveId:          { type: String, default: null },
  reportDriveUrl:         { type: String, default: null }

}, { timestamps: true });

hourRecordSchema.index({ instructor: 1, year: 1, month: 1 }, { unique: true });
hourRecordSchema.index({ instructor: 1, year: -1 });

const HourRecord = mongoose.model('HourRecord', hourRecordSchema);

export default HourRecord;
