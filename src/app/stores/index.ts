import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const BASE_URL = '/api';
const WS_URL = 'ws://localhost:8081';

// ─── API Client ───────────────────────────────────────────────────────────────
class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) { this.token = token; }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method, headers, signal,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json() as T;
  }

  get<T>(path: string, signal?: AbortSignal) { return this.request<T>('GET', path, undefined, signal); }
  post<T>(path: string, body?: unknown) { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: unknown) { return this.request<T>('PUT', path, body); }
  patch<T>(path: string, body?: unknown) { return this.request<T>('PATCH', path, body); }
  del<T>(path: string) { return this.request<T>('DELETE', path); }
}

export const api = new ApiClient();

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName: string;
  roleCategory: string;
  branchId: string | null;
  departmentId: string | null;
  permissions: string[];
  sessionToken: string;
  sessionExpires: string;
  mustChangePassword: boolean;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface Patient {
  id: string;
  patientNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone?: string;
  email?: string;
  bloodGroup?: string;
  nhifNumber?: string;
  insuranceProvider?: string;
  branchName?: string;
  createdAt: string;
}

// ─── Auth Store ───────────────────────────────────────────────────────────────
interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string, deviceFP?: string) => Promise<{ requiresMfa?: boolean; tempToken?: string }>;
  verifyMfa: (tempToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  clearError: () => void;
  hasPermission: (module: string, resource: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,

      login: async (username, password, deviceFP = 'browser') => {
        set({ isLoading: true, error: null });
        try {
          const res = await api.post<any>('/auth/login', {
            username, password, deviceFingerprint: deviceFP,
          });
          if (res.requiresMfa) {
            set({ isLoading: false });
            return { requiresMfa: true, tempToken: res.tempToken };
          }
          api.setToken(res.user.sessionToken);
          set({ user: res.user, isLoading: false });
          useNotificationStore.getState().connectWS(res.user.sessionToken);
          return {};
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false });
          throw err;
        }
      },

      verifyMfa: async (tempToken, code) => {
        set({ isLoading: true });
        const res = await api.post<any>('/auth/verify-mfa', { tempToken, code });
        api.setToken(res.user.sessionToken);
        set({ user: res.user, isLoading: false });
        useNotificationStore.getState().connectWS(res.user.sessionToken);
      },

      logout: async () => {
        try { await api.post('/auth/logout'); } catch { /* swallow */ }
        api.setToken(null);
        useNotificationStore.getState().disconnectWS();
        set({ user: null });
      },

      changePassword: async (current, next) => {
        await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
        set((s) => ({ user: s.user ? { ...s.user, mustChangePassword: false } : null }));
      },

      clearError: () => set({ error: null }),

      hasPermission: (module, resource, action) => {
        const { user } = get();
        if (!user) return false;
        const perms = new Set(user.permissions);
        return (
          perms.has('*:*:*') ||
          perms.has(`${module}:${resource}:${action}`) ||
          perms.has(`${module}:*:*`) ||
          perms.has(`${module}:${resource}:*`)
        );
      },
    }),
    {
      name: 'afyacore-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.user?.sessionToken) {
          api.setToken(state.user.sessionToken);
        }
      },
    },
  ),
);

// ─── Patient Store ────────────────────────────────────────────────────────────
interface PatientState {
  patients: Patient[];
  selectedPatient: Patient | null;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  query: string;
  fetchPatients: (params?: { q?: string; page?: number; branchId?: string }) => Promise<void>;
  fetchPatient: (id: string) => Promise<Patient>;
  createPatient: (data: Partial<Patient>) => Promise<{ id: string; patientNumber: string }>;
  updatePatient: (id: string, data: Partial<Patient>) => Promise<void>;
  selectPatient: (patient: Patient | null) => void;
  setQuery: (q: string) => void;
}

