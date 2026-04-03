# SPEC: Novelties Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Depends on: Auth, SystemConfig, Users, ProductiveStages**

---

## Business context

Novelties (novedades) are critical incidents that an instructor reports about an apprentice during their productive stage. They document situations that require administrative intervention: desertion, disciplinary issues, changes in company conditions, etc. The admin receives immediate notification and must manage each novelty through to resolution. All novelties are stored with full traceability and auto-archived as PDF in Google Drive.

**Novelty types:**
| Type | When to use |
|------|-------------|
| `DESERTION` | Apprentice stopped attending / unreachable |
| `DISCIPLINARY_ISSUE` | Behavioral or performance problems at company |
| `COMPANY_CONDITIONS_CHANGE` | Schedule change, supervisor change, function change, location change |
| `OTHER` | Any situation not covered above |

**Lifecycle:** `PENDING → IN_PROGRESS → RESOLVED`

Only the admin can advance the status. Instructor can only create and view. Apprentice has no access to novelties.

---

## Files to create

```
src/models/Novelty.model.js
src/controllers/novelties.controller.js
src/services/novelties.service.js
src/routes/novelties.routes.js
```

---

## Schema Mongoose — `src/models/Novelty.model.js`

> Full reference in DATA_MODEL.md — Section 11.

```javascript
const { NOVELTY_TYPES, NOVELTY_STATUSES } = require('../utils/enums');

const NoveltySchema = new Schema({
  productiveStage:  { type: Schema.Types.ObjectId, ref: 'ProductiveStage', required: true },
  apprentice:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reportedBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  resolvedBy:       { type: Schema.Types.ObjectId, ref: 'User', default: null },

  type:             { type: String, enum: NOVELTY_TYPES, required: true },
  description:      { type: String, required: true, minlength: 50 },
  occurrenceDate:   { type: Date, required: true },

  attachments: [{
    fileName:       { type: String },
    driveFileId:    { type: String },
    driveFileUrl:   { type: String },
    uploadedAt:     { type: Date, default: Date.now }
  }],

  status:           { type: String, enum: NOVELTY_STATUSES, default: 'PENDING' },
  actionsTaken:     { type: String, default: null },
  resolvedAt:       { type: Date, default: null },

  pdfDriveId:       { type: String, default: null },
  pdfDriveUrl:      { type: String, default: null },

  isActive:         { type: Boolean, default: true }
}, { timestamps: true });

NoveltySchema.index({ productiveStage: 1 });
NoveltySchema.index({ apprentice: 1 });
NoveltySchema.index({ reportedBy: 1, status: 1 });
NoveltySchema.index({ status: 1, createdAt: -1 });
```

---

## Endpoints

### POST `/api/novelties`
**Auth:** JWT — `INSTRUCTOR` only  
**Content-Type:** `multipart/form-data`  
**Fields:** `productiveStageId`, `type`, `description`, `occurrenceDate`, `files[]` (optional PDFs, max 3, max 10MB each)

**Validations:**
- `productiveStageId`: required, valid ObjectId.
- `type`: required, enum `NOVELTY_TYPES`.
- `description`: required, min 50 chars.
- `occurrenceDate`: required, valid date, not in the future.
- `files`: optional, each must be PDF, max 10MB.

**Service logic (step by step):**
1. Find EP by `productiveStageId`. Verify instructor is assigned to it → else `403`.
2. Verify EP `status` is not `COMPLETED` or `ARCHIVED` → else `400 'Cannot report novelties for a completed EP'`.
3. Upload attachments (if any) to Google Drive in EP folder under `novedades/` subfolder. Collect `{ fileName, driveFileId, driveFileUrl }` per file.
4. Create novelty with `status: 'PENDING'`, `reportedBy: req.user.id`.
5. Auto-generate PDF summary of the novelty using `pdfGenerator.util.js`:
   - Include: type, description, occurrenceDate, instructor name, apprentice name, EP modality, attachments list.
   - Upload PDF to Drive. Save `pdfDriveId`, `pdfDriveUrl`.
6. Send **priority notification** to ADMIN: type `NEW_CRITICAL_NOVELTY` with:
   - Apprentice name + enrollment number
   - Novelty type
   - Instructor name
   - Description (first 200 chars)
   - Link to novelty
7. Record in `AuditLog`: `action: 'NOVELTY_CREATED'`, `details: { type, apprenticeId }`.
8. Return created novelty with `pdfDriveUrl`.

---

### GET `/api/novelties`
**Auth:** JWT — `ADMIN` or `INSTRUCTOR`

**Query params:**
- `status`: filter by `PENDING | IN_PROGRESS | RESOLVED`
- `type`: filter by novelty type
- `productiveStageId`: filter by EP
- `apprenticeId`: filter by apprentice (ADMIN only)
- `page` (default: 1), `limit` (default: 20)

**Access control:**
- `INSTRUCTOR`: only novelties they reported (`reportedBy: req.user.id`).
- `ADMIN`: no restriction.

**Response:** list with populated `apprentice` (fullName, enrollmentNumber), `reportedBy` (fullName), `resolvedBy` (fullName).

---

### GET `/api/novelties/:id`
**Auth:** JWT — `ADMIN` or `INSTRUCTOR` (only own)

