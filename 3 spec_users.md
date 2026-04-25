
# SPEC: Users Module (Instructors & Apprentices)
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Depends on: Auth, SystemConfig**

---

## Business context

Admin manages instructors and apprentices. Instructors have 3 possible types (FOLLOWUP, TECHNICAL, PROJECT) and 3 statuses (ACTIVE, INACTIVE, CONTRACT_ENDED). When an instructor moves to CONTRACT_ENDED, the system automatically triggers a reassignment flow for their apprentices. Apprentices are loaded in bulk from flat file (CSV/Excel from SOFÍA Plus) or individually. Enrollments are differentiated as pre/post November 2024, affecting the deadline to register their productive stage.

---

## Files to create

```
src/controllers/users.controller.js
src/services/users.service.js
src/routes/users.routes.js
src/utils/importParser.util.js     // CSV/XLSX parser for bulk import
```
this field it is finished

> `User.model.js` already created in Auth module.

---

## Endpoints — Instructors

### POST `/api/users/instructors`
**Auth:** JWT — `ADMIN` only  
**Description:** Create instructor individually. On creation, system automatically creates their Google Drive folder.

**Body:**
```json
{
  "nationalId": "1234567890",
  "fullName": "Carlos Pérez",
  "email": "cperez@sena.edu.co",
  "phone": "3001234567",
  "instructorType": "FOLLOWUP",
  "knowledgeArea": "Technology and Informatics"
}
```

**Validations (express-validator):**
- `nationalId`: required, digits only, 7–12 chars.
- `fullName`: required, 3–100 chars.
- `email`: required, valid email format.
- `instructorType`: required, enum `INSTRUCTOR_TYPES`.
- `knowledgeArea`: required.

**Service logic (step by step):**
1. Check no user exists with same `nationalId` → `409 'A user with this national ID already exists'`.
2. Check no user exists with same `email` → `409 'A user with this email already exists'`.
3. Generate temporary password: `Sena${nationalId.slice(-4)}*` (e.g. `Sena7890*`).
4. Hash password with bcrypt.
5. Create user with `role: 'INSTRUCTOR'`, `status: 'ACTIVE'`, `firstLogin: true`.
6. Call `googleDriveService.createInstructorFolder(instructor)` → save returned `driveFolderId` on user.
7. Send welcome email to instructor with temporary credentials.
8. Record in `AuditLog`: `action: 'INSTRUCTOR_CREATED'`.
9. Return created instructor (no password).

---

