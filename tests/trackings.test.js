import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../index.js';
import User from '../src/models/User.model.js';
import ProductiveStage from '../src/models/ProductiveStage.model.js';
import Tracking from '../src/models/Tracking.model.js';
import HourRecord from '../src/models/HourRecord.model.js';
import SystemConfig from '../src/models/SystemConfig.model.js';
import { env } from '../src/config/env.js';

describe('Módulo Trackings (Seguimientos)', () => {
    let adminToken, instructorToken, apprenticeToken;
    let instructorId, epId, trackingId;

    const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar
        await User.deleteMany({ email: /test_tracking.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await Tracking.deleteMany({});
        await HourRecord.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = 'Password123!';
        const hashedPass = await bcrypt.hash(pass, salt);

        // Admin
        await new User({
            nationalId: '777001',
            fullName: 'Admin Test Tracking',
            email: 'test_tracking_admin@repfora.com',
            password: hashedPass,
            role: 'ADMIN',
            firstLogin: false
        }).save();

        // Apprentice
        const apprentice = await new User({
            nationalId: '777002',
            fullName: 'Apprentice Test Tracking',
            email: 'test_tracking_app@repfora.com',
            password: hashedPass,
            role: 'APPRENTICE',
            firstLogin: false
        }).save();

        // Instructor
        const instructor = await new User({
            nationalId: '777003',
            fullName: 'Instructor Test Tracking',
            email: 'test_tracking_ins@repfora.com',
            password: hashedPass,
            role: 'INSTRUCTOR',
            instructorType: 'FOLLOWUP',
            status: 'ACTIVE',
            firstLogin: false
        }).save();
        instructorId = instructor._id;

        // EP
        const ep = await new ProductiveStage({
            apprentice: apprentice._id,
            modality: 'APPRENTICESHIP_CONTRACT',
            status: 'ACTIVE',
            followupInstructor: instructorId,
            requiredTrackings: 3
        }).save();
        epId = ep._id;

        // Configs
        await SystemConfig.findOneAndUpdate({ key: 'HOURS_PER_IN_PERSON_TRACKING' }, { value: 2, valueType: 'NUMBER' }, { upsert: true });
        await SystemConfig.findOneAndUpdate({ key: 'HOURS_PER_VIRTUAL_TRACKING' }, { value: 2, valueType: 'NUMBER' }, { upsert: true });
        await SystemConfig.findOneAndUpdate({ key: 'HOURS_PER_EXTRAORDINARY_TRACKING' }, { value: 4, valueType: 'NUMBER' }, { upsert: true });

        // Logins
        const resAdmin = await request(app).post('/api/auth/login').send({ nationalId: '777001', password: pass });
        adminToken = resAdmin.body.data.token;

        const resIns = await request(app).post('/api/auth/login').send({ nationalId: '777003', password: pass });
        instructorToken = resIns.body.data.token;

        const resApp = await request(app).post('/api/auth/login').send({ nationalId: '777002', password: pass });
        apprenticeToken = resApp.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_tracking.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await Tracking.deleteMany({});
        await HourRecord.deleteMany({});
        await mongoose.connection.close();
    });

    describe('POST /api/trackings - Agendar Seguimiento', () => {
        it('✅ Instructor agenda seguimiento ordinario', async () => {
            const res = await request(app)
                .post('/api/trackings')
                .set('Authorization', `Bearer ${instructorToken}`)
                .send({
                    productiveStageId: epId,
                    type: 'IN_PERSON',
                    scheduledDate: new Date(new Date().setDate(new Date().getDate() + 5)),
                    notes: 'Primer seguimiento'
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.data.tracking.trackingNumber).toBe(1);
            expect(res.body.data.tracking.status).toBe('SCHEDULED');
            trackingId = res.body.data.tracking._id;
        });

        it('❌ Error por instructor no asignado', async () => {
            // Usar el password correcto (Password123!) que definimos arriba
            const pass = 'Password123!';
            const salt = await bcrypt.genSalt(10);
            const hashedPass = await bcrypt.hash(pass, salt);

            // Crear otro instructor
            const otherIns = await new User({
                nationalId: '777004',
                fullName: 'Other',
                email: 'test_tracking_other@repfora.com',
                password: hashedPass,
                role: 'INSTRUCTOR',
                firstLogin: false
            }).save();
            
            const login = await request(app).post('/api/auth/login').send({ nationalId: '777004', password: pass });
            const token = login.body.data.token;

            const res = await request(app)
                .post('/api/trackings')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    productiveStageId: epId,
                    type: 'IN_PERSON',
                    scheduledDate: new Date()
                });

            expect(res.statusCode).toBe(403);
        });
    });

    describe('Gestión de Seguimiento (PDF y Firmas)', () => {
        it('✅ Subir PDF del seguimiento', async () => {
            const res = await request(app)
                .patch(`/api/trackings/${trackingId}/upload-pdf`)
                .set('Authorization', `Bearer ${instructorToken}`)
                .attach('file', Buffer.from('PDF content'), 'seguimiento1.pdf');

            expect(res.statusCode).toBe(200);
            expect(res.body.data.tracking.driveFileId).toBeDefined();
        });

        it('✅ Validar firmas', async () => {
            const res = await request(app)
                .patch(`/api/trackings/${trackingId}/validate-signature`)
                .set('Authorization', `Bearer ${instructorToken}`)
                .send({
                    signedByInstructor: true,
                    signedByApprentice: true
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.tracking.signedByInstructor).toBe(true);
        });
    });

    describe('Ejecución y Pago', () => {
        it('✅ Ejecutar seguimiento - Asigna horas y actualiza EP', async () => {
            const res = await request(app)
                .patch(`/api/trackings/${trackingId}/execute`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.tracking.status).toBe('EXECUTED');
            expect(res.body.data.tracking.assignedHours).toBe(2);

            // Verificar EP
            const ep = await ProductiveStage.findById(epId);
            expect(ep.completedTrackings).toBe(1);

            // Verificar HourRecord
            const hr = await HourRecord.findOne({ instructor: instructorId });
            expect(hr.trackingHours).toBe(2);
        });

        it('✅ Marcar como cobrado (Paid)', async () => {
            const res = await request(app)
                .patch(`/api/trackings/${trackingId}/mark-paid`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.tracking.isPaid).toBe(true);
            expect(res.body.data.tracking.status).toBe('PAID');

            const hr = await HourRecord.findOne({ instructor: instructorId });
            expect(hr.paidHours).toBe(2);
        });
    });

    describe('Seguimientos Extraordinarios', () => {
        let extraordinaryId;

        it('✅ Solicitar seguimiento extraordinario', async () => {
            const res = await request(app)
                .post('/api/trackings/extraordinary/request')
                .set('Authorization', `Bearer ${instructorToken}`)
                .send({
                    productiveStageId: epId,
                    type: 'IN_PERSON',
                    scheduledDate: new Date(),
                    extraordinaryReason: 'El aprendiz no asiste a las sesiones de seguimiento programadas y no responde correos. Se requiere intervención.'
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.data.tracking.isExtraordinary).toBe(true);
            expect(res.body.data.tracking.approvedByAdmin).toBe(false);
            extraordinaryId = res.body.data.tracking._id;
        });

        it('❌ No permite ejecutar si no está aprobado por admin', async () => {
            const res = await request(app)
                .patch(`/api/trackings/${extraordinaryId}/execute`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/admin/i);
        });

        it('✅ Admin aprueba seguimiento extraordinario', async () => {
            const res = await request(app)
                .patch(`/api/trackings/${extraordinaryId}/approve-extraordinary`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.tracking.approvedByAdmin).toBe(true);
        });

        it('✅ Ejecutar seguimiento extraordinario - Horas distintas y NO incrementa completedTrackings', async () => {
            // Ahora que está aprobado, podemos subir PDF y Firmar
            await request(app)
                .patch(`/api/trackings/${extraordinaryId}/upload-pdf`)
                .set('Authorization', `Bearer ${instructorToken}`)
                .attach('file', Buffer.from('X'), 'x.pdf');
            
            await request(app)
                .patch(`/api/trackings/${extraordinaryId}/validate-signature`)
                .set('Authorization', `Bearer ${instructorToken}`)
                .send({ signedByInstructor: true, signedByApprentice: true });

            const res = await request(app)
                .patch(`/api/trackings/${extraordinaryId}/execute`)
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.tracking.assignedHours).toBe(4);

            const ep = await ProductiveStage.findById(epId);
            expect(ep.completedTrackings).toBe(1); // Se mantiene en 1 (el anterior)

            const hr = await HourRecord.findOne({ instructor: instructorId });
            expect(hr.extraordinaryHours).toBe(4);
            expect(hr.totalHours).toBe(6); // 2 + 4
        });
    });
});
