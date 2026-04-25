import ProductiveStage from "../models/ProductiveStage.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import { getConfig } from "../utils/configHelper.util.js";
import { calculateEpDeadline, daysUntil } from "../utils/dateHelper.util.js";
import { recordAuditLog } from "../utils/auditLog.util.js";
import { AUDIT_ACTIONS, EP_STATUSES } from "../utils/enums.js";

class ProductiveStageService {
    /**
     * Registra una nueva etapa productiva (Aprendiz)
     */
    async registerEP(apprenticeId, data, performedBy) {
        // 1. Verificar aprendiz
        const apprentice = await User.findOne({ _id: apprenticeId, role: "APPRENTICE", isActive: true });
        if (!apprentice) {
            const error = new Error("Aprendiz no encontrado o inactivo");
            error.statusCode = 404;
            throw error;
        }

        // 2. Verificar que no tenga EP activa
        const existingEP = await ProductiveStage.findOne({
            apprentice: apprenticeId,
            status: { $nin: ["COMPLETED", "ARCHIVED"] },
            isActive: true
        });
        if (existingEP) {
            const error = new Error("Ya tienes una etapa productiva activa o en proceso");
            error.statusCode = 409;
            throw error;
        }

        // 3. Verificar elegibilidad de matrícula
        if (!apprentice.enrollmentExpiryDate) {
            const error = new Error("No tienes registrada una fecha de fin de etapa lectiva. Contacta al administrador.");
            error.statusCode = 400;
            throw error;
        }

        const monthsNew = await getConfig("EP_DEADLINE_MONTHS_NEW_ENROLLMENT");
        const yearsOld = await getConfig("EP_DEADLINE_YEARS_OLD_ENROLLMENT");
        
        const deadline = calculateEpDeadline(
            apprentice.enrollmentExpiryDate,
            apprentice.isPreNov2024,
            monthsNew,
            yearsOld
        );

        if (new Date() > deadline) {
            const error = new Error("Tu plazo para registrar la etapa productiva ha vencido.");
            error.statusCode = 400;
            throw error;
        }

        // 4. Verificar empresa
        const company = await Company.findById(data.companyId);
        if (!company) {
            const error = new Error("La empresa seleccionada no existe");
            error.statusCode = 404;
            throw error;
        }

        // 5. Crear Snapshot de la empresa
        const companySnapshot = {
            companyName: company.name,
            taxId: company.taxId,
            address: company.address,
            ...data.companySnapshot
        };

        // 6. Crear EP
        const ep = new ProductiveStage({
            apprentice: apprenticeId,
            company: data.companyId,
            modality: data.modality,
            status: "PENDING_APPROVAL",
            registrationDate: new Date(),
            startDate: data.startDate,
            estimatedEndDate: data.estimatedEndDate,
            companySnapshot
        });

        await ep.save();

        // 7. Auditoría y Notificación
        await recordAuditLog({
            action: AUDIT_ACTIONS.EP_REGISTERED || "EP_REGISTERED",
            entity: "ProductiveStage",
            entityId: ep._id,
            performedBy,
            details: { modality: data.modality }
        });

        // TODO: Enviar notificación al ADMIN

        return ep;
    }

