 # SPEC: Documents Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Depends on: Auth, SystemConfig, Users, ProductiveStages, Hours**

---

## Business context

Documents are the certification files submitted by the apprentice at the end of their productive stage. The Admin reviews them and approves or rejects with observations. When the Admin uploads the signed certification PDF on behalf of the process, the instructor receives hours via `hours.service.addHours()`. Once all documents are approved, the system checks if the EP can advance to `COMPLETED`.

**Document types for REPFORA:**
| Type key | Description |
|----------|-------------|
| `EP_CERTIFICATE` | Main EP completion certificate |
| `PERFORMANCE_EVALUATION` | Employer's performance evaluation |
| `COMMITMENT_LETTER` | Signed commitment letter |
| `OTHER` | Any additional document required |

Documents are **never physically deleted** — only soft-deleted by ADMIN with a reason. Deletion requires a separate request flow if the document is already APPROVED.

---

## Files to create

```
src/models/Document.model.js
src/controllers/documents.controller.js
src/services/documents.service.js
src/routes/documents.routes.js
```

---

## Schema Mongoose — `src/models/Document.model.js`

> Full reference in DATA_MODEL.md — Section 7.

```javascript
const { DOCUMENT_STATUSES } = require('../utils/enums');

const DOCUMENT_TYPES = ['EP_CERTIFICATE', 'PERFORMANCE_EVALUATION', 'COMMITMENT_LETTER', 'OTHER'];

const DocumentSchema = new Schema({
  productiveStage:    { type: Schema.Types.ObjectId, ref: 'ProductiveStage', required: true },
  apprentice:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedBy:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy:         { type: Schema.Types.ObjectId, ref: 'User', default: null },

  documentType:       { type: String, enum: DOCUMENT_TYPES, required: true },
  fileName:           { type: String, required: true },
  driveFileId:        { type: String, required: true },
  driveFileUrl:       { type: String, required: true },
  uploadedAt:         { type: Date, default: Date.now },

  status:             { type: String, enum: DOCUMENT_STATUSES, default: 'SUBMITTED' },
  reviewedAt:         { type: Date, default: null },
  comments: [{
    text:             { type: String, required: true },
    author:           { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt:        { type: Date, default: Date.now }
  }],

  deletionRequested:  { type: Boolean, default: false },
  deletionReason:     { type: String, default: null },
  deletedBy:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt:          { type: Date, default: null },

  isActive:           { type: Boolean, default: true }
}, { timestamps: true });

DocumentSchema.index({ productiveStage: 1, documentType: 1 });
DocumentSchema.index({ apprentice: 1, status: 1 });
DocumentSchema.index({ status: 1 });
```

> Add `DOCUMENT_TYPES` to `src/utils/enums.js`.

---

## Endpoints

### POST `/api/documents`
**Auth:** JWT — `APPRENTICE` only  
**Content-Type:** `multipart/form-data`  
**Fields:** `file` (PDF), `productiveStageId`, `documentType`

**Validations:**
- `productiveStageId`: required, valid ObjectId.
- `documentType`: required, enum `DOCUMENT_TYPES`.
- `file`: required, PDF only, max 10MB.

**Service logic (step by step):**
1. Find EP. Verify `apprentice === req.user.id` → else `403`.
2. Verify EP `status === 'CERTIFICATION'` → else `400 'Documents can only be submitted when your EP is in certification stage'`.
3. Check if a non-rejected document of the same `documentType` already exists for this EP → `409 'A document of this type already exists. If rejected, you can resubmit it'`.
4. Upload PDF to Google Drive in EP folder under a `certificacion/` subfolder.
5. Create document with `status: 'SUBMITTED'`, `uploadedBy: req.user.id`, `uploadedAt: now`.
6. Send notification to ADMIN: type `DOCUMENTS_REMINDER` — `'New document submitted: ${documentType} by ${apprentice.fullName}'`.
7. Record in `AuditLog`: `action: 'DOCUMENT_SUBMITTED'`.
8. Return created document.

---

### GET `/api/documents`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR` (assigned), `APPRENTICE` (own)

**Query params:**
- `productiveStageId`: required for APPRENTICE and INSTRUCTOR
- `status`: filter by status
- `documentType`: filter by type

