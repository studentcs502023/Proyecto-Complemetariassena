# SPEC: Reports Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Last module. Depends on ALL previous modules.**
> **All data is read-only — no writes happen here.**

---

## Business context

Reports consolidate data from across the system for administrative oversight and payment control. All reports are generated on demand and optionally exported as PDF. Some reports are also auto-generated monthly (instructor hour reports) and stored in Google Drive. Reports are exclusively for `ADMIN` — instructors have access only to their own hour report (defined in the Hours module).

**Report types:**
| Report | Description |
|--------|-------------|
| `EP_SUMMARY` | Productive stages by year, modality, status |
| `INSTRUCTOR_HOURS` | Hours executed and pending per instructor |
| `APPRENTICE_PROGRESS` | Full traceability per apprentice (bitacoras, trackings, documents) |
| `COMPANY_ACTIVITY` | Companies with active apprentices |
| `NOVELTY_SUMMARY` | Novelties by type, status, instructor |
| `ENROLLMENT_EXPIRY` | Apprentices with upcoming enrollment expiry |

---

## Files to create

```
src/controllers/reports.controller.js
src/services/reports.service.js
src/routes/reports.routes.js
src/utils/pdfGenerator.util.js
```

---

## `pdfGenerator.util.js`

> Used by Reports, Novelties and Hours modules. Implement here, import everywhere.

```javascript
const PDFDocument = require('pdfkit');

/**
 * Generate a PDF buffer from structured data.
 * @param {Object} params
 * @param {string}   params.title
 * @param {string}   [params.subtitle]
 * @param {Object[]} params.sections   - [{ heading, rows: [[col1, col2, ...]] }]
 * @param {Object}   [params.summary]  - key-value pairs shown at the bottom
 * @returns {Buffer}
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
    doc.text(`Generated: ${new Date().toLocaleString('es-CO')}`, { align: 'right', fontSize: 9 });
    doc.moveDown();

    // Sections
    for (const section of sections) {
      doc.fontSize(12).fillColor('#000').text(section.heading, { underline: true });
      doc.moveDown(0.5);
      for (const row of section.rows) {
        doc.fontSize(9).text(row.join('   |   '));
      }
      doc.moveDown();
    }

    // Summary
    if (summary) {
      doc.moveDown();
      doc.fontSize(11).text('Summary', { underline: true });
      for (const [key, val] of Object.entries(summary)) {
        doc.fontSize(9).text(`${key}: ${val}`);
      }
    }

    doc.end();
  });
};

module.exports = { generatePdf };
```

---

## Endpoints

### GET `/api/reports/ep-summary`
**Auth:** JWT — `ADMIN` only  
**Description:** Productive stages grouped by modality and status, filterable by year and instructor.

**Query params:**
- `year` (default: current year)
- `modality`: filter by EP modality
- `status`: filter by EP status
- `instructorId`: filter by assigned instructor

**Service logic:**
```javascript
// Aggregation pipeline
const pipeline = [
  { $match: { ...filters, isActive: true } },
  {
    $group: {
      _id: { modality: '$modality', status: '$status' },
      count: { $sum: 1 }
    }
  },
  { $sort: { '_id.modality': 1, '_id.status': 1 } }
];
const grouped = await ProductiveStage.aggregate(pipeline);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "year": 2025,
    "totalEPs": 78,
    "byModality": {
      "INTERNSHIP": { "total": 30, "ACTIVE": 15, "IN_FOLLOWUP": 10, "COMPLETED": 5 },
      "APPRENTICESHIP_CONTRACT": { "total": 48, ... }
    },
    "byStatus": {
      "PENDING_REGISTRATION": 3,
      "ACTIVE": 25,
      "IN_FOLLOWUP": 30,
      "CERTIFICATION": 10,
      "COMPLETED": 10
    }
  }
}
```

---

### GET `/api/reports/ep-summary/export`
**Auth:** JWT — `ADMIN` only  
**Description:** Same data as `ep-summary` but returns a PDF download.

**Query params:** same as above, plus `upload=true` to also store in Drive.

**Service logic:**
1. Fetch same data as `ep-summary`.
2. Build sections array for `pdfGenerator`.
3. Generate PDF buffer.
4. If `upload=true`: upload to Drive and return `{ driveUrl }`.
5. Otherwise: set response headers and stream buffer:
   ```javascript
   res.setHeader('Content-Type', 'application/pdf');
   res.setHeader('Content-Disposition', `attachment; filename="ep-summary-${year}.pdf"`);
   res.send(pdfBuffer);
   ```

---

