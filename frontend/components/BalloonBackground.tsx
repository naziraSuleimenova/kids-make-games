'use client';

import { useEffect, useState } from 'react';

interface Balloon {
  id: number;
  x: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}

const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635',
  '#34d399', '#38bdf8', '#818cf8', '#e879f9',
];

let nextId = 0;

function makeBalloon(): Balloon {
  return {
    id: nextId++,
    x: Math.random() * 100,
    size: 24 + Math.random() * 32,
    delay: Math.random() * 6,
    duration: 7 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

export default function BalloonBackground() {
  const [balloons, setBalloons] = useState<Balloon[]>([]);

  useEffect(() => {
    setBalloons(Array.from({ length: 12 }, makeBalloon));

    const interval = setInterval(() => {
      setBalloons(prev => {
        const next = [...prev.slice(-14), makeBalloon()];
        return next;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {balloons.map(b => (
        <div
          key={b.id}
          className="absolute bottom-0 rounded-full opacity-20"
          style={{
            left: `${b.x}%`,
            width: b.size,
            height: b.size * 1.2,
            backgroundColor: b.color,
            animationName: 'floatUp',
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
            animationTimingFunction: 'linear',
            animationFillMode: 'both',
          }}
        />
      ))}
    </div>
  );
}
