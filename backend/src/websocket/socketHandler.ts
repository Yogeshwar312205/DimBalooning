import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';

let ioInstance: SocketIOServer | null = null;
const sessionCollaborators: Map<string, Map<string, { id: string; name: string; email: string; role: string; socketId: string }>> = new Map();

export function initSocketHandler(io: SocketIOServer) {
  ioInstance = io;

  // Socket authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('Authentication required for WebSocket connection'));
    }

    try {
      const decoded: any = jwt.verify(token, config.jwtSecret);
      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token for WebSocket connection'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    console.log(`⚡ WebSocket connected: User ${user.name} (${socket.id})`);

    socket.on('JOIN_INSPECTION_SESSION', ({ inspectionSessionId }: { inspectionSessionId: string }) => {
      if (!inspectionSessionId) return;

      socket.join(inspectionSessionId);
      socket.data.sessionId = inspectionSessionId;

      if (!sessionCollaborators.has(inspectionSessionId)) {
        sessionCollaborators.set(inspectionSessionId, new Map());
      }

      const roomUsers = sessionCollaborators.get(inspectionSessionId)!;
      roomUsers.set(socket.id, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        socketId: socket.id
      });

      const onlineList = Array.from(roomUsers.values());
      io.to(inspectionSessionId).emit('COLLABORATORS_UPDATED', { onlineUsers: onlineList });
      socket.to(inspectionSessionId).emit('USER_JOINED', { user });

      console.log(`👤 ${user.name} joined session room ${inspectionSessionId}`);
    });

    socket.on('LEAVE_INSPECTION_SESSION', ({ inspectionSessionId }: { inspectionSessionId: string }) => {
      if (!inspectionSessionId) return;
      socket.leave(inspectionSessionId);
      
      const roomUsers = sessionCollaborators.get(inspectionSessionId);
      if (roomUsers) {
        roomUsers.delete(socket.id);
        const onlineList = Array.from(roomUsers.values());
        io.to(inspectionSessionId).emit('COLLABORATORS_UPDATED', { onlineUsers: onlineList });
      }

      socket.to(inspectionSessionId).emit('USER_LEFT', { user });
    });

    socket.on('disconnect', () => {
      const sessionId = socket.data.sessionId;
      if (sessionId && sessionCollaborators.has(sessionId)) {
        const roomUsers = sessionCollaborators.get(sessionId)!;
        roomUsers.delete(socket.id);
        const onlineList = Array.from(roomUsers.values());
        io.to(sessionId).emit('COLLABORATORS_UPDATED', { onlineUsers: onlineList });
        io.to(sessionId).emit('USER_LEFT', { user });
      }
      console.log(`⚡ WebSocket disconnected: ${socket.id}`);
    });
  });
}

export function broadcastToInspectionSession(sessionId: string, eventName: string, payload: any) {
  if (ioInstance) {
    ioInstance.to(sessionId).emit(eventName, payload);
  }
}
