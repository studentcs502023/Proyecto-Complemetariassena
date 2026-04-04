import express from 'express';
import morgan from 'morgan';
import cors from 'cors'; // Que no falte cors
import { env } from './src/config/env.js';
import { conectarMongo } from './src/config/db.js'; 
import { seedSystemConfigs } from './src/config/systemConfig.seed.js';
import authRoutes from './src/routes/auth.routes.js';
import systemConfigRoutes from './src/routes/systemConfig.routes.js';

const app = express();

// Conectar a MongoDB Atlas (Solo si no estamos en test, o según la env)
if (process.env.NODE_ENV !== 'test') {
    conectarMongo().then(() => {
        // Ejecutar semilla de configuraciones al iniciar la DB
        seedSystemConfigs();
    });
}

// Middlewares
app.use(cors());
app.use(morgan('dev')); 
app.use(express.json()); 

// Rutas base
app.use('/api/auth', authRoutes);
app.use('/api/system-config', systemConfigRoutes);

// Puerto y Listen (Solo si no estamos en test)
if (process.env.NODE_ENV !== 'test') {
    const PORT = env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
        console.log(`📂 Base de datos: Etapa Productiva`);
    });
}

export default app;