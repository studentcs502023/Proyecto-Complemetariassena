import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import app from "../index.js";
import User from "../src/models/User.model.js";
import Company from "../src/models/Company.model.js";
import ProductiveStage from "../src/models/ProductiveStage.model.js";
import SystemConfig from "../src/models/SystemConfig.model.js";
import { env } from "../src/config/env.js";

describe("Módulo ProductiveStages (Etapa Productiva)", () => {
    let adminToken, apprenticeToken, instructorToken;
    let apprenticeId, companyId, epId;

    const MONGO_URI = env.MONGODB_URI || "mongodb://127.0.0.1:27017/repfora_test";

    beforeAll(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar para pruebas
        await User.deleteMany({ 
            $or: [
                { email: /test_ep.*@repfora.com/ },
                { nationalId: { $in: ["999001", "999002", "999003", "999004", "999999"] } }
            ]
        });
        await Company.deleteMany({ 
            $or: [
                { email: /test_ep.*@company.com/ },
                { taxId: "800-123-456" }
            ]
        });
        await ProductiveStage.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = "Password123!";
        const hashedPass = await bcrypt.hash(pass, salt);

        // Crear Admin
        await new User({
            nationalId: "999001",
            fullName: "Admin Test EP",
            email: "test_ep_admin@repfora.com",
            password: hashedPass,
            role: "ADMIN",
            firstLogin: false
        }).save();

        // Crear Aprendiz elegible (vence en 1 año)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        
        const apprentice = await new User({
            nationalId: "999002",
            fullName: "Apprentice Test EP",
            email: "test_ep_app@repfora.com",
            password: hashedPass,
            role: "APPRENTICE",
            trainingLevel: "TECHNOLOGIST",
            isPreNov2024: false,
            enrollmentExpiryDate: expiryDate,
            firstLogin: false
        }).save();
        apprenticeId = apprentice._id;

        // Crear Instructor
        const instructor = await new User({
            nationalId: "999003",
            fullName: "Instructor Test EP",
            email: "test_ep_ins@repfora.com",
            password: hashedPass,
            role: "INSTRUCTOR",
            instructorType: "FOLLOWUP",
            status: "ACTIVE",
            firstLogin: false
        }).save();

        // Crear Empresa
        const company = await new Company({
            taxId: "800-123-456",
            name: "Empresa Test EP",
            address: "Calle 123",
            phone: "5555555",
            email: "contact@test_ep_company.com"
        }).save();
        companyId = company._id;

        // Asegurar configuraciones necesarias
        await SystemConfig.findOneAndUpdate(
            { key: "EP_DEADLINE_MONTHS_NEW_ENROLLMENT" },
            { value: 6, valueType: "NUMBER", description: "Test" },
            { upsert: true }
        );
        await SystemConfig.findOneAndUpdate(
            { key: "EP_DEADLINE_YEARS_OLD_ENROLLMENT" },
            { value: 2, valueType: "NUMBER", description: "Test" },
            { upsert: true }
        );
        await SystemConfig.findOneAndUpdate(
            { key: "MAX_LOGBOOKS_TECHNOLOGIST" },
            { value: 12, valueType: "NUMBER", description: "Test" },
            { upsert: true }
        );
        await SystemConfig.findOneAndUpdate(
            { key: "REQUIRED_TRACKINGS_TECHNOLOGIST" },
            { value: 3, valueType: "NUMBER", description: "Test" },
            { upsert: true }
        );

        // Limpiar caché de configuración para que tome los nuevos valores
        const { invalidateCache } = await import("../src/utils/configHelper.util.js");
        invalidateCache();

        // Logins
        const resAdmin = await request(app).post("/api/auth/login").send({ nationalId: "999001", password: pass });
        adminToken = resAdmin.body.data.token;

        const resApp = await request(app).post("/api/auth/login").send({ nationalId: "999002", password: pass });
        apprenticeToken = resApp.body.data.token;

        const resIns = await request(app).post("/api/auth/login").send({ nationalId: "999003", password: pass });
        instructorToken = resIns.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_ep.*@repfora.com/ });
        await Company.deleteMany({ email: /test_ep.*@company.com/ });
        await ProductiveStage.deleteMany({});
        await mongoose.connection.close();
    });

    describe("Registro de Etapa Productiva", () => {
        it("✅ POST /api/productive-stages - Aprendiz registra su EP", async () => {
            const res = await request(app)
                .post("/api/productive-stages")
                .set("Authorization", `Bearer ${apprenticeToken}`)
                .send({
                    modality: "APPRENTICESHIP_CONTRACT",
                    companyId: companyId,
                    companySnapshot: {
                        apprenticeJobTitle: "Desarrollador Junior",
                        supervisorName: "Juan Jefe",
                        supervisorPhone: "3004445566",
                        supervisorEmail: "juan@empresa.com"
                    },
                    startDate: new Date(),
                    estimatedEndDate: new Date(new Date().setMonth(new Date().getMonth() + 6))
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.data.ep.status).toBe("PENDING_APPROVAL");
            epId = res.body.data.ep._id;
        });

        it("❌ POST /api/productive-stages - Error por EP ya existente", async () => {
            const res = await request(app)
                .post("/api/productive-stages")
                .set("Authorization", `Bearer ${apprenticeToken}`)
                .send({
                    modality: "INTERNSHIP",
                    companyId: companyId,
                    companySnapshot: { 
                        apprenticeJobTitle: "Otro",
                        supervisorName: "Pedro",
                        supervisorPhone: "123",
                        supervisorEmail: "p@p.com"
                    },
                    startDate: new Date(),
                    estimatedEndDate: new Date(new Date().setMonth(new Date().getMonth() + 6))
                });

            expect(res.statusCode).toBe(409);
            expect(res.body.message).toMatch(/activa/);
        });

        it("❌ POST /api/productive-stages - Error si plazo de matrícula venció", async () => {
            // Crear un aprendiz con matrícula vencida
            const salt = await bcrypt.genSalt(10);
            const expiredDate = new Date();
            expiredDate.setFullYear(expiredDate.getFullYear() - 5); // Hace 5 años venció

            const expiredApp = await new User({
                nationalId: "999999",
                fullName: "Expired Apprentice",
                email: "test_ep_expired@repfora.com",
                password: await bcrypt.hash("Pass123!", salt),
                role: "APPRENTICE",
                enrollmentExpiryDate: expiredDate,
                isPreNov2024: false,
                firstLogin: false
            }).save();

            const login = await request(app).post("/api/auth/login").send({ nationalId: "999999", password: "Pass123!" });
            const token = login.body.data.token;

            const res = await request(app)
                .post("/api/productive-stages")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    modality: "APPRENTICESHIP_CONTRACT",
                    companyId: companyId,
                    companySnapshot: { 
                        apprenticeJobTitle: "X",
                        supervisorName: "Pedro",
                        supervisorPhone: "123",
                        supervisorEmail: "p@p.com"
                    },
                    startDate: new Date(),
                    estimatedEndDate: new Date(new Date().setMonth(new Date().getMonth() + 6))
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/vencido/);
        });
    });

    describe("Aprobación y Gestión Administrativa", () => {
        it("✅ PATCH /api/productive-stages/:id/approve - Admin aprueba y se asignan límites", async () => {
            const res = await request(app)
                .patch(`/api/productive-stages/${epId}/approve`)
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    startDate: new Date(),
                    estimatedEndDate: new Date(new Date().setMonth(new Date().getMonth() + 6))
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.ep.status).toBe("ACTIVE");
            expect(res.body.data.ep.maxBitacoras).toBe(12); // Valor de config
            expect(res.body.data.ep.requiredTrackings).toBe(3); // Valor de config
        });

        it("✅ PATCH /api/productive-stages/:id/assign-instructors - Admin asigna instructor", async () => {
            const instructor = await User.findOne({ nationalId: "999003" });
            
            const res = await request(app)
                .patch(`/api/productive-stages/${epId}/assign-instructors`)
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    followupInstructorId: instructor._id
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.ep.followupInstructor).toBe(instructor._id.toString());
        });

        it("❌ PATCH /api/productive-stages/:id/assign-instructors - Error por falta de instructor técnico en modalidad Proyecto", async () => {
            // Cambiar modalidad de la EP en DB para probar validación
            await ProductiveStage.findByIdAndUpdate(epId, { modality: "INDIVIDUAL_PRODUCTIVE_PROJECT" });

            const res = await request(app)
                .patch(`/api/productive-stages/${epId}/assign-instructors`)
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    followupInstructorId: apprenticeId // Enviando cualquier ID para disparar validación de obligatoriedad primero
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/técnico es obligatorio/);
        });
    });

    describe("Seguridad y Visualización", () => {
        it("✅ GET /api/productive-stages/:id - Aprendiz ve su propia etapa", async () => {
            const res = await request(app)
                .get(`/api/productive-stages/${epId}`)
                .set("Authorization", `Bearer ${apprenticeToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.ep._id).toBe(epId.toString());
        });

        it("❌ GET /api/productive-stages/:id - Aprendiz intenta ver etapa ajena", async () => {
            // Crear otro aprendiz y su EP
            const otherApp = await new User({
                nationalId: "999004",
                fullName: "Other",
                email: "test_ep_other@repfora.com",
                password: "x",
                role: "APPRENTICE"
            }).save();

            const otherEP = await new ProductiveStage({
                apprentice: otherApp._id,
                modality: "INTERNSHIP"
            }).save();

            const res = await request(app)
                .get(`/api/productive-stages/${otherEP._id}`)
                .set("Authorization", `Bearer ${apprenticeToken}`);

            expect(res.statusCode).toBe(403);
        });
    });
});
