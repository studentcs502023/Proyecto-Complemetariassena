# SPEC: Bitacoras Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Depends on: Auth, SystemConfig, Users, Companies, ProductiveStages**

---

## Business context

Logbooks (bitácoras) are fortnightly documents submitted by the apprentice as PDF. The assigned instructor reviews them and either approves or rejects them with comments. On approval, hours are automatically added to the instructor's monthly record (`HourRecord`) using the value from `SystemConfig.HOURS_PER_LOGBOOK_REVIEW`. Approved logbooks are stored permanently in Google Drive and cannot be deleted. Rejected logbooks can be re-submitted. The system tracks how many logbooks have been completed and updates `ProductiveStage.completedBitacoras` on each approval, which may trigger a status auto-transition.

**Max logbooks per EP:** read from `SystemConfig.MAX_LOGBOOKS_TECHNICIAN` or `MAX_LOGBOOKS_TECHNOLOGIST` based on apprentice's `trainingLevel`. This value is already stored in `ProductiveStage.maxBitacoras` at EP approval time — always read it from there, not from SystemConfig directly.

---

## Files to create

```
src/models/Bitacora.model.js
src/controllers/bitacoras.controller.js
src/services/bitacoras.service.js
src/routes/bitacoras.routes.js
```

---

## Schema Mongoose — `src/models/Bitacora.model.js`

> Full reference in DATA_MODEL.md — Section 4.

```javascript
const { BITACORA_STATUSES } = require('../utils/enums');

const BitacoraSchema = new Schema({
  productiveStage:  { type: Schema.Types.ObjectId, ref: 'ProductiveStage', required: true },
  apprentice:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  instructor:       { type: Schema.Types.ObjectId, ref: 'User', default: null },

  logbookNumber:    { type: Number, required: true },
  periodStart:      { type: Date, required: true },
  periodEnd:        { type: Date, required: true },
  isAdditional:     { type: Boolean, default: false },

  fileName:         { type: String, default: null },
  driveFileId:      { type: String, default: null },
  driveFileUrl:     { type: String, default: null },
  submittedAt:      { type: Date, default: null },

  status:           { type: String, enum: BITACORA_STATUSES, default: 'PENDING' },
  reviewedAt:       { type: Date, default: null },
  reviewComments: [{
    text:           { type: String, required: true },
    createdAt:      { type: Date, default: Date.now },
    author:         { type: Schema.Types.ObjectId, ref: 'User' }
  }],

  assignedHours:    { type: Number, default: null },
  isPaid:           { type: Boolean, default: false },
  paidAt:           { type: Date, default: null },

  isActive:         { type: Boolean, default: true }
}, { timestamps: true });

BitacoraSchema.index({ productiveStage: 1, logbookNumber: 1 });
BitacoraSchema.index({ apprentice: 1, status: 1 });
BitacoraSchema.index({ instructor: 1, status: 1 });
BitacoraSchema.index({ status: 1, submittedAt: 1 });
```

---

## Endpoints

### POST `/api/bitacoras`
**Auth:** JWT — `APPRENTICE` only  
**Content-Type:** `multipart/form-data`  
**Fields:** `file` (PDF), `periodStart` (date), `periodEnd` (date), `productiveStageId`

**Validations:**
- `productiveStageId`: required, valid ObjectId.
- `periodStart`, `periodEnd`: required, valid dates, `periodEnd > periodStart`.
- `file`: required, PDF only, max 10MB.

**Service logic (step by step):**
1. Find `ProductiveStage` by `productiveStageId`. Verify `apprentice === req.user.id` → else `403`.
2. Verify EP `status` is `ACTIVE` or `IN_FOLLOWUP` → else `400 'Your productive stage is not active'`.
3. Count existing non-rejected bitacoras for this EP:
   - If `count >= ep.maxBitacoras` → `400 'Maximum logbooks reached (${ep.maxBitacoras})'`.
