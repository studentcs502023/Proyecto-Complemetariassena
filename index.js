import express from 'express';
import morgan from 'morgan';
import cors from 'cors'; // Que no falte cors
import { env } from './src/config/env.js';
import { conectarMongo } from './src/config/db.js'; 
import { seedSystemConfigs } from './src/config/systemConfig.seed.js';
import authRoutes from './src/routes/auth.routes.js';
import usersRoutes from './src/routes/users.routes.js';
import epRoutes from './src/routes/productiveStages.routes.js';
import systemConfigRoutes from './src/routes/systemConfig.routes.js';
import companyRoutes from './src/routes/companies.routes.js';
import noveltyRoutes from './src/routes/novelties.routes.js';
import documentRoutes from './src/routes/documents.routes.js';
import bitacoraRoutes from './src/routes/bitacoras.routes.js';
import trackingRoutes from './src/routes/trackings.routes.js';
import hourRoutes from './src/routes/hours.routes.js';
import notificationRoutes from './src/routes/notifications.routes.js';
import reportRoutes from './src/routes/reports.routes.js';
import { initJobs } from './src/jobs/alerts.job.js';

const app = express();

// Conectar a MongoDB Atlas (Solo si no estamos en test, o según la env)
if (process.env.NODE_ENV !== 'test') {
    conectarMongo().then(() => {
        // Ejecutar semilla de configuraciones al iniciar la DB
        seedSystemConfigs();
        // Iniciar cron jobs
        initJobs();
    });
}

// Middlewares
app.use(cors());
app.use(morgan('dev')); 
app.use(express.json()); 

// Rutas base
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/productive-stages', epRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/novelties', noveltyRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/bitacoras', bitacoraRoutes);
app.use('/api/trackings', trackingRoutes);
app.use('/api/hours', hourRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);

// Puerto y Listen (Solo si no estamos en test)
if (process.env.NODE_ENV !== 'test') {
    const PORT = env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
        console.log(`📂 Base de datos: Etapa Productiva`);
    });
}

export default app;