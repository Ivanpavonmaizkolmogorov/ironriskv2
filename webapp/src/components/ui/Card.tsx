/** Card component — glass-morphic dark surface. */
"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className = "", hover = false }: CardProps) {
  return (
    <div
      className={`
        bg-surface-secondary border border-iron-800 rounded-xl p-6
        ${hover ? "hover:border-iron-600 hover:shadow-lg transition-all duration-300" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
