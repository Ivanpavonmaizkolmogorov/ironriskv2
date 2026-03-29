/**
 * DashboardLayout — OOP model for the MT5 dashboard layout configuration.
 * Encapsulates widget definitions, color theming, and example values.
 */

// ─── Color Theme ────────────────────────────────────────────────

/** Maps MT5 color names to hex CSS values. */
export class MT5ColorTheme {
  private static readonly PALETTE: Record<string, string> = {
    Silver: "#cbd5e1",
    Slate: "#94a3b8",
    Iron: "#71717a",
    Cobalt: "#3b82f6",
    Indigo: "#6366f1",
    White: "#ffffff",
  };

  static resolve(colorName: string): string {
    return this.PALETTE[colorName] ?? this.PALETTE.White;
  }

  static allNames(): string[] {
    return Object.keys(this.PALETTE);
  }
}

// ─── Metric Catalog ─────────────────────────────────────────────

/** Describes a selectable metric option for a dashboard slot. */
export class MetricOption {
  constructor(
    public readonly valueKey: string,
    public readonly label: string,
    public readonly defaultTitle: string,
    public readonly defaultColor: string,
    public readonly exampleValue: string
  ) {}
}

/** Registry of all available metrics the user can assign to dashboard slots. */
export class MetricCatalog {
  private static readonly OPTIONS: MetricOption[] = [
    new MetricOption("max_drawdown", "Max Drawdown", "Current DD", "Silver", "$834.20"),
    new MetricOption("consecutive_losses", "Consec. Losses", "Consec. Losses", "Slate", "3"),
    new MetricOption("daily_loss", "Daily Loss", "Daily Loss", "Silver", "$156.80"),
    new MetricOption("stagnation_days", "Stagnation Days", "Stagn. Days", "Iron", "12"),
    new MetricOption("stagnation_trades", "Stagnation Trades", "Stagn. Trades", "Iron", "8"),
  ];

  static all(): MetricOption[] {
    return this.OPTIONS;
  }

  static findByKey(valueKey: string): MetricOption | undefined {
    return this.OPTIONS.find((o) => o.valueKey === valueKey);
  }

  static getExampleValue(valueKey: string): string {
    return this.findByKey(valueKey)?.exampleValue ?? "—";
  }
}

// ─── Widget ─────────────────────────────────────────────────────

/** Represents one metric card inside the MT5 dashboard. */
export class DashboardWidget {
  constructor(
    public readonly id: string,
    public readonly type: string,
    public readonly title: string,
    public readonly valueKey: string,
    public readonly x: number,
    public readonly y: number,
    public readonly color: string,
    public readonly style: string = "simple"
  ) {}

  /** Resolved CSS hex color for the accent. */
  get accentHex(): string {
    return MT5ColorTheme.resolve(this.color);
  }

  /** Example display value for preview purposes. */
  get exampleValue(): string {
    return MetricCatalog.getExampleValue(this.valueKey);
  }

  /** Create a copy with partial overrides. */
  withUpdates(updates: Partial<Pick<DashboardWidget, "title" | "valueKey" | "color" | "x" | "y" | "style">>): DashboardWidget {
    return new DashboardWidget(
      this.id,
      this.type,
      updates.title ?? this.title,
      updates.valueKey ?? this.valueKey,
      updates.x ?? this.x,
      updates.y ?? this.y,
      updates.color ?? this.color,
      updates.style ?? this.style
    );
  }

  /** Serialize to the JSON shape expected by the backend API. */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      value_key: this.valueKey,
      x: this.x,
      y: this.y,
      color: this.color,
      style: this.style,
    };
  }

  /** Hydrate from backend/stored JSON. */
  static fromJSON(data: Record<string, unknown>): DashboardWidget {
    return new DashboardWidget(
      (data.id as string) ?? "w_0",
      (data.type as string) ?? "metric",
      (data.title as string) ?? "Metric",
      (data.value_key as string) ?? "max_drawdown",
      (data.x as number) ?? 0,
      (data.y as number) ?? 0,
      (data.color as string) ?? "White",
      (data.style as string) ?? "simple"
    );
  }
}

// ─── Dashboard Layout ───────────────────────────────────────────

/** The full dashboard layout configuration, including theme + ordered widgets. */
export class DashboardLayout {
  private static readonly SLOT_SPACING = 160;
  private static readonly SLOT_Y = 40;
  private static readonly SLOT_X_START = 20;

  constructor(
    public readonly theme: string,
    public readonly widgets: DashboardWidget[],
    public readonly masterToggles: Record<string, boolean> = {
      max_drawdown: true,
      daily_loss: true,
      consecutive_losses: false,
      stagnation_days: false,
      stagnation_trades: false
    }
  ) {}

  /** Create a default 3-widget template. */
  static createDefault(): DashboardLayout {
    const defaults = MetricCatalog.all().slice(0, 3);
    const widgets = defaults.map(
      (opt, i) =>
        new DashboardWidget(
          `w_${Date.now()}_${i}`,
          "metric",
          opt.defaultTitle,
          opt.valueKey,
          this.SLOT_X_START + i * this.SLOT_SPACING,
          this.SLOT_Y,
          opt.defaultColor,
          "simple"
        )
    );
    return new DashboardLayout("dark", widgets);
  }

