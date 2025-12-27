// event-bus/src/eventBus.ts - Dedicated message broker
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

interface EventMessage {
  type: string;
  source: 'react-app' | 'express-server' | 'saga-middleware';
  target?: 'react-app' | 'express-server' | 'saga-middleware' | 'broadcast';
  data: any;
  messageId: string;
  timestamp: Date;
  threadId?: string;
}

class EventBusService {
  private io: SocketIOServer;
  private connectedServices = new Map<string, { socket: any; serviceType: string }>();

  constructor() {
    const server = createServer((req, res) => {
      // Health check endpoint for Railway
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          service: 'event-bus',
          connectedServices: this.connectedServices.size,
          uptime: process.uptime()
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Configure CORS for both local and Railway environments
    //Another comment
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'https://kmintelligentsystems-stategraph-react-production-a7ce.up.railway.app'
    ];

    this.io = new SocketIOServer(server, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['polling', 'websocket']
    });

    this.setupEventRouting();
    const port = parseInt(process.env.PORT || '3003', 10);
    server.listen(port, '0.0.0.0', () => {
      console.log(`Event Bus running on port ${port}`);
    });

    // Error handling
    server.on('error', (error) => {
      console.error('Server error:', error);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
    });
  }

  private setupEventRouting() {
    this.io.on('connection', (socket) => {
      console.log('Service connected to Event Bus:', socket.id);

      // Service registration
      socket.on('register_service', (data: { serviceType: string; serviceName: string }) => {
        this.connectedServices.set(socket.id, {
          socket,
          serviceType: data.serviceType
        });
        console.log(`[REGISTRATION] Registered ${data.serviceType}: ${data.serviceName} (Socket ID: ${socket.id})`);
        console.log(`[REGISTRATION] Total connected services: ${this.connectedServices.size}`);
      });

      // Message routing
      socket.on('publish_event', (message: EventMessage) => {
        console.log(`[INCOMING] Received message from ${message.source} (Socket: ${socket.id})`);
        console.log(`[INCOMING] Message type: ${message.type}, Target: ${message.target || 'broadcast'}`);
        console.log(`[INCOMING] Message data:`, message.data);
        this.routeMessage(message, socket.id);
      });

      socket.on('disconnect', () => {
        console.log(`[DISCONNECT] Service disconnected: ${socket.id}`);
        this.connectedServices.delete(socket.id);
        console.log(`[DISCONNECT] Remaining connected services: ${this.connectedServices.size}`);
      });
    });
  }

  private routeMessage(message: EventMessage, senderId: string) {
    console.log(`[ROUTING] Processing message: ${message.type} from ${message.source} to ${message.target || 'broadcast'}`);
    console.log(`[ROUTING] Message ID: ${message.messageId}, Thread ID: ${message.threadId || 'none'}`);

    if (message.target === 'broadcast') {
      // Broadcast to all except sender
      console.log(`[BROADCAST] Broadcasting to all services except sender (${senderId})`);
      let broadcastCount = 0;
      this.connectedServices.forEach((service, socketId) => {
        if (socketId !== senderId) {
          console.log(`[BROADCAST] Sending to ${service.serviceType} (Socket: ${socketId})`);
          service.socket.emit('event_received', message);
          broadcastCount++;
        }
      });
      console.log(`[BROADCAST] Message broadcast to ${broadcastCount} services`);
    } else if (message.target) {
      // Targeted delivery
      console.log(`[TARGETED] Looking for target service type: ${message.target}`);
      let deliveredCount = 0;
      this.connectedServices.forEach((service, socketId) => {
        if (service.serviceType === message.target && socketId !== senderId) {
          console.log(`[TARGETED] Delivering message to ${service.serviceType} (Socket: ${socketId})`);
          service.socket.emit('event_received', message);
          deliveredCount++;
        }
      });
      console.log(`[TARGETED] Message delivered to ${deliveredCount} services`);
      if (deliveredCount === 0) {
        console.log(`[TARGETED] WARNING: No target services found for type '${message.target}'`);
      }
    } else {
      console.log(`[ROUTING] WARNING: Message has no target specified, not routing`);
    }
  }
}

new EventBusService();