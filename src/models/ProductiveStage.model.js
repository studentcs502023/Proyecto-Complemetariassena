import mongoose from 'mongoose';
const { Schema } = mongoose;
import { EP_MODALITIES, EP_STATUSES } from '../utils/enums.js';

const ProductiveStageSchema = new Schema({
  // ACTORS
  apprentice:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  company:              { type: Schema.Types.ObjectId, ref: 'Company', default: null },
  followupInstructor:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
  technicalInstructor:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
  projectInstructor:    { type: Schema.Types.ObjectId, ref: 'User', default: null },

  // EP DATA
  modality:             { type: String, enum: EP_MODALITIES, required: true },
  status:               { type: String, enum: EP_STATUSES, default: 'PENDING_REGISTRATION' },
  registrationDate:     { type: Date, default: null },
  approvalDate:         { type: Date, default: null },
  startDate:            { type: Date, default: null },
  estimatedEndDate:     { type: Date, default: null },
  completionDate:       { type: Date, default: null },

  // COMPANY SNAPSHOT (denormalized at registration time)
  companySnapshot: {
    companyName:        { type: String, default: null },
    taxId:              { type: String, default: null },
    address:            { type: String, default: null },
    apprenticeJobTitle: { type: String, default: null },
    supervisorName:     { type: String, default: null },
    supervisorPhone:    { type: String, default: null },
    supervisorEmail:    { type: String, default: null }
  },

  // PROGRESS
  completedBitacoras:   { type: Number, default: 0 },
  maxBitacoras:         { type: Number, default: null },
  completedTrackings:   { type: Number, default: 0 },
  requiredTrackings:    { type: Number, default: null },

  // GOOGLE DRIVE
  driveFolderId:        { type: String, default: null },
  driveFolderUrl:       { type: String, default: null },

  // COMMENTS THREAD
  comments: [{
    text:               { type: String, required: true },
    author:             { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt:          { type: Date, default: Date.now }
  }],

  // FLAGS
  isHistorical:         { type: Boolean, default: false },
  isActive:             { type: Boolean, default: true }
}, { timestamps: true });

ProductiveStageSchema.index({ apprentice: 1, status: 1 });
ProductiveStageSchema.index({ apprentice: 1, isHistorical: 1 });
ProductiveStageSchema.index({ followupInstructor: 1, status: 1 });
ProductiveStageSchema.index({ technicalInstructor: 1 });
ProductiveStageSchema.index({ projectInstructor: 1 });
ProductiveStageSchema.index({ status: 1 });
ProductiveStageSchema.index({ modality: 1 });
ProductiveStageSchema.index({ company: 1 });

const ProductiveStage = mongoose.model('ProductiveStage', ProductiveStageSchema);

export default ProductiveStage;
