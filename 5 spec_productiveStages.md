# SPEC: ProductiveStages Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Depends on: Auth, SystemConfig, Users, Companies**
> **This is the core module. All other modules (Bitacoras, Trackings, Hours, Documents) depend on it.**

---

## Business context

The productive stage (EP) is the central process of REPFORA. Each apprentice goes through it once per enrollment, although they can have historical EPs from previous enrollments. The lifecycle has 7 states with strict transitions. The Admin approves the EP, assigns instructors (quantity depends on modality), and monitors progress. The system blocks certification until all requirements are met: required logbooks, required trackings, and approved certification documents.

**Instructor assignment rules by modality:**
| Modality | Instructors required |
|----------|----------------------|
| `APPRENTICESHIP_CONTRACT` | followupInstructor only |
| `LABOR_LINK` | followupInstructor only |
| `INTERNSHIP` | followupInstructor only |
| `INDIVIDUAL_PRODUCTIVE_PROJECT` | followupInstructor + technicalInstructor |
| `GROUP_PRODUCTIVE_PROJECT` | followupInstructor + technicalInstructor + projectInstructor |

**Enrollment deadline rules:**
- `isPreNov2024 = true` → 2 years from enrollment expiry to register EP (read from `SystemConfig.EP_DEADLINE_YEARS_OLD_ENROLLMENT`).
- `isPreNov2024 = false` → 6 months from enrollment expiry (read from `SystemConfig.EP_DEADLINE_MONTHS_NEW_ENROLLMENT`).

---

## Files to create

```
src/models/ProductiveStage.model.js
src/controllers/productiveStages.controller.js
src/services/productiveStages.service.js
src/routes/productiveStages.routes.js
src/utils/dateHelper.util.js
```

---

## Schema Mongoose — `src/models/ProductiveStage.model.js`

> Full reference in DATA_MODEL.md — Section 3.

```javascript
const { EP_MODALITIES, EP_STATUSES } = require('../utils/enums');

const ProductiveStageSchema = new Schema({
  // ACTORS
  apprentice:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  company:              { type: Schema.Types.ObjectId, ref: 'Company', default: null },
  followupInstructor:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
  technicalInstructor:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
  projectInstructor:    { type: Schema.Types.ObjectId, ref: 'User', default: null },

  // EP DATA
  modality:             { type: String, enum: EP_MODALITIES, required: true },
  status:               { type: String, enum: EP_STATUSES, default: 'PENDING_REGISTRATION' },
  registrationDate:     { type: Date, default: null },
  approvalDate:         { type: Date, default: null },
  startDate:            { type: Date, default: null },
  estimatedEndDate:     { type: Date, default: null },
  completionDate:       { type: Date, default: null },

  // COMPANY SNAPSHOT (denormalized at registration time)
  companySnapshot: {
    companyName:        { type: String, default: null },
    taxId:              { type: String, default: null },
    address:            { type: String, default: null },
    apprenticeJobTitle: { type: String, default: null },
    supervisorName:     { type: String, default: null },
    supervisorPhone:    { type: String, default: null },
    supervisorEmail:    { type: String, default: null }
  },

  // PROGRESS
  completedBitacoras:   { type: Number, default: 0 },
  maxBitacoras:         { type: Number, default: null },
  completedTrackings:   { type: Number, default: 0 },
  requiredTrackings:    { type: Number, default: null },

  // GOOGLE DRIVE
  driveFolderId:        { type: String, default: null },
  driveFolderUrl:       { type: String, default: null },

  // COMMENTS THREAD
  comments: [{
    text:               { type: String, required: true },
    author:             { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt:          { type: Date, default: Date.now }
  }],

  // FLAGS
  isHistorical:         { type: Boolean, default: false },
  isActive:             { type: Boolean, default: true }
}, { timestamps: true });

ProductiveStageSchema.index({ apprentice: 1, status: 1 });
ProductiveStageSchema.index({ apprentice: 1, isHistorical: 1 });
ProductiveStageSchema.index({ followupInstructor: 1, status: 1 });
ProductiveStageSchema.index({ technicalInstructor: 1 });
ProductiveStageSchema.index({ projectInstructor: 1 });
ProductiveStageSchema.index({ status: 1 });
ProductiveStageSchema.index({ modality: 1 });
ProductiveStageSchema.index({ company: 1 });
```