    /**
     * Obtiene lista de EPs con filtros (Admin/Instructor)
     */
    async getEPs(filters = {}, user) {
        const { status, modality, apprenticeId, instructorId, search, page = 1, limit = 20 } = filters;
        
        let query = { isActive: true };

        // Restricción para instructores
        if (user.role === "INSTRUCTOR") {
            query.$or = [
                { followupInstructor: user.id },
                { technicalInstructor: user.id },
                { projectInstructor: user.id }
            ];
        }

        if (status) query.status = status;
        if (modality) query.modality = modality;
        if (apprenticeId) query.apprentice = apprenticeId;
        if (instructorId) {
            query.$or = [
                { followupInstructor: instructorId },
                { technicalInstructor: instructorId },
                { projectInstructor: instructorId }
            ];
        }

        const skip = (page - 1) * limit;
        
        // Búsqueda por texto (requiere populate previo o agregación, por simplicidad usamos regex en path)
        let populateQuery = {
            path: "apprentice",
            select: "fullName nationalId enrollmentNumber email"
        };

        if (search) {
            // Nota: En una DB grande esto es ineficiente sin índices de texto o búsqueda previa de IDs
            const apprentices = await User.find({
                role: "APPRENTICE",
                $or: [
                    { fullName: { $regex: search, $options: "i" } },
                    { enrollmentNumber: { $regex: search, $options: "i" } }
                ]
            }).select("_id");
            query.apprentice = { $in: apprentices.map(a => a._id) };
        }

        const [eps, total] = await Promise.all([
            ProductiveStage.find(query)
                .populate(populateQuery)
                .populate("company", "name taxId")
                .populate("followupInstructor technicalInstructor projectInstructor", "fullName email")
                .sort({ registrationDate: -1 })
                .skip(skip)
                .limit(Number(limit)),
            ProductiveStage.countDocuments(query)
        ]);

        return {
            eps,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Aprueba una etapa productiva (Admin)
     */
    async approveEP(id, data, performedBy) {
        const ep = await ProductiveStage.findById(id).populate("apprentice");
        
        if (!ep) {
            const error = new Error("Etapa productiva no encontrada");
            error.statusCode = 404;
            throw error;
        }

        if (ep.status !== "PENDING_APPROVAL") {
            const error = new Error("La etapa productiva no está pendiente de aprobación");
            error.statusCode = 400;
            throw error;
        }

        // 1. Obtener límites de configuración
        const level = ep.apprentice.trainingLevel;
        const maxBitacoras = await getConfig(`MAX_LOGBOOKS_${level}`);
        const requiredTrackings = await getConfig(`REQUIRED_TRACKINGS_${level}`);

        // 2. Actualizar datos
        ep.status = "ACTIVE";
        ep.approvalDate = new Date();
        ep.maxBitacoras = maxBitacoras;
        ep.requiredTrackings = requiredTrackings;
        if (data.startDate) ep.startDate = data.startDate;
        if (data.estimatedEndDate) ep.estimatedEndDate = data.estimatedEndDate;

        // 3. Google Drive (Mock)
        ep.driveFolderId = `folder_ep_${ep._id}`;
        ep.driveFolderUrl = `https://drive.google.com/mock/${ep._id}`;

        await ep.save();

        await recordAuditLog({
            action: AUDIT_ACTIONS.EP_APPROVED || "EP_APPROVED",
            entity: "ProductiveStage",
            entityId: id,
            performedBy,
            details: { maxBitacoras, requiredTrackings }
        });

        // TODO: Notificar al aprendiz

        return ep;
    }

    /**
     * Asigna instructores a una etapa productiva
     */
    async assignInstructors(id, data, performedBy) {
        const ep = await ProductiveStage.findById(id);
        if (!ep) {
            const error = new Error("Etapa productiva no encontrada");
            error.statusCode = 404;
            throw error;
        }

        if (ep.status === "PENDING_REGISTRATION" || ep.status === "PENDING_APPROVAL") {
            const error = new Error("Debe aprobar la etapa productiva antes de asignar instructores");
            error.statusCode = 400;
            throw error;
        }

        const { followupInstructorId, technicalInstructorId, projectInstructorId } = data;

        // Validar según modalidad
        if (!followupInstructorId) {
            const error = new Error("El instructor de seguimiento es obligatorio para todas las modalidades");
            error.statusCode = 400;
            throw error;
        }

        const updates = { followupInstructor: followupInstructorId };

        if (ep.modality === "INDIVIDUAL_PRODUCTIVE_PROJECT") {
            if (!technicalInstructorId) {
                const error = new Error("El instructor técnico es obligatorio para proyectos individuales");
                error.statusCode = 400;
                throw error;
            }
            updates.technicalInstructor = technicalInstructorId;
        }

        if (ep.modality === "GROUP_PRODUCTIVE_PROJECT") {
            if (!technicalInstructorId || !projectInstructorId) {
                const error = new Error("Los instructores técnico y de proyecto son obligatorios para proyectos grupales");
                error.statusCode = 400;
                throw error;
            }
            updates.technicalInstructor = technicalInstructorId;
            updates.projectInstructor = projectInstructorId;
        }

        // Validar que los instructores existan y tengan el tipo correcto
        const instructorIds = Object.values(updates);
        const instructors = await User.find({ _id: { $in: instructorIds }, role: "INSTRUCTOR", status: "ACTIVE" });

        if (instructors.length !== instructorIds.length) {
            const error = new Error("Uno o más instructores no son válidos o no están activos");
            error.statusCode = 400;
            throw error;
        }

        // Aplicar actualizaciones
        Object.assign(ep, updates);
        await ep.save();

        await recordAuditLog({
            action: AUDIT_ACTIONS.EP_INSTRUCTOR_ASSIGNED || "EP_INSTRUCTOR_ASSIGNED",
            entity: "ProductiveStage",
            entityId: id,
            performedBy,
            details: updates
        });

        return ep;
    }

    /**
     * Avanza el estado automáticamente basado en el progreso
     * Invocado por BitacoraService y TrackingService
     */
    async checkAndAdvanceStatus(id) {
        const ep = await ProductiveStage.findById(id);
        if (!ep) return;

        let changed = false;

        // ACTIVE -> IN_FOLLOWUP: Primer seguimiento completado
        if (ep.status === "ACTIVE" && ep.completedTrackings >= 1) {
            ep.status = "IN_FOLLOWUP";
            changed = true;
        }

        // IN_FOLLOWUP -> CERTIFICATION: Todo entregado
        if (ep.status === "IN_FOLLOWUP" && 
            ep.completedBitacoras >= ep.maxBitacoras && 
            ep.completedTrackings >= ep.requiredTrackings) {
            ep.status = "CERTIFICATION";
            changed = true;
        }

        if (changed) {
            await ep.save();
            // TODO: Notificar cambios de estado críticos
        }
    }

    /**
     * Cierra la etapa productiva (Admin)
     */
    async completeEP(id, performedBy) {
        const ep = await ProductiveStage.findById(id);
        if (!ep || ep.status !== "CERTIFICATION") {
            const error = new Error("La etapa no está en fase de certificación");
            error.statusCode = 400;
            throw error;
        }

        // Validar requisitos finales
        const errors = {};
        if (ep.completedBitacoras < ep.maxBitacoras) {
            errors.bitacoras = `${ep.completedBitacoras} de ${ep.maxBitacoras} completadas`;
        }
        if (ep.completedTrackings < ep.requiredTrackings) {
            errors.trackings = `${ep.completedTrackings} de ${ep.requiredTrackings} completados`;
        }

        // TODO: Validar documentos aprobados (Módulo 9)
        // TODO: Validar novedades resueltas (Módulo 10)

        if (Object.keys(errors).length > 0) {
            const error = new Error("No se puede completar la etapa. Requisitos pendientes.");
            error.statusCode = 400;
            error.details = errors;
            throw error;
        }

        ep.status = "COMPLETED";
        ep.completionDate = new Date();
        await ep.save();

        await recordAuditLog({
            action: AUDIT_ACTIONS.EP_COMPLETED || "EP_COMPLETED",
            entity: "ProductiveStage",
            entityId: id,
            performedBy
        });

        return ep;
    }
    /**
     * Rechaza una etapa productiva (Admin)
     */
    async rejectEP(id, { reason }, performedBy) {
        const ep = await ProductiveStage.findById(id);
        if (!ep || ep.status !== "PENDING_APPROVAL") {
            const error = new Error("La etapa no está pendiente de aprobación");
            error.statusCode = 400;
            throw error;
        }

        ep.status = "PENDING_REGISTRATION"; // Vuelve a inicio para que el aprendiz corrija
        ep.comments.push({
            text: `RECHAZO DE REGISTRO: ${reason}`,
            author: performedBy
        });

        await ep.save();

        await recordAuditLog({
            action: AUDIT_ACTIONS.EP_REJECTED || "EP_REJECTED",
            entity: "ProductiveStage",
            entityId: id,
            performedBy,
            details: { reason }
        });

        return ep;
    }

    /**
     * Agrega un comentario al hilo de la EP
     */
    async addComment(id, { text }, performedBy) {
        const ep = await ProductiveStage.findById(id);
        if (!ep) {
            const error = new Error("Etapa productiva no encontrada");
            error.statusCode = 404;
            throw error;
        }

        ep.comments.push({
            text,
            author: performedBy
        });

        await ep.save();
        return ep;
    }

    /**
     * Obtiene detalle de una EP por ID con validación de acceso
     */
    async getEPById(id, user) {
        const ep = await ProductiveStage.findById(id)
            .populate("apprentice", "fullName nationalId enrollmentNumber email phone trainingLevel isPreNov2024 enrollmentExpiryDate")
            .populate("company")
            .populate("followupInstructor technicalInstructor projectInstructor", "fullName email phone");

        if (!ep) {
            const error = new Error("Etapa productiva no encontrada");
            error.statusCode = 404;
            throw error;
        }

        // Validación de acceso
        if (user.role === "APPRENTICE" && ep.apprentice._id.toString() !== user.id.toString()) {
            const error = new Error("No tienes permiso para ver esta etapa productiva");
            error.statusCode = 403;
            throw error;
        }

        if (user.role === "INSTRUCTOR") {
            const isAssigned = [
                ep.followupInstructor?._id.toString(),
                ep.technicalInstructor?._id.toString(),
                ep.projectInstructor?._id.toString()
            ].includes(user.id.toString());

            if (!isAssigned) {
                const error = new Error("No estás asignado a esta etapa productiva");
                error.statusCode = 403;
                throw error;
            }
        }

        return ep;
    }

    /**
     * Obtiene la etapa activa del aprendiz autenticado
     */
    async getMyApprenticeEP(apprenticeId) {
        return await ProductiveStage.find({ apprentice: apprenticeId, isActive: true })
            .sort({ isHistorical: 1, createdAt: -1 })
            .populate("company")
            .populate("followupInstructor technicalInstructor projectInstructor", "fullName email phone");
    }
}

export default new ProductiveStageService();
