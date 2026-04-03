# SPEC: Notifications Module
> REPFORA E.P. — Read CLAUDE.md and specs/DATA_MODEL.md before implementing.
> **Transversal module — used by ALL other modules. Implement before Reports.**
> **Depends on: Auth, SystemConfig, Users**

---

## Business context

Notifications in REPFORA are always dual: an in-platform record (stored in MongoDB) AND an email sent via nodemailer. If email fails, the in-platform notification remains active and the error is logged — never block the main operation because of an email failure.

Every module calls `notificationService.send()` — this is the single entry point. It handles DB creation and email dispatch internally. The email sender address is read from `SystemConfig.NOTIFICATION_EMAIL` at send time.

**In-platform notifications** appear in the user's notification panel (bell icon). They track read/unread state. **Email notifications** are sent simultaneously with the same content.

---

## Files to create

```
src/models/Notification.model.js
src/controllers/notifications.controller.js
src/services/notifications.service.js
src/services/email.service.js
src/routes/notifications.routes.js
```

---

## Schema Mongoose — `src/models/Notification.model.js`

> Full reference in DATA_MODEL.md — Section 8.

```javascript
const { NOTIFICATION_TYPES } = require('../utils/enums');

const NotificationSchema = new Schema({
  recipient:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type:         { type: String, enum: NOTIFICATION_TYPES, required: true },

  title:        { type: String, required: true },
  message:      { type: String, required: true },
  isRead:       { type: Boolean, default: false },
  readAt:       { type: Date, default: null },

  metadata: {
    entity:     { type: String, default: null },
    entityId:   { type: Schema.Types.ObjectId, default: null },
    url:        { type: String, default: null }
  },

  emailSent:    { type: Boolean, default: false },
  emailSentAt:  { type: Date, default: null },
  emailError:   { type: String, default: null }
}, { timestamps: true });

NotificationSchema.index({ recipient: 1, isRead: 1 });
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ type: 1 });
```

---

## Core service — `src/services/notifications.service.js`

> This is the central function all other services call. Implement this carefully.

```javascript
/**
 * Create in-platform notification(s) and send email(s).
 * Never throws — email failures are logged but do not propagate.
 *
 * @param {Object} params
 * @param {string}   params.type          - enum NOTIFICATION_TYPES
 * @param {ObjectId[]} params.recipients  - array of User ObjectIds
 * @param {string}   params.title
 * @param {string}   params.message
 * @param {Object}   [params.metadata]   - { entity, entityId, url }
 */
const send = async ({ type, recipients, title, message, metadata = {} }) => {
  const results = [];

  for (const recipientId of recipients) {
    // 1. Create in-platform notification
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      metadata,
      emailSent: false
    });

    // 2. Attempt to send email (never block on failure)
    try {
      const user = await User.findById(recipientId).select('email fullName');
      if (user?.email) {
        await emailService.send({
          to: user.email,
          subject: title,
          body: buildEmailBody(user.fullName, message)
        });
        notification.emailSent = true;
        notification.emailSentAt = new Date();
      }
    } catch (emailErr) {
      notification.emailError = emailErr.message;
      console.error(`[NotificationService] Email failed for recipient ${recipientId}:`, emailErr.message);
    }

    await notification.save();
    results.push(notification);
  }

  return results;
};

// Simple HTML email template
const buildEmailBody = (fullName, message) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #39a900;">REPFORA E.P. — SENA</h2>
    <p>Estimado/a <strong>${fullName}</strong>,</p>
    <p>${message}</p>
    <hr />
    <p style="font-size: 12px; color: #666;">
      Este es un mensaje automático. Por favor no responda a este correo.
    </p>
  </div>
`;

module.exports = { send };
```

---

## Email service — `src/services/email.service.js`

```javascript
const nodemailer = require('nodemailer');
const { getConfig } = require('../utils/configHelper.util');

let transporter = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  const senderEmail = await getConfig('NOTIFICATION_EMAIL');

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  return transporter;
};

/**
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.body  - HTML string
 */