---

## Valid state transitions

```
PENDING_REGISTRATION → PENDING_APPROVAL     (apprentice submits registration)
PENDING_APPROVAL     → ACTIVE               (admin approves)
PENDING_APPROVAL     → PENDING_REGISTRATION (admin rejects — apprentice must re-register)
ACTIVE               → IN_FOLLOWUP          (auto: first tracking completed)
IN_FOLLOWUP          → CERTIFICATION        (auto: all required trackings + logbooks done)
CERTIFICATION        → COMPLETED            (admin confirms all docs approved)
COMPLETED            → ARCHIVED             (admin archives)
```

Any other transition → `400 'Invalid status transition'`.

---

## Endpoints

### POST `/api/productive-stages`
**Auth:** JWT — `APPRENTICE` only  
**Description:** Apprentice registers their productive stage. One active EP per apprentice at a time.

**Body:**
```json
{
  "modality": "INTERNSHIP",
  "companyId": "...",
  "companySnapshot": {
    "apprenticeJobTitle": "Junior Developer",
    "supervisorName": "Pedro Ruiz",
    "supervisorPhone": "3001112222",
    "supervisorEmail": "pruiz@company.com"
  },
  "startDate": "2025-10-01",
  "estimatedEndDate": "2026-04-01"
}
```

**Validations (express-validator):**
- `modality`: required, enum `EP_MODALITIES`.
- `companyId`: required, valid ObjectId.
- `companySnapshot.apprenticeJobTitle`: required.
- `companySnapshot.supervisorName`: required.
- `startDate`: required, valid date, not in the past.
- `estimatedEndDate`: required, after `startDate`.

**Service logic (step by step):**
1. Find apprentice user. Verify `status: 'ACTIVE'` and `isActive: true`.
2. Check no existing EP with status outside `['COMPLETED', 'ARCHIVED']` → `409 'You already have an active productive stage'`.
3. Verify enrollment eligibility:
   - Calculate deadline from `enrollmentExpiryDate` using `isPreNov2024` flag and SystemConfig values.
   - If current date is past deadline → `400 'Your enrollment has expired. You are not eligible to register a productive stage'`.
4. Find company by `companyId`. Not found → `404 'Company not found'`.
5. Build `companySnapshot` by merging company data (`taxId`, `name`, `address`) with body's `companySnapshot`.
6. Create `ProductiveStage` with `status: 'PENDING_REGISTRATION'`, `registrationDate: now`.
7. Send notification to ADMIN: type `EP_REGISTRATION_REMINDER` with apprentice data.
8. Record in `AuditLog`: `action: 'EP_REGISTERED'`.
9. Return created productive stage.

---

### GET `/api/productive-stages`
**Auth:** JWT — `ADMIN` or `INSTRUCTOR`

**Query params (ADMIN):**
- `status`: filter by EP status
- `modality`: filter by modality
- `apprenticeId`: filter by apprentice
- `instructorId`: filter by any instructor field
- `search`: partial match on apprentice name or enrollment number
- `page`, `limit`

**Query params (INSTRUCTOR):**
- Same filters, but query is automatically scoped to:
  ```javascript
  { $or: [
    { followupInstructor: req.user.id },
    { technicalInstructor: req.user.id },
    { projectInstructor: req.user.id }
  ]}
  ```
- Instructor never sees EPs they are not assigned to.

**Response includes** populated: `apprentice` (fullName, enrollmentNumber, email), `company` (name, taxId), instructor names.

---

### GET `/api/productive-stages/my`
**Auth:** JWT — `APPRENTICE` only  
**Description:** Returns the apprentice's own active EP + historical EPs.

**Logic:**
```javascript
ProductiveStage.find({ apprentice: req.user.id, isActive: true })
  .sort({ isHistorical: 1, createdAt: -1 })
  .populate('company', 'name taxId address')
  .populate('followupInstructor', 'fullName email phone')
  .populate('technicalInstructor', 'fullName email phone')
  .populate('projectInstructor', 'fullName email phone')
```

---

