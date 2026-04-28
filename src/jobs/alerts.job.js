import cron from 'node-cron';
import ProductiveStage from '../models/ProductiveStage.model.js';
import User from '../models/User.model.js';
import Bitacora from '../models/Bitacora.model.js';
import Tracking from '../models/Tracking.model.js';
import notificationService from '../services/notifications.service.js';

/**
 * Find PENDING bitacoras older than 7 days and notify ADMIN
 */
const checkOverdueReviews = async () => {
  console.log('[Cron] Checking overdue reviews...');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const pendingBitacoras = await Bitacora.find({
    status: 'PENDING',
    submittedAt: { $lte: sevenDaysAgo },
    isActive: true
  }).populate('instructor apprentice');

  // Find all admins
  const admins = await User.find({ role: 'ADMIN', isActive: true });
  const adminIds = admins.map(a => a._id.toString());

  for (const b of pendingBitacoras) {
    if (adminIds.length > 0) {
      await notificationService.send({
        type: 'INSTRUCTOR_OVERDUE_REVIEW',
        recipients: adminIds,
        title: 'Revisión de bitácora atrasada',
        message: `El instructor ${b.instructor?.fullName || 'No asignado'} no ha revisado la bitácora #${b.logbookNumber} de ${b.apprentice?.fullName} en más de 7 días.`,
        metadata: { entity: 'Bitacora', entityId: b._id }
      });
    }
  }
};

/**
 * Check for apprentices missing bitacora submissions (one every 14 days)
 */
const checkMissingBitacoras = async () => {
  console.log('[Cron] Checking missing bitacoras...');
  const activeEPs = await ProductiveStage.find({
    status: { $in: ['ACTIVE', 'IN_FOLLOWUP'] },
    isActive: true
  }).populate('apprentice followupInstructor');

  for (const ep of activeEPs) {
    if (!ep.startDate) continue;

    const daysSinceStart = Math.floor((new Date() - new Date(ep.startDate)) / (1000 * 60 * 60 * 24));
    const expectedBitacoras = Math.floor(daysSinceStart / 14);

    if (ep.completedBitacoras < expectedBitacoras) {
      // Notify apprentice and instructor
      const recipients = [ep.apprentice._id.toString()];
      if (ep.followupInstructor) recipients.push(ep.followupInstructor._id.toString());

      await notificationService.send({
        type: 'APPRENTICE_MISSING_BITACORA',
        recipients,
        title: 'Bitácora pendiente de entrega',
        message: `El aprendiz ${ep.apprentice.fullName} tiene entregas de bitácora pendientes según el cronograma.`,
        metadata: { entity: 'ProductiveStage', entityId: ep._id }
      });
    }
  }
};

/**
 * Start all scheduled jobs
 */
export const initJobs = () => {
  // Run daily at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    await checkOverdueReviews();
    await checkMissingBitacoras();
    // More checks can be added here (enrollment exipiry, etc)
  });
  
  console.log('⏰ Scheduled jobs initialized');
};
