import Company from '../models/Company.model.js';
import { recordAuditLog } from '../utils/auditLog.util.js';
import { AUDIT_ACTIONS } from '../utils/enums.js';

/**
 * Servicio para la gestión de Empresas
 */
class CompanyService {
  /**
   * Crear una nueva empresa manualmente
   */
  async createCompany(companyData, performedBy) {
    // 1. Verificar si el taxId ya existe
    const existingCompany = await Company.findOne({ taxId: companyData.taxId });
    if (existingCompany) {
      throw { statusCode: 409, message: 'Ya existe una empresa con este NIT/RUT' };
    }

    // 2. Validar que solo haya un contacto primario
    if (companyData.contacts) {
      const primaryContacts = companyData.contacts.filter(c => c.isPrimary);
      if (primaryContacts.length > 1) {
        throw { statusCode: 400, message: 'Solo se permite un contacto principal' };
      }
    }

    // 3. Crear empresa
    const newCompany = new Company({
      ...companyData,
      importSource: 'MANUAL'
    });

    await newCompany.save();

    // 4. Registrar Auditoría
    await recordAuditLog({
      action: AUDIT_ACTIONS.COMPANY_CREATED,
      entity: 'Company',
      entityId: newCompany._id,
      performedBy,
      details: { taxId: newCompany.taxId, name: newCompany.name }
    });

    return newCompany;
  }

  /**
   * Obtener lista de empresas con paginación y filtros
   */
  async getAllCompanies(filters, user) {
    const { search, city, isActive, page = 1, limit = 20 } = filters;
    const query = {};

    // Filtro por rol: Instructores solo ven activas
    if (user.role === 'INSTRUCTOR') {
      query.isActive = true;
      // TODO: En el controlador/rutas se debe filtrar para que solo vean empresas de sus aprendices si es GET/:id,
      // pero para el listado general según spec pueden buscar información de contacto.
    } else if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Búsqueda por texto (nombre) o taxId
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { taxId: { $regex: search, $options: 'i' } }
      ];
    }

    if (city) {
      query.city = city;
    }

    const skip = (page - 1) * limit;
    
    const [companies, total] = await Promise.all([
      Company.find(query).skip(skip).limit(Number(limit)).sort({ name: 1 }),
      Company.countDocuments(query)
    ]);

    return {
      companies,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Obtener una empresa por ID
   */
  async getCompanyById(id) {
    const company = await Company.findById(id);
    if (!company) {
      throw { statusCode: 404, message: 'Empresa no encontrada' };
    }
    return company;
  }

  /**
   * Actualizar datos básicos de una empresa
   */
  async updateCompany(id, updateData, performedBy) {
    const company = await Company.findById(id);
    if (!company || !company.isActive) {
      throw { statusCode: 404, message: 'Empresa no encontrada o inactiva' };
    }

    // No permitir actualizar taxId o importSource
    delete updateData.taxId;
    delete updateData.importSource;
    delete updateData.contacts; // Se maneja en rutas aparte

    const changedFields = {};
    Object.keys(updateData).forEach(key => {
      if (company[key] !== updateData[key]) {
        changedFields[key] = { old: company[key], new: updateData[key] };
      }
    });

    Object.assign(company, updateData);
    await company.save();

    await recordAuditLog({
      action: AUDIT_ACTIONS.COMPANY_UPDATED,
      entity: 'Company',
      entityId: company._id,
      performedBy,
      details: { changedFields }
    });

    return company;
  }

  /**
   * Agregar un contacto a la empresa
   */
  async addContact(companyId, contactData, performedBy) {
    const company = await Company.findById(companyId);
    if (!company) throw { statusCode: 404, message: 'Empresa no encontrada' };

    // Si el nuevo contacto es primario, quitar el primario a los demás
    if (contactData.isPrimary) {
      company.contacts.forEach(c => c.isPrimary = false);
    }

    company.contacts.push(contactData);
    await company.save();

    return company;
  }

  /**
   * Actualizar un contacto específico
   */
  async updateContact(companyId, contactId, contactData, performedBy) {
    const company = await Company.findById(companyId);
    if (!company) throw { statusCode: 404, message: 'Empresa no encontrada' };

    const contact = company.contacts.id(contactId);
    if (!contact) throw { statusCode: 404, message: 'Contacto no encontrado' };

    if (contactData.isPrimary) {
      company.contacts.forEach(c => c.isPrimary = false);
    }

    Object.assign(contact, contactData);
    await company.save();

    return company;
  }

  /**
   * Eliminar un contacto
   */
  async deleteContact(companyId, contactId, performedBy) {
    const company = await Company.findById(companyId);
    if (!company) throw { statusCode: 404, message: 'Empresa no encontrada' };

    if (company.contacts.length === 1) {
      throw { statusCode: 400, message: 'No se puede eliminar el único contacto de la empresa' };
    }

    const contact = company.contacts.id(contactId);
    if (!contact) throw { statusCode: 404, message: 'Contacto no encontrado' };

    const wasPrimary = contact.isPrimary;
    
    // Eliminar usando pull
    company.contacts.pull(contactId);

    // Si era el primario, asignar el primero restante como primario
    if (wasPrimary && company.contacts.length > 0) {
      company.contacts[0].isPrimary = true;
    }

    await company.save();
    return company;
  }

  /**
   * Desactivación lógica (Soft-delete)
   */
  async deactivateCompany(id, performedBy) {
    const company = await Company.findById(id);
    if (!company) throw { statusCode: 404, message: 'Empresa no encontrada' };

    // TODO: Verificar que no haya ProductiveStages activos vinculados
    // Esta lógica se completará cuando se implemente el módulo de ProductiveStages.

    company.isActive = false;
    await company.save();

    await recordAuditLog({
      action: AUDIT_ACTIONS.COMPANY_UPDATED,
      entity: 'Company',
      entityId: company._id,
      performedBy,
      details: { action: 'DEACTIVATED' }
    });

    return company;
  }
}

export default new CompanyService();