### GET `/api/productive-stages/:id`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR` (only if assigned), `APPRENTICE` (only their own)

**Service logic:**
1. Find EP by `_id`.
2. Role-based access check:
   - `APPRENTICE`: verify `ep.apprentice.toString() === req.user.id`.
   - `INSTRUCTOR`: verify `req.user.id` is in `[followupInstructor, technicalInstructor, projectInstructor]`.
   - `ADMIN`: no restriction.
3. If unauthorized → `403`.
4. Return with full populate: apprentice, company, all instructors.

---

### PATCH `/api/productive-stages/:id/approve`
**Auth:** JWT — `ADMIN` only  
**Description:** Admin approves the EP. Reads config to set `maxBitacoras` and `requiredTrackings`. Creates Google Drive folder for the apprentice.

**Body:**
```json
{
  "startDate": "2025-10-01",
  "estimatedEndDate": "2026-04-01"
}
```

**Service logic (step by step):**
1. Find EP. Verify `status === 'PENDING_APPROVAL'` → else `400 'EP is not pending approval'`.
2. Read from SystemConfig based on apprentice's `trainingLevel`:
   - `maxBitacoras` ← `MAX_LOGBOOKS_TECHNICIAN` or `MAX_LOGBOOKS_TECHNOLOGIST`
   - `requiredTrackings` ← `REQUIRED_TRACKINGS_TECHNICIAN` or `REQUIRED_TRACKINGS_TECHNOLOGIST`
3. Create Google Drive folder for apprentice inside instructor's folder: `googleDriveService.createApprenticeFolder(ep)` → save `driveFolderId`, `driveFolderUrl`.
4. Update EP: `status = 'ACTIVE'`, `approvalDate = now`, `maxBitacoras`, `requiredTrackings`, `startDate`, `estimatedEndDate`.
5. Send notification to apprentice: type `EP_APPROVED`.
6. Record in `AuditLog`: `action: 'EP_APPROVED'`.
7. Return updated EP.

---

### PATCH `/api/productive-stages/:id/reject`
**Auth:** JWT — `ADMIN` only  
**Description:** Admin rejects the EP registration with a reason. Apprentice must re-register.

**Body:**
```json
{ "reason": "Company information is incomplete. Please verify the NIT and supervisor data." }
```

**Validations:** `reason` required, min 10 chars.

**Service logic:**
1. Verify `status === 'PENDING_APPROVAL'`.
2. Add comment to `ep.comments` with the rejection reason and author.
3. Set `status = 'PENDING_REGISTRATION'`.
4. Send notification to apprentice: type `EP_REJECTED` with reason.
5. Record in `AuditLog`: `action: 'EP_REJECTED'`.

---

### PATCH `/api/productive-stages/:id/assign-instructors`
**Auth:** JWT — `ADMIN` only  
**Description:** Assign instructors to an ACTIVE EP. Validates required instructors by modality.

**Body:**
```json
{
  "followupInstructorId": "...",
  "technicalInstructorId": "...",
  "projectInstructorId": "..."
}
```

**Service logic (step by step):**
1. Find EP. Verify `status === 'ACTIVE'`.
2. Determine required instructors by modality:
   - `APPRENTICESHIP_CONTRACT | LABOR_LINK | INTERNSHIP` → only `followupInstructorId` required.
   - `INDIVIDUAL_PRODUCTIVE_PROJECT` → `followupInstructorId` + `technicalInstructorId` required.
   - `GROUP_PRODUCTIVE_PROJECT` → all three required.
3. Validate each provided instructor:
   - Exists in DB, `role: 'INSTRUCTOR'`, `status: 'ACTIVE'`, `isActive: true`.
   - `instructorType` matches assignment: `followupInstructor` must be type `FOLLOWUP`, `technicalInstructor` must be `TECHNICAL`, `projectInstructor` must be `PROJECT`.
4. If any validation fails → `400` with specific message.
5. Update EP with instructor IDs.
6. Send notification + email to each assigned instructor: type `APPRENTICE_ASSIGNED` with apprentice data, modality, company.
7. Send notification to apprentice: type `EP_APPROVED` update with instructor contact info.
8. Record in `AuditLog`: `action: 'EP_INSTRUCTOR_ASSIGNED'`.

