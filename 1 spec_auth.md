# SPEC: Auth Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.

---

## Business context

3 roles: `ADMIN`, `INSTRUCTOR`, `APPRENTICE`. Admin is created by seed — no public registration. Instructors and apprentices are created by Admin. First login forces password change. Temporary lockout after failed attempts (2 minutes). Password recovery via time-limited link (24h expiry).

---

## Schema Mongoose — `src/models/User.model.js`

> Full field reference in DATA_MODEL.md — Section 1. Implement exactly as defined there.

```javascript
const { ROLES, INSTRUCTOR_STATUSES, INSTRUCTOR_TYPES, TRAINING_LEVELS } = require('../utils/enums');

const UserSchema = new Schema({
  // IDENTITY
  nationalId:           { type: String, required: true, unique: true, trim: true },
  fullName:             { type: String, required: true, trim: true },
  email:                { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:             { type: String, required: true },
  phone:                { type: String, default: null },
  role:                 { type: String, enum: ROLES, required: true },

  // SESSION CONTROL
  status:               { type: String, enum: INSTRUCTOR_STATUSES, default: 'ACTIVE' },
  firstLogin:           { type: Boolean, default: true },
  failedAttempts:       { type: Number, default: 0 },
  lockedUntil:          { type: Date, default: null },
  resetPasswordToken:   { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },

  // INSTRUCTORS ONLY
  instructorType:       { type: String, enum: INSTRUCTOR_TYPES, default: null },
  knowledgeArea:        { type: String, default: null },
  accumulatedHours:     { type: Number, default: 0 },
  pendingPaymentHours:  { type: Number, default: 0 },
  driveFolderId:        { type: String, default: null },

  // APPRENTICES ONLY
  enrollmentNumber:     { type: String, default: null },
  program:              { type: String, default: null },
  trainingLevel:        { type: String, enum: TRAINING_LEVELS, default: null },
  trainingCenter:       { type: String, default: null },
  enrollmentExpiryDate: { type: Date, default: null },
  isPreNov2024:         { type: Boolean, default: null },

  isActive:             { type: Boolean, default: true }
}, { timestamps: true });

UserSchema.index({ nationalId: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ enrollmentNumber: 1 });

UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};
```

---

## Files to create

```
src/utils/enums.js                  ← global enums (from DATA_MODEL.md)
src/models/User.model.js
src/models/AuditLog.model.js
src/controllers/auth.controller.js
src/services/auth.service.js
src/routes/auth.routes.js
src/middlewares/auth.middleware.js
src/middlewares/role.middleware.js
src/middlewares/validate.middleware.js
src/utils/response.util.js
src/utils/auditLog.util.js
```

---

## Endpoints

### POST `/api/auth/login`
**Auth:** None  
**Body:**
```json
{ "nationalId": "1234567890", "password": "MyPass123!" }
```

**Service logic (step by step):**
1. Find user by `nationalId` where `isActive: true`.
2. Not found → `401 'Invalid credentials'`.
3. If `lockedUntil` exists and is in the future → `401 'Account locked. Try again in X minutes'` (calculate remaining minutes).
4. Compare password with `bcrypt.compare`.
5. If password wrong:
   - Increment `failedAttempts`.
   - If `failedAttempts >= MAX_LOGIN_ATTEMPTS (env)` → set `lockedUntil = now + LOCK_TIME_MINUTES`, reset `failedAttempts = 0`.
   - Save and return `401 'Invalid credentials'`.
6. If password correct:
   - Reset `failedAttempts = 0`, `lockedUntil = null`. Save.
   - Generate JWT payload: `{ id, nationalId, role, fullName }`.
   - If `firstLogin === true` → return `{ requiresPasswordChange: true, token }` with `200`.
   - Otherwise → return `{ token, user: { id, fullName, email, role } }` with `200`.

**Response — first login:**
```json
{
  "success": true,
  "message": "First login detected",
  "data": { "requiresPasswordChange": true, "token": "<jwt>" }
}
```

