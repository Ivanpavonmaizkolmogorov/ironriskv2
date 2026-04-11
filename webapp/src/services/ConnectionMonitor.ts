/**
 * ConnectionMonitor — OOP Service that monitors TWO independent channels:
 * 
 * 1. SERVER: Is the FastAPI backend reachable? (HTTP ping)
 * 2. EA:     Is MetaTrader sending heartbeats? (timestamp freshness check)
 * 
 * Uses Observer Pattern to notify UI subscribers of state changes.
 */

export type ChannelState = "online" | "offline" | "stale";

/** Unified helper to check if a heartbeat is fresh (default 5 min). */
export function isConnectionAlive(dateString: string | null | undefined, thresholdMs = 300_000): boolean {
  if (!dateString) return false;
  return Date.now() - new Date(dateString).getTime() < thresholdMs;
}

export interface DualSnapshot {
  server: ChannelState;
  ea: ChannelState;
  serverLastOk: Date | null;
  eaLastHeartbeat: Date | null;
  eaStaleSinceSeconds: number;
}

export type DualListener = (snapshot: DualSnapshot) => void;

export class ConnectionMonitor {
  // ─── Configuration ───
  private apiUrl: string;
  private pingIntervalMs: number;
  private pingTimeoutMs: number;
  private serverFailThreshold: number;
  private eaStaleThresholdMs: number;

  // ─── Internal State ───
  private serverState: ChannelState = "online";
  private serverLastOk: Date | null = null;
  private serverFailCount = 0;

  private eaState: ChannelState = "offline";
  private eaLastHeartbeat: Date | null = null;

  // ─── Observer Pattern ───
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<DualListener> = new Set();

  constructor(config?: {
    apiUrl?: string;
    pingIntervalMs?: number;
    pingTimeoutMs?: number;
    serverFailThreshold?: number;
    eaStaleThresholdMs?: number;
  }) {
    let baseUrl = config?.apiUrl ?? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
    if (typeof window !== "undefined" && window.location.protocol === "https:" && baseUrl.startsWith("http://")) {
      baseUrl = baseUrl.replace("http://", "https://");
    }
    this.apiUrl              = baseUrl;
    this.pingIntervalMs      = config?.pingIntervalMs      ?? 10_000;
    this.pingTimeoutMs       = config?.pingTimeoutMs       ?? 4_000;
    this.serverFailThreshold = config?.serverFailThreshold ?? 2;
    this.eaStaleThresholdMs  = config?.eaStaleThresholdMs  ?? 60_000; // 60s without heartbeat = stale/dead
  }

  // ─── Public API ───

  subscribe(listener: DualListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): DualSnapshot {
    return {
      server: this.serverState,
      ea: this.eaState,
      serverLastOk: this.serverLastOk,
      eaLastHeartbeat: this.eaLastHeartbeat,
      eaStaleSinceSeconds: this.eaLastHeartbeat
        ? Math.floor((Date.now() - this.eaLastHeartbeat.getTime()) / 1000)
        : -1,
    };
  }

  /** Called externally by TradingAccountManager when it sees a last_heartbeat_at update */
  setManualHeartbeat(date: Date): void {
    if (!this.eaLastHeartbeat || date > this.eaLastHeartbeat) {
      this.eaLastHeartbeat = date;
      this.evaluateEaState();
    }
  }

  /** Called externally whenever strategies are fetched — extracts EA heartbeat timestamps. */
  updateEaHeartbeat(strategies: Array<{ risk_config?: Record<string, any> | null }>): void {
    let latestTs: Date | null = null;

    for (const s of strategies) {
      const cfg = s.risk_config as any;
      if (cfg?.last_updated) {
        const d = new Date(cfg.last_updated);
        if (!latestTs || d > latestTs) {
          latestTs = d;
        }
      }
    }

    if (latestTs) {
      this.eaLastHeartbeat = latestTs;
    }

    // Evaluate EA freshness
    this.evaluateEaState();
  }

  start(): void {
    if (this.intervalId) return;
    this.pingServer();
    this.intervalId = setInterval(() => {
      this.pingServer();
      this.evaluateEaState();
    }, this.pingIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ─── Private Logic ───

  private async pingServer(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.pingTimeoutMs);

    try {
      const res = await fetch(`${this.apiUrl}/docs`, {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (res.ok) {
        this.serverFailCount = 0;
        this.serverLastOk = new Date();
        this.setServerState("online");
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      clearTimeout(timeout);
      this.serverFailCount++;
      this.setServerState(this.serverFailCount >= this.serverFailThreshold ? "offline" : "stale");
    }
  }

  private evaluateEaState(): void {
    if (!this.eaLastHeartbeat) {
      this.setEaState("offline");
      return;
    }

    const age = Date.now() - this.eaLastHeartbeat.getTime();
    if (age > this.eaStaleThresholdMs) {
      this.setEaState("stale");
    } else {
      this.setEaState("online");
    }
  }

  private setServerState(s: ChannelState): void {
    if (this.serverState !== s) {
      this.serverState = s;
      this.notify();
    }
  }

  private setEaState(s: ChannelState): void {
    if (this.eaState !== s) {
      this.eaState = s;
      this.notify();
    }
  }

  private notify(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }
}

/** Singleton for the whole app. */
let _instance: ConnectionMonitor | null = null;
export function getConnectionMonitor(): ConnectionMonitor {
  if (!_instance) _instance = new ConnectionMonitor();
  return _instance;
}
