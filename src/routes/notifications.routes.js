import { Router } from 'express';
import { query } from 'express-validator';
import notificationController from '../controllers/notifications.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { validateFields } from '../middlewares/validate.middleware.js';
import { NOTIFICATION_TYPES } from '../utils/enums.js';

const router = Router();

router.use(verifyToken);

router.get('/',
    [
        query('isRead').optional().isBoolean(),
        query('type').optional().isIn(NOTIFICATION_TYPES),
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        validateFields
    ],
    notificationController.getUserNotifications
);

router.get('/unread-count', notificationController.getUnreadCount);

router.patch('/read-all', notificationController.markAllAsRead);

router.patch('/:id/read', notificationController.markAsRead);

router.delete('/:id', notificationController.deleteNotification);

export default router;
