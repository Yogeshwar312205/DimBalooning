import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { config } from './config';
import { initSocketHandler } from './websocket/socketHandler';

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

initSocketHandler(io);

server.listen(config.port, () => {
  console.log(`🚀 Manufacturing Inspection API Server running on port ${config.port}`);
  console.log(`🔗 Python PDF Microservice configured at ${config.pdfServiceUrl}`);
});
