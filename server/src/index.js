import 'dotenv/config';

import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import leadRoutes from './routes/leads.js';
import dashboardRoutes from './routes/dashboard.js';

import reportRoutes from './routes/reports.js';
import orderRoutes from './routes/orders.js';
import masterRoutes from './routes/masters.js';
import integrationRoutes from './routes/integrations.js';
import notificationRoutes from './routes/notifications.js';
import maintenanceRoutes from './routes/maintenance.js';

import { startSheetScheduler } from './services/sheetSync.js';
import { initDb } from './db.js';
import {isDuplicatePhoneError,duplicatePhoneMessage} from './utils/leadPhone.js';

const app = express();
const port = Number(process.env.PORT || 4000);

/* ----------------------------------
   CORS
----------------------------------- */

const allowedOrigins = (
  process.env.CLIENT_ORIGIN || 'http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked origin: ${origin}`)
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ],
    maxAge: 600,
    exposedHeaders: ['Server-Timing']
  })
);

app.use(
  express.json({
    limit: '2mb'
  })
);

// Expose application processing time separately from network latency.
app.use((req,res,next)=>{
  const started=performance.now();
  const end=res.end;
  res.end=function(...args){
    if(!res.headersSent)res.setHeader('Server-Timing',`app;dur=${(performance.now()-started).toFixed(1)}`);
    return end.apply(this,args);
  };
  next();
});

/* ----------------------------------
   Health
----------------------------------- */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true
  });
});

/* ----------------------------------
   API Routes
----------------------------------- */

app.use('/api/auth', authRoutes);

app.use('/api/users', userRoutes);

app.use('/api/leads', leadRoutes);

app.use('/api/dashboard', dashboardRoutes);

app.use('/api/reports', reportRoutes);

app.use('/api/orders', orderRoutes);

app.use('/api/masters', masterRoutes);

app.use('/api/integrations', integrationRoutes);

app.use('/api/notifications', notificationRoutes);

app.use('/api/maintenance', maintenanceRoutes);

/* ----------------------------------
   Error Handler
----------------------------------- */

app.use((err, req, res, next) => {
  if(isDuplicatePhoneError(err))return res.status(409).json({message:duplicatePhoneMessage});
  console.error('API ERROR:', err);

  res.status(500).json({
    message: 'Unexpected server error'
  });
});

/* ----------------------------------
   Database Initialization
----------------------------------- */

await initDb();

/* ----------------------------------
   Server
----------------------------------- */

app.listen(
  port,
  '0.0.0.0',
  () => {
    console.log(
      `CMA Sales CRM API running on port ${port}`
    );

    startSheetScheduler();
  }
);
