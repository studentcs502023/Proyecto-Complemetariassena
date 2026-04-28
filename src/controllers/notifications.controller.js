import notificationService from '../services/notifications.service.js';
import { successResponse, errorResponse } from '../utils/response.util.js';

class NotificationController {
  async getUserNotifications(req, res) {
    try {
      const data = await notificationService.getUserNotifications(req.user.id, req.query);
      return successResponse(res, 200, 'Notifications retrieved successfully', data);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async getUnreadCount(req, res) {
    try {
      const data = await notificationService.getUnreadCount(req.user.id);
      return successResponse(res, 200, 'Unread count retrieved successfully', data);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async markAsRead(req, res) {
    try {
      const notification = await notificationService.markAsRead(req.user.id, req.params.id);
      return successResponse(res, 200, 'Notification marked as read', { notification });
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async markAllAsRead(req, res) {
    try {
      const data = await notificationService.markAllAsRead(req.user.id);
      return successResponse(res, 200, 'All notifications marked as read', data);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }

  async deleteNotification(req, res) {
    try {
      const data = await notificationService.deleteNotification(req.user.id, req.params.id);
      return successResponse(res, 200, 'Notification deleted successfully', data);
    } catch (error) {
      return errorResponse(res, error.statusCode || 500, error.message);
    }
  }
}

export default new NotificationController();
