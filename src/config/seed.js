import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.model.js";
import { conectarMongo } from "./db.js";

const seedAdmin = async () => {
    try {
        await conectarMongo();

        // Limpiar usuarios previos (Opcional, ten cuidado en producción)
        // await User.deleteMany({});

        const adminExists = await User.findOne({ nationalId: "123456" });

        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash("Admin123!", salt);

            const admin = new User({
                nationalId: "123456",
                fullName: "Administrador del Sistema",
                email: "admin@repfora.com",
                password: hashedPassword,
                role: "ADMIN",
                status: "ACTIVE",
                firstLogin: true // Forzará cambio de contraseña al entrar
            });

            await admin.save();
            console.log("✅ Admin de prueba creado: Cédula 123456 / Pass: Admin123!");
        } else {
            console.log("ℹ️ El admin ya existe en la base de datos.");
        }

        process.exit();
    } catch (error) {
        console.error("❌ Error al crear admin:", error.message);
        process.exit(1);
    }
};

seedAdmin();