  /** Hydrate from stored JSON (backend response or strategy.dashboard_layout). */
  static fromJSON(data: Record<string, unknown> | null | undefined): DashboardLayout {
    if (!data || !Array.isArray(data.widgets) || data.widgets.length === 0) {
      return this.createDefault();
    }
    return new DashboardLayout(
      (data.theme as string) ?? "dark",
      (data.widgets as Record<string, unknown>[]).map(DashboardWidget.fromJSON),
      (data.master_toggles as Record<string, boolean>) ?? {
        max_drawdown: true,
        daily_loss: true,
        consecutive_losses: false,
        stagnation_days: false,
        stagnation_trades: false
      }
    );
  }

  /** Add a new default widget to the layout. */
  addWidget(): DashboardLayout {
    if (this.widgets.length >= 6) return this; // Max 6 widgets to avoid clutter
    const opt = MetricCatalog.all()[0];
    const newIndex = this.widgets.length;
    const newWidget = new DashboardWidget(
      `w_${Date.now()}`,
      "metric",
      opt.defaultTitle,
      opt.valueKey,
      DashboardLayout.SLOT_X_START + newIndex * DashboardLayout.SLOT_SPACING,
      DashboardLayout.SLOT_Y,
      opt.defaultColor,
      "simple"
    );
    return new DashboardLayout(this.theme, [...this.widgets, newWidget], this.masterToggles);
  }

  /** Remove a widget by its ID. */
  removeWidget(widgetId: string): DashboardLayout {
    // Re-calculate X positions for remaining widgets so there are no empty gaps
    const remaining = this.widgets.filter((w) => w.id !== widgetId);
    const repositioned = remaining.map((w, i) =>
      w.withUpdates({ x: DashboardLayout.SLOT_X_START + i * DashboardLayout.SLOT_SPACING })
    );
    return new DashboardLayout(this.theme, repositioned, this.masterToggles);
  }

  /** Replace the widget at a given slot index, returning a new immutable layout. */
  updateWidget(index: number, updates: Partial<Pick<DashboardWidget, "title" | "valueKey" | "color" | "style">>): DashboardLayout {
    const newWidgets = this.widgets.map((w, i) => (i === index ? w.withUpdates(updates) : w));
    return new DashboardLayout(this.theme, newWidgets, this.masterToggles);
  }

  /** Update a global risk enforcement toggle and sync widgets mapping. */
  setMasterToggle(key: string, enabled: boolean): DashboardLayout {
    const nextToggles = { ...this.masterToggles, [key]: enabled };
    let nextWidgets = [...this.widgets];

    if (enabled) {
      if (!nextWidgets.find((w) => w.valueKey === key)) {
        const opt = MetricCatalog.findByKey(key);
        if (opt) {
          const newIndex = nextWidgets.length;
          nextWidgets.push(
            new DashboardWidget(
              `w_${Date.now()}_${newIndex}`,
              "metric",
              opt.defaultTitle,
              opt.valueKey,
              DashboardLayout.SLOT_X_START + newIndex * DashboardLayout.SLOT_SPACING,
              DashboardLayout.SLOT_Y,
              opt.defaultColor,
              "simple"
            )
          );
        }
      }
    } else {
      nextWidgets = nextWidgets.filter((w) => w.valueKey !== key);
      nextWidgets = nextWidgets.map((w, i) =>
        w.withUpdates({ x: DashboardLayout.SLOT_X_START + i * DashboardLayout.SLOT_SPACING })
      );
    }

    return new DashboardLayout(this.theme, nextWidgets, nextToggles);
  }

  /** Reorder widgets from source to target index, recalculating X positions */
  reorderWidget(sourceIdx: number, targetIdx: number): DashboardLayout {
    if (sourceIdx === targetIdx || sourceIdx < 0 || targetIdx < 0 || sourceIdx >= this.widgets.length || targetIdx >= this.widgets.length) return this;
    
    const nextWidgets = [...this.widgets];
    const [moved] = nextWidgets.splice(sourceIdx, 1);
    nextWidgets.splice(targetIdx, 0, moved);
    
    const repositioned = nextWidgets.map((w, i) =>
      w.withUpdates({ x: DashboardLayout.SLOT_X_START + i * DashboardLayout.SLOT_SPACING })
    );
    
    return new DashboardLayout(this.theme, repositioned, this.masterToggles);
  }

  /** Assign a full metric to a slot (updates title, valueKey, color based on MetricOption). */
  assignMetric(index: number, valueKey: string): DashboardLayout {
    const opt = MetricCatalog.findByKey(valueKey);
    if (!opt) return this;
    return this.updateWidget(index, {
      valueKey: opt.valueKey,
      title: opt.defaultTitle,
      color: opt.defaultColor,
    });
  }

  /** Change only the color of a slot. */
  changeColor(index: number, color: string): DashboardLayout {
    return this.updateWidget(index, { color });
  }

  /** Change the style of a slot. */
  changeStyle(index: number, style: string): DashboardLayout {
    return this.updateWidget(index, { style });
  }

  /** Serialize for backend POST/PUT. */
  toJSON(): Record<string, unknown> {
    return {
      theme: this.theme,
      widgets: this.widgets.map((w) => w.toJSON()),
      master_toggles: this.masterToggles,
    };
  }
}
