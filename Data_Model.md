# DATA_MODEL.md — Complete Data Model
> REPFORA E.P. — Single source of truth for all Mongoose schemas
> **Any new field must be registered here first.**
> **If a spec conflicts with this file, this file wins.**

---

## Collection index

| Collection | Model | Description |
|------------|-------|-------------|
| `users` | `User` | Admins, instructors and apprentices |
| `companies` | `Company` | Companies where apprentices do their productive stage |
| `productive_stages` | `ProductiveStage` | Each apprentice's productive stage |
| `bitacoras` | `Bitacora` | Fortnightly logbooks submitted by apprentice |
| `trackings` | `Tracking` | Instructor follow-up sessions |
| `hour_records` | `HourRecord` | Monthly hour accumulation per instructor |
| `documents` | `Document` | Certification documents submitted by apprentice |
| `notifications` | `Notification` | In-platform notifications |
| `audit_logs` | `AuditLog` | Critical action traceability |
| `system_configs` | `SystemConfig` | Configurable system parameters |
| `novelties` | `Novelty` | Critical incidents reported by instructors |

---

## Global enums — `src/utils/enums.js`

> Create this file. Every model imports enums from here — never redefine them inline.

```javascript
const ROLES = ['ADMIN', 'INSTRUCTOR', 'APPRENTICE'];

const INSTRUCTOR_STATUSES = ['ACTIVE', 'INACTIVE', 'CONTRACT_ENDED'];

const INSTRUCTOR_TYPES = ['FOLLOWUP', 'TECHNICAL', 'PROJECT'];

const TRAINING_LEVELS = ['TECHNICIAN', 'TECHNOLOGIST'];

const EP_MODALITIES = [
  'APPRENTICESHIP_CONTRACT',
  'LABOR_LINK',
  'INTERNSHIP',
  'INDIVIDUAL_PRODUCTIVE_PROJECT',
  'GROUP_PRODUCTIVE_PROJECT'
];

const EP_STATUSES = [
  'PENDING_REGISTRATION',  // apprentice enabled but has not registered EP yet
  'PENDING_APPROVAL',      // apprentice registered, waiting for admin approval
  'ACTIVE',                // admin approved, instructors assigned
  'IN_FOLLOWUP',           // at least 1 tracking completed
  'CERTIFICATION',         // certification documents in progress
  'COMPLETED',             // admin marked as completed
  'ARCHIVED'               // historical process archived
];

const BITACORA_STATUSES = [
  'PENDING',       // submitted by apprentice, awaiting review
  'IN_REVIEW',     // instructor opened it
  'APPROVED',      // instructor approved
  'REJECTED'       // instructor rejected with comments
];

const TRACKING_STATUSES = [
  'SCHEDULED',   // date set but not yet done
  'EXECUTED',    // tracking done, pending payment
  'PAID'         // hours discounted / paid
];

const TRACKING_TYPES = [
  'IN_PERSON',
  'VIRTUAL',
  'EXTRAORDINARY'
];

const DOCUMENT_STATUSES = [
  'SUBMITTED',      // apprentice uploaded, awaiting review
  'IN_VALIDATION',  // admin reviewing
  'APPROVED',       // admin approved
  'REJECTED'        // admin rejected with comments
];

const NOVELTY_TYPES = [
  'DESERTION',
  'DISCIPLINARY_ISSUE',
  'COMPANY_CONDITIONS_CHANGE',
  'OTHER'
];

const NOVELTY_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'RESOLVED'
];

const NOTIFICATION_TYPES = [
  // Apprentice
  'SYSTEM_WELCOME',
  'EP_REGISTRATION_REMINDER',
  'ENROLLMENT_EXPIRY_ALERT',
  'EP_APPROVED',
  'EP_REJECTED',
  'BITACORA_APPROVED',
  'BITACORA_REJECTED',
  'BITACORA_REMINDER',
  'TRACKING_REMINDER',
  'DOCUMENTS_APPROVED',
  'DOCUMENTS_REJECTED',
  'DOCUMENTS_REMINDER',
  // Instructor
  'APPRENTICE_ASSIGNED',
  'APPRENTICE_REASSIGNED',
  'BITACORA_PENDING_REVIEW',
  'EXTRAORDINARY_TRACKING_APPROVED',
  'HOURS_LIMIT_ALERT',
  'HOURS_OVERLOAD',
  'TRACKING_DEADLINE_APPROACHING',
  'ADMIN_COMMENT_ON_BITACORA',
  // Admin
  'NEW_CRITICAL_NOVELTY',
  'INSTRUCTOR_OVERDUE_REVIEW',
  'APPRENTICE_MISSING_BITACORA',
];

const AUDIT_ACTIONS = [
  'LOGIN',
  'PASSWORD_CHANGED_FIRST_LOGIN',
  'PASSWORD_RESET',
  'PASSWORD_CHANGED',
  'INSTRUCTOR_CREATED',
  'INSTRUCTOR_UPDATED',
  'INSTRUCTOR_STATUS_CHANGED',
  'INSTRUCTOR_REASSIGNMENT',
  'APPRENTICE_CREATED',
  'APPRENTICE_UPDATED',
  'APPRENTICE_IMPORTED',
  'COMPANY_CREATED',
  'COMPANY_UPDATED',
  'EP_REGISTERED',
  'EP_APPROVED',
  'EP_REJECTED',
  'EP_INSTRUCTOR_ASSIGNED',
  'EP_COMPLETED',
  'EP_ARCHIVED',
  'BITACORA_SUBMITTED',
  'BITACORA_APPROVED',
  'BITACORA_REJECTED',
  'TRACKING_CREATED',
  'TRACKING_STATUS_UPDATED',
  'TRACKING_EXTRAORDINARY_REQUESTED',
  'TRACKING_EXTRAORDINARY_APPROVED',
  'HOURS_MARKED_PAID',
  'DOCUMENT_SUBMITTED',
  'DOCUMENT_APPROVED',
  'DOCUMENT_REJECTED',
  'DOCUMENT_DELETED',
  'NOVELTY_CREATED',
  'NOVELTY_RESOLVED',
  'SYSTEM_CONFIG_UPDATED',
];

module.exports = {
  ROLES,
  INSTRUCTOR_STATUSES,
  INSTRUCTOR_TYPES,
  TRAINING_LEVELS,
  EP_MODALITIES,
  EP_STATUSES,
  BITACORA_STATUSES,
  TRACKING_STATUSES,
  TRACKING_TYPES,
  DOCUMENT_STATUSES,
  NOVELTY_TYPES,
  NOVELTY_STATUSES,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS
};
```

