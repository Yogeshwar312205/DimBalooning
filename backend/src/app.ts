import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/authRoutes';
import drawingRoutes from './routes/drawingRoutes';
import inspectionRoutes from './routes/inspectionRoutes';
import balloonRoutes from './routes/balloonRoutes';
import measurementRoutes from './routes/measurementRoutes';
import reportRoutes from './routes/reportRoutes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for uploads & reports
app.use('/uploads', express.static(path.resolve('uploads')));
app.use('/reports', express.static(path.resolve('reports')));

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend-api', timestamp: new Date() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/drawings', drawingRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/balloons', balloonRoutes);
app.use('/api/measurements', measurementRoutes);
app.use('/api/reports', reportRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

export default app;
