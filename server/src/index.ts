import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { paymentRouter } from './routes/paymentRoutes.js';
import { ngoRouter } from './routes/ngoRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { dbRoutes } from './routes/dbRoutes.js';

const app = express();

// Enable CORS for frontend Vite dev server (port 3000 / 5173)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature'],
  })
);

// Capture raw body for webhook HMAC validation while still parsing JSON
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    service: 'TrustFabric Payment & Anchor Gateway',
    status: 'ONLINE',
    razorpayMode: config.razorpayMode,
    network: config.networkName,
    chainId: config.evmChainId,
    fiatAnchorContract: config.fiatAnchorContractAddress,
    timestamp: new Date().toISOString(),
  });
});

// Mount auth, payment, NGO verification and cloud persistence API routes
app.use('/api', authRouter);
app.use('/api', paymentRouter);
app.use('/api', ngoRouter);
app.use('/api/db', dbRoutes);

// Start server if not running in test mode
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const server = app.listen(config.port, () => {
    console.log(`[TrustFabric Server] Node.js payment gateway running on http://localhost:${config.port}`);
    console.log(`[TrustFabric Server] Razorpay Mode: ${config.razorpayMode.toUpperCase()}`);
    console.log(`[TrustFabric Server] Public Key ID: ${config.razorpayKeyId}`);
    console.log(`[TrustFabric Server] EVM Anchor Target: ${config.networkName} (Chain ID ${config.evmChainId})`);
    console.log(`[TrustFabric Server] Fiat Anchor Contract: ${config.fiatAnchorContractAddress}`);
  });

  process.on('SIGTERM', () => {
    server.close(() => {
      console.log('[TrustFabric Server] Shut down gracefully.');
    });
  });
}

export default app;