---

## 1. User — `src/models/User.model.js`

**Collection:** `users`

```javascript
{
  // === IDENTITY (all roles) ===
  nationalId:           String, required, unique, trim      // national ID / cédula
  fullName:             String, required, trim
  email:                String, required, unique, lowercase
  password:             String, required                    // bcrypt hash
  phone:                String, default: null
  role:                 enum ROLES, required

  // === SESSION CONTROL (all roles) ===
  status:               enum INSTRUCTOR_STATUSES, default: 'ACTIVE'
  firstLogin:           Boolean, default: true              // forces password change
  failedAttempts:       Number, default: 0
  lockedUntil:          Date, default: null                 // temporary login lock
  resetPasswordToken:   String, default: null               // stored as hash, not plain text
  resetPasswordExpires: Date, default: null

  // === INSTRUCTORS ONLY (null for other roles) ===
  instructorType:       enum INSTRUCTOR_TYPES, default: null
  knowledgeArea:        String, default: null
  accumulatedHours:     Number, default: 0                  // total historical hours
  pendingPaymentHours:  Number, default: 0                  // hours pending payment
  driveFolderId:        String, default: null               // Google Drive folder ID

  // === APPRENTICES ONLY (null for other roles) ===
  enrollmentNumber:     String, default: null               // SENA enrollment / ficha
  program:              String, default: null               // program name
  trainingLevel:        enum TRAINING_LEVELS, default: null
  trainingCenter:       String, default: null               // 'Virtual' | center name
  enrollmentExpiryDate: Date, default: null
  isPreNov2024:         Boolean, default: null              // true = 2yr deadline; false = 6mo

  // === SOFT DELETE ===
  isActive:             Boolean, default: true

  // === TIMESTAMPS ===
  createdAt, updatedAt                                      // { timestamps: true }
}
```

