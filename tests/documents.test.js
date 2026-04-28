import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../index.js';
import User from '../src/models/User.model.js';
import ProductiveStage from '../src/models/ProductiveStage.model.js';
import Document from '../src/models/Document.model.js';
import HourRecord from '../src/models/HourRecord.model.js';
import SystemConfig from '../src/models/SystemConfig.model.js';
import { env } from '../src/config/env.js';

describe('Módulo Documentación de Certificación', () => {
    let adminToken, apprenticeToken, instructorToken;
    let apprenticeId, instructorId, epId, docId;

    const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar
        await User.deleteMany({ email: /test_docs.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await Document.deleteMany({});
        await HourRecord.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = 'Password123!';
        const hashedPass = await bcrypt.hash(pass, salt);

        // Admin
        await new User({
            nationalId: '555001',
            fullName: 'Admin Test Docs',
            email: 'test_docs_admin@repfora.com',
            password: hashedPass,
            role: 'ADMIN',
            firstLogin: false
        }).save();

        // Apprentice
        const apprentice = await new User({
            nationalId: '555002',
            fullName: 'Apprentice Test Docs',
            email: 'test_docs_app@repfora.com',
            password: hashedPass,
            role: 'APPRENTICE',
            firstLogin: false
        }).save();
        apprenticeId = apprentice._id;

        // Instructor
        const instructor = await new User({
            nationalId: '555003',
            fullName: 'Instructor Test Docs',
            email: 'test_docs_ins@repfora.com',
            password: hashedPass,
            role: 'INSTRUCTOR',
            instructorType: 'FOLLOWUP',
            status: 'ACTIVE',
            firstLogin: false
        }).save();
        instructorId = instructor._id;

        // EP en estado CERTIFICATION
        const ep = await new ProductiveStage({
            apprentice: apprenticeId,
            modality: 'APPRENTICESHIP_CONTRACT',
            status: 'CERTIFICATION',
            followupInstructor: instructorId
        }).save();
        epId = ep._id;

        await SystemConfig.findOneAndUpdate({ key: 'HOURS_PER_CERTIFICATION' }, { value: 2, valueType: 'NUMBER' }, { upsert: true });

        // Logins
        const resAdmin = await request(app).post('/api/auth/login').send({ nationalId: '555001', password: pass });
        adminToken = resAdmin.body.data.token;

        const resApp = await request(app).post('/api/auth/login').send({ nationalId: '555002', password: pass });
        apprenticeToken = resApp.body.data.token;

        const resIns = await request(app).post('/api/auth/login').send({ nationalId: '555003', password: pass });
        instructorToken = resIns.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_docs.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await Document.deleteMany({});
        await HourRecord.deleteMany({});
        await mongoose.connection.close();
    });

    describe('POST /api/documents - Entrega de documentos', () => {
        it('✅ Aprendiz entrega documento requerido', async () => {
            const res = await request(app)
                .post('/api/documents')
                .set('Authorization', `Bearer ${apprenticeToken}`)
                .field('productiveStageId', epId.toString())
                .field('documentType', 'EP_CERTIFICATE')
                .attach('file', Buffer.from('PDF dummy'), 'certificado.pdf');

            expect(res.statusCode).toBe(201);
            expect(res.body.data.status).toBe('SUBMITTED');
            docId = res.body.data._id;
        });

        it('❌ Error si EP no está en CERTIFICATION', async () => {
            const otherEP = await new ProductiveStage({
                apprentice: apprenticeId,
                status: 'ACTIVE',
                modality: 'INTERNSHIP'
            }).save();

            const res = await request(app)
                .post('/api/documents')
                .set('Authorization', `Bearer ${apprenticeToken}`)
                .field('productiveStageId', otherEP._id.toString())
                .field('documentType', 'PERFORMANCE_EVALUATION')
                .attach('file', Buffer.from('PDF dummy'), 'eval.pdf');

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/certification stage/i);
        });
    });

    describe('Aprobación y Bolsa de Horas', () => {
        it('✅ Admin aprueba documento', async () => {
            const res = await request(app)
                .patch(`/api/documents/${docId}/approve`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.status).toBe('APPROVED');
        });

        it('✅ Al aprobar todos los requeridos, se asignan horas al instructor', async () => {
            // Faltan 2: PERFORMANCE_EVALUATION, COMMITMENT_LETTER
            await request(app).post('/api/documents').set('Authorization', `Bearer ${apprenticeToken}`)
                .field('productiveStageId', epId.toString()).field('documentType', 'PERFORMANCE_EVALUATION')
                .attach('file', Buffer.from('X'), 'eval.pdf');
            
            const docs = await Document.find({ productiveStage: epId, documentType: 'PERFORMANCE_EVALUATION' });
            await request(app).patch(`/api/documents/${docs[0]._id}/approve`).set('Authorization', `Bearer ${adminToken}`);

            // El último
            const lastSubmission = await request(app).post('/api/documents').set('Authorization', `Bearer ${apprenticeToken}`)
                .field('productiveStageId', epId.toString()).field('documentType', 'COMMITMENT_LETTER')
                .attach('file', Buffer.from('X'), 'carta.pdf');
            
            const lastDocId = lastSubmission.body.data._id;
            
            const res = await request(app)
                .patch(`/api/documents/${lastDocId}/approve`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);

            // Verificar Bolsa de Horas
            const hr = await HourRecord.findOne({ instructor: instructorId });
            expect(hr.certificationHours).toBe(2);
            expect(hr.totalHours).toBe(2);
        });
    });

    describe('GET /api/documents/ep/:id/status', () => {
        it('✅ Reporta estado completo de documentos', async () => {
            const res = await request(app)
                .get(`/api/documents/ep/${epId}/status`)
                .set('Authorization', `Bearer ${apprenticeToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.allRequiredApproved).toBe(true);
            expect(res.body.data.missing.length).toBe(0);
        });
    });

    describe('Eliminación de documentos', () => {
        it('❌ Admin no puede borrar aprobado sin solicitud', async () => {
            const res = await request(app)
                .delete(`/api/documents/${docId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(403);
        });

        it('✅ Instructor solicita eliminación', async () => {
            const res = await request(app)
                .patch(`/api/documents/${docId}/request-deletion`)
                .set('Authorization', `Bearer ${instructorToken}`)
                .send({ reason: 'Error en el archivo cargado por el aprendiz, falta firma.' });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.deletionRequested).toBe(true);
        });

        it('✅ Admin borra (soft-delete) tras solicitud', async () => {
            const res = await request(app)
                .delete(`/api/documents/${docId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            const doc = await Document.findById(docId);
            expect(doc.isActive).toBe(false);
        });
    });
});
