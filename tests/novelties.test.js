import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../index.js';
import User from '../src/models/User.model.js';
import ProductiveStage from '../src/models/ProductiveStage.model.js';
import Novelty from '../src/models/Novelty.model.js';
import { env } from '../src/config/env.js';

describe('Módulo Novelties (Novedades)', () => {
    let adminToken, instructorToken, otherInstructorToken, apprenticeToken;
    let apprenticeId, instructorId, otherInstructorId, epId, noveltyId;

    const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar
        await User.deleteMany({ email: /test_novelty.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await Novelty.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = 'Password123!';
        const hashedPass = await bcrypt.hash(pass, salt);

        // Admin
        await new User({
            nationalId: '444001',
            fullName: 'Admin Test Novelty',
            email: 'test_novelty_admin@repfora.com',
            password: hashedPass,
            role: 'ADMIN',
            firstLogin: false
        }).save();

        // Apprentice
        const apprentice = await new User({
            nationalId: '444002',
            fullName: 'Apprentice Test Novelty',
            email: 'test_novelty_app@repfora.com',
            password: hashedPass,
            role: 'APPRENTICE',
            firstLogin: false
        }).save();
        apprenticeId = apprentice._id;

        // Instructor
        const instructor = await new User({
            nationalId: '444003',
            fullName: 'Instructor Test Novelty',
            email: 'test_novelty_ins@repfora.com',
            password: hashedPass,
            role: 'INSTRUCTOR',
            instructorType: 'FOLLOWUP',
            status: 'ACTIVE',
            firstLogin: false
        }).save();
        instructorId = instructor._id;

        // Other Instructor (not assigned)
        const otherInstructor = await new User({
          nationalId: '444004',
          fullName: 'Other Instructor Test Novelty',
          email: 'test_novelty_other@repfora.com',
          password: hashedPass,
          role: 'INSTRUCTOR',
          instructorType: 'TECHNICAL',
          status: 'ACTIVE',
          firstLogin: false
      }).save();
      otherInstructorId = otherInstructor._id;

        // EP activa
        const ep = await new ProductiveStage({
            apprentice: apprenticeId,
            modality: 'APPRENTICESHIP_CONTRACT',
            status: 'ACTIVE',
            followupInstructor: instructorId
        }).save();
        epId = ep._id;

        // Logins
        const resAdmin = await request(app).post('/api/auth/login').send({ nationalId: '444001', password: pass });
        adminToken = resAdmin.body.data.token;

        const resApp = await request(app).post('/api/auth/login').send({ nationalId: '444002', password: pass });
        apprenticeToken = resApp.body.data.token;

        const resIns = await request(app).post('/api/auth/login').send({ nationalId: '444003', password: pass });
        instructorToken = resIns.body.data.token;

        const resOther = await request(app).post('/api/auth/login').send({ nationalId: '444004', password: pass });
        otherInstructorToken = resOther.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_novelty.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await Novelty.deleteMany({});
        await mongoose.connection.close();
    });

    describe('POST /api/novelties - Reportar Novedad', () => {
        it('✅ Instructor reporta novedad correctamente', async () => {
            const res = await request(app)
                .post('/api/novelties')
                .set('Authorization', `Bearer ${instructorToken}`)
                .field('productiveStageId', epId.toString())
                .field('type', 'DESERTION')
                .field('description', 'El aprendiz no ha asistido a la empresa durante los últimos 5 días y no responde mensajes.')
                .field('occurrenceDate', '2025-05-01')
                .attach('files', Buffer.from('PDF dummy content'), 'evidencia.pdf');

            expect(res.statusCode).toBe(201);
            expect(res.body.data.status).toBe('PENDING');
            expect(res.body.data.pdfDriveUrl).toBeDefined();
            noveltyId = res.body.data._id;
        });

        it('❌ Error por descripción corta (< 50 chars)', async () => {
            const res = await request(app)
                .post('/api/novelties')
                .set('Authorization', `Bearer ${instructorToken}`)
                .send({
                    productiveStageId: epId,
                    type: 'DISCIPLINARY_ISSUE',
                    description: 'Algo pasó.',
                    occurrenceDate: new Date()
                });

            expect(res.statusCode).toBe(400);
        });

        it('❌ Error si instructor no está asignado a la EP', async () => {
            const res = await request(app)
                .post('/api/novelties')
                .set('Authorization', `Bearer ${otherInstructorToken}`)
                .send({
                    productiveStageId: epId,
                    type: 'DESERTION',
                    description: 'Intento de reporte por instructor no asignado a esta etapa productiva.',
                    occurrenceDate: new Date()
                });

            expect(res.statusCode).toBe(403);
        });

        it('❌ Aprendiz no puede reportar novedades', async () => {
            const res = await request(app)
                .post('/api/novelties')
                .set('Authorization', `Bearer ${apprenticeToken}`)
                .send({
                    productiveStageId: epId,
                    type: 'OTHER',
                    description: 'Reporte inválido por un aprendiz que no debería tener acceso.',
                    occurrenceDate: new Date()
                });

            expect(res.statusCode).toBe(403);
        });
    });

    describe('GET /api/novelties', () => {
        it('✅ Admin ve todas las novedades', async () => {
            const res = await request(app)
                .get('/api/novelties')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.novelties.length).toBeGreaterThan(0);
        });

        it('✅ Instructor ve solo sus novedades', async () => {
            const res = await request(app)
                .get('/api/novelties')
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.novelties.every(n => n.reportedBy._id === instructorId.toString())).toBe(true);
        });
    });

    describe('PATCH /api/novelties/:id/status - Gestión Admin', () => {
        it('✅ Admin cambia a IN_PROGRESS', async () => {
            const res = await request(app)
                .patch(`/api/novelties/${noveltyId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'IN_PROGRESS',
                    actionsTaken: 'Se contactó con el centro de formación para iniciar proceso disciplinario.'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.status).toBe('IN_PROGRESS');
        });

        it('❌ Error al intentar retroceder estado (IN_PROGRESS -> PENDING)', async () => {
            const res = await request(app)
                .patch(`/api/novelties/${noveltyId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'PENDING',
                    actionsTaken: 'Intento de retroceso inválido.'
                });

            expect(res.statusCode).toBe(400);
        });

        it('✅ Admin cambia a RESOLVED', async () => {
            const res = await request(app)
                .patch(`/api/novelties/${noveltyId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'RESOLVED',
                    actionsTaken: 'El aprendiz fue retirado del programa por deserción confirmada.'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.status).toBe('RESOLVED');
            expect(res.body.data.resolvedAt).toBeDefined();
            expect(res.body.data.resolvedBy).toBeDefined();
        });
    });

    describe('GET /api/novelties/ep/:id', () => {
        it('✅ Reporta estadísticas por EP', async () => {
            const res = await request(app)
                .get(`/api/novelties/ep/${epId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.total).toBe(1);
            expect(res.body.data.resolved).toBe(1);
        });
    });
});
