import ProductiveStage from '../models/ProductiveStage.model.js';
import HourRecord from '../models/HourRecord.model.js';
import User from '../models/User.model.js';
import Bitacora from '../models/Bitacora.model.js';
import Tracking from '../models/Tracking.model.js';
import Document from '../models/Document.model.js';
import Novelty from '../models/Novelty.model.js';
import pdfGenerator from '../utils/pdfGenerator.util.js';
import { daysUntil, getExpiryAlertLevel, calculateEpDeadline } from '../utils/dateHelper.util.js';
import { getConfig } from '../utils/configHelper.util.js';

class ReportService {
  /**
   * EP Summary grouped by modality and status
   */
  async getEPSummary(query) {
    const year = Number(query.year) || new Date().getFullYear();
    const { instructorId, modality, status } = query;

    const filter = {
      isActive: true,
      createdAt: {
        $gte: new Date(`${year}-01-01`),
        $lte: new Date(`${year}-12-31T23:59:59.999Z`)
      }
    };

    if (modality) filter.modality = modality;
    if (status) filter.status = status;
    if (instructorId) {
      filter.$or = [
        { followupInstructor: instructorId },
        { technicalInstructor: instructorId },
        { projectInstructor: instructorId }
      ];
    }

    const pipeline = [
      { $match: filter },
      {
        $group: {
          _id: { modality: '$modality', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ];

    const results = await ProductiveStage.aggregate(pipeline);
    
    const totalEPs = await ProductiveStage.countDocuments(filter);
    
    const byModality = {};
    const byStatus = {};

    results.forEach(r => {
      const { modality, status } = r._id;
      
      if (!byModality[modality]) byModality[modality] = { total: 0 };
      byModality[modality].total += r.count;
      byModality[modality][status] = r.count;

      byStatus[status] = (byStatus[status] || 0) + r.count;
    });

    return {
      year,
      totalEPs,
      byModality,
      byStatus
    };
  }

  /**
   * Instructor Hours report
   */
  async getInstructorHours(query) {
    const year = Number(query.year) || new Date().getFullYear();
    const { month, instructorId } = query;

    const filter = { year };
    if (month) filter.month = Number(month);
    if (instructorId) filter.instructor = instructorId;

    const records = await HourRecord.find(filter)
      .populate('instructor', 'fullName email nationalId knowledgeArea')
      .sort({ instructor: 1, month: -1 });

    // Group by instructor
    const instructorsMap = {};
    records.forEach(r => {
      const insId = r.instructor._id.toString();
      if (!instructorsMap[insId]) {
        instructorsMap[insId] = {
          instructor: {
            id: r.instructor._id,
            fullName: r.instructor.fullName,
            knowledgeArea: r.instructor.knowledgeArea,
            nationalId: r.instructor.nationalId
          },
          months: [],
          yearTotals: { totalHours: 0, pendingPaymentHours: 0 }
        };
      }
      
      instructorsMap[insId].months.push({
        month: r.month,
        totalHours: r.totalHours,
        bitacoraHours: r.bitacoraHours,
        trackingHours: r.trackingHours,
        certificationHours: r.certificationHours,
        extraordinaryHours: r.extraordinaryHours,
        paidHours: r.paidHours,
        pendingPaymentHours: r.pendingPaymentHours,
        excessHours: r.excessHours
      });

      instructorsMap[insId].yearTotals.totalHours += r.totalHours;
      instructorsMap[insId].yearTotals.pendingPaymentHours += r.pendingPaymentHours;
    });

    const instructorsList = Object.values(instructorsMap);
    
    const grandTotals = {
      totalHours: instructorsList.reduce((sum, i) => sum + i.yearTotals.totalHours, 0),
      totalPending: instructorsList.reduce((sum, i) => sum + i.yearTotals.pendingPaymentHours, 0)
    };

    return {
      period: { year, month: month ? Number(month) : null },
      instructors: instructorsList,
      grandTotals
    };
  }

  /**
   * Apprentice full traceability
   */
  async getApprenticeProgress(apprenticeId) {
    const apprentice = await User.findById(apprenticeId).select('fullName enrollmentNumber program trainingLevel');
    if (!apprentice) {
        const error = new Error('Apprentice not found');
        error.statusCode = 404;
        throw error;
    }

    const [eps, bitacoras, trackings, documents, novelties] = await Promise.all([
      ProductiveStage.find({ apprentice: apprenticeId, isActive: true }).populate('company followupInstructor'),
      Bitacora.find({ apprentice: apprenticeId, isActive: true }),
      Tracking.find({ apprentice: apprenticeId, isActive: true }),
      Document.find({ apprentice: apprenticeId, isActive: true }),
      Novelty.find({ apprentice: apprenticeId, isActive: true })
    ]);

    const productiveStages = eps.map(ep => {
      const epId = ep._id.toString();
      const epBitacoras = bitacoras.filter(b => b.productiveStage.toString() === epId);
      const epTrackings = trackings.filter(t => t.productiveStage.toString() === epId);
      const epDocuments = documents.filter(d => d.productiveStage.toString() === epId);
      const epNovelties = novelties.filter(n => n.productiveStage.toString() === epId);

      return {
        id: ep._id,
        modality: ep.modality,
        status: ep.status,
        startDate: ep.startDate,
        company: ep.company?.name,
        instructor: ep.followupInstructor?.fullName,
        progress: {
          bitacoras: {
            completed: epBitacoras.filter(b => b.status === 'APPROVED').length,
            required: ep.maxBitacoras || 0,
            pending: epBitacoras.filter(b => b.status === 'PENDING').length,
            rejected: epBitacoras.filter(b => b.status === 'REJECTED').length
          },
          trackings: {
            completed: epTrackings.filter(t => t.status !== 'SCHEDULED').length,
            required: ep.requiredTrackings || 0,
            scheduled: epTrackings.filter(t => t.status === 'SCHEDULED').length
          },
          documents: {
            approved: epDocuments.filter(d => d.status === 'APPROVED').length,
            pending: epDocuments.filter(d => ['SUBMITTED', 'IN_VALIDATION'].includes(d.status)).length,
            missing: Math.max(0, 3 - epDocuments.filter(d => d.status === 'APPROVED').length)
          }
        },
        novelties: {
          total: epNovelties.length,
          resolved: epNovelties.filter(n => n.status === 'RESOLVED').length,
          pending: epNovelties.filter(n => n.status === 'PENDING').length
        }
      };
    });

    return {
      apprentice,
      productiveStages
    };
  }

  /**
   * Enrollment Expiry report
   */
  async getEnrollmentExpiry(query) {
    const { alertLevel, page = 1, limit = 20 } = query;

    const yellowDays = await getConfig('EXPIRY_ALERT_DAYS_YELLOW') || 30;
    const orangeDays = await getConfig('EXPIRY_ALERT_DAYS_ORANGE') || 15;
    const redDays = await getConfig('EXPIRY_ALERT_DAYS_RED') || 5;

    const monthsNew = await getConfig('EP_REGISTRATION_DEADLINE_MONTHS') || 6;
    const yearsOld = await getConfig('EP_REGISTRATION_DEADLINE_YEARS_OLD') || 2;

    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() + Number(yellowDays));

    const apprenticeFilter = {
      role: 'APPRENTICE',
      isActive: true,
      enrollmentExpiryDate: { $lte: cutoff, $gte: today }
    };

    const skip = (page - 1) * limit;
    const apprentices = await User.find(apprenticeFilter)
      .select('fullName nationalId enrollmentNumber program trainingLevel enrollmentExpiryDate isPreNov2024')
      .skip(skip)
      .limit(Number(limit));

    const total = await User.countDocuments(apprenticeFilter);

    // Get active EPs to check existence
    const activeEPs = await ProductiveStage.find({
      apprentice: { $in: apprentices.map(a => a._id) },
      status: { $nin: ['COMPLETED', 'ARCHIVED'] },
      isActive: true
    }).select('apprentice');

    const activeEPMap = new Set(activeEPs.map(ep => ep.apprentice.toString()));

    let results = apprentices.map(a => {
      const days = daysUntil(a.enrollmentExpiryDate);
      return {
        ...a.toJSON(),
        daysRemaining: days,
        alertLevel: getExpiryAlertLevel(days, redDays, orangeDays, yellowDays),
        registrationDeadline: calculateEpDeadline(a.enrollmentExpiryDate, a.isPreNov2024, monthsNew, yearsOld),
        hasActiveEP: activeEPMap.has(a._id.toString())
      };
    });

    if (alertLevel) {
      results = results.filter(r => r.alertLevel === alertLevel);
    }

    const byAlertLevel = {
      RED: results.filter(r => r.alertLevel === 'RED').length,
      ORANGE: results.filter(r => r.alertLevel === 'ORANGE').length,
      YELLOW: results.filter(r => r.alertLevel === 'YELLOW').length
    };

    return {
      asOf: today.toISOString().split('T')[0],
      total: results.length,
      byAlertLevel,
      apprentices: results
    };
  }

  /**
   * Export to PDF (Generic wrapper)
   */
  async exportToPdf(reportType, data) {
    let title = '';
    let sections = [];
    let summary = {};

    switch (reportType) {
      case 'EP_SUMMARY':
        title = `Resumen de Etapas Productivas - ${data.year}`;
        sections = [
          {
            heading: 'Distribución por Modalidad',
            rows: Object.entries(data.byModality).map(([mod, stats]) => [
              mod, `Total: ${stats.total}`, `Activos: ${stats.ACTIVE || 0}`, `En Seguimiento: ${stats.IN_FOLLOWUP || 0}`, `Completados: ${stats.COMPLETED || 0}`
            ])
          },
          {
            heading: 'Estados Globales',
            rows: Object.entries(data.byStatus).map(([status, count]) => [status, count])
          }
        ];
        summary = { 'Total EPs': data.totalEPs };
        break;

      case 'INSTRUCTOR_HOURS':
        title = `Reporte de Horas de Instructores - ${data.period.year}`;
        sections = data.instructors.map(i => ({
          heading: `Instructor: ${i.instructor.fullName} (${i.instructor.nationalId})`,
          rows: i.months.map(m => [
            `Mes: ${m.month}`, `Total: ${m.totalHours}`, `Bitácoras: ${m.bitacoraHours}`, `Seguimientos: ${m.trackingHours}`, `Pagadas: ${m.paidHours}`, `Pendientes: ${m.pendingPaymentHours}`
          ])
        }));
        summary = { 
          'Total Horas General': data.grandTotals.totalHours,
          'Total Pendiente Pago': data.grandTotals.totalPending
        };
        break;

        case 'APPRENTICE_PROGRESS':
            title = `Trazabilidad del Aprendiz: ${data.apprentice.fullName}`;
            subtitle = `Ficha: ${data.apprentice.enrollmentNumber} | Programa: ${data.apprentice.program}`;
            sections = data.productiveStages.map(ep => ({
                heading: `Etapa Productiva: ${ep.modality} (${ep.status})`,
                rows: [
                    [`Compañía: ${ep.company || 'N/A'}`, `Instructor: ${ep.instructor || 'N/A'}`],
                    [`Bitácoras: ${ep.progress.bitacoras.completed}/${ep.progress.bitacoras.required} aprobadas`],
                    [`Seguimientos: ${ep.progress.trackings.completed}/${ep.progress.trackings.required} ejecutados`],
                    [`Documentos: ${ep.progress.documents.approved}/3 aprobados`],
                    [`Novedades: ${ep.novelties.total} reportadas (${ep.novelties.resolved} resueltas)`]
                ]
            }));
            break;
    }

    return await pdfGenerator.generatePdf({ title, sections, summary });
  }
}

export default new ReportService();
