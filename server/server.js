import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { clerkMiddleware } from '@clerk/express'
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js"
import showRouter from './routes/showRoutes.js';
import bookingRouter from './routes/bookingRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import userRouter from './routes/userRoutes.js';
import recommendationRouter from './routes/recommendationRoutes.js';
import { stripeWebhooks } from './controllers/stripeWebhooks.js';
import watchTogetherRouter from './watchTogether/routes/watchTogetherRoutes.js';
import { initializeWatchTogetherSocket } from './watchTogether/socket/watchTogetherSocket.js';




const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
};
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: corsOptions });


await connectDB()

//stripe webhooks route
app.use('/api/stripe', express.raw({type: 'application/json'}),stripeWebhooks)


//middleware
app.use(express.json());
app.use(cors(corsOptions));
app.use(clerkMiddleware())

//Api routes
app.get('/', (req, res) => res.send('server is live!'));

// Set up the "/api/inngest" (recommended) routes with the serve handler
app.use('/api/inngest', serve({ client: inngest, functions }));
app.use('/api/show',showRouter)
app.use('/api/booking',bookingRouter)
app.use('/api/admin',adminRouter)
app.use('/api/user',userRouter)
app.use('/api/recommendations',recommendationRouter)
app.use('/api/watch-together', watchTogetherRouter)

initializeWatchTogetherSocket(io)

// Vercel invokes the exported HTTP server. Local development owns the listener.
if (!process.env.VERCEL) {
  httpServer.listen(port, () => console.log(`server listening at http://localhost:${port}`));
}

export default httpServer;
