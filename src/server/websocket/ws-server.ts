import { WebSocketServer, WebSocket } from 'ws';
import { authService } from '../../lib/auth/auth-service';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WSMessage {
  type: WsEventType;
  payload: unknown;
}

export type WsEventType =
  | 'PATIENT_REGISTERED' | 'VISIT_CREATED' | 'VISIT_UPDATED'
  | 'LAB_RESULT_READY' | 'PRESCRIPTION_READY' | 'BED_STATUS_CHANGED'
  | 'PAYMENT_RECEIVED' | 'APPOINTMENT_REMINDER' | 'EMERGENCY_ALERT'
  | 'INVENTORY_LOW' | 'DRUG_EXPIRING' | 'SYSTEM_ALERT'
  | 'ADMISSION_CREATED' | 'PATIENT_DISCHARGED'
  | 'NOTIFICATION' | 'PING' | 'PONG';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  branchId: string | null;
  roleId: string;
  roleName: string;
  connectedAt: Date;
}

// ─── AfyaWSServer ─────────────────────────────────────────────────────────────
class AfyaWSServer {
  private static instance: AfyaWSServer;
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ConnectedClient>(); // sessionToken → client
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): AfyaWSServer {
    if (!AfyaWSServer.instance) AfyaWSServer.instance = new AfyaWSServer();
    return AfyaWSServer.instance;
  }

  init(port = 8081): void {
    this.wss = new WebSocketServer({ port });
    console.log(`[WS] AfyaCore WebSocket server on port ${port}`);

    this.wss.on('connection', (ws: WebSocket, req) => {
      const url = new URL(req.url ?? '/', `ws://localhost`);
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Authentication required');
        return;
      }

      const session = authService.validateSession(token);
      if (!session) {
        ws.close(4001, 'Invalid or expired session');
        return;
      }

      const client: ConnectedClient = {
        ws,
        userId: session.userId,
        branchId: session.branchId,
        roleId: session.roleId,
        roleName: session.roleName,
        connectedAt: new Date(),
      };

      this.clients.set(token, client);
      console.log(`[WS] Client connected: ${session.userId} (${session.roleName})`);

      this.send(ws, { type: 'NOTIFICATION', payload: { message: 'Connected to AfyaCore live updates' } });

      ws.on('message', (raw) => {
        try {
          const msg: WSMessage = JSON.parse(raw.toString());
          if (msg.type === 'PING') this.send(ws, { type: 'PONG', payload: { ts: Date.now() } });
        } catch { /* ignore malformed */ }
      });

      ws.on('close', () => {
        this.clients.delete(token);
        console.log(`[WS] Client disconnected: ${session.userId}`);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
        this.clients.delete(token);
      });
    });

    // Keep-alive ping every 30s
    this.pingInterval = setInterval(() => {
      for (const [token, client] of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        } else {
          this.clients.delete(token);
        }
      }
    }, 30_000);
  }

  // ─── Broadcast helpers ────────────────────────────────────────────────────

  // Broadcast to all connected clients in a branch
  broadcastToBranch(branchId: string, event: WsEventType, payload: unknown): void {
    for (const client of this.clients.values()) {
      if (client.branchId === branchId && client.ws.readyState === WebSocket.OPEN) {
        this.send(client.ws, { type: event, payload });
      }
    }
  }

  // Broadcast to a specific user
  broadcastToUser(userId: string, event: WsEventType, payload: unknown): void {
    for (const client of this.clients.values()) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        this.send(client.ws, { type: event, payload });
      }
    }
  }

  // Broadcast to a specific role across all branches
  broadcastToRole(roleName: string, event: WsEventType, payload: unknown): void {
    for (const client of this.clients.values()) {
      if (client.roleName === roleName && client.ws.readyState === WebSocket.OPEN) {
        this.send(client.ws, { type: event, payload });
      }
    }
  }

  // Broadcast to everyone
  broadcastAll(event: WsEventType, payload: unknown): void {
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        this.send(client.ws, { type: event, payload });
      }
    }
  }

  // Emergency alert - highest priority, all branches
  emergencyAlert(message: string, branchId?: string): void {
    const payload = { message, timestamp: new Date().toISOString(), priority: 'CRITICAL' };
    if (branchId) {
      this.broadcastToBranch(branchId, 'EMERGENCY_ALERT', payload);
    } else {
      this.broadcastAll('EMERGENCY_ALERT', payload);
    }
  }

  // Specific domain events
  notifyLabResultReady(branchId: string, patientName: string, requestNumber: string): void {
    this.broadcastToRole('lab_technician', 'LAB_RESULT_READY', { patientName, requestNumber });
    this.broadcastToBranch(branchId, 'NOTIFICATION', {
      title: 'Lab Results Ready',
      message: `Lab results ready for ${patientName} (${requestNumber})`,
      type: 'lab',
    });
  }

  notifyBedStatusChange(branchId: string, bedNumber: string, wardName: string, status: string): void {
    this.broadcastToBranch(branchId, 'BED_STATUS_CHANGED', { bedNumber, wardName, status });
  }

  notifyInventoryLow(branchId: string, drugName: string, quantity: number): void {
    this.broadcastToRole('pharmacist', 'INVENTORY_LOW', { drugName, quantity, branchId });
  }

  notifyNewVisit(branchId: string, visitNumber: string, patientName: string, type: string): void {
    this.broadcastToBranch(branchId, 'VISIT_CREATED', { visitNumber, patientName, type });
  }

  notifyPaymentReceived(branchId: string, amount: number, method: string, receipt: string): void {
    this.broadcastToRole('billing_officer', 'PAYMENT_RECEIVED', { amount, method, receipt, branchId });
  }

  get connectedCount(): number {
    return this.clients.size;
  }

  // ─── Private ─────────────────────────────────────────────────────────────
  private send(ws: WebSocket, message: WSMessage): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (err) {
      console.error('[WS] Send error:', err);
    }
  }

  close(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.wss?.close();
  }
}

export const wsServer = AfyaWSServer.getInstance();
