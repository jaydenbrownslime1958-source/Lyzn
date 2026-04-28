import { useMemo } from "react";

/**
 * Pure-CSS purple shooting stars background.
 * Creates static twinkling stars + animated shooting star streaks.
 */
export const ShootingStars = () => {
  // Pre-compute star positions so they don't re-randomize on re-renders.
  const stars = useMemo(
    () =>
      Array.from({ length: 120 }).map(() => ({
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 2 + 0.5,
        delay: Math.random() * 6,
        duration: Math.random() * 4 + 2,
      })),
    []
  );

  const shooters = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, i) => ({
        id: i,
        top: Math.random() * 70,
        left: Math.random() * 100,
        delay: Math.random() * 8 + i * 1.2,
        duration: Math.random() * 2 + 2.2,
      })),
    []
  );

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {/* purple radial base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, #2a0a5e 0%, #160436 40%, #09001A 75%, #05000A 100%)",
        }}
      />
      {/* subtle grain */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* twinkling stars */}
      {stars.map((s, i) => (
        <span
          key={i}
          className="lyzn-star"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}

      {/* shooting stars */}
      {shooters.map((s) => (
        <span
          key={s.id}
          className="lyzn-shooter"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
};

export default ShootingStars;