const send = async ({ to, subject, body }) => {
  const transport = await getTransporter();
  const senderEmail = await getConfig('NOTIFICATION_EMAIL');

  await transport.sendMail({
    from: `"REPFORA E.P. - SENA" <${senderEmail}>`,
    to,
    subject,
    html: body
  });
};

module.exports = { send };
```

---

## Notification type reference — when each is sent

> This table is the contract between modules. Each service must call `notificationService.send()` with the correct type.

| Type | Sent by | Recipients | Trigger |
|------|---------|-----------|---------|
| `SYSTEM_WELCOME` | `users.service` | Apprentice / Instructor | Account created |
| `EP_REGISTRATION_REMINDER` | `productiveStages.service` | Admin | Apprentice registers EP |
| `ENROLLMENT_EXPIRY_ALERT` | cron job | Apprentice + Instructor | N days before enrollment expiry |
| `EP_APPROVED` | `productiveStages.service` | Apprentice | Admin approves EP |
| `EP_REJECTED` | `productiveStages.service` | Apprentice | Admin rejects EP |
| `BITACORA_APPROVED` | `bitacoras.service` | Apprentice | Instructor approves logbook |
| `BITACORA_REJECTED` | `bitacoras.service` | Apprentice | Instructor rejects logbook |
| `BITACORA_PENDING_REVIEW` | `bitacoras.service` | Instructor | Apprentice submits logbook |
| `BITACORA_REMINDER` | cron job | Apprentice | Scheduled reminder |
| `TRACKING_REMINDER` | `trackings.service` | Apprentice | Tracking scheduled / approaching |
| `DOCUMENTS_APPROVED` | `documents.service` | Apprentice | Admin approves document |
| `DOCUMENTS_REJECTED` | `documents.service` | Apprentice | Admin rejects document |
| `DOCUMENTS_REMINDER` | `documents.service` / cron | Apprentice | Document submitted / reminder |
| `APPRENTICE_ASSIGNED` | `productiveStages.service` | Instructor | Instructor assigned to EP |
| `APPRENTICE_REASSIGNED` | `users.service` | Instructor + Apprentice | Instructor reassigned |
| `EXTRAORDINARY_TRACKING_APPROVED` | `trackings.service` | Instructor | Admin approves extraordinary |
| `HOURS_LIMIT_ALERT` | `hours.service` | Instructor | Approaching monthly hour limit |
| `HOURS_OVERLOAD` | `hours.service` | Instructor + Admin | Exceeded monthly hour limit |
| `TRACKING_DEADLINE_APPROACHING` | cron job | Instructor + Apprentice | N days before tracking date |
| `ADMIN_COMMENT_ON_BITACORA` | `bitacoras.service` | Instructor | Admin adds comment on logbook |
| `NEW_CRITICAL_NOVELTY` | `novelties.service` | Admin | Instructor reports novelty |
| `INSTRUCTOR_OVERDUE_REVIEW` | cron job | Admin | Instructor hasn't reviewed logbook in N days |
| `APPRENTICE_MISSING_BITACORA` | cron job | Admin + Instructor | Apprentice hasn't submitted logbook |

---

## HTTP Endpoints

### GET `/api/notifications`
**Auth:** JWT — any role  
**Description:** Get notifications for the authenticated user.

**Query params:**
- `isRead`: filter by read status (`true | false`)
- `type`: filter by notification type
- `page` (default: 1), `limit` (default: 20)

**Service logic:**
```javascript
Notification.find({ recipient: req.user.id, ...filters })
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(limit)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [...],
    "unreadCount": 5,
    "pagination": { "total": 23, "page": 1, "limit": 20, "pages": 2 }
  }
}
```

---

### GET `/api/notifications/unread-count`
**Auth:** JWT — any role  
**Description:** Lightweight endpoint for the bell icon badge. Called frequently by frontend.

**Response:**
```json
{ "success": true, "data": { "unreadCount": 5 } }
```

---

### PATCH `/api/notifications/:id/read`
**Auth:** JWT — any role  
**Description:** Mark a single notification as read.

**Service logic:**
1. Find notification. Verify `recipient === req.user.id` → else `403`.
2. If already read → return as-is (idempotent, no error).
3. Set `isRead = true`, `readAt = now`. Save.

---

### PATCH `/api/notifications/read-all`
**Auth:** JWT — any role  
**Description:** Mark all unread notifications as read for the authenticated user.

**Service logic:**
```javascript
await Notification.updateMany(
  { recipient: req.user.id, isRead: false },
  { $set: { isRead: true, readAt: new Date() } }
);
```

---

### DELETE `/api/notifications/:id`
**Auth:** JWT — any role  
**Description:** Delete a single notification (hard delete — notification records are not critical data).

**Service logic:** Verify `recipient === req.user.id`. Then `Notification.findByIdAndDelete(id)`.

---

## Scheduled jobs (cron) — `src/jobs/`

> These are not HTTP endpoints. They run on a schedule using `node-cron` or similar.
> Define in `src/jobs/alerts.job.js`. Register in `app.js` on startup.

```javascript
// src/jobs/alerts.job.js