**Indexes:**
```javascript
{ nationalId: 1 }             // unique
{ email: 1 }                  // unique
{ role: 1, status: 1 }
{ role: 1, isActive: 1 }
{ enrollmentNumber: 1 }
```

**toJSON:** strip `password`, `resetPasswordToken`, `resetPasswordExpires`.

---

## 2. Company — `src/models/Company.model.js`

**Collection:** `companies`

```javascript
{
  // === COMPANY DATA ===
  taxId:                String, required, unique, trim      // NIT
  name:                 String, required, trim              // razón social
  address:              String, required
  phone:                String, required
  email:                String, required, lowercase
  city:                 String, default: null

  // === CONTACTS (immediate supervisor of apprentice) ===
  contacts: [{
    fullName:           String, required
    jobTitle:           String, required
    phone:              String
    email:              String, lowercase
    isPrimary:          Boolean, default: false
  }]

  // === METADATA ===
  importSource:         enum ['SGVA', 'MANUAL', 'FLAT_FILE'], default: 'MANUAL'
  isActive:             Boolean, default: true
  createdAt, updatedAt
}
```

**Indexes:**
```javascript
{ taxId: 1 }              // unique
{ name: 'text' }          // full-text search
{ isActive: 1 }
```

---

## 3. ProductiveStage — `src/models/ProductiveStage.model.js`

**Collection:** `productive_stages`
> Core model of the system. Each apprentice may have multiple historical EPs but only one non-COMPLETED/ARCHIVED at a time.

```javascript
{
  // === ACTORS ===
  apprentice:               ObjectId → User (role: APPRENTICE), required
  company:                  ObjectId → Company, default: null
  followupInstructor:       ObjectId → User (role: INSTRUCTOR), default: null
  technicalInstructor:      ObjectId → User (role: INSTRUCTOR), default: null  // projects only
  projectInstructor:        ObjectId → User (role: INSTRUCTOR), default: null  // group projects only

  // === EP DATA ===
  modality:                 enum EP_MODALITIES, required
  status:                   enum EP_STATUSES, default: 'PENDING_REGISTRATION'
  registrationDate:         Date, default: null     // when apprentice registered
  approvalDate:             Date, default: null     // when admin approved
  startDate:                Date, default: null     // actual start of EP
  estimatedEndDate:         Date, default: null
  completionDate:           Date, default: null     // when marked COMPLETED

  // === COMPANY DATA (denormalized from apprentice registration) ===
  companySnapshot: {
    companyName:            String
    taxId:                  String
    address:                String
    apprenticeJobTitle:     String                  // apprentice's role at the company
    supervisorName:         String
    supervisorPhone:        String
    supervisorEmail:        String
  }

  // === PROGRESS ===
  completedBitacoras:       Number, default: 0
  maxBitacoras:             Number, default: null   // populated from SystemConfig on approval
  completedTrackings:       Number, default: 0
  requiredTrackings:        Number, default: null   // populated from SystemConfig on approval

  // === GOOGLE DRIVE ===
  driveFolderId:            String, default: null
  driveFolderUrl:           String, default: null

  // === COMMENTS THREAD (admin <-> apprentice) ===
  comments: [{
    text:                   String, required
    author:                 ObjectId → User
    createdAt:              Date, default: Date.now
  }]

  // === FLAGS ===
  isHistorical:             Boolean, default: false  // previous EPs of same apprentice
  isActive:                 Boolean, default: true
  createdAt, updatedAt
}
```

**Indexes:**
```javascript
{ apprentice: 1, status: 1 }
{ apprentice: 1, isHistorical: 1 }
{ followupInstructor: 1, status: 1 }
{ technicalInstructor: 1 }
{ projectInstructor: 1 }
{ status: 1 }
{ modality: 1 }
{ company: 1 }
```

