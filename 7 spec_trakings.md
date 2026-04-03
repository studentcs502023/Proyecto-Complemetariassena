# SPEC: Trackings Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Depends on: Auth, SystemConfig, Users, ProductiveStages**

---

## Business context

Trackings (seguimientos) are the formal evaluation sessions the instructor conducts with the apprentice during the productive stage. They can be in-person, virtual, or extraordinary. Required trackings per EP are defined by `trainingLevel` and stored in `ProductiveStage.requiredTrackings` at approval time.

**Key rules:**
- Ordinary trackings: numbered 1, 2, 3 (up to `requiredTrackings`).
- Extraordinary trackings: require prior admin approval before being executed. They generate additional hours.
- Each tracking goes through: `SCHEDULED → EXECUTED → PAID`.
- Hours are assigned per type from SystemConfig on execution (not scheduling).
- On execution, `ProductiveStage.completedTrackings` increments and `checkAndAdvanceStatus` is called.
- A tracking must be signed by the instructor (and optionally by the apprentice depending on modality) before it can be marked as executed.
- Instructors can mark status checkboxes (executed, paid) per tracking — once marked as paid, the row is locked from editing.

**Hours by tracking type (from SystemConfig):**
| Type | SystemConfig key |
|------|-----------------|
| `IN_PERSON` | `HOURS_PER_IN_PERSON_TRACKING` |
| `VIRTUAL` | `HOURS_PER_VIRTUAL_TRACKING` |
| `EXTRAORDINARY` | `HOURS_PER_EXTRAORDINARY_TRACKING` |

---

## Files to create

```
src/models/Tracking.model.js
src/controllers/trackings.controller.js
src/services/trackings.service.js
src/routes/trackings.routes.js
```

---

## Schema Mongoose — `src/models/Tracking.model.js`

> Full reference in DATA_MODEL.md — Section 5.

```javascript
const { TRACKING_STATUSES, TRACKING_TYPES } = require('../utils/enums');

const TrackingSchema = new Schema({
  productiveStage:      { type: Schema.Types.ObjectId, ref: 'ProductiveStage', required: true },
  apprentice:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  instructor:           { type: Schema.Types.ObjectId, ref: 'User', required: true },

  trackingNumber:       { type: Number, required: true },
  type:                 { type: String, enum: TRACKING_TYPES, required: true },
  isExtraordinary:      { type: Boolean, default: false },
  extraordinaryReason:  { type: String, default: null },
  approvedByAdmin:      { type: Boolean, default: false },
  approvedBy:           { type: Schema.Types.ObjectId, ref: 'User', default: null },

  scheduledDate:        { type: Date, required: true },
  executedDate:         { type: Date, default: null },

  fileName:             { type: String, default: null },
  driveFileId:          { type: String, default: null },
  driveFileUrl:         { type: String, default: null },

  signedByInstructor:   { type: Boolean, default: false },
  signedByApprentice:   { type: Boolean, default: false },
  signatureValidatedAt: { type: Date, default: null },

  status:               { type: String, enum: TRACKING_STATUSES, default: 'SCHEDULED' },
  assignedHours:        { type: Number, default: null },
  isPaid:               { type: Boolean, default: false },
  paidAt:               { type: Date, default: null },

  notes:                { type: String, default: null },

  isActive:             { type: Boolean, default: true }
}, { timestamps: true });

TrackingSchema.index({ productiveStage: 1, trackingNumber: 1 });
TrackingSchema.index({ instructor: 1, status: 1 });
TrackingSchema.index({ apprentice: 1 });
TrackingSchema.index({ isExtraordinary: 1, approvedByAdmin: 1 });
TrackingSchema.index({ scheduledDate: 1 });
```

---

## Endpoints

### POST `/api/trackings`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Schedule a new ordinary tracking for an assigned apprentice.

**Body:**
```json
{
  "productiveStageId": "...",
  "type": "IN_PERSON",
  "scheduledDate": "2025-11-15",
  "notes": "First formal tracking session"
}
```

**Validations:**
- `productiveStageId`: required, valid ObjectId.
- `type`: required, `IN_PERSON` or `VIRTUAL` only (for ordinary trackings — extraordinary has its own endpoint).
- `scheduledDate`: required, valid date, not in the past.