### GET `/api/users/instructors`
**Auth:** JWT — `ADMIN` only  
**Query params:**
- `status`: filter by `ACTIVE | INACTIVE | CONTRACT_ENDED`
- `instructorType`: filter by type
- `knowledgeArea`: partial match (case-insensitive regex)
- `search`: searches across `nationalId`, `fullName`, `email`, `phone`
- `page` (default: 1), `limit` (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "instructors": [...],
    "pagination": { "total": 45, "page": 1, "limit": 20, "pages": 3 }
  }
}
```

---

### GET `/api/users/instructors/:id`
**Auth:** JWT — `ADMIN` only  
**Logic:** Find by `_id`, verify `isActive: true`. Include virtual count of active apprentices assigned (`ProductiveStage.countDocuments({ followupInstructor: id, status: { $nin: ['COMPLETED', 'ARCHIVED'] } })`).

---

### PATCH `/api/users/instructors/:id`
**Auth:** JWT — `ADMIN` only  
**Description:** Update instructor data (`fullName`, `email`, `phone`, `instructorType`, `knowledgeArea`).  
**Does NOT allow** changing `status` from this endpoint — use the status endpoint for that.

---

### PATCH `/api/users/instructors/:id/status`
**Auth:** JWT — `ADMIN` only  
**Body:**
```json
{ "status": "INACTIVE", "reason": "Scheduled vacation" }
```

**Validations:**
- `status`: required, enum `INSTRUCTOR_STATUSES`.
- `reason`: required (for audit trail).

**Service logic (step by step):**
1. Find instructor by ID. Not found or `!isActive` → `404`.
2. If new status equals current → `400 'Instructor already has that status'`.
3. If new status is `CONTRACT_ENDED`:
   - Identify all apprentices with active productive stage assigned to this instructor.
   - Update instructor status.
   - Return `{ instructor, affectedApprentices: [{ id, fullName, enrollmentNumber, modality }] }` — admin will see the list and complete reassignment via another endpoint.
   - Send notification to admin with affected list.
4. Other status: update and notify.
5. Record in `AuditLog`: `action: 'INSTRUCTOR_STATUS_CHANGED'`, `details: { previousStatus, newStatus, reason }`.

---

### POST `/api/users/instructors/:id/reassign`
**Auth:** JWT — `ADMIN` only  
**Description:** Reassign apprentices from CONTRACT_ENDED instructor to a new instructor.  
**Body:**
```json
{
  "newInstructorId": "...",
  "productiveStageIds": ["...", "..."]
}
```

**Service logic:**
1. Verify original instructor has status `CONTRACT_ENDED`.
2. Verify new instructor exists and is `ACTIVE`.
3. For each `productiveStageId`:
   - Verify stage belongs to original instructor.
   - Update `followupInstructor = newInstructorId` (or `technicalInstructor` / `projectInstructor` as appropriate).
   - Move apprentice Google Drive folder to new instructor's folder.
   - Send notification + email to apprentice about the change.
   - Send notification + email to new instructor.
4. Record in `AuditLog`: `action: 'INSTRUCTOR_REASSIGNMENT'`.

---

## Endpoints — Apprentices

### POST `/api/users/apprentices`
**Auth:** JWT — `ADMIN` only

**Body:**
```json
{
  "nationalId": "1098765432",
  "fullName": "Ana Gómez",
  "email": "agomez@misena.edu.co",
  "phone": "3109876543",
  "enrollmentNumber": "2758649",
  "program": "Software Analysis and Development",
  "trainingLevel": "TECHNOLOGIST",
  "trainingCenter": "Virtual",
  "enrollmentExpiryDate": "2026-03-15",
  "isPreNov2024": false
}
```

**Service logic:**
1. Check uniqueness of `nationalId` and `email`.
2. Generate temporary password: `Sena${nationalId.slice(-4)}*`.
3. Create user with `role: 'APPRENTICE'`, `firstLogin: true`.
4. Send welcome email with access instructions and link to REPFORA.
5. Record in `AuditLog`: `action: 'APPRENTICE_CREATED'`.

---

### POST `/api/users/apprentices/import`
**Auth:** JWT — `ADMIN` only  
**Content-Type:** `multipart/form-data`  
**Field:** `file` (CSV or XLSX)

**Expected columns:**
`nationalId`, `fullName`, `email`, `phone`, `enrollmentNumber`, `program`, `trainingLevel`, `trainingCenter`, `enrollmentExpiryDate`, `isPreNov2024`

**Service logic:**
1. Parse file with `importParser.util.js` (auto-detects CSV or XLSX).
2. Validate each row: check required fields and formats.
3. Separate into `valid` and `invalid` (with error reason).
4. For valid rows: create user if `nationalId` does not yet exist (skip duplicates).
5. Return summary:
```json
{
  "imported": 45,
  "skipped": 3,
  "errors": [
    { "row": 12, "nationalId": "...", "reason": "Invalid email" }
  ]
}
```

---

### GET `/api/users/apprentices`
**Auth:** JWT — `ADMIN` only  
**Query params:**
- `enrollmentNumber`, `program`, `trainingLevel`, `trainingCenter`
- `search`: searches `nationalId`, `fullName`, `email`
- `hasProductiveStage` (boolean): filter by whether EP exists
- `page`, `limit`

---

### GET `/api/users/apprentices/:id`
**Auth:** JWT — `ADMIN` or the apprentice themselves (`req.user.id === id`)

---

### PATCH `/api/users/apprentices/:id`
**Auth:** JWT — `ADMIN` can edit everything. `APPRENTICE` can only edit `phone` and `email`.

**Service logic:**
- If role is `APPRENTICE`: extract only `{ phone, email }` from body (ignore the rest).
- If role is `ADMIN`: allow all fields except `nationalId` and `role`.
- If email changes: verify uniqueness.
- Record changes in `AuditLog`: `action: 'APPRENTICE_UPDATED'`.

---

### GET `/api/users/apprentices/:id/history`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR` (only if their assigned apprentice), or the apprentice themselves  
**Description:** Action history for the apprentice (AuditLog filtered by `entityId`).

---

## Minimum required tests — `tests/users.test.js`

```javascript
describe('POST /api/users/instructors', () => {
  test('✅ Admin creates instructor with temporary password and firstLogin=true')
  test('✅ Google Drive folder created (service mocked)')
  test('❌ duplicate nationalId → 409')
  test('❌ duplicate email → 409')
  test('❌ INSTRUCTOR tries to create another instructor → 403')
});

describe('PATCH /api/users/instructors/:id/status', () => {
  test('✅ status change to INACTIVE recorded in AuditLog')
  test('✅ CONTRACT_ENDED returns list of affected apprentices')
  test('❌ same status as current → 400')
  test('❌ non-existent instructor → 404')
});

describe('POST /api/users/instructors/:id/reassign', () => {
  test('✅ successful reassignment updates ProductiveStage and notifies')
  test('❌ new instructor is INACTIVE → 400')
  test('❌ productive stage does not belong to original instructor → 400')
});

describe('POST /api/users/apprentices/import', () => {
  test('✅ CSV import with 10 valid rows → 10 imported')
  test('✅ rows with invalid email reported in errors')
  test('✅ existing nationalId → skipped (no duplicate)')
  test('❌ non CSV/XLSX file → 400')
});

describe('PATCH /api/users/apprentices/:id (role APPRENTICE)', () => {
  test('✅ apprentice edits own phone and email')
  test('❌ apprentice tries to edit program → ignored silently')
  test('❌ apprentice tries to edit another user → 403')
});
```

---

## Completion criteria

- [ ] Instructor creation triggers Google Drive folder creation.
- [ ] Bulk import with per-row error report.
- [ ] CONTRACT_ENDED returns list of affected apprentices.
- [ ] Reassignment moves Google Drive folders.
- [ ] Notifications sent on assignment, reassignment and status change.
- [ ] Apprentice can only edit their own allowed fields.
- [ ] Instructor cannot see apprentices from other instructors.
- [ ] AuditLog on all critical actions.
- [ ] All tests pass.
3 spec_users.md
Mostrando 3 spec_users.md