**Critical business rule:** Before creating a new EP for an apprentice, verify no existing EP with status outside `COMPLETED` or `ARCHIVED`. If one exists → `409`.

---

## 4. Bitacora — `src/models/Bitacora.model.js`

**Collection:** `bitacoras`

```javascript
{
  // === REFERENCES ===
  productiveStage:      ObjectId → ProductiveStage, required
  apprentice:           ObjectId → User (role: APPRENTICE), required  // denormalized
  instructor:           ObjectId → User (role: INSTRUCTOR), default: null  // reviewer

  // === LOGBOOK DATA ===
  logbookNumber:        Number, required              // 1, 2, 3... (order within EP)
  periodStart:          Date, required
  periodEnd:            Date, required
  isAdditional:         Boolean, default: false      // logbook outside the normal plan

  // === FILE ===
  fileName:             String, default: null
  driveFileId:          String, default: null
  driveFileUrl:         String, default: null
  submittedAt:          Date, default: null

  // === REVIEW ===
  status:               enum BITACORA_STATUSES, default: 'PENDING'
  reviewedAt:           Date, default: null
  reviewComments: [{
    text:               String, required
    createdAt:          Date, default: Date.now
    author:             ObjectId → User
  }]

  // === HOURS ===
  assignedHours:        Number, default: null        // read from SystemConfig on approval
  isPaid:               Boolean, default: false
  paidAt:               Date, default: null

  isActive:             Boolean, default: true
  createdAt, updatedAt
}
```

**Indexes:**
```javascript
{ productiveStage: 1, logbookNumber: 1 }
{ apprentice: 1, status: 1 }
{ instructor: 1, status: 1 }
{ status: 1, submittedAt: 1 }
```

---

## 5. Tracking — `src/models/Tracking.model.js`

**Collection:** `trackings`

```javascript
{
  // === REFERENCES ===
  productiveStage:      ObjectId → ProductiveStage, required
  apprentice:           ObjectId → User (role: APPRENTICE), required  // denormalized
  instructor:           ObjectId → User (role: INSTRUCTOR), required

  // === TRACKING DATA ===
  trackingNumber:       Number, required
  type:                 enum TRACKING_TYPES, required
  isExtraordinary:      Boolean, default: false
  extraordinaryReason:  String, default: null         // required if isExtraordinary = true
  approvedByAdmin:      Boolean, default: false
  approvedBy:           ObjectId → User, default: null

  // === DATES ===
  scheduledDate:        Date, required
  executedDate:         Date, default: null

  // === FILE (signed PDF) ===
  fileName:             String, default: null
  driveFileId:          String, default: null
  driveFileUrl:         String, default: null

  // === SIGNATURE VALIDATION ===
  signedByInstructor:   Boolean, default: false
  signedByApprentice:   Boolean, default: false
  signatureValidatedAt: Date, default: null

  // === STATUS AND HOURS ===
  status:               enum TRACKING_STATUSES, default: 'SCHEDULED'
  assignedHours:        Number, default: null         // read from SystemConfig on execution
  isPaid:               Boolean, default: false
  paidAt:               Date, default: null

  // === NOTES ===
  notes:                String, default: null

  isActive:             Boolean, default: true
  createdAt, updatedAt
}
```

**Indexes:**
```javascript
{ productiveStage: 1, trackingNumber: 1 }
{ instructor: 1, status: 1 }
{ apprentice: 1 }
{ isExtraordinary: 1, approvedByAdmin: 1 }
{ scheduledDate: 1 }
```

---

## 6. HourRecord — `src/models/HourRecord.model.js`

**Collection:** `hour_records`
> Monthly hour summary per instructor. Auto-generated/updated by Bitacora, Tracking and Document services whenever an activity is approved.

