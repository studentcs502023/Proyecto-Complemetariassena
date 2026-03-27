import express from 'express'
import morgan from 'morgan'
import 'dotenv/config'


const app = express();



app.use(express.json());











//puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>{
    console.log(`👂Servidor escuchando en el puerto ${PORT}`);   
})
//rutas








