import mongoose from "mongoose";
import { env } from "./env.js";

export const conectarMongo = async () => {
  try {
    if (!env.MONGODB_URI) {
      throw new Error("La variable MONGODB_URI no está definida en el archivo .env");
    }
    await mongoose.connect(env.MONGODB_URI);
    console.log("✅ Mongo conectado");
  } catch (error) {
    console.error("❌ Error Mongo:", error.message);
  }
};  

