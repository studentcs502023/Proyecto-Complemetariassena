import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../index.js';
import User from '../src/models/User.model.js';
import HourRecord from '../src/models/HourRecord.model.js';
import SystemConfig from '../src/models/SystemConfig.model.js';
import hourService from '../src/services/hours.service.js';
import { env } from '../src/config/env.js';

describe('Módulo Bolsa de Horas', () => {
    let adminToken, instructorToken;
    let instructorId;

    const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar
        await User.deleteMany({ email: /test_hours.*@repfora.com/ });
        await HourRecord.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = 'Password123!';
        const hashedPass = await bcrypt.hash(pass, salt);

        // Admin
        await new User({
            nationalId: '666001',
            fullName: 'Admin Test Hours',
            email: 'test_hours_admin@repfora.com',
            password: hashedPass,
            role: 'ADMIN',
            firstLogin: false
        }).save();

        // Instructor
        const instructor = await new User({
            nationalId: '666002',
            fullName: 'Instructor Test Hours',
            email: 'test_hours_ins@repfora.com',
            password: hashedPass,
            role: 'INSTRUCTOR',
            firstLogin: false
        }).save();
        instructorId = instructor._id;

        // Config
        await SystemConfig.findOneAndUpdate({ key: 'MAX_MONTHLY_HOURS_INSTRUCTOR' }, { value: 10, valueType: 'NUMBER' }, { upsert: true });

        // Logins
        const resAdmin = await request(app).post('/api/auth/login').send({ nationalId: '666001', password: pass });
        adminToken = resAdmin.body.data.token;

        const resIns = await request(app).post('/api/auth/login').send({ nationalId: '666002', password: pass });
        instructorToken = resIns.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_hours.*@repfora.com/ });
        await HourRecord.deleteMany({});
        await mongoose.connection.close();
    });

    describe('Internal addHours() pattern', () => {
        it('✅ Suma horas y crea registro mensual', async () => {
            const { record } = await hourService.addHours({
                instructorId,
                year: 2025,
                month: 5,
                field: 'bitacoraHours',
                amount: 4
            });

            expect(record.bitacoraHours).toBe(4);
            expect(record.totalHours).toBe(4);
            
            const user = await User.findById(instructorId);
            expect(user.accumulatedHours).toBe(4);
        });

        it('✅ Detecta exceso de horas (Limit: 10)', async () => {
            const { isOverLimit, excessAmount } = await hourService.addHours({
                instructorId,
                year: 2025,
                month: 5,
                field: 'trackingHours',
                amount: 8 // Total will be 4 + 8 = 12
            });

            expect(isOverLimit).toBe(true);
            expect(excessAmount).toBe(2);
            
            const record = await HourRecord.findOne({ instructor: instructorId, year: 2025, month: 5 });
            expect(record.excessHours).toBe(2);
        });
    });

    describe('GET /api/hours/instructors/:id', () => {
        it('✅ Instructor ve sus propias horas', async () => {
            const res = await request(app)
                .get(`/api/hours/instructors/${instructorId}?year=2025`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.records.length).toBeGreaterThan(0);
        });

        it('❌ Instructor no puede ver horas de otro', async () => {
            const res = await request(app)
                .get(`/api/hours/instructors/${new mongoose.Types.ObjectId()}`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(403);
        });

        it('✅ Admin ve cualquier instructor', async () => {
            const res = await request(app)
                .get(`/api/hours/instructors/${instructorId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
        });
    });

    describe('Gestión de Pagos y Carry-over', () => {
        it('✅ Admin marca horas como pagadas', async () => {
            const res = await request(app)
                .patch(`/api/hours/instructors/${instructorId}/month/2025/5/mark-paid`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    amount: 5,
                    confirm: 'true'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.record.paidHours).toBe(5);
            expect(res.body.data.record.pendingPaymentHours).toBe(12 - 5);
        });

        it('✅ Admin transfiere exceso al siguiente mes', async () => {
            const res = await request(app)
                .patch(`/api/hours/instructors/${instructorId}/carry-over`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    fromYear: 2025,
                    fromMonth: 5,
                    toYear: 2025,
                    toMonth: 6
                });

            expect(res.statusCode).toBe(200);
            
            // Registro de Junio debe tener horas transferidas
            const target = await HourRecord.findOne({ instructor: instructorId, year: 2025, month: 6 });
            expect(target.carriedOverHours).toBe(2);
            expect(target.totalHours).toBe(2);

            // Registro de Mayo queda en 0 exceso
            const source = await HourRecord.findOne({ instructor: instructorId, year: 2025, month: 5 });
            expect(source.excessHours).toBe(0);
        });
    });

    describe('Dashboard Summary', () => {
        it('✅ Admin obtiene resumen global del mes', async () => {
            const res = await request(app)
                .get('/api/hours/summary?year=2025&month=5')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.instructors.length).toBeGreaterThan(0);
            expect(res.body.data.totals.totalHoursAllInstructors).toBe(12);
        });
    });
});