```javascript
{
  instructor:             ObjectId → User (role: INSTRUCTOR), required
  month:                  Number, required                // 1-12
  year:                   Number, required
  modality:               enum EP_MODALITIES, default: null

  // === HOUR BREAKDOWN ===
  bitacoraHours:          Number, default: 0
  trackingHours:          Number, default: 0
  certificationHours:     Number, default: 0
  extraordinaryHours:     Number, default: 0
  totalHours:             Number, default: 0

  // === EXCESS ===
  excessHours:            Number, default: 0
  carriedOverHours:       Number, default: 0

  // === PAYMENT ===
  paidHours:              Number, default: 0
  pendingPaymentHours:    Number, default: 0
  lastPaymentDate:        Date, default: null

  // === REPORT ===
  reportDriveId:          String, default: null
  reportDriveUrl:         String, default: null

  createdAt, updatedAt
}
```

**Indexes:**
```javascript
{ instructor: 1, year: 1, month: 1 }   // unique compound
{ instructor: 1, year: -1 }
```

---

## 7. Document — `src/models/Document.model.js`

**Collection:** `documents`

```javascript
{
  // === REFERENCES ===
  productiveStage:      ObjectId → ProductiveStage, required
  apprentice:           ObjectId → User (role: APPRENTICE), required  // denormalized
  uploadedBy:           ObjectId → User, required
  reviewedBy:           ObjectId → User, default: null

  // === DOCUMENT DATA ===
  documentType:         String, required
  fileName:             String, required
  driveFileId:          String, required
  driveFileUrl:         String, required
  uploadedAt:           Date, default: Date.now

  // === VALIDATION ===
  status:               enum DOCUMENT_STATUSES, default: 'SUBMITTED'
  reviewedAt:           Date, default: null
  comments: [{
    text:               String, required
    author:             ObjectId → User
    createdAt:          Date, default: Date.now
  }]

  // === CONTROLLED DELETION ===
  deletionRequested:    Boolean, default: false
  deletionReason:       String, default: null
  deletedBy:            ObjectId → User, default: null
  deletedAt:            Date, default: null

  isActive:             Boolean, default: true
  createdAt, updatedAt
}
```

**Indexes:**
```javascript
{ productiveStage: 1, documentType: 1 }
{ apprentice: 1, status: 1 }
{ status: 1 }
```

---

## 8. Notification — `src/models/Notification.model.js`

**Collection:** `notifications`

```javascript
{
  // === RECIPIENT ===
  recipient:            ObjectId → User, required
  type:                 enum NOTIFICATION_TYPES, required

  // === CONTENT ===
  title:                String, required
  message:              String, required
  isRead:               Boolean, default: false
  readAt:               Date, default: null

  // === CONTEXT ===
  metadata: {
    entity:             String
    entityId:           ObjectId
    url:                String
  }

  // === EMAIL ===
  emailSent:            Boolean, default: false
  emailSentAt:          Date, default: null
  emailError:           String, default: null

  createdAt, updatedAt
}
```

**Indexes:**
```javascript
{ recipient: 1, isRead: 1 }
{ recipient: 1, createdAt: -1 }
{ type: 1 }
```

---

## 9. AuditLog — `src/models/AuditLog.model.js`

**Collection:** `audit_logs`

```javascript
{
  action:               enum AUDIT_ACTIONS, required
  entity:               String, required
  entityId:             ObjectId, default: null
  performedBy:          ObjectId → User, required
  details:              Mixed, default: null
  ip:                   String, default: null

  createdAt                                          // createdAt only
}
```

**Indexes:**
```javascript
{ performedBy: 1, createdAt: -1 }
{ entity: 1, entityId: 1 }
{ action: 1 }
{ createdAt: -1 }
```

> **No updatedAt** — logs are never modified.
> **No soft-delete** — logs are never deleted.
> Use `{ timestamps: { createdAt: true, updatedAt: false } }`.

---

## 10. SystemConfig — `src/models/SystemConfig.model.js`

**Collection:** `system_configs`

```javascript
{
  key:                  String, required, unique, uppercase, trim
  value:                Mixed, required
  description:          String, required
  valueType:            enum ['NUMBER', 'STRING', 'BOOLEAN', 'JSON'], required
  updatedBy:            ObjectId → User, default: null

  updatedAt
}
```