**Access control:**
- `APPRENTICE`: `apprentice === req.user.id`.
- `INSTRUCTOR`: verify EP is assigned to them.
- `ADMIN`: no restriction.

**Response:** list of documents with `driveFileUrl` for direct viewing.

---

### GET `/api/documents/:id`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR` (assigned EP), `APPRENTICE` (own)

**Logic:** Find document, apply role access check, return with populated `uploadedBy`, `reviewedBy`, `comments.author`.

---

### PATCH `/api/documents/:id/approve`
**Auth:** JWT — `ADMIN` only  
**Description:** Approve a document. If it's the last pending document for the EP and all required ones are present, check if EP can advance.

**Service logic (step by step):**
1. Find document. Verify `status === 'SUBMITTED' || status === 'IN_VALIDATION'` → else `400`.
2. Update: `status = 'APPROVED'`, `reviewedAt = now`, `reviewedBy = req.user.id`.
3. **Check if all required document types are approved for this EP:**
   ```javascript
   const required = ['EP_CERTIFICATE', 'PERFORMANCE_EVALUATION', 'COMMITMENT_LETTER'];
   const approved = await Document.find({
     productiveStage: doc.productiveStage,
     documentType: { $in: required },
     status: 'APPROVED',
     isActive: true
   });
   const allApproved = approved.length === required.length;
   ```
4. If `allApproved`:
   - Add certification hours to instructor's `HourRecord`:
     ```javascript
     const hours = await getConfig('HOURS_PER_CERTIFICATION');
     await hoursService.addHours({
       instructorId: ep.followupInstructor,
       month: now.getMonth() + 1,
       year: now.getFullYear(),
       field: 'certificationHours',
       amount: hours
     });
     ```
   - Notify apprentice: type `DOCUMENTS_APPROVED`.
   - Notify admin panel: EP ready for final completion.
5. Send notification to apprentice: type `DOCUMENTS_APPROVED` for this specific document.
6. Record in `AuditLog`: `action: 'DOCUMENT_APPROVED'`.
7. Return updated document.

---

### PATCH `/api/documents/:id/reject`
**Auth:** JWT — `ADMIN` only  
**Description:** Reject a document with specific observations.

**Body:**
```json
{ "comment": "The certificate does not have the company stamp. Please resubmit with all required signatures." }
```

**Validations:** `comment` required, min 10 chars.

**Service logic:**
1. Find document. Verify `status === 'SUBMITTED' || status === 'IN_VALIDATION'`.
2. Update: `status = 'REJECTED'`, `reviewedAt = now`, `reviewedBy = req.user.id`.
3. Push to `comments`: `{ text: comment, author: req.user.id, createdAt: now }`.
4. Notify apprentice: type `DOCUMENTS_REJECTED` with comment.
5. Also notify assigned instructor (for awareness).
6. Record in `AuditLog`: `action: 'DOCUMENT_REJECTED'`.

---

### PATCH `/api/documents/:id/resubmit`
**Auth:** JWT — `APPRENTICE` only  
**Content-Type:** `multipart/form-data`  
**Field:** `file` (PDF)

**Service logic:**
1. Find document. Verify `apprentice === req.user.id` → else `403`.
2. Verify `status === 'REJECTED'` → else `400 'Only rejected documents can be resubmitted'`.
3. Upload new PDF to Drive (append `_v2`, `_v3` suffix to filename).
4. Update: `fileName`, `driveFileId`, `driveFileUrl`, `uploadedAt = now`, `status = 'SUBMITTED'`.
5. Notify admin: type `DOCUMENTS_REMINDER`.
6. Return updated document.

---

### PATCH `/api/documents/:id/request-deletion`
**Auth:** JWT — `INSTRUCTOR` only  
**Description:** Instructor requests deletion of an approved document. Requires admin authorization.

**Body:**
```json
{ "reason": "Document uploaded to wrong productive stage by mistake." }
```

**Validations:** `reason` required, min 20 chars.

