import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import app from "../index.js";
import User from "../src/models/User.model.js";
import SystemConfig from "../src/models/SystemConfig.model.js";
import { env } from "../src/config/env.js";

describe("Módulo SystemConfig", () => {
    let adminToken, instructorToken;

    beforeAll(async () => {
        const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }

        // Limpiar para pruebas
        await User.deleteMany({ email: /test_config.*@repfora.com/ });
        
        const salt = await bcrypt.genSalt(10);
        const pass = "Password123!";
        const hashedPass = await bcrypt.hash(pass, salt);

        // Crear Admin
        const admin = await new User({
            nationalId: "777777",
            fullName: "Admin Test Config",
            email: "test_config_admin@repfora.com",
            password: hashedPass,
            role: "ADMIN",
            firstLogin: false
        }).save();

        // Crear Instructor
        const instructor = await new User({
            nationalId: "888888",
            fullName: "Instructor Test Config",
            email: "test_config_ins@repfora.com",
            password: hashedPass,
            role: "INSTRUCTOR",
            firstLogin: false
        }).save();

        // Logins para obtener tokens
        const resAdmin = await request(app).post("/api/auth/login").send({ nationalId: "777777", password: pass });
        adminToken = resAdmin.body.data.token;

        const resIns = await request(app).post("/api/auth/login").send({ nationalId: "888888", password: pass });
        instructorToken = resIns.body.data.token;

        // Asegurar que exista una configuración para probar
        await SystemConfig.findOneAndUpdate(
            { key: "TEST_PARAM" },
            { value: 10, valueType: "NUMBER", description: "Test parameter" },
            { upsert: true }
        );
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_config.*@repfora.com/ });
        await SystemConfig.deleteOne({ key: "TEST_PARAM" });
        await mongoose.connection.close();
    });

    describe("GET /api/system-config", () => {
        it("✅ Debería permitir al ADMIN ver todas las configuraciones", async () => {
            const res = await request(app)
                .get("/api/system-config")
                .set("Authorization", `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body.data.configs)).toBe(true);
        });

        it("❌ Debería denegar acceso a un INSTRUCTOR", async () => {
            const res = await request(app)
                .get("/api/system-config")
                .set("Authorization", `Bearer ${instructorToken}`);

            expect(res.statusCode).toBe(403);
            expect(res.body.success).toBe(false);
        });
    });

    describe("PATCH /api/system-config/:key", () => {
        it("✅ Debería permitir al ADMIN actualizar un valor numérico", async () => {
            const res = await request(app)
                .patch("/api/system-config/TEST_PARAM")
                .set("Authorization", `Bearer ${adminToken}`)
                .send({ value: 25 });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.value).toBe(25);
            
            // Verificar en DB
            const updated = await SystemConfig.findOne({ key: "TEST_PARAM" });
            expect(updated.value).toBe(25);
        });

        it("❌ Debería fallar si el tipo de dato es incorrecto (STRING en lugar de NUMBER)", async () => {
            const res = await request(app)
                .patch("/api/system-config/TEST_PARAM")
                .set("Authorization", `Bearer ${adminToken}`)
                .send({ value: "No soy un número" });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/NUMBER/);
        });
    });
});
