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
