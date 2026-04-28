import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import app from "../index.js";
import User from "../src/models/User.model.js";
import { env } from "../src/config/env.js";

describe("Módulo de Autenticación", () => {
    let token;

    beforeAll(async () => {
        const MONGO_URI = env.MONGODB_URI || 'mongodb://127.0.0.1:27017/repfora_test';
        // Conectar a la base de datos para pruebas
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
        }
        
        // Limpiar usuarios de prueba previos
        await User.deleteMany({ email: /test_auth@repfora.com/ });

        // Crear usuario para pruebas
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash("Password123!", salt);

        const testUser = new User({
            nationalId: "999999",
            fullName: "Usuario de Prueba",
            email: "test_auth@repfora.com",
            password: passwordHash,
            role: "ADMIN",
            firstLogin: true,
            isActive: true
        });

        await testUser.save();
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test_auth@repfora.com/ });
        await mongoose.connection.close();
    });

    describe("POST /api/auth/login", () => {
        it("✅ Debería iniciar sesión correctamente y retornar token", async () => {
            const res = await request(app)
                .post("/api/auth/login")
                .send({
                    nationalId: "999999",
                    password: "Password123!"
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty("token");
            expect(res.body.data.requiresPasswordChange).toBe(true);
            token = res.body.data.token;
        });

        it("❌ Debería fallar con credenciales incorrectas", async () => {
            const res = await request(app)
                .post("/api/auth/login")
                .send({
                    nationalId: "999999",
                    password: "WrongPassword!"
                });

            expect(res.statusCode).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });

    describe("GET /api/auth/me", () => {
        it("❌ Debería bloquear acceso a /me si firstLogin es true", async () => {
            const res = await request(app)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${token}`);

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toMatch(/cambiar/i);
        });
    });

    describe("POST /api/auth/change-password-first", () => {
        it("✅ Debería cambiar la contraseña y desactivar firstLogin", async () => {
            const res = await request(app)
                .post("/api/auth/change-password-first")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    newPassword: "NewSecret2024!",
                    confirmPassword: "NewSecret2024!"
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            
            const user = await User.findOne({ nationalId: "999999" });
            expect(user.firstLogin).toBe(false);
        });
    });

    describe("Refrescar sesión tras cambio", () => {
        it("✅ Debería permitir acceso a /me ahora que firstLogin es false", async () => {
            const res = await request(app)
                .get("/api/auth/me")
                .set("Authorization", `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.nationalId).toBe("999999");
        });
    });
});