---

### PATCH `/api/productive-stages/:id/complete`
**Auth:** JWT — `ADMIN` only  
**Description:** Mark EP as COMPLETED. Requires confirmation — all requirements must be verified first.

**Service logic (step by step):**
1. Find EP. Verify `status === 'CERTIFICATION'`.
2. **Completeness check** (all must pass):
   - `completedBitacoras >= maxBitacoras`
   - `completedTrackings >= requiredTrackings`
   - All `Document` records for this EP have `status: 'APPROVED'`
   - No pending `Novelty` records (`status !== 'RESOLVED'`)
3. If any check fails → `400` with detail of which requirement is not met:
   ```json
   {
     "success": false,
     "message": "EP cannot be completed. Requirements not met.",
     "errors": {
       "logbooks": "8 of 13 completed",
       "trackings": "All completed",
       "documents": "1 document pending approval",
       "novelties": "1 unresolved novelty"
     }
   }
   ```
4. Set `status = 'COMPLETED'`, `completionDate = now`.
5. Mark current EP as `isHistorical = false` (it stays as the completed record).
6. Record in `AuditLog`: `action: 'EP_COMPLETED'`.

---

### PATCH `/api/productive-stages/:id/archive`
**Auth:** JWT — `ADMIN` only  
**Description:** Archive a COMPLETED EP. Used for long-term historical management.

**Service logic:**
1. Verify `status === 'COMPLETED'`.
2. Set `status = 'ARCHIVED'`, `isHistorical = true`.
3. Record in `AuditLog`: `action: 'EP_ARCHIVED'`.

---

### POST `/api/productive-stages/:id/comments`
**Auth:** JWT — `ADMIN` or `APPRENTICE` (only their own EP)  
**Description:** Add a comment to the EP thread (used for rejection feedback, questions, observations).

**Body:**
```json
{ "text": "I have updated the company information as requested." }
```

**Validations:** `text` required, min 5 chars, max 1000 chars.

**Service logic:**
1. Verify access (admin → any; apprentice → only their own).
2. Push `{ text, author: req.user.id, createdAt: now }` to `ep.comments`.
3. If author is APPRENTICE → notify all assigned instructors and admin.
4. If author is ADMIN → notify apprentice.

---

### GET `/api/productive-stages/:id/eligibility`
**Auth:** JWT — `ADMIN`  
**Description:** Check if an apprentice is eligible to start their EP (used before enabling the apprentice in the system).

**Service logic:**
1. Find apprentice by `id` (query param `?apprenticeId=...`).
2. Check:
   - `enrollmentExpiryDate` exists.
   - Deadline not yet passed (based on `isPreNov2024` and SystemConfig).
   - No active non-completed EP exists.
3. Return eligibility result with deadline date calculated.

**Response:**
```json
{
  "success": true,
  "data": {
    "eligible": true,
    "enrollmentExpiryDate": "2026-03-15",
    "registrationDeadline": "2026-09-15",
    "daysRemaining": 180,
    "reason": null
  }
}
```

---

## `dateHelper.util.js`

```javascript
// Calculate EP registration deadline from enrollment data
const calculateEpDeadline = (enrollmentExpiryDate, isPreNov2024, monthsNew, yearsOld) => {
  const base = new Date(enrollmentExpiryDate);
  if (isPreNov2024) {
    base.setFullYear(base.getFullYear() + yearsOld);
  } else {
    base.setMonth(base.getMonth() + monthsNew);
  }
  return base;
};

// Returns number of days between now and a future date
const daysUntil = (targetDate) => {
  const diff = new Date(targetDate) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// Returns alert level based on days remaining
const getExpiryAlertLevel = (daysRemaining, redDays, orangeDays, yellowDays) => {
  if (daysRemaining <= redDays) return 'RED';
  if (daysRemaining <= orangeDays) return 'ORANGE';
  if (daysRemaining <= yellowDays) return 'YELLOW';
  return null;
};

module.exports = { calculateEpDeadline, daysUntil, getExpiryAlertLevel };
```

---

## Auto-transition logic (called from Bitacora and Tracking services)

