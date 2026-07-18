import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { devicePerformanceTier } from '@/lib/devicePerformanceTier';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

const COLORS = ['#22C55E', '#F59E0B', '#3B82F6', '#EC4899', '#A855F7'];

const PARTICLE_COUNT = { high: 150, mid: 60, low: 0 } as const;

interface SkiaConfettiProps {
  /** 0–1 progress shared value, e.g. from useCelebrate(). */
  progress: SharedValue<number>;
  width: number;
  height: number;
}

/**
 * Single Canvas confetti burst (guide §5.5): all particle constants are
 * precomputed once via useMemo, and every particle's position is derived
 * from the one `progress` shared value — no per-frame allocation.
 */
export function SkiaConfetti({ progress, width, height }: SkiaConfettiProps) {
  const count = PARTICLE_COUNT[devicePerformanceTier()];

  const particles = useMemo<Particle[]>(() => {
    const list: Particle[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        x: width / 2,
        y: height * 0.3,
        vx: (Math.random() - 0.5) * width * 0.8,
        vy: -Math.random() * height * 0.6 - height * 0.2,
        radius: 3 + Math.random() * 3,
        color: COLORS[i % COLORS.length],
      });
    }
    return list;
  }, [count, width, height]);

  if (count === 0) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((particle, i) => (
        <ConfettiParticle key={i} particle={particle} progress={progress} />
      ))}
    </Canvas>
  );
}

function ConfettiParticle({ particle, progress }: { particle: Particle; progress: SharedValue<number> }) {
  const cx = useDerivedValue(() => particle.x + particle.vx * progress.value);
  const cy = useDerivedValue(
    () => particle.y + particle.vy * progress.value + 400 * progress.value * progress.value
  );
  const opacity = useDerivedValue(() => 1 - progress.value);

  return <Circle cx={cx} cy={cy} r={particle.radius} color={particle.color} opacity={opacity} />;
}
