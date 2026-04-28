import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../index.js';
import User from '../src/models/User.model.js';
import Notification from '../src/models/Notification.model.js';
import notificationService from '../src/services/notifications.service.js';
import { env } from '../src/config/env.js';

describe('Módulo Notifications', () => {
    let adminToken, instructorToken;
    let adminId, instructorId, notificationId;

    const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar
        await User.deleteMany({ email: /test_notify.*@repfora.com/ });
        await Notification.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = 'Password123!';
        const hashedPass = await bcrypt.hash(pass, salt);

        // Admin
        const admin = await new User({
            nationalId: '333001',
            fullName: 'Admin Test Notify',
            email: 'test_notify_admin@repfora.com',
            password: hashedPass,
            role: 'ADMIN',
            firstLogin: false
        }).save();
        adminId = admin._id;

        // Instructor
        const instructor = await new User({
            nationalId: '333002',
            fullName: 'Instructor Test Notify',
            email: 'test_notify_ins@repfora.com',
            password: hashedPass,
            role: 'INSTRUCTOR',
            status: 'ACTIVE',
            firstLogin: false
        }).save();
        instructorId = instructor._id;

        // Logins
        const resAdmin = await request(app).post('/api/auth/login').send({ nationalId: '333001', password: pass });
        adminToken = resAdmin.body.data.token;

        const resIns = await request(app).post('/api/auth/login').send({ nationalId: '333002', password: pass });
        instructorToken = resIns.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_notify.*@repfora.com/ });
        await Notification.deleteMany({});
        await mongoose.connection.close();
    });

    describe('notificationService.send()', () => {
        it('✅ Crea registro de notificación en DB', async () => {
            const results = await notificationService.send({
                type: 'SYSTEM_WELCOME',
                recipients: [instructorId.toString()],
                title: 'Bienvenido',
                message: 'Bienvenido al sistema REPFORA.'
            });

            expect(results.length).toBe(1);
            expect(results[0].recipient.toString()).toBe(instructorId.toString());
            expect(results[0].emailSent).toBe(true); // En test simulamos éxito
            notificationId = results[0]._id;
        });

        it('✅ Múltiples destinatarios crean múltiples registros', async () => {
            const results = await notificationService.send({
                type: 'BITACORA_REMINDER',
                recipients: [adminId.toString(), instructorId.toString()],
                title: 'Recordatorio masivo',
                message: 'Este es un mensaje para varios.'
            });

            expect(results.length).toBe(2);
            const count = await Notification.countDocuments({ type: 'BITACORA_REMINDER' });
            expect(count).toBe(2);
        });
    });

    describe('GET /api/notifications', () => {
        it('✅ Usuario obtiene sus propias notificaciones', async () => {
            const res = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.notifications.length).toBeGreaterThan(0);
            expect(res.body.data.unreadCount).toBeGreaterThan(0);
        });

        it('✅ Filtra por isRead correctamente', async () => {
            const res = await request(app)
                .get('/api/notifications?isRead=true')
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.notifications.length).toBe(0); // Ninguna leída aún
        });
    });

    describe('PATCH /api/notifications/:id/read', () => {
        it('✅ Marca como leída', async () => {
            const res = await request(app)
                .patch(`/api/notifications/${notificationId}/read`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.notification.isRead).toBe(true);
            expect(res.body.data.notification.readAt).toBeDefined();
        });

        it('❌ No permite leer notificaciones ajenas', async () => {
            const res = await request(app)
                .patch(`/api/notifications/${notificationId}/read`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(404); // Se busca por ID + Recipient, si no existe es 404
        });
    });

    describe('PATCH /api/notifications/read-all', () => {
        it('✅ Marca todas como leídas para el usuario', async () => {
            const res = await request(app)
                .patch('/api/notifications/read-all')
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            
            const unreadCount = await Notification.countDocuments({ recipient: instructorId, isRead: false });
            expect(unreadCount).toBe(0);
        });
    });
});