**Index:** `{ key: 1 }` unique

---

## 11. Novelty — `src/models/Novelty.model.js`

**Collection:** `novelties`

```javascript
{
  // === REFERENCES ===
  productiveStage:      ObjectId → ProductiveStage, required
  apprentice:           ObjectId → User (role: APPRENTICE), required  // denormalized
  reportedBy:           ObjectId → User (role: INSTRUCTOR), required
  resolvedBy:           ObjectId → User (role: ADMIN), default: null

  // === NOVELTY DATA ===
  type:                 enum NOVELTY_TYPES, required
  description:          String, required, minLength: 50
  occurrenceDate:       Date, required

  // === ATTACHMENTS ===
  attachments: [{
    fileName:           String
    driveFileId:        String
    driveFileUrl:       String
    uploadedAt:         Date, default: Date.now
  }]

  // === ADMIN MANAGEMENT ===
  status:               enum NOVELTY_STATUSES, default: 'PENDING'
  actionsTaken:         String, default: null
  resolvedAt:           Date, default: null

  // === DRIVE (auto-generated PDF) ===
  pdfDriveId:           String, default: null
  pdfDriveUrl:          String, default: null

  isActive:             Boolean, default: true
  createdAt, updatedAt
}
```

**Indexes:**
```javascript
{ productiveStage: 1 }
{ apprentice: 1 }
{ reportedBy: 1, status: 1 }
{ status: 1, createdAt: -1 }
```

---

## Relationship diagram

```
SystemConfig (global parameters)
     │
     ▼
User ──────────────────────────────────────────┐
 ├─ ADMIN                                      │
 ├─ INSTRUCTOR ──────────────┐                 │
 └─ APPRENTICE ──────┐       │                 │
                     │       │                 │
                     ▼       ▼                 │
              ProductiveStage ◄──── Company    │
               │    │    │                     │
               │    │    └──► Novelty ─────────┤
               │    │                          │
               ▼    ▼                          │
           Bitacora  Tracking                  │
               │         │                     │
               └────┬────┘                     │
                    ▼                           │
              HourRecord (instructor)           │
                                                │
              Document ◄──────────────────────┘

              Notification → User (recipient)
              AuditLog    → User (performedBy)
```

---

## Integrity rules — cascade effects between models

| Action | Cascade effect |
|--------|----------------|
| Instructor → `CONTRACT_ENDED` | Trigger reassignment flow in ProductiveStage |
| ProductiveStage → `COMPLETED` | Verify completeness: bitacoras + trackings + documents all done |
| Bitacora → `APPROVED` | Increment `ProductiveStage.completedBitacoras` + add hours to HourRecord |
| Tracking → `EXECUTED` | Increment `ProductiveStage.completedTrackings` + add hours to HourRecord |
| Extraordinary Tracking | Requires `approvedByAdmin: true` before it can be executed |
| Document → `APPROVED` | Check if all docs approved → advance EP to `COMPLETED` if criteria met |
| User → `isActive: false` | Do NOT delete related EPs, bitacoras or trackings |

---

## Implementation notes

1. **Intentional denormalization:** `apprentice` and `instructor` in `Bitacora`, `Tracking`, `Document` and `Novelty` are denormalized from `ProductiveStage` to avoid double `populate` on frequent listing queries.

2. **Google Drive IDs:** Always store both `driveFileId` (programmatic operations) AND `driveFileUrl` (direct user access). They are separate fields.

3. **HourRecord:** Never created manually. Auto-generated by `Bitacora`, `Tracking` and `Document` services on activity approval.

4. **Notification:** Always created in DB (in-platform panel) AND email is attempted. If email fails, log error in `emailError` but keep web notification active.

5. **AuditLog:** Use `{ timestamps: { createdAt: true, updatedAt: false } }`.

6. **Text indexes:** `Company.name` has a `text` index for `$text` queries. For `User`, use regex on search queries — avoids index conflicts with combined filters.
