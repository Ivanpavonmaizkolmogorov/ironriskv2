"use client";

import React, { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";

interface ChangelogEntry {
  id: string;
  date: string;
  tag: "feature" | "fix" | "improvement";
  internal?: boolean;
}

const TAG_STYLES: Record<string, { bg: string; text: string }> = {
  feature:     { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  fix:         { bg: "bg-amber-500/15",   text: "text-amber-400" },
  improvement: { bg: "bg-cyan-500/15",    text: "text-cyan-400" },
};

const LAST_SEEN_KEY = "ironrisk_changelog_last_seen";

export default function ChangelogButton() {
  const t = useTranslations("changelog");
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load changelog entries
  useEffect(() => {
    fetch("/changelog.json")
      .then(r => r.json())
      .then((data: ChangelogEntry[]) => {
        const publicEntries = data.filter(e => !e.internal);
        setEntries(publicEntries);

        // Check if there are unseen entries
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
        if (!lastSeen || (publicEntries.length > 0 && publicEntries[0].date > lastSeen)) {
          setHasNew(true);
        }
      })
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(prev => !prev);
    if (!isOpen && entries.length > 0) {
      localStorage.setItem(LAST_SEEN_KEY, entries[0].date);
      setHasNew(false);
    }
  };

  if (entries.length === 0) return null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative flex items-center gap-1.5 bg-iron-800/40 hover:bg-iron-700/60 border border-iron-700/40 hover:border-iron-600 rounded-lg px-2.5 py-1.5 transition-all duration-200 group"
        title={t("title")}
      >
        <span className="text-sm opacity-80 group-hover:opacity-100 transition-opacity">📋</span>
        {hasNew && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse" />
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[70vh] bg-surface-secondary border border-iron-700 rounded-xl shadow-2xl z-[60] animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-iron-800 shrink-0">
            <h3 className="text-sm font-bold text-iron-100">{t("title")}</h3>
            <p className="text-[10px] text-iron-500 mt-0.5">{t("subtitle")}</p>
          </div>

          {/* Entries */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {entries.slice(0, 15).map((entry) => {
              const tagStyle = TAG_STYLES[entry.tag] || TAG_STYLES.improvement;
              let title: string, body: string, tagLabel: string;
              try { title = t(`entries.${entry.id}.title`); } catch { title = entry.id; }
              try { body = t(`entries.${entry.id}.body`); } catch { body = ""; }
              try { tagLabel = t(`tags.${entry.tag}`); } catch { tagLabel = entry.tag; }

              return (
                <div
                  key={entry.id}
                  className="bg-surface-tertiary rounded-lg p-3 border border-iron-800/50 hover:border-iron-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${tagStyle.bg} ${tagStyle.text}`}>
                      {tagLabel}
                    </span>
                    <span className="text-[10px] text-iron-600 font-mono">{entry.date}</span>
                  </div>
                  <h4 className="text-xs font-semibold text-iron-200 leading-snug">{title}</h4>
                  {body && (
                    <p className="text-[11px] text-iron-400 mt-1 leading-relaxed">{body}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
