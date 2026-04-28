import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../index.js';
import User from '../src/models/User.model.js';
import ProductiveStage from '../src/models/ProductiveStage.model.js';
import Bitacora from '../src/models/Bitacora.model.js';
import HourRecord from '../src/models/HourRecord.model.js';
import SystemConfig from '../src/models/SystemConfig.model.js';
import { env } from '../src/config/env.js';

describe('Módulo Bitacoras', () => {
    let adminToken, apprenticeToken, instructorToken;
    let apprenticeId, instructorId, epId, bitacoraId;

    const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar
        await User.deleteMany({ email: /test_bitacora.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await Bitacora.deleteMany({});
        await HourRecord.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = 'Password123!';
        const hashedPass = await bcrypt.hash(pass, salt);

        // Crear Admin
        await new User({
            nationalId: '888001',
            fullName: 'Admin Test Bitacora',
            email: 'test_bitacora_admin@repfora.com',
            password: hashedPass,
            role: 'ADMIN',
            firstLogin: false
        }).save();

        // Crear Aprendiz
        const apprentice = await new User({
            nationalId: '888002',
            fullName: 'Apprentice Test Bitacora',
            email: 'test_bitacora_app@repfora.com',
            password: hashedPass,
            role: 'APPRENTICE',
            trainingLevel: 'TECHNOLOGIST',
            firstLogin: false
        }).save();
        apprenticeId = apprentice._id;

        // Crear Instructor
        const instructor = await new User({
            nationalId: '888003',
            fullName: 'Instructor Test Bitacora',
            email: 'test_bitacora_ins@repfora.com',
            password: hashedPass,
            role: 'INSTRUCTOR',
            instructorType: 'FOLLOWUP',
            status: 'ACTIVE',
            firstLogin: false
        }).save();
        instructorId = instructor._id;

        // Crear EP activa
        const ep = await new ProductiveStage({
            apprentice: apprenticeId,
            modality: 'APPRENTICESHIP_CONTRACT',
            status: 'ACTIVE',
            followupInstructor: instructorId,
            maxBitacoras: 12,
            requiredTrackings: 3
        }).save();
        epId = ep._id;

        // Configuración
        await SystemConfig.findOneAndUpdate(
            { key: 'HOURS_PER_LOGBOOK_REVIEW' },
            { value: 2, valueType: 'NUMBER', description: 'Test' },
            { upsert: true }
        );
        await SystemConfig.findOneAndUpdate(
          { key: 'MAX_MONTHLY_HOURS_INSTRUCTOR' },
          { value: 160, valueType: 'NUMBER', description: 'Test' },
          { upsert: true }
        );

        // Logins
        const resAdmin = await request(app).post('/api/auth/login').send({ nationalId: '888001', password: pass });
        adminToken = resAdmin.body.data.token;

        const resApp = await request(app).post('/api/auth/login').send({ nationalId: '888002', password: pass });
        apprenticeToken = resApp.body.data.token;

        const resIns = await request(app).post('/api/auth/login').send({ nationalId: '888003', password: pass });
        instructorToken = resIns.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_bitacora.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await Bitacora.deleteMany({});
        await HourRecord.deleteMany({});
        await mongoose.connection.close();
    });

    describe('POST /api/bitacoras - Entrega de Bitácora', () => {
        it('✅ Aprendiz entrega bitácora correctamente', async () => {
            const res = await request(app)
                .post('/api/bitacoras')
                .set('Authorization', `Bearer ${apprenticeToken}`)
                .field('productiveStageId', epId.toString())
                .field('periodStart', '2025-01-01')
                .field('periodEnd', '2025-01-15')
                .attach('file', Buffer.from('PDF dummy content'), 'bitacora1.pdf');

            expect(res.statusCode).toBe(201);
            expect(res.body.data.bitacora.status).toBe('PENDING');
            expect(res.body.data.bitacora.logbookNumber).toBe(1);
            bitacoraId = res.body.data.bitacora._id;
        });

        it('❌ Error por período duplicado', async () => {
            const res = await request(app)
                .post('/api/bitacoras')
                .set('Authorization', `Bearer ${apprenticeToken}`)
                .field('productiveStageId', epId.toString())
                .field('periodStart', '2025-01-01')
                .field('periodEnd', '2025-01-15')
                .attach('file', Buffer.from('PDF dummy content'), 'bitacora1_dup.pdf');

            expect(res.statusCode).toBe(409);
        });

        it('❌ Instructor no puede entregar bitácora', async () => {
            const res = await request(app)
                .post('/api/bitacoras')
                .set('Authorization', `Bearer ${instructorToken}`)
                .field('productiveStageId', epId.toString())
                .field('periodStart', '2025-02-01')
                .field('periodEnd', '2025-02-15')
                .attach('file', Buffer.from('PDF dummy content'), 'fail.pdf');

            expect(res.statusCode).toBe(403);
        });
    });

    describe('GET /api/bitacoras', () => {
        it('✅ Obtener lista de bitácoras (Instructor)', async () => {
            const res = await request(app)
                .get(`/api/bitacoras?productiveStageId=${epId}`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.bitacoras.length).toBeGreaterThan(0);
        });

        it('✅ Obtener detalle de bitácora', async () => {
            const res = await request(app)
                .get(`/api/bitacoras/${bitacoraId}`)
                .set('Authorization', `Bearer ${apprenticeToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.bitacora._id).toBe(bitacoraId);
        });
    });

    describe('Gestión de Bitácora (Instructor)', () => {
        it('✅ Instructor aprueba bitácora y se asignan horas', async () => {
            const res = await request(app)
                .patch(`/api/bitacoras/${bitacoraId}/approve`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.bitacora.status).toBe('APPROVED');
            expect(res.body.data.bitacora.assignedHours).toBe(2);

            // Verificar ProductiveStage
            const ep = await ProductiveStage.findById(epId);
            expect(ep.completedBitacoras).toBe(1);

            // Verificar HourRecord
            const hr = await HourRecord.findOne({ instructor: instructorId });
            expect(hr.bitacoraHours).toBe(2);
            expect(hr.totalHours).toBe(2);

            // Verificar User
            const instructor = await User.findById(instructorId);
            expect(instructor.accumulatedHours).toBe(2);
            expect(instructor.pendingPaymentHours).toBe(2);
        });

        it('✅ Rechazo de bitácora', async () => {
            // Entregar otra bitácora para rechazar
            const submission = await request(app)
                .post('/api/bitacoras')
                .set('Authorization', `Bearer ${apprenticeToken}`)
                .field('productiveStageId', epId.toString())
                .field('periodStart', '2025-02-01')
                .field('periodEnd', '2025-02-15')
                .attach('file', Buffer.from('PDF dummy content'), 'bitacora2.pdf');
            
            const bId = submission.body.data.bitacora._id;

            const res = await request(app)
                .patch(`/api/bitacoras/${bId}/reject`)
                .set('Authorization', `Bearer ${instructorToken}`)
                .send({ comment: 'Faltan actividades detalladas en el reporte' });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.bitacora.status).toBe('REJECTED');
            expect(res.body.data.bitacora.reviewComments[0].text).toMatch(/Faltan/);
        });
    });
});
