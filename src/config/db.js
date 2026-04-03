import mongoose from "mongoose";
import { env } from "./env.js";

export const conectarMongo = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("✅ Mongo conectado");
  } catch (error) {
    console.error("❌ Error Mongo:", error);
  }
};  

