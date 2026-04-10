"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── OOP InfoPopover ────────────────────────────────────────────────
// Reusable click-to-toggle popover with outside-click dismiss.
// Follows Single Responsibility: only handles popover display logic.

interface InfoPopoverProps {
  /** The content to display inside the popover */
  content: React.ReactNode;
  /** Popover width class (default: 'w-80') */
  width?: string;
  /** Position relative to trigger (default: 'top') */
  position?: "top" | "bottom";
  /** Additional className for the trigger wrapper */
  className?: string;
  /** Children rendered as the trigger (e.g. the ℹ️ icon) */
  children?: React.ReactNode;
}

/**
 * InfoPopover — A click-to-toggle popover component.
 * 
 * Replaces tiny hover tooltips with a properly sized, accessible popover
 * that the user clicks to open and clicks outside (or clicks again) to close.
 * 
 * OOP principles:
 * - Single typed interface (InfoPopoverProps)
 * - Encapsulates all state and side-effects internally
 * - Reusable across any component that needs rich tooltips
 */
export default function InfoPopover({
  content,
  width = "w-80",
  position = "top",
  className = "",
  children,
}: InfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const positionClasses =
    position === "top"
      ? "bottom-full left-0 mb-2"
      : "top-full left-0 mt-2";

  return (
    <div ref={popoverRef} className={`relative inline-block ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={toggle}
        className="text-[10px] cursor-pointer hover:opacity-80 transition-opacity select-none"
        aria-label="Show info"
        aria-expanded={isOpen}
      >
        {children || "ℹ️"}
      </button>

      {/* Popover panel */}
      {isOpen && (
        <div
          className={`absolute ${positionClasses} ${width} bg-iron-900 border border-iron-700 text-iron-200 text-[11px] p-4 rounded-lg shadow-2xl z-50 normal-case font-normal leading-relaxed whitespace-pre-line animate-in fade-in zoom-in-95 duration-200`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