### GET `/api/reports/instructor-hours`
**Auth:** JWT — `ADMIN` only  
**Description:** Hours breakdown for all instructors or a specific one.

**Query params:**
- `year` (default: current year)
- `month`: specific month (optional — if omitted, returns all months of the year)
- `instructorId`: filter for specific instructor

**Service logic:**
```javascript
const records = await HourRecord.find({ ...filters })
  .populate('instructor', 'fullName email nationalId knowledgeArea')
  .sort({ year: -1, month: -1 });
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": { "year": 2025, "month": null },
    "instructors": [
      {
        "instructor": { "id": "...", "fullName": "...", "knowledgeArea": "..." },
        "months": [
          {
            "month": 11,
            "totalHours": 42,
            "bitacoraHours": 20,
            "trackingHours": 16,
            "certificationHours": 4,
            "extraordinaryHours": 2,
            "paidHours": 22,
            "pendingPaymentHours": 20,
            "excessHours": 0
          }
        ],
        "yearTotals": {
          "totalHours": 380,
          "pendingPaymentHours": 45
        }
      }
    ],
    "grandTotals": {
      "totalHours": 1240,
      "totalPending": 180
    }
  }
}
```

---

### GET `/api/reports/instructor-hours/export`
**Auth:** JWT — `ADMIN` only  
**Description:** PDF export of instructor hours report.

---

### GET `/api/reports/apprentice-progress/:apprenticeId`
**Auth:** JWT — `ADMIN` only  
**Description:** Full traceability report for a specific apprentice — all EPs, bitacoras, trackings, documents, novelties.

**Service logic:**
```javascript
// Fetch all data in parallel
const [eps, bitacoras, trackings, documents, novelties] = await Promise.all([
  ProductiveStage.find({ apprentice: apprenticeId }).populate('company followupInstructor'),
  Bitacora.find({ apprentice: apprenticeId }),
  Tracking.find({ apprentice: apprenticeId }),
  Document.find({ apprentice: apprenticeId }),
  Novelty.find({ apprentice: apprenticeId })
]);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "apprentice": { "fullName": "...", "enrollmentNumber": "...", "program": "..." },
    "productiveStages": [
      {
        "id": "...",
        "modality": "INTERNSHIP",
        "status": "IN_FOLLOWUP",
        "startDate": "...",
        "progress": {
          "bitacoras": { "completed": 5, "required": 13, "pending": 2, "rejected": 1 },
          "trackings": { "completed": 2, "required": 3, "scheduled": 1 },
          "documents": { "approved": 1, "pending": 2, "missing": 0 }
        },
        "novelties": { "total": 1, "resolved": 0, "pending": 1 }
      }
    ]
  }
}
```

---

### GET `/api/reports/apprentice-progress/:apprenticeId/export`
**Auth:** JWT — `ADMIN` only  
**Description:** PDF export of full apprentice traceability.

---

### GET `/api/reports/company-activity`
**Auth:** JWT — `ADMIN` only  
**Description:** Companies with active apprentices — useful for auditing company relationships.

**Query params:**
- `city`: filter by city
- `year`: filter by EP year
- `hasActiveEPs`: boolean

**Service logic:**
```javascript
const pipeline = [
  { $match: { status: { $in: ['ACTIVE', 'IN_FOLLOWUP', 'CERTIFICATION'] }, isActive: true } },
  {
    $lookup: {
      from: 'companies',
      localField: 'company',
      foreignField: '_id',
      as: 'companyData'
    }
  },
  { $unwind: '$companyData' },
  {
    $group: {
      _id: '$company',
      companyName: { $first: '$companyData.name' },
      city: { $first: '$companyData.city' },
      taxId: { $first: '$companyData.taxId' },
      activeApprentices: { $sum: 1 }
    }
  },
  { $sort: { activeApprentices: -1 } }
];
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalCompanies": 24,
    "companies": [
      {
        "companyId": "...",
        "name": "Tech Solutions SAS",
        "city": "Bogotá",
        "taxId": "900123456-1",
        "activeApprentices": 5
      }
    ]
  }
}
```

---

### GET `/api/reports/novelty-summary`
**Auth:** JWT — `ADMIN` only  
**Description:** Novelties grouped by type and status — useful for administrative oversight.

**Query params:**
- `year` (default: current year)
- `instructorId`
- `type`: novelty type filter
- `status`: novelty status filter