export const usePatientStore = create<PatientState>()((set, get) => ({
  patients: [], selectedPatient: null,
  total: 0, page: 1, pageSize: 25, totalPages: 0,
  isLoading: false, error: null, query: '',

  fetchPatients: async (params = {}) => {
    set({ isLoading: true, error: null });
    try {
      const q = new URLSearchParams({
        page: String(params.page ?? get().page),
        pageSize: String(get().pageSize),
        ...(params.q !== undefined ? { q: params.q } : get().query ? { q: get().query } : {}),
        ...(params.branchId ? { branchId: params.branchId } : {}),
      });
      const res = await api.get<any>(`/patients?${q}`);
      set({
        patients: res.rows, total: res.total, page: res.page,
        totalPages: res.totalPages, isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchPatient: async (id) => {
    const res = await api.get<{ patient: Patient }>(`/patients/${id}`);
    set({ selectedPatient: res.patient });
    return res.patient;
  },

  createPatient: async (data) => {
    const res = await api.post<{ id: string; patientNumber: string }>('/patients', data);
    get().fetchPatients();
    return res;
  },

  updatePatient: async (id, data) => {
    await api.put(`/patients/${id}`, data);
    get().fetchPatients();
    if (get().selectedPatient?.id === id) get().fetchPatient(id);
  },

  selectPatient: (patient) => set({ selectedPatient: patient }),
  setQuery: (query) => set({ query }),
}));

// ─── Visit Store ──────────────────────────────────────────────────────────────
interface VisitState {
  visits: any[];
  activeVisit: any | null;
  total: number;
  page: number;
  isLoading: boolean;
  fetchVisits: (params?: Record<string, string>) => Promise<void>;
  createVisit: (data: any) => Promise<{ id: string; visitNumber: string }>;
  setActiveVisit: (visit: any | null) => void;
}

export const useVisitStore = create<VisitState>()((set, get) => ({
  visits: [], activeVisit: null, total: 0, page: 1, isLoading: false,

  fetchVisits: async (params = {}) => {
    set({ isLoading: true });
    const q = new URLSearchParams({ page: '1', pageSize: '25', ...params });
    const res = await api.get<any>(`/visits?${q}`);
    set({ visits: res.rows, total: res.total, page: res.page, isLoading: false });
  },

  createVisit: async (data) => {
    const res = await api.post<{ id: string; visitNumber: string }>('/visits', data);
    get().fetchVisits();
    return res;
  },

  setActiveVisit: (visit) => set({ activeVisit: visit }),
}));

// ─── Notification / WS Store ──────────────────────────────────────────────────
interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  ws: WebSocket | null;
  isConnected: boolean;
  connectWS: (token: string) => void;
  disconnectWS: () => void;
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [], unreadCount: 0, ws: null, isConnected: false,

  connectWS: (token) => {
    if (get().ws) return;
    const ws = new WebSocket(`${WS_URL}?token=${token}`);

    ws.onopen = () => set({ isConnected: true });

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'PONG') return;

        const title = getEventTitle(msg.type);
        const body = typeof msg.payload?.message === 'string'
          ? msg.payload.message
          : JSON.stringify(msg.payload);

        get().addNotification({ type: msg.type, title, body });

        // Browser notification for critical events
        if (['EMERGENCY_ALERT', 'LAB_RESULT_READY', 'BED_STATUS_CHANGED'].includes(msg.type)) {
          if (Notification.permission === 'granted') {
            new Notification(`AfyaCore: ${title}`, { body });
          }
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => set({ ws: null, isConnected: false });
    ws.onerror = () => set({ ws: null, isConnected: false });

    // Ping every 25s
    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
    }, 25_000);

    (ws as any)._pingTimer = pingTimer;
    set({ ws });
  },

  disconnectWS: () => {
    const { ws } = get();
    if (ws) {
      clearInterval((ws as any)._pingTimer);
      ws.close();
    }
    set({ ws: null, isConnected: false });
  },

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: crypto.randomUUID(),
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + 1,
    }));
  },

  markRead: (id) => set((s) => ({
    notifications: s.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n),
    unreadCount: Math.max(0, s.unreadCount - 1),
  })),

  markAllRead: () => set((s) => ({
    notifications: s.notifications.map((n) => ({ ...n, isRead: true })),
    unreadCount: 0,
  })),
}));

// ─── UI Store ─────────────────────────────────────────────────────────────────
interface UIState {
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark';
  activeModule: string;
  toggleSidebar: () => void;
  setTheme: (t: 'light' | 'dark') => void;
  setModule: (m: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: 'light',
      activeModule: 'dashboard',
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      setModule: (activeModule) => set({ activeModule }),
    }),
    { name: 'afyacore-ui' },
  ),
);

// ─── Dashboard Store ──────────────────────────────────────────────────────────
interface DashboardState {
  summary: Record<string, number>;
  charts: Record<string, any[]>;
  kpis: Record<string, string>;
  isLoading: boolean;
  lastUpdated: string | null;
  fetchDashboard: () => Promise<void>;
  fetchKpis: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>()((set) => ({
  summary: {}, charts: {}, kpis: {}, isLoading: false, lastUpdated: null,

  fetchDashboard: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<any>('/analytics/dashboard');
      set({ summary: res.summary, charts: res.charts, isLoading: false, lastUpdated: new Date().toISOString() });
    } catch { set({ isLoading: false }); }
  },

  fetchKpis: async () => {
    const res = await api.get<any>('/analytics/kpis');
    set({ kpis: res });
  },
}));

// ─── Helper ───────────────────────────────────────────────────────────────────
function getEventTitle(type: string): string {
  const titles: Record<string, string> = {
    PATIENT_REGISTERED: 'New Patient Registered',
    VISIT_CREATED: 'New Visit Started',
    LAB_RESULT_READY: 'Lab Results Ready',
    BED_STATUS_CHANGED: 'Bed Status Updated',
    PAYMENT_RECEIVED: 'Payment Received',
    EMERGENCY_ALERT: '🚨 Emergency Alert',
    INVENTORY_LOW: '⚠️ Low Stock Alert',
    DRUG_EXPIRING: '⚠️ Drug Expiring Soon',
    NOTIFICATION: 'Notification',
    ADMISSION_CREATED: 'Patient Admitted',
    PATIENT_DISCHARGED: 'Patient Discharged',
  };
  return titles[type] ?? type;
}
