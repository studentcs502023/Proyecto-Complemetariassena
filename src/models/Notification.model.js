import mongoose from 'mongoose';
const { Schema } = mongoose;
import { NOTIFICATION_TYPES } from '../utils/enums.js';

const notificationSchema = new Schema({
  recipient:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type:         { type: String, enum: NOTIFICATION_TYPES, required: true },

  title:        { type: String, required: true },
  message:      { type: String, required: true },
  isRead:       { type: Boolean, default: false },
  readAt:       { type: Date, default: null },

  metadata: {
    entity:     { type: String, default: null },
    entityId:   { type: Schema.Types.ObjectId, default: null },
    url:        { type: String, default: null }
  },

  emailSent:    { type: Boolean, default: false },
  emailSentAt:  { type: Date, default: null },
  emailError:   { type: String, default: null }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
