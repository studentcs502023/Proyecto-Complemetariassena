import dotenv from "dotenv";
dotenv.config();

export const env = {
    PORT: process.env.PORT || 3000,
    MONGODB_URI: process.env.MONGODB_URI,
    
    // Seguridad y JWT
    JWT_SECRET: process.env.JWT_SECRET || "default_super_secret",
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",

    // Control de Bloqueos Login
    MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    LOCK_TIME_MINUTES: parseInt(process.env.LOCK_TIME_MINUTES) || 2,
};