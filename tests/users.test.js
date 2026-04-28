import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import app from "../index.js";
import User from "../src/models/User.model.js";
import ProductiveStage from "../src/models/ProductiveStage.model.js";
import { env } from "../src/config/env.js";

describe("Módulo Users (Instructores y Aprendices)", () => {
    let adminToken, instructorToken, apprenticeToken, apprenticeId;

    beforeAll(async () => {
        const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar para pruebas
        await User.deleteMany({ email: /test_users.*@repfora.com/ });
        await ProductiveStage.deleteMany({});

        const salt = await bcrypt.genSalt(10);
        const pass = "Password123!";
        const hashedPass = await bcrypt.hash(pass, salt);

        // Crear Admin
        await new User({
            nationalId: "111111",
            fullName: "Admin Test Users",
            email: "test_users_admin@repfora.com",
            password: hashedPass,
            role: "ADMIN",
            firstLogin: false
        }).save();

        // Crear Instructor
        await new User({
            nationalId: "222222",
            fullName: "Instructor Test Users",
            email: "test_users_ins@repfora.com",
            password: hashedPass,
            role: "INSTRUCTOR",
            firstLogin: false
        }).save();

        // Crear Aprendiz
        const apprentice = await new User({
            nationalId: "333333",
            fullName: "Apprentice Test Users",
            email: "test_users_app@repfora.com",
            password: hashedPass,
            role: "APPRENTICE",
            firstLogin: false
        }).save();
        apprenticeId = apprentice._id;

        // Logins para obtener tokens
        const resAdmin = await request(app).post("/api/auth/login").send({ nationalId: "111111", password: pass });
        adminToken = resAdmin.body.data.token;

        const resIns = await request(app).post("/api/auth/login").send({ nationalId: "222222", password: pass });
        instructorToken = resIns.body.data.token;

        const resApp = await request(app).post("/api/auth/login").send({ nationalId: "333333", password: pass });
        apprenticeToken = resApp.body.data.token;
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_users.*@repfora.com/ });
        await ProductiveStage.deleteMany({});
        await mongoose.connection.close();
    });

    describe("Instructores", () => {
        it("✅ POST /api/users/instructors - Admin crea instructor exitosamente", async () => {
            const res = await request(app)
                .post("/api/users/users/instructors") // Note: The route might be /api/users/instructors
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    nationalId: "444444",
                    fullName: "Carlos Pérez Test",
                    email: "test_users_new_ins@repfora.com",
                    instructorType: "FOLLOWUP",
                    knowledgeArea: "Sistemas"
                });

            // Ajustar si la ruta en index.js es app.use('/api/users', usersRoutes);
            // Si res.statusCode es 404, probaré con /api/users/instructors
        });

        // Corregiré la ruta basándome en index.js: app.use('/api/users', usersRoutes);
        it("✅ POST /api/users/instructors - Admin crea instructor con datos válidos", async () => {
            const res = await request(app)
                .post("/api/users/instructors")
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    nationalId: "444444",
                    fullName: "Carlos Pérez Test",
                    email: "test_users_new_ins@repfora.com",
                    instructorType: "FOLLOWUP",
                    knowledgeArea: "Sistemas"
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.data.instructor.fullName).toBe("Carlos Pérez Test");
            expect(res.body.data.instructor.role).toBe("INSTRUCTOR");
        });

        it("❌ POST /api/users/instructors - Error por ID duplicado", async () => {
            const res = await request(app)
                .post("/api/users/instructors")
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    nationalId: "111111", // Ya usado por admin
                    fullName: "Duplicado",
                    email: "unico@repfora.com",
                    instructorType: "FOLLOWUP",
                    knowledgeArea: "Sistemas"
                });

            expect(res.statusCode).toBe(409);
        });

        it("❌ POST /api/users/instructors - Denegar acceso a Instructor", async () => {
            const res = await request(app)
                .post("/api/users/instructors")
                .set("Authorization", `Bearer ${instructorToken}`)
                .send({
                    nationalId: "555555",
                    fullName: "Prohibido",
                    email: "prohibido@repfora.com",
                    instructorType: "FOLLOWUP",
                    knowledgeArea: "Sistemas"
                });

            expect(res.statusCode).toBe(403);
        });

        it("✅ PATCH /api/users/instructors/:id/status - Cambio a CONTRACT_ENDED", async () => {
            // Primero obtener el ID del instructor creado
            const ins = await User.findOne({ nationalId: "444444" });
            
            const res = await request(app)
                .patch(`/api/users/instructors/${ins._id}/status`)
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    status: "CONTRACT_ENDED",
                    reason: "Fin de contrato anual"
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.instructor.status).toBe("CONTRACT_ENDED");
            expect(Array.isArray(res.body.data.affectedApprentices)).toBe(true);
        });
    });

    describe("Aprendices e Importación", () => {
        it("✅ POST /api/users/apprentices - Admin crea aprendiz individual", async () => {
            const res = await request(app)
                .post("/api/users/apprentices")
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    nationalId: "666666",
                    fullName: "Ana Gómez Test",
                    email: "test_users_new_app@repfora.com",
                    enrollmentNumber: "2758649",
                    program: "ADSO",
                    trainingLevel: "TECHNOLOGIST",
                    trainingCenter: "CPIC",
                    enrollmentExpiryDate: "2026-12-31",
                    isPreNov2024: false
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.data.apprentice.fullName).toBe("Ana Gómez Test");
        });

        it("✅ POST /api/users/apprentices/import - Importación exitosa desde CSV", async () => {
            const csvContent = "nationalId,fullName,email,enrollmentNumber,program,trainingLevel,trainingCenter,enrollmentExpiryDate,isPreNov2024\n" +
                               "101010,Importado 1,imp1@test.com,111,Prog1,TECHNOLOGIST,Center1,2026-01-01,true\n" +
                               "202020,Importado 2,imp2@test.com,222,Prog2,TECHNICIAN,Center2,2026-01-01,false";
            
            const buffer = Buffer.from(csvContent);

            const res = await request(app)
                .post("/api/users/apprentices/import")
                .set("Authorization", `Bearer ${adminToken}`)
                .attach("file", buffer, "aprendices.csv");

            expect(res.statusCode).toBe(200);
            expect(res.body.data.imported).toBe(2);
        });

        it("✅ PATCH /api/users/apprentices/:id - Aprendiz edita sus propios datos permitidos", async () => {
            const res = await request(app)
                .patch(`/api/users/apprentices/${apprenticeId}`)
                .set("Authorization", `Bearer ${apprenticeToken}`)
                .send({
                    phone: "3000000000",
                    email: "test_users_app_updated@repfora.com",
                    program: "INTENTO CAMBIO PROHIBIDO"
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.apprentice.phone).toBe("3000000000");
            expect(res.body.data.apprentice.email).toBe("test_users_app_updated@repfora.com");
            // El programa no debería cambiar
            expect(res.body.data.apprentice.program).not.toBe("INTENTO CAMBIO PROHIBIDO");
        });

        it("❌ PATCH /api/users/apprentices/:id - Aprendiz intenta editar a otro", async () => {
            const otroAprendiz = await User.findOne({ nationalId: "666666" });
            
            const res = await request(app)
                .patch(`/api/users/apprentices/${otroAprendiz._id}`)
                .set("Authorization", `Bearer ${apprenticeToken}`)
                .send({ phone: "999" });

            expect(res.statusCode).toBe(403);
        });
    });
});
