/**
 * Utilidad para parsear archivos de importación masiva de aprendices
 */

/**
 * Parsea un buffer de archivo CSV a un array de objetos
 * @param {Buffer} buffer 
 * @returns {Array<Object>}
 */
export const parseCSV = (buffer) => {
    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',').map(v => v.trim());
        const entry = {};
        
        headers.forEach((header, index) => {
            let value = values[index];
            
            // Convertir booleanos
            if (value?.toLowerCase() === 'true') value = true;
            if (value?.toLowerCase() === 'false') value = false;
            
            entry[header] = value;
        });
        
        results.push(entry);
    }

    return results;
};

/**
 * Valida que el objeto tenga los campos mínimos requeridos para un aprendiz
 * @param {Object} row 
 * @returns {String|null} Mensaje de error o null si es válido
 */
export const validateApprenticeRow = (row) => {
    const required = [
        'nationalId', 
        'fullName', 
        'email', 
        'enrollmentNumber', 
        'program', 
        'trainingLevel', 
        'trainingCenter', 
        'enrollmentExpiryDate'
    ];

    for (const field of required) {
        if (!row[field]) return `Campo '${field}' es obligatorio`;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        return "Formato de correo inválido";
    }

    if (isNaN(Date.parse(row.enrollmentExpiryDate))) {
        return "Fecha de vencimiento inválida";
    }

    return null;
};
