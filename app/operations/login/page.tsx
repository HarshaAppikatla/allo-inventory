'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Mail, Lock, Loader2, ArrowRight } from 'lucide-react';

export default function OperationsLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.user.role !== 'SERVICE_PROVIDER' && data.user.role !== 'ADMIN') {
        throw new Error('Unauthorized for Operations Portal.');
      }

      router.push('/operations');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[#090b0a]">
      {/* Visual background elements */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-teal-600/10 blur-[80px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo/Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
            <Truck className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-2">
            Operations & Fulfillment
          </h1>
          <p className="text-sm text-white/40">
            Log in to manage catalog, adjustments, and order workflows
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.03] border border-white/8 backdrop-blur-xl rounded-3xl p-8 shadow-2xl">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive-foreground text-xs leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-white/30">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ops@allohealth.com"
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/8 focus:border-emerald-500/50 rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-white/30">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/8 focus:border-emerald-500/50 rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all duration-200"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 active:transform active:scale-[0.98] shadow-lg shadow-emerald-600/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                <>
                  Enter Operations Portal
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Test Credentials Hint */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <span className="text-[11px] font-medium text-white/30 uppercase tracking-wider block mb-3">
              Test Credentials
            </span>
            <div className="inline-flex flex-col gap-1.5 p-3.5 rounded-xl bg-white/[0.01] border border-white/5 text-left w-full">
              <div className="flex justify-between text-xs">
                <span className="text-white/40 font-mono">Email:</span>
                <span className="text-emerald-300 font-mono select-all">ops@allohealth.com</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/40 font-mono">Password:</span>
                <span className="text-white/80 font-mono select-all">ops123</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