**Response — normal login:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<jwt>",
    "user": { "id": "...", "fullName": "...", "email": "...", "role": "INSTRUCTOR" }
  }
}
```

---

### POST `/api/auth/change-password-first`
**Auth:** JWT required (any role)  
**Description:** Mandatory password change on first login.  
**Body:**
```json
{ "newPassword": "NewPass456!", "confirmPassword": "NewPass456!" }
```

**Validations (express-validator):**
- `newPassword`: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.
- `confirmPassword`: must match `newPassword`.

**Service logic:**
1. Find user by `req.user.id`.
2. Verify `firstLogin === true`. If not → `400 'This endpoint only applies to first login'`.
3. Hash new password with bcrypt.
4. Update `password`, set `firstLogin = false`.
5. Record in `AuditLog`: `action: 'PASSWORD_CHANGED_FIRST_LOGIN'`.
6. Return `200`.

---

### POST `/api/auth/forgot-password`
**Auth:** None  
**Body:**
```json
{ "email": "instructor@sena.edu.co" }
```

**Service logic:**
1. Find user by `email` where `isActive: true`.
2. Not found → return `200` with generic message (do not reveal existence).
3. Generate random token: `crypto.randomBytes(32).toString('hex')`.
4. Store `resetPasswordToken = hash(token)` and `resetPasswordExpires = now + 24h`.
5. Send email with link: `${FRONTEND_URL}/reset-password?token=<unhashed_token>`.
6. Return `200 'If the email exists, you will receive a recovery link'`.

---

### POST `/api/auth/reset-password`
**Auth:** None  
**Body:**
```json
{ "token": "<token_from_email>", "newPassword": "NewPass456!" }
```

**Service logic:**
1. Hash received token. Find user where `resetPasswordToken` matches and `resetPasswordExpires > now`.
2. Not found → `400 'Invalid or expired token'`.
3. Hash new password.
4. Update `password`, clear `resetPasswordToken = null`, `resetPasswordExpires = null`, `firstLogin = false`.
5. Record in `AuditLog`: `action: 'PASSWORD_RESET'`.
6. Return `200`.

---

### POST `/api/auth/change-password`
**Auth:** JWT required (any role)  
**Description:** Voluntary password change from profile.  
**Body:**
```json
{ "currentPassword": "...", "newPassword": "...", "confirmPassword": "..." }
```

**Service logic:**
1. Find user by `req.user.id`.
2. Verify `currentPassword` with bcrypt. If fails → `400 'Current password is incorrect'`.
3. Validate `newPassword !== currentPassword` → `400 'New password must be different'`.
4. Hash and save new password.
5. Record in `AuditLog`: `action: 'PASSWORD_CHANGED'`.

---

### GET `/api/auth/me`
**Auth:** JWT required (any role)  
**Logic:** `User.findById(req.user.id).select('-password -resetPasswordToken -resetPasswordExpires')`

---

## Middlewares

### `auth.middleware.js`
```javascript
// Extract and verify JWT from Authorization: Bearer <token> header
// Valid → set req.user = { id, nationalId, role, fullName }
// Invalid → 401
// If user has firstLogin = true AND route is NOT /change-password-first → 403
//   message: 'You must change your password before continuing'
```

### `role.middleware.js`
```javascript
// checkRole(...roles) → middleware factory
// Verifies req.user.role is in the allowed roles array
// If not → 403 'You do not have permission for this action'
```

### `validate.middleware.js`
```javascript
// Runs validationResult(req) from express-validator
// If errors → 400 with formatted error array
// If none → next()
```

---

## AuditLog Schema — `src/models/AuditLog.model.js`

> Full reference in DATA_MODEL.md — Section 9.

```javascript
const { AUDIT_ACTIONS } = require('../utils/enums');

const AuditLogSchema = new Schema({
  action:       { type: String, enum: AUDIT_ACTIONS, required: true },
  entity:       { type: String, required: true },
  entityId:     { type: Schema.Types.ObjectId, default: null },
  performedBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  details:      { type: Schema.Types.Mixed, default: null },
  ip:           { type: String, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

AuditLogSchema.index({ performedBy: 1, createdAt: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ createdAt: -1 });
```

---

## Minimum required tests — `tests/auth.test.js`

```javascript
describe('POST /api/auth/login', () => {
  test('✅ successful login returns token and user data')
  test('✅ first login returns requiresPasswordChange: true')
  test('❌ wrong credentials → 401')
  test('❌ lockout after MAX failed attempts → 401 with lock message')
  test('❌ inactive user → 401')
});

describe('POST /api/auth/change-password-first', () => {
  test('✅ changes password and firstLogin becomes false')
  test('❌ no token → 401')
  test('❌ weak password → 400 with validation errors')
  test('❌ user with firstLogin=false → 400')
});

describe('POST /api/auth/forgot-password', () => {
  test('✅ existing email → 200 with generic message')
  test('✅ non-existing email → 200 with same generic message')
});

describe('POST /api/auth/reset-password', () => {
  test('✅ valid token → password changed')
  test('❌ expired token → 400')
  test('❌ invalid token → 400')
});

describe('Auth middleware', () => {
  test('❌ no token → 401 on protected route')
  test('❌ wrong role token → 403')
  test('❌ user with firstLogin=true blocked on normal routes → 403')
});
```

---

## Completion criteria

- [ ] Login works for all 3 roles.
- [ ] Temporary lockout after failed attempts works correctly.
- [ ] First login forces password change.
- [ ] Recovery token stored as hash (never plain text in DB).
- [ ] Generic response in forgot-password (does not reveal if email exists).
- [ ] `toJSON` never returns `password` or tokens.
- [ ] All tests pass.
- [ ] `AuditLog` recorded on every password change