**Service logic:**
1. Find novelty.
2. `INSTRUCTOR`: verify `novelty.reportedBy.toString() === req.user.id` → else `403`.
3. Return with full populate.

---

### PATCH `/api/novelties/:id/status`
**Auth:** JWT — `ADMIN` only  
**Description:** Admin advances the novelty status. Only valid transitions: `PENDING → IN_PROGRESS → RESOLVED`.

**Body:**
```json
{
  "status": "IN_PROGRESS",
  "actionsTaken": "Called the company supervisor. Scheduled a meeting with all parties for next week."
}
```

**Validations:**
- `status`: required, enum `NOVELTY_STATUSES`.
- `actionsTaken`: required when advancing to `IN_PROGRESS` or `RESOLVED`, min 20 chars.

**Valid transitions:**
```
PENDING     → IN_PROGRESS  ✅
IN_PROGRESS → RESOLVED     ✅
PENDING     → RESOLVED     ✅  (skip directly if resolved immediately)
RESOLVED    → anything     ❌  400 'Resolved novelties cannot be reopened'
backwards   → anything     ❌  400 'Invalid status transition'
```

**Service logic:**
1. Find novelty. Validate transition.
2. Update `status`, `actionsTaken`.
3. If advancing to `RESOLVED`: set `resolvedBy = req.user.id`, `resolvedAt = now`.
4. Regenerate the PDF summary with updated status and actions taken. Re-upload to Drive (overwrite same `pdfDriveId`).
5. Notify instructor: `'Novelty for ${apprentice.fullName} updated to ${status}'`.
6. Record in `AuditLog`: `action: 'NOVELTY_RESOLVED'` (if RESOLVED), else `'NOVELTY_CREATED'` (reuse for IN_PROGRESS update or add `NOVELTY_UPDATED` to enum).
7. Return updated novelty.

---

### POST `/api/novelties/:id/attachments`
**Auth:** JWT — `INSTRUCTOR` (own novelty) or `ADMIN`  
**Content-Type:** `multipart/form-data`  
**Field:** `files[]` (PDF, max 3 additional, max 10MB each)  
**Description:** Add attachments to an existing novelty (e.g. after the fact).

**Service logic:**
1. Find novelty. Access check.
2. Verify `novelty.status !== 'RESOLVED'` → else `400 'Cannot add attachments to a resolved novelty'`.
3. Upload each file to Drive. Push to `novelty.attachments`.
4. Regenerate PDF summary. Re-upload.
5. Return updated novelty.

---

### GET `/api/novelties/ep/:productiveStageId`
**Auth:** JWT — `ADMIN` or `INSTRUCTOR` (assigned)  
**Description:** All novelties for a specific EP — used in the apprentice detail view.

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 2,
    "pending": 1,
    "inProgress": 0,
    "resolved": 1,
    "novelties": [...]
  }
}
```

---

### GET `/api/novelties/history/:productiveStageId`
**Auth:** JWT — `ADMIN` or `INSTRUCTOR` (assigned)  
**Description:** Full chronological history of novelties for an EP, ordered by `createdAt` descending.

---

## Minimum required tests — `tests/novelties.test.js`

```javascript
describe('POST /api/novelties', () => {
  test('✅ instructor creates novelty for assigned apprentice')
  test('✅ PDF auto-generated and uploaded to Drive (mocked)')
  test('✅ admin receives priority notification')
  test('✅ attachments uploaded if provided')
  test('❌ description under 50 chars → 400')
  test('❌ EP is COMPLETED → 400')
  test('❌ instructor not assigned to EP → 403')
  test('❌ APPRENTICE tries to create → 403')
  test('❌ non-PDF attachment → 400')
});

describe('PATCH /api/novelties/:id/status', () => {
  test('✅ PENDING → IN_PROGRESS with actionsTaken')
  test('✅ IN_PROGRESS → RESOLVED, resolvedBy and resolvedAt set')
  test('✅ PENDING → RESOLVED directly')
  test('✅ PDF regenerated on status update (mocked)')
  test('✅ instructor notified on status change')
  test('❌ RESOLVED → any → 400')
  test('❌ IN_PROGRESS → PENDING → 400')
  test('❌ missing actionsTaken when resolving → 400')
  test('❌ INSTRUCTOR tries to update status → 403')
});

describe('GET /api/novelties', () => {
  test('✅ admin sees all novelties with filters')
  test('✅ instructor sees only own novelties')
  test('❌ instructor accessing another instructor novelty → 403')
  test('❌ APPRENTICE tries to access → 403')
});

describe('GET /api/novelties/ep/:productiveStageId', () => {
  test('✅ returns correct counts per status')
  test('❌ instructor not assigned to EP → 403')
});
```

---

## Completion criteria

- [ ] PDF auto-generated on creation with all novelty data.
- [ ] PDF regenerated on status update — not a new file, same `pdfDriveId` overwritten.
- [ ] Priority notification sent to admin immediately on creation.
- [ ] Only valid status transitions allowed — no backwards movement.
- [ ] `resolvedBy` and `resolvedAt` set only on `RESOLVED`.
- [ ] `ProductiveStage.complete` endpoint checks for unresolved novelties before allowing completion.
- [ ] Role-based access: instructors only see own novelties.
- [ ] Apprentice has zero access to novelties.
- [ ] AuditLog on creation and resolution.
- [ ] All tests pass.