4. Check no other bitacora exists for the same `periodStart`/`periodEnd` pair → `409 'A logbook for this period already exists'`.
5. Determine `logbookNumber`: `count of existing bitacoras for this EP + 1`.
6. Upload PDF to Google Drive in apprentice's EP folder: `googleDriveService.uploadFile(...)` → get `driveFileId`, `driveFileUrl`.
7. Create bitacora with `status: 'PENDING'`, `submittedAt: now`.
8. Send notification to assigned instructor(s): type `BITACORA_PENDING_REVIEW`.
9. Record in `AuditLog`: `action: 'BITACORA_SUBMITTED'`.
10. Return created bitacora.

---

### GET `/api/bitacoras`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR`, `APPRENTICE`

**Query params:**
- `productiveStageId`: filter by EP (required for APPRENTICE and INSTRUCTOR)
- `status`: filter by status
- `page`, `limit`

**Access control:**
- `APPRENTICE`: only their own bitacoras (`apprentice: req.user.id`).
- `INSTRUCTOR`: only bitacoras from their assigned EPs. Verify EP belongs to them before returning.
- `ADMIN`: no restriction.

---

### GET `/api/bitacoras/:id`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR` (assigned), `APPRENTICE` (own)

**Service logic:**
1. Find bitacora.
2. Role check:
   - `APPRENTICE`: `bitacora.apprentice !== req.user.id` → `403`.
   - `INSTRUCTOR`: find the EP and verify instructor is assigned.
3. Return with populated `instructor` (fullName), `apprentice` (fullName, enrollmentNumber), `reviewComments.author`.

---

### PATCH `/api/bitacoras/:id/approve`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Approve a logbook. Adds hours to instructor's HourRecord and updates EP progress.

**Service logic (step by step):**
1. Find bitacora. Verify `status === 'PENDING' || status === 'IN_REVIEW'` → else `400`.
2. Verify the requesting instructor is assigned to the EP (`ep.followupInstructor === req.user.id`).
3. Read `hoursToAssign` from `SystemConfig.HOURS_PER_LOGBOOK_REVIEW` via `configHelper`.
4. Update bitacora:
   - `status = 'APPROVED'`
   - `reviewedAt = now`
   - `instructor = req.user.id`
   - `assignedHours = hoursToAssign`
5. Increment `ProductiveStage.completedBitacoras += 1`. Save EP.
6. Update instructor's `HourRecord` for current month:
   - Find or create `HourRecord` for `{ instructor: req.user.id, month, year }`.
   - Increment `bitacoraHours += hoursToAssign`, recalculate `totalHours`.
   - Check if `totalHours > MAX_MONTHLY_HOURS_INSTRUCTOR`:
     - If yes: calculate `excessHours`, send alert notification type `HOURS_OVERLOAD`.
     - Also send `HOURS_LIMIT_ALERT` if approaching (within 10 hours of limit).
   - Update `User.accumulatedHours += hoursToAssign` and `User.pendingPaymentHours += hoursToAssign`.
7. Call `productiveStagesService.checkAndAdvanceStatus(ep._id)` to trigger auto-transitions.
8. Send notification to apprentice: type `BITACORA_APPROVED`.
9. Record in `AuditLog`: `action: 'BITACORA_APPROVED'`, `details: { assignedHours }`.
10. Return updated bitacora.

---

### PATCH `/api/bitacoras/:id/reject`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Reject a logbook with comments.

**Body:**
```json
{ "comment": "The activities described do not match the established period. Please review sections 2 and 3." }
```

**Validations:** `comment` required, min 10 chars.

**Service logic:**
1. Find bitacora. Verify `status === 'PENDING' || status === 'IN_REVIEW'`.
2. Verify instructor is assigned to the EP.
3. Update bitacora:
   - `status = 'REJECTED'`
   - `reviewedAt = now`
   - `instructor = req.user.id`
   - Push to `reviewComments`: `{ text: comment, author: req.user.id, createdAt: now }`.
4. Send notification to apprentice: type `BITACORA_REJECTED` with comment text.
5. Record in `AuditLog`: `action: 'BITACORA_REJECTED'`.
6. Return updated bitacora.

---

### PATCH `/api/bitacoras/:id/resubmit`
**Auth:** JWT — `APPRENTICE` only  
**Description:** Re-submit a rejected logbook with a new PDF.  
**Content-Type:** `multipart/form-data`  
**Field:** `file` (PDF)

