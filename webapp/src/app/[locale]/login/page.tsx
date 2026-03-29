/** Login Page */
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/useAuthStore";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.push("/dashboard");
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(email, password);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-iron-100">
            IRON<span className="text-risk-green">RISK</span>
          </h1>
          <p className="text-sm text-iron-500 mt-2">Access your control tower</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="trader@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div>
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button 
              type="button" 
              onClick={() => setShowHint(!showHint)} 
              className="text-xs text-iron-500 hover:text-iron-300 transition-colors mt-2 ml-1"
            >
              ¿Olvidaste la contraseña?
            </button>
          </div>

          {showHint && (
            <div className="bg-iron-900 border border-risk-yellow/30 rounded-lg p-3 text-sm text-iron-300">
              💡 <strong>Soporte Técnico:</strong> Por motivos de testing transversal, tu contraseña temporal es <span className="font-mono text-risk-green font-bold">ironrisk2026</span>
              <br/>
              <button 
                type="button" 
                onClick={() => setPassword("ironrisk2026")}
                className="mt-2 text-xs bg-iron-800 hover:bg-iron-700 px-2 py-1 rounded text-iron-200 transition-colors"
              >
                Auto-completar
              </button>
            </div>
          )}

          {error && (
            <div className="bg-risk-red/10 border border-risk-red/30 rounded-lg p-3">
              <p className="text-risk-red text-sm">{error}</p>
            </div>
          )}

          <Button type="submit" isLoading={isLoading} className="w-full">
            Sign In
          </Button>
        </form>

        <p className="text-center text-sm text-iron-500 mt-6">
          No account?{" "}
          <Link href="/register" className="text-risk-green hover:underline">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
