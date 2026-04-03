import express from 'express';
import morgan from 'morgan';
import { env } from './src/config/env.js';


import { conectarMongo } from './src/config/db.js'; 

const app = express();

//  Conectar a MongoDB Atlas
conectarMongo();

//  Middlewares
app.use(morgan('dev')); 
app.use(express.json()); 


// Puerto
const PORT = env.PORT;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
    console.log(`📂 Base de datos configurada para: complementarias`);
});