**Service logic:**
1. Find bitacora. Verify `bitacora.apprentice === req.user.id` → else `403`.
2. Verify `status === 'REJECTED'` → else `400 'Only rejected logbooks can be resubmitted'`.
3. Upload new PDF to Drive (overwrite same slot — append `_v2`, `_v3` to filename for versioning).
4. Update: `fileName`, `driveFileId`, `driveFileUrl`, `submittedAt = now`, `status = 'PENDING'`.
5. Notify instructor: type `BITACORA_PENDING_REVIEW`.
6. Return updated bitacora.

---

### POST `/api/bitacoras/additional`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Create an additional (extraordinary) logbook outside the normal plan. Used when the instructor needs to document special situations.

**Body:**
```json
{
  "productiveStageId": "...",
  "periodStart": "2025-11-01",
  "periodEnd": "2025-11-15",
  "reason": "Apprentice requested additional documentation for project deliverable extension."
}
```

**Validations:** `reason` required, min 20 chars.

**Service logic:**
1. Find EP. Verify instructor is assigned.
2. Create bitacora with `isAdditional: true`, `status: 'PENDING'`, `logbookNumber` as next in sequence.
3. Notify apprentice to upload the PDF for this additional logbook.
4. Return created bitacora.

---

### GET `/api/bitacoras/template`
**Auth:** JWT — `APPRENTICE` or `INSTRUCTOR`  
**Description:** Download the official logbook template.

**Logic:** Return a pre-stored Drive URL for the template file from `SystemConfig.LOGBOOK_TEMPLATE_DRIVE_URL` (add this key to seed).

---

## Minimum required tests — `tests/bitacoras.test.js`

```javascript
describe('POST /api/bitacoras', () => {
  test('✅ apprentice submits logbook for active EP')
  test('✅ logbookNumber is auto-incremented correctly')
  test('✅ file uploaded to Drive (mocked)')
  test('✅ instructor notified on submission')
  test('❌ EP not active → 400')
  test('❌ max logbooks reached → 400')
  test('❌ duplicate period → 409')
  test('❌ INSTRUCTOR tries to submit → 403')
  test('❌ non-PDF file → 400')
});

describe('PATCH /api/bitacoras/:id/approve', () => {
  test('✅ status → APPROVED, hours assigned from SystemConfig')
  test('✅ ProductiveStage.completedBitacoras incremented')
  test('✅ HourRecord updated for instructor')
  test('✅ User.pendingPaymentHours incremented')
  test('✅ checkAndAdvanceStatus called')
  test('✅ apprentice notified')
  test('✅ HOURS_OVERLOAD notification if limit exceeded')
  test('❌ already approved → 400')
  test('❌ instructor not assigned to EP → 403')
});

describe('PATCH /api/bitacoras/:id/reject', () => {
  test('✅ status → REJECTED, comment stored')
  test('✅ apprentice notified with comment')
  test('❌ missing comment → 400')
  test('❌ already approved → 400')
});

describe('PATCH /api/bitacoras/:id/resubmit', () => {
  test('✅ rejected logbook re-submitted successfully')
  test('❌ non-rejected logbook → 400')
  test('❌ another apprentice tries to resubmit → 403')
});

describe('Access control', () => {
  test('✅ apprentice only sees own bitacoras')
  test('✅ instructor only sees bitacoras from assigned EPs')
  test('❌ instructor accessing bitacora from unassigned EP → 403')
});
```

---

## Completion criteria

- [ ] Hours read from `SystemConfig.HOURS_PER_LOGBOOK_REVIEW` via `configHelper` — never hardcoded.
- [ ] `ProductiveStage.completedBitacoras` incremented on approval.
- [ ] `HourRecord` created or updated on approval (find-or-create pattern).
- [ ] `User.accumulatedHours` and `User.pendingPaymentHours` updated on approval.
- [ ] `checkAndAdvanceStatus` called after every approval.
- [ ] Overload notification sent when instructor exceeds monthly limit.
- [ ] Approved logbooks stored permanently in Drive — never deleted.
- [ ] Rejected logbooks can be re-submitted with a new file.
- [ ] Role-based access enforced on every endpoint.
- [ ] AuditLog on submit, approve, reject.
- [ ] All tests pass.