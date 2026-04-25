/**
 * Helper para el manejo de fechas y plazos de la Etapa Productiva
 */

/**
 * Calcula la fecha límite de registro de EP basado en la fecha de fin de etapa lectiva
 * @param {Date|String} enrollmentExpiryDate - Fecha de fin de etapa lectiva
 * @param {Boolean} isPreNov2024 - Si la ficha es anterior a Noviembre 2024
 * @param {Number} monthsNew - Meses de plazo para fichas nuevas (ej: 6)
 * @param {Number} yearsOld - Años de plazo para fichas antiguas (ej: 2)
 * @returns {Date}
 */
export const calculateEpDeadline = (enrollmentExpiryDate, isPreNov2024, monthsNew, yearsOld) => {
    const base = new Date(enrollmentExpiryDate);
    if (isPreNov2024) {
        base.setFullYear(base.getFullYear() + Number(yearsOld));
    } else {
        base.setMonth(base.getMonth() + Number(monthsNew));
    }
    return base;
};

/**
 * Calcula la diferencia en días entre hoy y una fecha futura
 * @param {Date|String} targetDate 
 * @returns {Number}
 */
export const daysUntil = (targetDate) => {
    const diff = new Date(targetDate) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

/**
 * Determina el nivel de alerta según los días restantes
 * @param {Number} daysRemaining 
 * @param {Number} redDays 
 * @param {Number} orangeDays 
 * @param {Number} yellowDays 
 * @returns {String|null}
 */
export const getExpiryAlertLevel = (daysRemaining, redDays, orangeDays, yellowDays) => {
    if (daysRemaining <= redDays) return 'RED';
    if (daysRemaining <= orangeDays) return 'ORANGE';
    if (daysRemaining <= yellowDays) return 'YELLOW';
    return null;
};