**Service logic (step by step):**
1. Find EP. Verify instructor is assigned (`followupInstructor` or `technicalInstructor` or `projectInstructor`).
2. Verify EP `status` is `ACTIVE` or `IN_FOLLOWUP`.
3. Count existing non-extraordinary trackings for this EP. If `count >= ep.requiredTrackings` → `400 'All required trackings already scheduled (${ep.requiredTrackings})'`.
4. Set `trackingNumber = count + 1`.
5. Verify no other tracking already scheduled for the same `scheduledDate` for this EP → `409 'A tracking is already scheduled for this date'`.
6. Create tracking with `status: 'SCHEDULED'`, `isExtraordinary: false`, `approvedByAdmin: false`.
7. Send notification to apprentice: type `TRACKING_REMINDER` with date and type.
8. Record in `AuditLog`: `action: 'TRACKING_CREATED'`.
9. Return created tracking.

---

### POST `/api/trackings/extraordinary/request`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Request an extraordinary tracking. Requires admin approval before it can be executed.

**Body:**
```json
{
  "productiveStageId": "...",
  "type": "IN_PERSON",
  "scheduledDate": "2025-12-01",
  "extraordinaryReason": "Apprentice showed signs of difficulty with core tasks. Additional evaluation needed to document and support the process."
}
```

**Validations:**
- `extraordinaryReason`: required, min 50 chars.
- `type`: required, enum `TRACKING_TYPES` (including `EXTRAORDINARY`).

**Service logic:**
1. Find EP. Verify instructor is assigned.
2. Create tracking with `isExtraordinary: true`, `approvedByAdmin: false`, `status: 'SCHEDULED'`.
3. Set `trackingNumber` as next after existing extraordinaries for this EP.
4. Send notification to ADMIN: type `NEW_CRITICAL_NOVELTY` (reuse) — or dedicated type — with reason and instructor/apprentice data.
5. Record in `AuditLog`: `action: 'TRACKING_EXTRAORDINARY_REQUESTED'`.
6. Return tracking with `approvedByAdmin: false` (pending admin action).

---

### PATCH `/api/trackings/:id/approve-extraordinary`
**Auth:** JWT — `ADMIN` only  
**Description:** Admin approves an extraordinary tracking request.

**Service logic:**
1. Find tracking. Verify `isExtraordinary: true` and `approvedByAdmin: false`.
2. Set `approvedByAdmin: true`, `approvedBy: req.user.id`.
3. Send notification to instructor: type `EXTRAORDINARY_TRACKING_APPROVED`.
4. Record in `AuditLog`: `action: 'TRACKING_EXTRAORDINARY_APPROVED'`.
5. Return updated tracking.

---

### PATCH `/api/trackings/:id/upload-pdf`
**Auth:** JWT — `INSTRUCTOR` only  
**Content-Type:** `multipart/form-data`  
**Field:** `file` (PDF — signed tracking document)  
**Description:** Upload the signed PDF for the tracking. Required before marking as executed.

**Service logic:**
1. Find tracking. Verify instructor owns it (`tracking.instructor === req.user.id`).
2. Verify `status === 'SCHEDULED'` → else `400 'Cannot upload PDF for a tracking that is already executed'`.
3. If `isExtraordinary: true` and `approvedByAdmin: false` → `400 'Extraordinary tracking must be approved by admin before uploading'`.
4. Upload to Drive in EP folder.
5. Update `fileName`, `driveFileId`, `driveFileUrl`.
6. Return updated tracking.

---

### PATCH `/api/trackings/:id/validate-signature`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Mark signatures as validated. Must be done before executing.

**Body:**
```json
{
  "signedByInstructor": true,
  "signedByApprentice": true
}
```

**Service logic:**
1. Find tracking. Verify instructor owns it.
2. Verify PDF has been uploaded (`driveFileId` not null) → else `400 'Upload the signed PDF before validating signatures'`.
3. Update `signedByInstructor`, `signedByApprentice`, `signatureValidatedAt = now`.
4. Return updated tracking.

---

### PATCH `/api/trackings/:id/execute`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Mark tracking as executed. Assigns hours and updates EP progress.