**Service logic:**
```javascript
const pipeline = [
  { $match: { ...filters, isActive: true } },
  {
    $group: {
      _id: { type: '$type', status: '$status' },
      count: { $sum: 1 }
    }
  }
];
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 12,
    "pending": 3,
    "inProgress": 2,
    "resolved": 7,
    "byType": {
      "DESERTION": { "total": 4, "PENDING": 1, "RESOLVED": 3 },
      "DISCIPLINARY_ISSUE": { "total": 3, "IN_PROGRESS": 2, "RESOLVED": 1 },
      "COMPANY_CONDITIONS_CHANGE": { "total": 5, "PENDING": 2, "RESOLVED": 3 }
    }
  }
}
```

---

### GET `/api/reports/enrollment-expiry`
**Auth:** JWT — `ADMIN` only  
**Description:** Apprentices with enrollment expiry approaching. Uses the same alert thresholds from SystemConfig.

**Query params:**
- `alertLevel`: `YELLOW | ORANGE | RED` (filter by urgency)
- `page`, `limit`

**Service logic:**
```javascript
const yellowDays = await getConfig('EXPIRY_ALERT_DAYS_YELLOW'); // e.g. 30
const today = new Date();
const cutoff = addDays(today, yellowDays);

const apprentices = await User.find({
  role: 'APPRENTICE',
  isActive: true,
  enrollmentExpiryDate: { $lte: cutoff, $gte: today }
}).select('fullName nationalId enrollmentNumber program trainingLevel enrollmentExpiryDate isPreNov2024');

// Calculate alert level and days remaining for each
const result = apprentices.map(a => ({
  ...a.toJSON(),
  daysRemaining: daysUntil(a.enrollmentExpiryDate),
  alertLevel: getExpiryAlertLevel(daysUntil(a.enrollmentExpiryDate), redDays, orangeDays, yellowDays),
  registrationDeadline: calculateEpDeadline(a.enrollmentExpiryDate, a.isPreNov2024, monthsNew, yearsOld),
  hasActiveEP: /* check ProductiveStage */ false
}));
```

**Response:**
```json
{
  "success": true,
  "data": {
    "asOf": "2025-11-19",
    "total": 8,
    "byAlertLevel": { "RED": 2, "ORANGE": 3, "YELLOW": 3 },
    "apprentices": [
      {
        "fullName": "Ana Gómez",
        "enrollmentNumber": "2758649",
        "program": "Software Analysis and Development",
        "enrollmentExpiryDate": "2025-12-01",
        "daysRemaining": 12,
        "alertLevel": "ORANGE",
        "registrationDeadline": "2026-06-01",
        "hasActiveEP": false
      }
    ]
  }
}
```

---

## Minimum required tests — `tests/reports.test.js`

```javascript
describe('GET /api/reports/ep-summary', () => {
  test('✅ Admin gets summary grouped by modality and status')
  test('✅ year filter applied correctly')
  test('✅ modality filter applied correctly')
  test('❌ INSTRUCTOR tries to access → 403')
  test('❌ APPRENTICE tries to access → 403')
});

describe('GET /api/reports/ep-summary/export', () => {
  test('✅ returns PDF buffer with correct Content-Type header')
  test('✅ upload=true returns driveUrl (Drive mocked)')
});

describe('GET /api/reports/instructor-hours', () => {
  test('✅ returns all instructors with monthly breakdown')
  test('✅ year + month filter returns single month data')
  test('✅ instructorId filter returns single instructor')
  test('❌ INSTRUCTOR tries to access → 403')
});

describe('GET /api/reports/apprentice-progress/:apprenticeId', () => {
  test('✅ returns full traceability with all related data')
  test('✅ progress counts are accurate')
  test('❌ non-existent apprenticeId → 404')
});

describe('GET /api/reports/enrollment-expiry', () => {
  test('✅ returns apprentices within yellow threshold')
  test('✅ alertLevel filter works correctly')
  test('✅ daysRemaining calculated correctly')
  test('✅ hasActiveEP correctly reflects EP existence')
});

describe('pdfGenerator.generatePdf()', () => {
  test('✅ returns a Buffer')
  test('✅ buffer is non-empty')
  test('✅ title appears in generated content')
});
```

---

## Completion criteria

- [ ] All aggregation queries use MongoDB pipeline — no in-memory filtering of large datasets.
- [ ] PDF exports use `pdfGenerator.util.js` — not inline PDF generation in the service.
- [ ] `Promise.all` used in `apprentice-progress` to fetch related data in parallel.
- [ ] `enrollment-expiry` uses `dateHelper` functions — not inline date math.
- [ ] Export endpoints set correct HTTP headers (`Content-Type: application/pdf`, `Content-Disposition: attachment`).
- [ ] `upload=true` stores PDF in Drive and returns URL instead of streaming.
- [ ] All reports are `ADMIN` only — no exceptions.
- [ ] All tests pass.
