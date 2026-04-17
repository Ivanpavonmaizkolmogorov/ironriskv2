/**
 * ConnectionMonitor — OOP Service that monitors the API Server channel.
 * 
 * Includes the Unified `deriveWorkspaceConnection` logic to compute the UI state
 * for any given TradingAccount across the application.
 */
import type { TradingAccount } from "@/types/tradingAccount";

export type ChannelState = "online" | "offline" | "stale";

export interface DualSnapshot {
  server: ChannelState;
  serverLastOk: Date | null;
}

export type DualListener = (snapshot: DualSnapshot) => void;

/** Unified pure function to parse a TradingAccount into a UI state */
export function deriveWorkspaceConnection(account: TradingAccount | null | undefined, serverOffsetMs = 0) {
  if (!account) {
    return {
      isAlive: false,
      type: "OFFLINE",
      label: "OFFLINE",
      timeString: "",
      dotColor: "bg-iron-600",
      bgColor: "bg-iron-800/50 border-iron-700/50 text-iron-500",
      pulseClass: "",
      secondsPassed: -1
    };
  }

  const thresholdMs = 300_000; // 5 mins
  const isAlive = !!account.last_heartbeat_at && 
                 ((Date.now() + serverOffsetMs) - new Date(account.last_heartbeat_at).getTime() < thresholdMs);
                 
  const isService = account.default_dashboard_layout?.last_heartbeat_source === "service";
  
  let timeString = "";
  let secondsPassed = -1;

  if (account.last_heartbeat_at) {
    const syncedNow = Date.now() + serverOffsetMs;
    secondsPassed = Math.floor((syncedNow - new Date(account.last_heartbeat_at).getTime()) / 1000);
    if (secondsPassed <= 0) timeString = ``;
    else if (secondsPassed < 60) timeString = `${secondsPassed}s`;
    else if (secondsPassed < 300) timeString = `${Math.floor(secondsPassed/60)}m ${secondsPassed%60}s`;
    else timeString = `hace ${Math.floor(secondsPassed/60)}m`;
  }

  if (!isAlive) {
    return {
      isAlive: false,
      type: "OFFLINE",
      label: "OFFLINE",
      timeString: account.last_heartbeat_at ? `Off (${timeString})` : "",
      dotColor: "bg-risk-red",
      bgColor: "bg-surface-secondary border-risk-red/20 text-risk-red",
      pulseClass: "",
      secondsPassed
    };
  }

  if (isService || !account.default_dashboard_layout?.last_heartbeat_source) {
    return {
      isAlive: true,
      type: "SERVICE",
      label: "SERVICE",
      timeString,
      dotColor: "bg-risk-green",
      bgColor: "bg-risk-green/10 border-risk-green/20 text-risk-green",
      pulseClass: "shadow-[0_0_8px_rgba(0,230,118,0.8)] animate-pulse",
      secondsPassed
    };
  }

  return {
    isAlive: true,
    type: "LEGACY",
    label: "LEGACY EA",
    timeString,
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-500/10 border-amber-500/20 text-amber-500",
    pulseClass: "shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse",
    secondsPassed
  };
}


export class ConnectionMonitor {
  // ─── Configuration ───
  private apiUrl: string;
  private pingIntervalMs: number;
  private pingTimeoutMs: number;
  private serverFailThreshold: number;

  // ─── Internal State ───
  private serverState: ChannelState = "online";
  private serverLastOk: Date | null = null;
  private serverFailCount = 0;

  // ─── Observer Pattern ───
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<DualListener> = new Set();

  constructor(config?: {
    apiUrl?: string;
    pingIntervalMs?: number;
    pingTimeoutMs?: number;
    serverFailThreshold?: number;
  }) {
    let baseUrl = config?.apiUrl ?? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
    if (typeof window !== "undefined" && window.location.protocol === "https:" && baseUrl.startsWith("http://")) {
      baseUrl = baseUrl.replace("http://", "https://");
    }
    this.apiUrl              = baseUrl;
    this.pingIntervalMs      = config?.pingIntervalMs      ?? 10_000;
    this.pingTimeoutMs       = config?.pingTimeoutMs       ?? 4_000;
    this.serverFailThreshold = config?.serverFailThreshold ?? 2;
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
      serverLastOk: this.serverLastOk,
    };
  }

  start(): void {
    if (this.intervalId) return;
    this.pingServer();
    this.intervalId = setInterval(() => {
      this.pingServer();
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

  private setServerState(s: ChannelState): void {
    if (this.serverState !== s) {
      this.serverState = s;
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