**Service logic (step by step):**
1. Find tracking. Verify instructor owns it.
2. Verify `status === 'SCHEDULED'` → else `400`.
3. Verify `signedByInstructor === true` → else `400 'Tracking must be signed before marking as executed'`.
4. Verify PDF uploaded (`driveFileId` not null) → else `400 'Upload the signed PDF before executing'`.
5. If `isExtraordinary` and `!approvedByAdmin` → `400 'Extraordinary tracking must be approved by admin first'`.
6. Determine `hoursKey` based on type:
   - `IN_PERSON` → `HOURS_PER_IN_PERSON_TRACKING`
   - `VIRTUAL` → `HOURS_PER_VIRTUAL_TRACKING`
   - `EXTRAORDINARY` → `HOURS_PER_EXTRAORDINARY_TRACKING`
7. Read `hoursToAssign` from SystemConfig via `configHelper`.
8. Update tracking: `status = 'EXECUTED'`, `executedDate = now`, `assignedHours = hoursToAssign`.
9. If NOT extraordinary: increment `ProductiveStage.completedTrackings += 1`. Save EP.
10. Update instructor's `HourRecord`:
    - Find or create for `{ instructor: req.user.id, month, year }`.
    - If ordinary: `trackingHours += hoursToAssign`.
    - If extraordinary: `extraordinaryHours += hoursToAssign`.
    - Recalculate `totalHours`.
    - Check monthly limit → send `HOURS_OVERLOAD` or `HOURS_LIMIT_ALERT` if needed.
    - Update `User.accumulatedHours` and `User.pendingPaymentHours`.
11. Call `productiveStagesService.checkAndAdvanceStatus(ep._id)`.
12. Record in `AuditLog`: `action: 'TRACKING_STATUS_UPDATED'`, `details: { status: 'EXECUTED', assignedHours }`.
13. Return updated tracking.

---

### PATCH `/api/trackings/:id/mark-paid`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Mark tracking hours as paid (cobrado). Locks the row — no further edits allowed.

**Service logic:**
1. Find tracking. Verify instructor owns it.
2. Verify `status === 'EXECUTED'` → else `400 'Only executed trackings can be marked as paid'`.
3. Verify `!isPaid` → else `400 'This tracking has already been marked as paid'`.
4. Update: `isPaid = true`, `paidAt = now`, `status = 'PAID'`.
5. Update `HourRecord`: `paidHours += assignedHours`, `pendingPaymentHours -= assignedHours`.
6. Update `User.pendingPaymentHours -= assignedHours`.
7. Record in `AuditLog`: `action: 'TRACKING_STATUS_UPDATED'`, `details: { status: 'PAID' }`.
8. Return updated tracking.

---

### GET `/api/trackings`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR`, `APPRENTICE`

**Query params:**
- `productiveStageId`: required for APPRENTICE and INSTRUCTOR
- `status`: filter
- `isExtraordinary`: boolean filter
- `page`, `limit`

**Access control:**
- `APPRENTICE`: only trackings where `apprentice === req.user.id`.
- `INSTRUCTOR`: only trackings where `instructor === req.user.id`.
- `ADMIN`: no restriction.

**Response:** populated `apprentice` (fullName, enrollmentNumber), `instructor` (fullName), with checkbox states (executed, paid).

---

### GET `/api/trackings/:id`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR` (own), `APPRENTICE` (own)

---

### GET `/api/trackings/summary/:productiveStageId`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR` (assigned), `APPRENTICE` (own EP)  
**Description:** Summary table of all trackings for an EP — used to render the tracking dashboard.

**Response:**
```json
{
  "success": true,
  "data": {
    "required": 3,
    "completed": 2,
    "pending": 1,
    "trackings": [
      {
        "id": "...",
        "trackingNumber": 1,
        "type": "IN_PERSON",
        "scheduledDate": "2025-10-15",
        "executedDate": "2025-10-15",
        "status": "PAID",
        "isExtraordinary": false,
        "approvedByAdmin": false,
        "signedByInstructor": true,
        "signedByApprentice": true,
        "assignedHours": 2,
        "isPaid": true
      }
    ]
  }
}
```

---

### GET `/api/trackings/template`
**Auth:** JWT — `INSTRUCTOR`  
**Description:** Download the official tracking template (PDF).

**Logic:** Return Drive URL from `SystemConfig.TRACKING_TEMPLATE_DRIVE_URL` (add this key to seed).

---

## Alert logic — called by scheduled job or on-demand

These functions live in `trackings.service.js` and are called by a scheduled job (e.g. daily cron):

