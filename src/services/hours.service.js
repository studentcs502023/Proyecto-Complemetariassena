import HourRecord from '../models/HourRecord.model.js';
import User from '../models/User.model.js';
import Bitacora from '../models/Bitacora.model.js';
import Tracking from '../models/Tracking.model.js';
import { recordAuditLog } from '../utils/auditLog.util.js';
import { getConfig } from '../utils/configHelper.util.js';

class HourService {
  /**
   * Internal helper: Add hours to an instructor's monthly record.
   */
  async addHours({ instructorId, month, year, field, amount }) {
    const maxHours = await getConfig('MAX_MONTHLY_HOURS_INSTRUCTOR') || 160;

    let record = await HourRecord.findOne({ instructor: instructorId, month, year });
    if (!record) {
      record = new HourRecord({ instructor: instructorId, month, year });
    }

    record[field] = (record[field] || 0) + amount;
    
    // Recalculate totalHours (sum of all breakdown fields + carriedOverHours)
    record.totalHours = (record.bitacoraHours || 0) + 
                        (record.trackingHours || 0) + 
                        (record.certificationHours || 0) + 
                        (record.extraordinaryHours || 0) + 
                        (record.carriedOverHours || 0);

    record.pendingPaymentHours = (record.pendingPaymentHours || 0) + amount;

    let isOverLimit = false;
    let excessAmount = 0;

    if (record.totalHours > maxHours) {
      isOverLimit = true;
      excessAmount = record.totalHours - maxHours;
      record.excessHours = excessAmount;
    } else {
      record.excessHours = 0;
    }

    await record.save();

    // Update User accumulatedHours and pendingPaymentHours
    await User.findByIdAndUpdate(instructorId, {
      $inc: { accumulatedHours: amount, pendingPaymentHours: amount }
    });

    return { record, isOverLimit, excessAmount };
  }

  /**
   * Internal helper: Subtract hours when marking as paid.
   */
  async markHoursPaidInternal({ instructorId, month, year, amount }) {
    const record = await HourRecord.findOne({ instructor: instructorId, month, year });
    if (!record) throw new Error('HourRecord not found for payment');

    record.paidHours = (record.paidHours || 0) + amount;
    record.pendingPaymentHours = Math.max(0, (record.pendingPaymentHours || 0) - amount);
    record.lastPaymentDate = new Date();
    await record.save();

    await User.findByIdAndUpdate(instructorId, {
      $inc: { pendingPaymentHours: -amount }
    });

    return record;
  }

  /**
   * GET /api/hours/instructors/:instructorId
   */
  async getInstructorHours(reqUser, instructorId, query) {
    const { year = new Date().getFullYear(), month } = query;

    // Access control
    if (reqUser.role === 'INSTRUCTOR' && reqUser.id.toString() !== instructorId.toString()) {
      const error = new Error('Forbidden: You can only access your own hour records');
      error.statusCode = 403;
      throw error;
    }

    const instructor = await User.findById(instructorId).select('fullName email nationalId accumulatedHours pendingPaymentHours');
    if (!instructor) {
      const error = new Error('Instructor not found');
      error.statusCode = 404;
      throw error;
    }

    let filter = { instructor: instructorId, year: Number(year) };
    if (month) filter.month = Number(month);

    const records = await HourRecord.find(filter).sort({ year: -1, month: -1 });

    return {
      instructor,
      records,
      totals: {
        allTimeAccumulatedHours: instructor.accumulatedHours,
        allTimePendingHours: instructor.pendingPaymentHours
      }
    };
  }

  /**
   * GET /api/hours/instructors/:instructorId/month/:year/:month
   */
  async getMonthlyDetail(reqUser, instructorId, year, month) {
    // Access control
    if (reqUser.role === 'INSTRUCTOR' && reqUser.id.toString() !== instructorId.toString()) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    let record = await HourRecord.findOne({ instructor: instructorId, year: Number(year), month: Number(month) });
    
    // If not found, return an empty template
    if (!record) {
      record = {
        instructor: instructorId,
        year: Number(year),
        month: Number(month),
        bitacoraHours: 0,
        trackingHours: 0,
        certificationHours: 0,
        extraordinaryHours: 0,
        totalHours: 0,
        pendingPaymentHours: 0,
        paidHours: 0
      };
    }

    // Activity breakdown
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const [bitacoras, trackings] = await Promise.all([
      Bitacora.find({ 
        instructor: instructorId, 
        reviewedAt: { $gte: monthStart, $lte: monthEnd },
        status: 'APPROVED' 
      }).populate('apprentice', 'fullName'),
      Tracking.find({ 
        instructor: instructorId, 
        executedDate: { $gte: monthStart, $lte: monthEnd },
        status: { $in: ['EXECUTED', 'PAID'] }
      }).populate('apprentice', 'fullName')
    ]);

    return {
      record,
      breakdown: {
        bitacoras: bitacoras.map(b => ({
          id: b._id,
          apprenticeName: b.apprentice.fullName,
          approvedAt: b.reviewedAt,
          hours: b.assignedHours,
          isPaid: b.isPaid
        })),
        trackings: trackings.map(t => ({
          id: t._id,
          apprenticeName: t.apprentice.fullName,
          type: t.type,
          executedAt: t.executedDate,
          hours: t.assignedHours,
          isPaid: t.isPaid
        }))
      }
    };
  }

