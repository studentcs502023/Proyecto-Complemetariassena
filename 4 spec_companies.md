 # SPEC: Companies Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Depends on: Auth, SystemConfig**

---

## Business context

Companies are the organizations where apprentices carry out their productive stage. The Admin manages them — creating individually or importing in bulk from SGVA or flat files. Each company can have multiple contacts (immediate supervisors). Companies are never deleted — only deactivated (`isActive: false`). When an apprentice registers their EP, company data is denormalized into `ProductiveStage.companySnapshot` so historical records remain intact even if the company is later edited.

---

## Files to create

```
src/models/Company.model.js
src/controllers/companies.controller.js
src/services/companies.service.js
src/routes/companies.routes.js
```

---

## Schema Mongoose — `src/models/Company.model.js`

> Full reference in DATA_MODEL.md — Section 2.

```javascript
const CompanySchema = new Schema({
  // COMPANY DATA
  taxId:         { type: String, required: true, unique: true, trim: true },
  name:          { type: String, required: true, trim: true },
  address:       { type: String, required: true },
  phone:         { type: String, required: true },
  email:         { type: String, required: true, lowercase: true, trim: true },
  city:          { type: String, default: null },

  // CONTACTS
  contacts: [{
    fullName:    { type: String, required: true },
    jobTitle:    { type: String, required: true },
    phone:       { type: String, default: null },
    email:       { type: String, lowercase: true, default: null },
    isPrimary:   { type: Boolean, default: false }
  }],

  // METADATA
  importSource:  { type: String, enum: ['SGVA', 'MANUAL', 'FLAT_FILE'], default: 'MANUAL' },
  isActive:      { type: Boolean, default: true }
}, { timestamps: true });

CompanySchema.index({ taxId: 1 });           // unique
CompanySchema.index({ name: 'text' });       // full-text search
CompanySchema.index({ isActive: 1 });
```

**Business rule:** Only one contact per company can have `isPrimary: true`. Enforce this in the service — before setting a contact as primary, unset the previous primary.

---

## Endpoints

### POST `/api/companies`
**Auth:** JWT — `ADMIN` only  
**Description:** Create company individually.

**Body:**
```json
{
  "taxId": "900123456-1",
  "name": "Tech Solutions SAS",
  "address": "Calle 10 # 20-30, Bogotá",
  "phone": "6011234567",
  "email": "contacto@techsolutions.com",
  "city": "Bogotá",
  "contacts": [
    {
      "fullName": "María López",
      "jobTitle": "HR Manager",
      "phone": "3001234567",
      "email": "mlopez@techsolutions.com",
      "isPrimary": true
    }
  ]
}
```

**Validations (express-validator):**
- `taxId`: required, non-empty string.
- `name`: required, 2–200 chars.
- `email`: required, valid email.
- `phone`: required.
- `address`: required.
- `contacts`: optional array; if provided, each item must have `fullName` and `jobTitle`.
- Max one contact with `isPrimary: true`.

**Service logic:**
1. Check `taxId` not already in use → `409 'A company with this tax ID already exists'`.
2. If `contacts` has more than one `isPrimary: true` → `400 'Only one primary contact allowed'`.
3. Create and save company with `importSource: 'MANUAL'`.
4. Record in `AuditLog`: `action: 'COMPANY_CREATED'`.
5. Return created company.

---

### POST `/api/companies/import`
**Auth:** JWT — `ADMIN` only  
**Content-Type:** `multipart/form-data`  
**Field:** `file` (CSV or XLSX)  
**Description:** Bulk import from SGVA export or flat file.

**Expected columns:**
`taxId`, `name`, `address`, `phone`, `email`, `city`, `contactFullName`, `contactJobTitle`, `contactPhone`, `contactEmail`

**Service logic:**
1. Parse file with `importParser.util.js`.
2. Validate each row.
3. For valid rows: create company if `taxId` not yet exists. If exists → skip (do not overwrite).
4. Each imported row creates one company with one contact derived from `contactFullName` etc., marked as `isPrimary: true`.
5. Set `importSource` based on a query param `?source=SGVA|FLAT_FILE` (default `FLAT_FILE`).
6. Return import summary:
```json
{
  "imported": 30,
  "skipped": 5,
  "errors": [{ "row": 3, "taxId": "...", "reason": "Invalid email" }]
}
```

---

### GET `/api/companies`
**Auth:** JWT — `ADMIN` or `INSTRUCTOR`  
**Description:** Instructors can search companies to view contact info for their assigned apprentices.

**Query params:**
- `search`: full-text on `name` OR partial match on `taxId`, `city`
- `city`: exact filter
- `isActive`: boolean filter (Admin only — instructors always see only active)
- `page` (default: 1), `limit` (default: 20)