These functions live in `productiveStages.service.js` and are called by other services after updating progress:

```javascript
// Called by bitacoraService.approve() and trackingService.markExecuted()
const checkAndAdvanceStatus = async (productiveStageId) => {
  const ep = await ProductiveStage.findById(productiveStageId);

  // ACTIVE → IN_FOLLOWUP: triggered on first completed tracking
  if (ep.status === 'ACTIVE' && ep.completedTrackings >= 1) {
    ep.status = 'IN_FOLLOWUP';
    await ep.save();
  }

  // IN_FOLLOWUP → CERTIFICATION: all logbooks + all trackings done
  if (
    ep.status === 'IN_FOLLOWUP' &&
    ep.completedBitacoras >= ep.maxBitacoras &&
    ep.completedTrackings >= ep.requiredTrackings
  ) {
    ep.status = 'CERTIFICATION';
    await ep.save();
    // Notify admin and apprentice
    await notificationService.send({
      type: 'EP_APPROVED',  // reuse — or create specific type
      recipients: [ep.apprentice],
      title: 'Ready for certification',
      message: 'All logbooks and trackings completed. Upload your certification documents.'
    });
  }
};
```

---

## Minimum required tests — `tests/productiveStages.test.js`

```javascript
describe('POST /api/productive-stages', () => {
  test('✅ apprentice registers EP successfully')
  test('❌ apprentice already has active EP → 409')
  test('❌ enrollment deadline passed → 400')
  test('❌ invalid companyId → 404')
  test('❌ ADMIN tries to register → 403')
  test('❌ INSTRUCTOR tries to register → 403')
});

describe('PATCH /api/productive-stages/:id/approve', () => {
  test('✅ Admin approves EP, maxBitacoras and requiredTrackings set from config')
  test('✅ Google Drive folder created (mocked)')
  test('✅ Notification sent to apprentice')
  test('❌ EP not in PENDING_APPROVAL → 400')
  test('❌ INSTRUCTOR tries to approve → 403')
});

describe('PATCH /api/productive-stages/:id/assign-instructors', () => {
  test('✅ INTERNSHIP assigns only followupInstructor')
  test('✅ GROUP_PRODUCTIVE_PROJECT assigns all 3 instructors')
  test('❌ Missing required instructor for modality → 400')
  test('❌ Instructor is INACTIVE → 400')
  test('❌ Wrong instructorType for role → 400')
});

describe('PATCH /api/productive-stages/:id/complete', () => {
  test('✅ All requirements met → status COMPLETED')
  test('❌ Incomplete logbooks → 400 with detail')
  test('❌ Pending document → 400 with detail')
  test('❌ Unresolved novelty → 400 with detail')
  test('❌ EP not in CERTIFICATION → 400')
});

describe('Access control', () => {
  test('✅ APPRENTICE sees only their own EP')
  test('✅ INSTRUCTOR sees only their assigned EPs')
  test('❌ INSTRUCTOR accessing someone else EP → 403')
  test('❌ APPRENTICE accessing someone else EP → 403')
});

describe('Status transitions', () => {
  test('✅ checkAndAdvanceStatus: ACTIVE → IN_FOLLOWUP on first tracking')
  test('✅ checkAndAdvanceStatus: IN_FOLLOWUP → CERTIFICATION when all done')
  test('❌ Invalid transition blocked')
});
```

---

## Completion criteria

- [ ] Only one active EP per apprentice enforced.
- [ ] Enrollment eligibility calculated from SystemConfig values and `isPreNov2024`.
- [ ] Instructor assignment validates type match by modality.
- [ ] `maxBitacoras` and `requiredTrackings` set from SystemConfig on approval.
- [ ] `companySnapshot` denormalized at registration time — not a live reference.
- [ ] Auto-transition `ACTIVE → IN_FOLLOWUP → CERTIFICATION` works via `checkAndAdvanceStatus`.
- [ ] Completeness check blocks `COMPLETED` if any requirement unmet.
- [ ] Google Drive folder created on approval.
- [ ] Role-based access control enforced on every endpoint.
- [ ] Notifications sent at every key lifecycle event.
- [ ] AuditLog on all critical actions.
- [ ] All tests pass.