import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use('/api', apiRouter);

// Basic health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files from client build in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientBuildPath = path.join(__dirname, '../public');

app.use(express.static(clientBuildPath));

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.name === 'MulterError' ? 400 : err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

export default app;