**Service logic:**
1. Find document. Verify document belongs to an EP where instructor is assigned.
2. Verify `status === 'APPROVED'` → else `400 'Only approved documents require a deletion request'`.
3. Verify `deletionRequested === false` → else `400 'Deletion already requested'`.
4. Set `deletionRequested = true`, `deletionReason = reason`.
5. Notify admin: type `NEW_CRITICAL_NOVELTY` (reuse) with document info and reason.
6. Return updated document.

---

### DELETE `/api/documents/:id`
**Auth:** JWT — `ADMIN` only  
**Description:** Soft-delete a document. Can delete directly if `SUBMITTED` or `REJECTED`. If `APPROVED`, requires `deletionRequested === true`.

**Service logic:**
1. Find document. Not found or `!isActive` → `404`.
2. If `status === 'APPROVED'` and `!deletionRequested` → `403 'Approved documents require a deletion request first'`.
3. Set `isActive = false`, `deletedBy = req.user.id`, `deletedAt = now`.
4. Record in `AuditLog`: `action: 'DOCUMENT_DELETED'`, `details: { documentType, fileName, reason: deletionReason }`.

---

### GET `/api/documents/ep/:productiveStageId/status`
**Auth:** JWT — `ADMIN`, `INSTRUCTOR` (assigned), `APPRENTICE` (own)  
**Description:** Overview of all documents for an EP — which are submitted, approved, rejected, and which required ones are still missing.

**Response:**
```json
{
  "success": true,
  "data": {
    "required": ["EP_CERTIFICATE", "PERFORMANCE_EVALUATION", "COMMITMENT_LETTER"],
    "submitted": [
      { "documentType": "EP_CERTIFICATE", "status": "APPROVED", "driveFileUrl": "..." }
    ],
    "missing": ["PERFORMANCE_EVALUATION", "COMMITMENT_LETTER"],
    "allRequiredApproved": false
  }
}
```

---

## Minimum required tests — `tests/documents.test.js`

```javascript
describe('POST /api/documents', () => {
  test('✅ apprentice submits document for EP in CERTIFICATION')
  test('✅ file uploaded to Drive subfolder (mocked)')
  test('✅ admin notified')
  test('❌ EP not in CERTIFICATION → 400')
  test('❌ duplicate documentType (non-rejected) → 409')
  test('❌ INSTRUCTOR tries to submit → 403')
  test('❌ non-PDF file → 400')
});

describe('PATCH /api/documents/:id/approve', () => {
  test('✅ status → APPROVED, reviewedBy set')
  test('✅ all required docs approved → certificationHours added to HourRecord')
  test('✅ apprentice notified')
  test('❌ already approved → 400')
  test('❌ INSTRUCTOR tries to approve → 403')
});

describe('PATCH /api/documents/:id/reject', () => {
  test('✅ status → REJECTED, comment stored')
  test('✅ apprentice and instructor notified')
  test('❌ missing comment → 400')
});

describe('PATCH /api/documents/:id/resubmit', () => {
  test('✅ rejected document resubmitted with new file')
  test('❌ non-rejected document → 400')
  test('❌ wrong apprentice → 403')
});

describe('DELETE /api/documents/:id', () => {
  test('✅ admin deletes SUBMITTED document directly')
  test('✅ admin deletes APPROVED document with deletionRequested=true')
  test('❌ APPROVED without deletionRequested → 403')
  test('✅ AuditLog recorded with reason')
});

describe('GET /api/documents/ep/:productiveStageId/status', () => {
  test('✅ correctly identifies missing required document types')
  test('✅ allRequiredApproved: true when all 3 required types approved')
  test('❌ instructor from unassigned EP → 403')
});
```

---

## Completion criteria

- [ ] EP must be in `CERTIFICATION` status to submit documents.
- [ ] Duplicate `documentType` blocked unless previous is `REJECTED`.
- [ ] All 3 required document types approved → `certificationHours` added to instructor's `HourRecord`.
- [ ] Approved documents blocked from direct deletion — require deletion request flow.
- [ ] `/ep/:id/status` correctly reports missing required document types.
- [ ] Role-based access enforced on every endpoint.
- [ ] Notifications sent to correct recipients at each step.
- [ ] AuditLog on submit, approve, reject, delete.
- [ ] All tests pass.