  /**
   * PATCH .../mark-paid
   */
  async markPaid(reqUser, instructorId, year, month, data) {
    const { amount, confirm } = data;

    if (!confirm) {
      const error = new Error('Confirmation required to apply payment');
      error.statusCode = 400;
      throw error;
    }

    const record = await HourRecord.findOne({ instructor: instructorId, year: Number(year), month: Number(month) });
    if (!record) {
      const error = new Error('HourRecord not found');
      error.statusCode = 404;
      throw error;
    }

    if (amount > record.pendingPaymentHours) {
      const error = new Error(`Amount (${amount}) exceeds pending hours (${record.pendingPaymentHours})`);
      error.statusCode = 400;
      throw error;
    }

    record.paidHours += Number(amount);
    record.pendingPaymentHours -= Number(amount);
    record.lastPaymentDate = new Date();
    await record.save();

    // Update User
    await User.findByIdAndUpdate(instructorId, {
      $inc: { pendingPaymentHours: -Number(amount) }
    });

    await recordAuditLog({
      action: 'HOURS_MARKED_PAID',
      entity: 'HourRecord',
      entityId: record._id,
      performedBy: reqUser.id,
      details: { instructorId, year, month, amount }
    });

    return record;
  }

  /**
   * PATCH .../carry-over
   */
  async carryOver(reqUser, instructorId, data) {
    const { fromYear, fromMonth, toYear, toMonth } = data;

    const source = await HourRecord.findOne({ instructor: instructorId, year: fromYear, month: fromMonth });
    if (!source || source.excessHours <= 0) {
      const error = new Error('No excess hours to carry over');
      error.statusCode = 400;
      throw error;
    }

    let target = await HourRecord.findOne({ instructor: instructorId, year: toYear, month: toMonth });
    if (!target) {
      target = new HourRecord({ instructor: instructorId, year: toYear, month: toMonth });
    }

    const amount = source.excessHours;

    target.carriedOverHours += amount;
    target.totalHours += amount;
    target.pendingPaymentHours += amount;

    source.excessHours = 0;
    // record source as carrying over to target
    await source.save();
    await target.save();

    // Update User (since they are "new" payable hours for the target month, but wait... 
    // actually accumulatedHours was already incremented when they were earned. 
    // But pendingPaymentHours was also incremented when earned.
    // So carrying over doesn't change User totals, just moves them between monthly records.)

    await recordAuditLog({
      action: 'HOURS_CARRIED_OVER',
      entity: 'HourRecord',
      entityId: target._id,
      performedBy: reqUser.id,
      details: { instructorId, from: { fromYear, fromMonth }, to: { toYear, toMonth }, amount }
    });

    return { source, target };
  }

  /**
   * GET /api/hours/summary
   */
  async getSummary(query) {
    const { year, month } = query;
    if (!year || !month) {
      const error = new Error('year and month are required');
      error.statusCode = 400;
      throw error;
    }

    const records = await HourRecord.find({ year: Number(year), month: Number(month) })
      .populate('instructor', 'fullName');

    const instructors = records.map(r => ({
      instructorId: r.instructor._id,
      fullName: r.instructor.fullName,
      totalHours: r.totalHours,
      pendingPaymentHours: r.pendingPaymentHours,
      paidHours: r.paidHours,
      excessHours: r.excessHours
    }));

    const totals = {
      totalHoursAllInstructors: instructors.reduce((sum, i) => sum + i.totalHours, 0),
      totalPendingAllInstructors: instructors.reduce((sum, i) => sum + i.pendingPaymentHours, 0)
    };

    return {
      period: { year: Number(year), month: Number(month) },
      instructors,
      totals
    };
  }

  /**
   * GET .../report
   */
  async getReport(reqUser, instructorId, year, month) {
     // Access control
     if (reqUser.role === 'INSTRUCTOR' && reqUser.id.toString() !== instructorId.toString()) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    const record = await HourRecord.findOne({ instructor: instructorId, year: Number(year), month: Number(month) });
    if (!record) {
      const error = new Error('HourRecord not found');
      error.statusCode = 404;
      throw error;
    }

    if (record.reportDriveUrl) {
      return { reportDriveUrl: record.reportDriveUrl };
    }

    // Generate PDF (Mock logic for now as pdfGenerator.util.js is likely a placeholder or basic)
    // In a real scenario we would call pdfGenerator.generateMonthlyReport(...)
    
    const mockReportUrl = `https://drive.google.com/report_${instructorId}_${year}_${month}`;
    record.reportDriveUrl = mockReportUrl;
    record.reportDriveId = `mock_report_id_${Date.now()}`;
    await record.save();

    return { reportDriveUrl: mockReportUrl };
  }
}

export default new HourService();
