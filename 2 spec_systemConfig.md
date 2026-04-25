
# SPEC: SystemConfig Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Implement AFTER Auth. This is a dependency of every other module.**

---

## Business context

Configurable parameters the Admin can adjust: hours per activity type, max logbooks, required trackings, expiry alerts, notification email. These values are read at runtime from MongoDB — never hardcoded. System initializes with defaults via seed.

---

## Schema Mongoose — `src/models/SystemConfig.model.js`

> Full reference in DATA_MODEL.md — Section 10.

```javascript
const SystemConfigSchema = new Schema({
  key:         { type: String, required: true, unique: true, uppercase: true, trim: true },
  value:       { type: Schema.Types.Mixed, required: true },
  description: { type: String, required: true },
  valueType:   { type: String, enum: ['NUMBER', 'STRING', 'BOOLEAN', 'JSON'], required: true },
  updatedBy:   { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: { createdAt: false, updatedAt: true } });

SystemConfigSchema.index({ key: 1 });
```

---

## Files to create

```
src/models/SystemConfig.model.js
src/controllers/systemConfig.controller.js
src/services/systemConfig.service.js
src/routes/systemConfig.routes.js
src/config/systemConfig.seed.js
src/utils/configHelper.util.js
```
this field it is finished
---

## Initial seed — `src/config/systemConfig.seed.js`

Run on system startup if keys do not yet exist (upsert with `$setOnInsert`):

```javascript
const defaults = [
  { key: 'HOURS_PER_LOGBOOK_REVIEW',          value: 2,   valueType: 'NUMBER',  description: 'Hours assigned to instructor per reviewed logbook' },
  { key: 'HOURS_PER_IN_PERSON_TRACKING',      value: 2,   valueType: 'NUMBER',  description: 'Hours per in-person tracking session' },
  { key: 'HOURS_PER_VIRTUAL_TRACKING',        value: 2,   valueType: 'NUMBER',  description: 'Hours per virtual tracking session' },
  { key: 'HOURS_PER_EXTRAORDINARY_TRACKING',  value: 2,   valueType: 'NUMBER',  description: 'Hours per extraordinary tracking session' },
  { key: 'HOURS_PER_CERTIFICATION',           value: 2,   valueType: 'NUMBER',  description: 'Hours per final certification process' },
  { key: 'MAX_LOGBOOKS_TECHNICIAN',           value: 13,  valueType: 'NUMBER',  description: 'Max logbooks for technician level' },
  { key: 'MAX_LOGBOOKS_TECHNOLOGIST',         value: 13,  valueType: 'NUMBER',  description: 'Max logbooks for technologist level' },
  { key: 'REQUIRED_TRACKINGS_TECHNICIAN',     value: 3,   valueType: 'NUMBER',  description: 'Required trackings for technician level' },
  { key: 'REQUIRED_TRACKINGS_TECHNOLOGIST',   value: 3,   valueType: 'NUMBER',  description: 'Required trackings for technologist level' },
  { key: 'MAX_MONTHLY_HOURS_INSTRUCTOR',      value: 160, valueType: 'NUMBER',  description: 'Max monthly hours allowed per instructor' },
  { key: 'EXPIRY_ALERT_DAYS_YELLOW',          value: 30,  valueType: 'NUMBER',  description: 'Days before expiry for yellow alert' },
  { key: 'EXPIRY_ALERT_DAYS_ORANGE',          value: 15,  valueType: 'NUMBER',  description: 'Days before expiry for orange alert' },
  { key: 'EXPIRY_ALERT_DAYS_RED',             value: 7,   valueType: 'NUMBER',  description: 'Days before expiry for red alert' },
  { key: 'NOTIFICATION_EMAIL',                value: '',  valueType: 'STRING',  description: 'Email address used to send automatic notifications' },
  { key: 'GOOGLE_DRIVE_ROOT_FOLDER_ID',       value: '',  valueType: 'STRING',  description: 'Root Google Drive folder ID for REPFORA' },
  { key: 'EP_DEADLINE_MONTHS_NEW_ENROLLMENT', value: 6,   valueType: 'NUMBER',  description: 'Months to register EP for post-Nov-2024 enrollments' },
  { key: 'EP_DEADLINE_YEARS_OLD_ENROLLMENT',  value: 2,   valueType: 'NUMBER',  description: 'Years to register EP for pre-Nov-2024 enrollments' },
];

for (const item of defaults) {
  await SystemConfig.findOneAndUpdate(
    { key: item.key },
    { $setOnInsert: item },
    { upsert: true, new: false }
  );
}
```

