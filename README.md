Completed Tasks:
   - Model: Created Tracking.model.js.
   - Service: Implemented trackings.service.js, handling scheduling, extraordinary tracking
     requests/approvals, PDF uploads, signature validation, and execution logic.
   - Controller: Established trackings.controller.js.
   - Routes: Created trackings.routes.js with full role-based access control.
   - Verification: Successfully ran the tests/trackings.test.js suite (10/10 tests passed).

  Key Logic Implemented:
   - Auto-numbering: Tracking numbers increment automatically per EP.
   - Extraordinary trackings: Requires admin approval BEFORE execution or PDF upload.
   - Hour Calculation: Dynamic lookup from SystemConfig based on tracking type.
   - Progress Tracking: completedTrackings in ProductiveStage increments only for ordinary
     trackings; checkAndAdvanceStatus is triggered automatically.
   - HourRecord Integration: Hours are c


✦ Hours module verified and Spec 8 finished.

  The Hours (Bolsa de Horas) module (Spec 8) is now fully implemented and verified.

  Completed Tasks:
   - Model: Verified HourRecord.model.js.
   - Service: Implemented hours.service.js with addHours(), markHoursPaidInternal(), and
     all management logic (carry-over, payment, monthly detail).
   - Integration: Updated bitacoras.service.js and trackings.service.js to use the
     centralized hourService.
   - Enums: Updated AUDIT_ACTIONS in enums.js to include HOURS_CARRIED_OVER.
   - Controller & Routes: Established hours.controller.js and hours.routes.js.
   - Verification: Successfully ran the tests/hours.test.js suite (8/8 tests passed).

  Key Features:
   - Centralized Logic: Hours addition and monthly limit checking are now handled in a
     single place.
   - Two-Step Payment: Mark-paid actions require a confirm: true flag for safety.
   - Carry-over: Allows moving excess hours from one month to the next.
   - Role-Based Access: Instructors can only see their own records; Admins have a global
     summary dashboard.
   - Audit Logging: All financial movements (payment, carry-over) are recorded.

  The project is now fully implemented up to Spec 8. Ready for Spec 9: Documents
  (Documentación de Certificación)?

