import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../index.js';
import User from '../src/models/User.model.js';
import ProductiveStage from '../src/models/ProductiveStage.model.js';
import HourRecord from '../src/models/HourRecord.model.js';
import SystemConfig from '../src/models/SystemConfig.model.js';
import { env } from '../src/config/env.js';

describe('Módulo Reports (Informes)', () => {
    let adminToken, instructorToken;
    let apprenticeId, instructorId;

    const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar
        await User.deleteMany({ email: /test_report.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await HourRecord.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = 'Password123!';
        const hashedPass = await bcrypt.hash(pass, salt);

        // Admin
        await new User({
            nationalId: '222001',
            fullName: 'Admin Test Report',
            email: 'test_report_admin@repfora.com',
            password: hashedPass,
            role: 'ADMIN',
            firstLogin: false
        }).save();

        // Instructor
        const instructor = await new User({
            nationalId: '222002',
            fullName: 'Instructor Test Report',
            email: 'test_report_ins@repfora.com',
            password: hashedPass,
            role: 'INSTRUCTOR',
            firstLogin: false
        }).save();
        instructorId = instructor._id;

        // Apprentice with enrollmentExpiryDate
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 10); // 10 days from now (Orange level)

        const apprentice = await new User({
            nationalId: '222003',
            fullName: 'Apprentice Test Report',
            email: 'test_report_app@repfora.com',
            password: hashedPass,
            role: 'APPRENTICE',
            enrollmentExpiryDate: expiry,
            isPreNov2024: false,
            firstLogin: false
        }).save();
        apprenticeId = apprentice._id;

        // Create some EPs
        await new ProductiveStage({
            apprentice: apprenticeId,
            modality: 'INTERNSHIP',
            status: 'ACTIVE',
            followupInstructor: instructorId,
            createdAt: new Date('2025-05-10')
        }).save();

        // Create an HourRecord
        await new HourRecord({
            instructor: instructorId,
            year: 2025,
            month: 5,
            bitacoraHours: 10,
            totalHours: 10,
            pendingPaymentHours: 10
        }).save();

        // Configs
        await SystemConfig.findOneAndUpdate({ key: 'EXPIRY_ALERT_DAYS_YELLOW' }, { value: 30, valueType: 'NUMBER', description: 'T' }, { upsert: true });
        await SystemConfig.findOneAndUpdate({ key: 'EXPIRY_ALERT_DAYS_ORANGE' }, { value: 15, valueType: 'NUMBER', description: 'T' }, { upsert: true });
        await SystemConfig.findOneAndUpdate({ key: 'EXPIRY_ALERT_DAYS_RED' }, { value: 5, valueType: 'NUMBER', description: 'T' }, { upsert: true });
        await SystemConfig.findOneAndUpdate({ key: 'EP_REGISTRATION_DEADLINE_MONTHS' }, { value: 6, valueType: 'NUMBER', description: 'T' }, { upsert: true });
        await SystemConfig.findOneAndUpdate({ key: 'EP_REGISTRATION_DEADLINE_YEARS_OLD' }, { value: 2, valueType: 'NUMBER', description: 'T' }, { upsert: true });

        // Logins
        const resAdmin = await request(app).post('/api/auth/login').send({ nationalId: '222001', password: pass });
        adminToken = resAdmin.body.data.token;

        const resIns = await request(app).post('/api/auth/login').send({ nationalId: '222002', password: pass });
        instructorToken = resIns.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_report.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await HourRecord.deleteMany({});
        await mongoose.connection.close();
    });

    describe('GET /api/reports/ep-summary', () => {
        it('✅ Admin obtiene resumen de EPs', async () => {
            const res = await request(app)
                .get('/api/reports/ep-summary?year=2025')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.totalEPs).toBe(1);
            expect(res.body.data.byModality.INTERNSHIP).toBeDefined();
        });

        it('❌ Instructor no tiene acceso', async () => {
            const res = await request(app)
                .get('/api/reports/ep-summary')
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(403);
        });
    });

    describe('GET /api/reports/instructor-hours', () => {
        it('✅ Admin obtiene reporte de horas', async () => {
            const res = await request(app)
                .get('/api/reports/instructor-hours?year=2025&month=5')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.instructors.length).toBeGreaterThan(0);
            expect(res.body.data.instructors[0].yearTotals.totalHours).toBe(10);
        });
    });

    describe('GET /api/reports/apprentice-progress/:id', () => {
        it('✅ Admin obtiene progreso del aprendiz', async () => {
            const res = await request(app)
                .get(`/api/reports/apprentice-progress/${apprenticeId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.apprentice.fullName).toBe('Apprentice Test Report');
            expect(res.body.data.productiveStages.length).toBe(1);
        });
    });

    describe('GET /api/reports/enrollment-expiry', () => {
        it('✅ Admin obtiene aprendices por vencer', async () => {
            const res = await request(app)
                .get('/api/reports/enrollment-expiry')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.apprentices.length).toBeGreaterThan(0);
            expect(res.body.data.apprentices[0].alertLevel).toBe('ORANGE');
        });
    });

    describe('Export PDF', () => {
        it('✅ Exporta resumen de EPs a PDF', async () => {
            const res = await request(app)
                .get('/api/reports/ep-summary/export?year=2025')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.header['content-type']).toBe('application/pdf');
            expect(res.body).toBeDefined();
        });
    });
});
