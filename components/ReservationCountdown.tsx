'use client';

import { useEffect, useState, useCallback } from 'react';
import { secondsUntil, formatCountdown } from '@/lib/utils';

interface ReservationCountdownProps {
  expiresAt: string | Date;
  onExpired?: () => void;
  className?: string;
}

export function ReservationCountdown({
  expiresAt,
  onExpired,
  className,
}: ReservationCountdownProps) {
  const [seconds, setSeconds] = useState(() => secondsUntil(expiresAt));
  const totalSeconds = 10 * 60; // 10 minutes

  const tick = useCallback(() => {
    const remaining = secondsUntil(expiresAt);
    setSeconds(remaining);
    if (remaining === 0 && onExpired) {
      onExpired();
    }
  }, [expiresAt, onExpired]);

  useEffect(() => {
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  const progress = Math.max(0, Math.min(1, seconds / totalSeconds));
  const isExpired = seconds === 0;
  const isUrgent = seconds <= 60;
  const isWarning = seconds <= 180;

  // SVG circle parameters
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const color = isExpired
    ? '#ef4444'
    : isUrgent
      ? '#ef4444'
      : isWarning
        ? '#f59e0b'
        : '#10b981';

  const glowClass = isUrgent
    ? 'drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]'
    : isWarning
      ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]'
      : 'drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]';

  return (
    <div className={`flex flex-col items-center gap-3 ${className ?? ''}`}>
      <div className="relative">
        <svg
          width={size}
          height={size}
          className={`-rotate-90 transition-all duration-300 ${glowClass}`}
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease' }}
          />
        </svg>
        {/* Time display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-bold tabular-nums"
            style={{ color, transition: 'color 0.5s ease' }}
          >
            {formatCountdown(seconds)}
          </span>
          <span className="text-[10px] text-white/40 uppercase tracking-wider mt-0.5">
            {isExpired ? 'Expired' : 'Remaining'}
          </span>
        </div>
      </div>

      {/* Status label */}
      <div className="text-center">
        {isExpired ? (
          <p className="text-sm font-semibold text-red-400 animate-pulse">
            Your reservation has expired
          </p>
        ) : isUrgent ? (
          <p className="text-sm font-semibold text-red-400 animate-pulse">
            Less than 1 minute left!
          </p>
        ) : isWarning ? (
          <p className="text-sm text-amber-400">
            Hurry up — reservation expiring soon
          </p>
        ) : (
          <p className="text-sm text-white/50">
            Reserve held for {Math.ceil(seconds / 60)} min
          </p>
        )}
      </div>
    </div>
  );
}
