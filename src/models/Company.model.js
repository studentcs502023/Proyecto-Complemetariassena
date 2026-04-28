import mongoose from 'mongoose';

const { Schema } = mongoose;

const CompanySchema = new Schema({
  // COMPANY DATA
  taxId: { 
    type: String, 
    required: [true, 'El NIT/RUT es obligatorio'], 
    unique: true, 
    trim: true 
  },
  name: { 
    type: String, 
    required: [true, 'El nombre de la empresa es obligatorio'], 
    trim: true 
  },
  address: { 
    type: String, 
    required: [true, 'La dirección es obligatoria'] 
  },
  phone: { 
    type: String, 
    required: [true, 'El teléfono es obligatorio'] 
  },
  email: { 
    type: String, 
    required: [true, 'El correo electrónico es obligatorio'], 
    lowercase: true, 
    trim: true 
  },
  city: { 
    type: String, 
    default: null 
  },

  // CONTACTS
  contacts: [{
    fullName: { 
      type: String, 
      required: [true, 'El nombre completo del contacto es obligatorio'] 
    },
    jobTitle: { 
      type: String, 
      required: [true, 'El cargo del contacto es obligatorio'] 
    },
    phone: { 
      type: String, 
      default: null 
    },
    email: { 
      type: String, 
      lowercase: true, 
      default: null 
    },
    isPrimary: { 
      type: Boolean, 
      default: false 
    }
  }],

  // METADATA
  importSource: { 
    type: String, 
    enum: ['SGVA', 'MANUAL', 'FLAT_FILE'], 
    default: 'MANUAL' 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

// Índices para optimización
CompanySchema.index({ name: 'text' });       // full-text search para búsquedas rápidas
CompanySchema.index({ isActive: 1 });

const Company = mongoose.model('Company', CompanySchema);

export default Company;
