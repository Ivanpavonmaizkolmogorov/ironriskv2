/** Reusable Input component with clinical dark styling. */
"use client";

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className = "", ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-iron-400 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <input
        className={`
          w-full bg-surface-tertiary border border-iron-700 rounded-lg
          px-4 py-2.5 text-sm text-iron-100 placeholder-iron-500
          focus:outline-none focus:border-risk-green/50 focus:ring-1 focus:ring-risk-green/20
          transition-colors duration-200
          ${error ? "border-risk-red/50" : ""}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-risk-red">{error}</p>}
    </div>
  );
}
