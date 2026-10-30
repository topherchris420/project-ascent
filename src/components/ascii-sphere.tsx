'use client';
import { useEffect, useRef } from 'react';

const GLYPHS = '·∙░▒▓│─┤├┴┬╭╮╰╯█';

/**
 * Decorative rotating sphere drawn with text glyphs. It inherits `color` from CSS, pauses when it is
 * off screen or the tab is hidden, and draws a single still frame for people who prefer reduced motion.
 */
export function AsciiSphere({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      time = 0.8,
      visible = true,
      width = 0,
      height = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      if (!width || !height) return;
      const cx = width / 2,
        cy = height / 2,
        radius = Math.min(width, height) * 0.46;
      ctx.fillStyle = getComputedStyle(canvas).color;
      ctx.font = `${Math.max(9, Math.round(radius / 30))}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const points: { x: number; y: number; z: number }[] = [];
      const rotY = time * 0.3,
        rotX = time * 0.2;
      for (let phi = 0; phi < Math.PI * 2; phi += 0.15) {
        for (let theta = 0.075; theta < Math.PI; theta += 0.15) {
          const x = Math.sin(theta) * Math.cos(phi + time * 0.5);
          const y = Math.sin(theta) * Math.sin(phi + time * 0.5);
          const z = Math.cos(theta);
          const x2 = x * Math.cos(rotY) - z * Math.sin(rotY);
          const z2 = x * Math.sin(rotY) + z * Math.cos(rotY);
          const y3 = y * Math.cos(rotX) - z2 * Math.sin(rotX);
          const z3 = y * Math.sin(rotX) + z2 * Math.cos(rotX);
          points.push({ x: cx + x2 * radius, y: cy + y3 * radius, z: z3 });
        }
      }
      points.sort((a, b) => a.z - b.z);
      for (const point of points) {
        const depth = (point.z + 1) / 2;
        ctx.globalAlpha = 0.12 + depth * 0.7;
        ctx.fillText(GLYPHS[Math.floor(depth * (GLYPHS.length - 1))], point.x, point.y);
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      time += 0.012;
      draw();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (visible && !still.matches && !document.hidden) frame = requestAnimationFrame(loop);
      else draw();
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const sizes = new ResizeObserver(resize);
    sizes.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    seen.observe(canvas);
    document.addEventListener('visibilitychange', start);
    still.addEventListener('change', start);
    resize();
    start();
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', start);
      still.removeEventListener('change', start);
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