**Service logic:**
- If role is `INSTRUCTOR`: force `isActive: true` in query regardless of param.
- Build dynamic query and return with pagination.

---

### GET `/api/companies/:id`
**Auth:** JWT — `ADMIN` or `INSTRUCTOR`

**Logic:** Find by `_id`. If role is `INSTRUCTOR`, verify the company is linked to at least one of their assigned apprentices' productive stages — if not → `403 'You do not have access to this company'`.

---

### PATCH `/api/companies/:id`
**Auth:** JWT — `ADMIN` only  
**Description:** Update company data.

**Body (all fields optional):**
```json
{
  "name": "Tech Solutions SAS Updated",
  "address": "Cra 15 # 30-40",
  "phone": "6017654321",
  "email": "nuevo@techsolutions.com",
  "city": "Medellín"
}
```

**Service logic:**
1. Find company. Not found or `!isActive` → `404`.
2. Update only provided fields (never update `taxId` or `importSource`).
3. Record in `AuditLog`: `action: 'COMPANY_UPDATED'`, `details: { changedFields }`.

---

### POST `/api/companies/:id/contacts`
**Auth:** JWT — `ADMIN` only  
**Description:** Add a contact to an existing company.

**Body:**
```json
{
  "fullName": "Juan Torres",
  "jobTitle": "Operations Manager",
  "phone": "3109876543",
  "email": "jtorres@techsolutions.com",
  "isPrimary": false
}
```

**Service logic:**
1. Find company.
2. If `isPrimary: true` → unset previous primary contact (`contacts.$[].isPrimary = false`).
3. Push new contact to `contacts` array.
4. Save and return updated company.

---

### PATCH `/api/companies/:id/contacts/:contactId`
**Auth:** JWT — `ADMIN` only  
**Description:** Update a specific contact.

**Service logic:**
1. Find company and locate contact by `contactId` within `contacts` array.
2. If contact not found → `404 'Contact not found'`.
3. If setting `isPrimary: true` → unset previous primary first.
4. Update contact fields and save.

---

### DELETE `/api/companies/:id/contacts/:contactId`
**Auth:** JWT — `ADMIN` only  
**Description:** Remove a contact. Cannot remove the only contact or the primary contact if it's the only one.

**Service logic:**
1. Find company.
2. If only one contact remains → `400 'Cannot remove the only contact'`.
3. If contact is `isPrimary` and there are others → auto-assign `isPrimary` to the first remaining contact.
4. Pull contact from array. Save.

---

### DELETE `/api/companies/:id`
**Auth:** JWT — `ADMIN` only  
**Description:** Soft-delete — sets `isActive: false`.

**Service logic:**
1. Check no active productive stages reference this company → if yes: `409 'Company has active productive stages and cannot be deactivated'`.
2. Set `isActive: false`. Save.
3. Record in `AuditLog`.

---

## Minimum required tests — `tests/companies.test.js`

```javascript
describe('POST /api/companies', () => {
  test('✅ Admin creates company with one contact')
  test('❌ duplicate taxId → 409')
  test('❌ more than one isPrimary contact → 400')
  test('❌ INSTRUCTOR tries to create → 403')
  test('❌ no auth → 401')
});

describe('POST /api/companies/import', () => {
  test('✅ imports 10 valid rows correctly')
  test('✅ existing taxId → skipped')
  test('✅ invalid rows reported in errors array')
  test('❌ non CSV/XLSX file → 400')
});

describe('GET /api/companies/:id', () => {
  test('✅ Admin can access any company')
  test('❌ INSTRUCTOR accessing company not linked to their apprentices → 403')
  test('✅ INSTRUCTOR can access company linked to their apprentice')
});

describe('PATCH /api/companies/:id', () => {
  test('✅ Admin updates name and city')
  test('✅ AuditLog recorded with changedFields')
  test('❌ INSTRUCTOR tries to update → 403')
});

describe('Contacts', () => {
  test('✅ Add contact sets isPrimary correctly (unsets previous)')
  test('❌ Remove only contact → 400')
  test('✅ Remove non-primary contact → auto-assigns primary')
});

describe('DELETE /api/companies/:id', () => {
  test('✅ soft-delete sets isActive: false')
  test('❌ company with active productive stages → 409')
});
```

---

## Completion criteria

- [ ] Only one primary contact enforced at service level.
- [ ] Bulk import with per-row error report and correct `importSource`.
- [ ] Instructors can only view companies linked to their apprentices.
- [ ] Soft-delete blocked if active productive stages exist.
- [ ] Company data is denormalized into `ProductiveStage.companySnapshot` at EP registration (handled in productiveStages spec).
- [ ] AuditLog on create and update.
- [ ] All tests pass.