const cron = require('node-cron');

// Run daily at 8:00 AM
cron.schedule('0 8 * * *', async () => {
  await checkEnrollmentExpiries();    // ENROLLMENT_EXPIRY_ALERT
  await checkTrackingDeadlines();     // TRACKING_DEADLINE_APPROACHING
  await checkMissingBitacoras();      // APPRENTICE_MISSING_BITACORA
  await checkOverdueReviews();        // INSTRUCTOR_OVERDUE_REVIEW
});
```

### `checkEnrollmentExpiries()`
```javascript
// Find apprentices whose enrollmentExpiryDate is within alert thresholds
// Use dateHelper.getExpiryAlertLevel() to determine level (YELLOW/ORANGE/RED)
// Send ENROLLMENT_EXPIRY_ALERT to apprentice + their assigned instructor
// Only send each alert level once per apprentice (check if already sent recently)
```

### `checkMissingBitacoras()`
```javascript
// Find active EPs where completedBitacoras < expected for current date
// Expected: floor((daysSinceStart / 14)) — one bitacora every 2 weeks
// If apprentice is 1+ bitacora behind → notify apprentice + instructor
```

### `checkOverdueReviews()`
```javascript
// Find PENDING bitacoras older than 7 days
// Notify admin: 'Instructor ${name} has not reviewed logbook for ${apprentice.fullName} in ${days} days'
```

---

## Minimum required tests — `tests/notifications.test.js`

```javascript
describe('notificationService.send()', () => {
  test('✅ creates Notification record in DB')
  test('✅ sends email via emailService (mocked)')
  test('✅ multiple recipients create multiple records')
  test('✅ email failure saves emailError but does not throw')
  test('✅ notification created even when email fails')
});

describe('GET /api/notifications', () => {
  test('✅ returns only own notifications')
  test('✅ unreadCount is correct')
  test('✅ filters by isRead correctly')
  test('❌ accessing another user notifications → 403')
});

describe('PATCH /api/notifications/:id/read', () => {
  test('✅ marks as read with readAt timestamp')
  test('✅ idempotent — already read returns 200 without error')
  test('❌ marking another user notification → 403')
});

describe('PATCH /api/notifications/read-all', () => {
  test('✅ all unread notifications marked as read')
  test('✅ already read notifications unaffected')
});

describe('emailService.send()', () => {
  test('✅ sends email with correct from address from SystemConfig')
  test('✅ throws on nodemailer error (caller handles it)')
});
```

---

## Completion criteria

- [ ] `notificationService.send()` is the single entry point — no module sends email directly.
- [ ] Email failure never blocks the calling operation — caught and logged in `emailError`.
- [ ] Every notification type in the reference table is sent by the correct module at the correct trigger.
- [ ] `unreadCount` always reflects current state — not cached.
- [ ] Sender email read from `SystemConfig.NOTIFICATION_EMAIL` at send time — not from `.env` directly.
- [ ] Cron jobs registered on app startup and run daily.
- [ ] `read-all` is atomic — uses `updateMany`.
- [ ] All tests pass.
