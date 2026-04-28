import SystemConfig from "../models/SystemConfig.model.js";

/**
 * Parámetros iniciales del sistema.
 */
const defaults = [
    { key: 'HOURS_PER_LOGBOOK_REVIEW',          value: 2,   valueType: 'NUMBER',  description: 'Horas asignadas al instructor por bitácora revisada' },
    { key: 'HOURS_PER_IN_PERSON_TRACKING',      value: 2,   valueType: 'NUMBER',  description: 'Horas por sesión de seguimiento presencial' },
    { key: 'HOURS_PER_VIRTUAL_TRACKING',        value: 2,   valueType: 'NUMBER',  description: 'Horas por sesión de seguimiento virtual' },
    { key: 'HOURS_PER_EXTRAORDINARY_TRACKING',  value: 2,   valueType: 'NUMBER',  description: 'Horas por sesión de seguimiento extraordinario' },
    { key: 'HOURS_PER_CERTIFICATION',           value: 2,   valueType: 'NUMBER',  description: 'Horas por proceso final de certificación' },
    { key: 'MAX_LOGBOOKS_TECHNICIAN',           value: 13,  valueType: 'NUMBER',  description: 'Máximo de bitácoras para nivel Técnico' },
    { key: 'MAX_LOGBOOKS_TECHNOLOGIST',         value: 13,  valueType: 'NUMBER',  description: 'Máximo de bitácoras para nivel Tecnólogo' },
    { key: 'REQUIRED_TRACKINGS_TECHNICIAN',     value: 3,   valueType: 'NUMBER',  description: 'Seguimientos requeridos para nivel Técnico' },
    { key: 'REQUIRED_TRACKINGS_TECHNOLOGIST',   value: 3,   valueType: 'NUMBER',  description: 'Seguimientos requeridos para nivel Tecnólogo' },
    { key: 'MAX_MONTHLY_HOURS_INSTRUCTOR',      value: 160, valueType: 'NUMBER',  description: 'Máximo de horas mensuales permitidas por instructor' },
    { key: 'EXPIRY_ALERT_DAYS_YELLOW',          value: 30,  valueType: 'NUMBER',  description: 'Días antes del vencimiento para alerta Amarilla' },
    { key: 'EXPIRY_ALERT_DAYS_ORANGE',          value: 15,  valueType: 'NUMBER',  description: 'Días antes del vencimiento para alerta Naranja' },
    { key: 'EXPIRY_ALERT_DAYS_RED',             value: 7,   valueType: 'NUMBER',  description: 'Días antes del vencimiento para alerta Roja' },
    { key: 'NOTIFICATION_EMAIL',                value: '',  valueType: 'STRING',  description: 'Correo electrónico para enviar notificaciones automáticas' },
    { key: 'GOOGLE_DRIVE_ROOT_FOLDER_ID',       value: '',  valueType: 'STRING',  description: 'ID de la carpeta raíz de Google Drive para REPFORA' },
    { key: 'EP_DEADLINE_MONTHS_NEW_ENROLLMENT', value: 6,   valueType: 'NUMBER',  description: 'Meses para registrar E.P para matriculados post-Nov-2024' },
    { key: 'EP_DEADLINE_YEARS_OLD_ENROLLMENT',  value: 2,   valueType: 'NUMBER',  description: 'Años para registrar E.P para matriculados pre-Nov-2024' },
];

/**
 * Ejecuta la semilla para inicializar configuraciones si no existen.
 */
export const seedSystemConfigs = async () => {
    try {
        for (const item of defaults) {
            // Upsert: Si no existe lo inserta ($setOnInsert). Si existe, no hace nada.
            await SystemConfig.findOneAndUpdate(
                { key: item.key },
                { $setOnInsert: item },
                { upsert: true, returnDocument: 'before' }
            );
        }
        console.log("✅ Configuraciones del sistema inicializadas correctamente.");
    } catch (error) {
        console.error("❌ Error al inicializar SystemConfigs:", error.message);
    }
};
