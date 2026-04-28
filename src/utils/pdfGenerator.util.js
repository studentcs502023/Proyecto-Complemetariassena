import PDFDocument from 'pdfkit';

/**
 * Generate a PDF buffer from structured data.
 * @param {Object} params
 * @param {string}   params.title
 * @param {string}   [params.subtitle]
 * @param {Object[]} params.sections   - [{ heading, rows: [[col1, col2, ...]] }]
 * @param {Object}   [params.summary]  - key-value pairs shown at the bottom
 * @returns {Promise<Buffer>}
 */
const generatePdf = ({ title, subtitle, sections, summary }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Header
    doc.fontSize(18).fillColor('#39a900').text('REPFORA E.P. — SENA', { align: 'center' });
    doc.fontSize(14).fillColor('#000').text(title, { align: 'center' });
    if (subtitle) doc.fontSize(10).fillColor('#666').text(subtitle, { align: 'center' });
    doc.moveDown();
    doc.fontSize(9).text(`Generated: ${new Date().toLocaleString('es-CO')}`, { align: 'right' });
    doc.moveDown();

    // Sections
    for (const section of sections) {
      doc.fontSize(12).fillColor('#000').text(section.heading, { underline: true });
      doc.moveDown(0.5);
      if (section.rows && section.rows.length > 0) {
        for (const row of section.rows) {
          // Flatten row if it contains nested objects/arrays to avoid PDFKit errors
          const rowText = row.map(cell => String(cell)).join('   |   ');
          doc.fontSize(9).text(rowText);
        }
      } else {
        doc.fontSize(9).text('No data available');
      }
      doc.moveDown();
    }

    // Summary
    if (summary) {
      doc.moveDown();
      doc.fontSize(11).text('Summary', { underline: true });
      doc.moveDown(0.5);
      for (const [key, val] of Object.entries(summary)) {
        doc.fontSize(9).text(`${key}: ${val}`);
      }
    }

    doc.end();
  });
};

/**
 * Stub for novelty PDF (backward compatibility with existing service calls)
 */
const generateNoveltyPDF = async (noveltyData) => {
  return {
    driveFileId: `mock-pdf-id-${Date.now()}`,
    driveFileUrl: `https://drive.google.com/mock-pdf-url-${Date.now()}`
  };
};

export default {
  generatePdf,
  generateNoveltyPDF
};