```javascript
// Check for upcoming tracking deadlines and send alerts
const checkTrackingDeadlines = async () => {
  const yellowDays = await getConfig('EXPIRY_ALERT_DAYS_YELLOW');
  const orangeDays = await getConfig('EXPIRY_ALERT_DAYS_ORANGE');
  const redDays    = await getConfig('EXPIRY_ALERT_DAYS_RED');

  // Find SCHEDULED trackings whose scheduledDate is approaching
  const upcoming = await Tracking.find({
    status: 'SCHEDULED',
    scheduledDate: { $lte: addDays(new Date(), yellowDays) }
  }).populate('instructor apprentice productiveStage');

  for (const tracking of upcoming) {
    const days = daysUntil(tracking.scheduledDate);
    const level = getExpiryAlertLevel(days, redDays, orangeDays, yellowDays);
    if (level) {
      await notificationService.send({
        type: 'TRACKING_DEADLINE_APPROACHING',
        recipients: [tracking.instructor._id],
        title: `Tracking deadline ${level} alert`,
        message: `Tracking #${tracking.trackingNumber} for ${tracking.apprentice.fullName} is due in ${days} days.`
      });
      // Also notify apprentice
      await notificationService.send({
        type: 'TRACKING_REMINDER',
        recipients: [tracking.apprentice._id],
        ...
      });
    }
  }
};
```

---

## Minimum required tests — `tests/trackings.test.js`

```javascript
describe('POST /api/trackings', () => {
  test('✅ instructor creates tracking for assigned apprentice')
  test('✅ trackingNumber auto-incremented')
  test('✅ apprentice notified on creation')
  test('❌ EP not active → 400')
  test('❌ all required trackings already scheduled → 400')
  test('❌ duplicate date → 409')
  test('❌ instructor not assigned to EP → 403')
  test('❌ APPRENTICE tries to create → 403')
});

describe('POST /api/trackings/extraordinary/request', () => {
  test('✅ extraordinary tracking created with approvedByAdmin: false')
  test('✅ admin notified')
  test('❌ reason too short → 400')
});

describe('PATCH /api/trackings/:id/approve-extraordinary', () => {
  test('✅ admin approves, approvedByAdmin set to true')
  test('✅ instructor notified')
  test('❌ INSTRUCTOR tries to approve → 403')
  test('❌ already approved → 400')
});

describe('PATCH /api/trackings/:id/execute', () => {
  test('✅ status → EXECUTED, hours assigned from SystemConfig by type')
  test('✅ ProductiveStage.completedTrackings incremented for ordinary tracking')
  test('✅ extraordinary tracking does NOT increment completedTrackings')
  test('✅ HourRecord updated (trackingHours or extraordinaryHours)')
  test('✅ User.pendingPaymentHours incremented')
  test('✅ checkAndAdvanceStatus called')
  test('❌ not signed → 400')
  test('❌ no PDF uploaded → 400')
  test('❌ extraordinary not approved → 400')
  test('❌ already executed → 400')
});

describe('PATCH /api/trackings/:id/mark-paid', () => {
  test('✅ status → PAID, HourRecord.paidHours incremented')
  test('✅ User.pendingPaymentHours decremented')
  test('❌ not executed → 400')
  test('❌ already paid → 400')
});

describe('Access control', () => {
  test('✅ instructor only sees own trackings')
  test('✅ apprentice only sees own trackings')
  test('❌ instructor accessing another instructor tracking → 403')
});
```

---

## Completion criteria

- [ ] Hours read from SystemConfig by tracking type — never hardcoded.
- [ ] Extraordinary trackings require admin approval before `execute`.
- [ ] Signature validation required before `execute`.
- [ ] PDF upload required before `execute`.
- [ ] `completedTrackings` only incremented for ordinary (non-extraordinary) trackings.
- [ ] `checkAndAdvanceStatus` called after every ordinary tracking execution.
- [ ] `HourRecord` splits hours correctly: `trackingHours` vs `extraordinaryHours`.
- [ ] `mark-paid` locks the row (`isPaid: true`) — no further edits.
- [ ] Monthly limit alerts triggered from `execute` when threshold reached.
- [ ] Role-based access enforced on every endpoint.
- [ ] AuditLog on create, execute, mark-paid.
- [ ] All tests pass.