---

## Endpoints

### GET `/api/system-config`
**Auth:** JWT — `ADMIN` only  
**Description:** Returns all system parameters.

**Response:**
```json
{
  "success": true,
  "data": {
    "configs": [
      {
        "key": "HOURS_PER_LOGBOOK_REVIEW",
        "value": 2,
        "description": "Hours assigned to instructor per reviewed logbook",
        "valueType": "NUMBER",
        "updatedAt": "2025-09-19T00:00:00.000Z"
      }
    ]
  }
}
```

---

### GET `/api/system-config/:key`
**Auth:** JWT — `ADMIN` only

**Service logic:**
1. Find by `key` (convert to uppercase).
2. Not found → `404 'Parameter not found'`.
3. Return document.

---

### PATCH `/api/system-config/:key`
**Auth:** JWT — `ADMIN` only  
**Body:**
```json
{ "value": 3 }
```

**Validations:** `value` required, not empty.

**Service logic (step by step):**
1. Find config by `key`.
2. Not found → `404`.
3. Validate value type matches `config.valueType`:
   - `NUMBER`: `typeof value === 'number'` and `value > 0`.
   - `STRING`: `typeof value === 'string'`.
   - `BOOLEAN`: `typeof value === 'boolean'`.
4. Type mismatch → `400 'Value must be of type ${config.valueType}'`.
5. Update `value` and `updatedBy = req.user.id`.
6. Call `invalidateCache(key)` on `configHelper`.
7. Record in `AuditLog`: `action: 'SYSTEM_CONFIG_UPDATED'`, `details: { key, previousValue, newValue }`.
8. Return updated config.

---

## Config helper — `src/utils/configHelper.util.js`

> Used by ALL other services to read parameters. Critical — implement here.

```javascript
let cache = {};

const getConfig = async (key) => {
  if (cache[key] !== undefined) return cache[key];
  const config = await SystemConfig.findOne({ key });
  if (!config) throw new Error(`Config key '${key}' not found`);
  cache[key] = config.value;
  return config.value;
};

const invalidateCache = (key) => {
  if (key) delete cache[key];
  else cache = {};
};

module.exports = { getConfig, invalidateCache };
```

**Usage in other services:**
```javascript
const { getConfig } = require('../utils/configHelper.util');
const hours = await getConfig('HOURS_PER_LOGBOOK_REVIEW');
```

---

## Minimum required tests — `tests/systemConfig.test.js`

```javascript
describe('GET /api/system-config', () => {
  test('✅ Admin gets all parameters')
  test('❌ INSTRUCTOR → 403')
  test('❌ APPRENTICE → 403')
  test('❌ no auth → 401')
});

describe('PATCH /api/system-config/:key', () => {
  test('✅ Admin updates numeric value correctly')
  test('✅ AuditLog recorded after update')
  test('✅ cache invalidated after update')
  test('❌ wrong value type → 400')
  test('❌ non-existent key → 404')
  test('❌ no auth → 401')
});

describe('configHelper', () => {
  test('✅ returns correct value from DB')
  test('✅ cache works on second call')
  test('✅ invalidateCache clears correctly')
  test('❌ non-existent key throws error')
});
```

---

## Completion criteria

- [ ] Seed creates all default parameters on startup if they do not exist.
- [ ] `configHelper.getConfig()` works with in-memory cache.
- [ ] Cache is invalidated on every PATCH.
- [ ] Only ADMIN can read and modify parameters.
- [ ] AuditLog recorded on every PATCH.
- [ ] Value type validation works correctly.
- [ ] All tests pass.
