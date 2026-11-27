"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface ConfettiParticle {
  x: number;
  y: number;
  size: number;
  color: string;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

export function CompanySetupCelebration() {
  const t = useTranslations("PackagesPage");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const [showBanner, setShowBanner] = useState(true);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colors = [
      "#2b7453",
      "#4b8066",
      "#6dbb86",
      "#c6a46a",
      "#dfbd72",
      "#9cbba7",
      "#326c54",
      "#709b82",
    ];

    function createParticles(): ConfettiParticle[] {
      const currentCanvas = canvasRef.current;
      if (!currentCanvas) return [];
      const newParticles: ConfettiParticle[] = [];
      const particleCount = 60;
      const canvasWidth = currentCanvas.width;
      for (let i = 0; i < particleCount; i++) {
        newParticles.push({
          x: Math.random() * canvasWidth,
          y: -20 - Math.random() * 100,
          size: 6 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)],
          velocityX: (Math.random() - 0.5) * 2,
          velocityY: 1.5 + Math.random() * 2.5,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.1,
          opacity: 1,
        });
      }
      return newParticles;
    }

    function resizeCanvas() {
      const currentCanvas = canvasRef.current;
      if (!currentCanvas) return;
      const container = currentCanvas.parentElement;
      if (container) {
        currentCanvas.width = container.clientWidth;
        currentCanvas.height = 120;
      }
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    setParticles(createParticles());

    function animate() {
      const currentCanvas = canvasRef.current;
      const currentCtx = currentCanvas?.getContext("2d");
      if (!currentCanvas || !currentCtx) return;

      currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);

      const remainingParticles = particles
        .map((p) => ({
          ...p,
          x: p.x + p.velocityX,
          y: p.y + p.velocityY,
          velocityY: p.velocityY + 0.03,
          rotation: p.rotation + p.rotationSpeed,
          opacity: Math.max(0, p.opacity - 0.008),
        }))
        .filter((p) => p.opacity > 0 && p.y < currentCanvas.height + 50);

      remainingParticles.forEach((p) => {
        currentCtx.save();
        currentCtx.translate(p.x, p.y);
        currentCtx.rotate(p.rotation);
        currentCtx.globalAlpha = p.opacity;
        currentCtx.fillStyle = p.color;
        currentCtx.beginPath();
        currentCtx.roundRect(-p.size / 2, -p.size / 2, p.size, p.size, 2);
        currentCtx.fill();
        currentCtx.restore();
      });

      setParticles(remainingParticles);

      if (remainingParticles.length > 0) {
        animationRef.current = requestAnimationFrame(animate);
      }
    }

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [particles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowBanner(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!showBanner) return null;

  // @ts-expect-error - new translation key not yet in generated types
  const title = t("companySetupSuccess.title");
  // @ts-expect-error - new translation key not yet in generated types
  const description = t("companySetupSuccess.description");

  return (
    <div className="company-setup-celebration" role="status" aria-live="polite">
      <canvas
        ref={canvasRef}
        className="celebration-confetti"
        aria-hidden="true"
        style={{ width: "100%", height: "120px", display: "block" }}
      />
      <div className="page-container celebration-content">
        <div className="celebration-inner">
          <svg
            className="celebration-icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            width="28"
            height="28"
          >
            <circle
              cx="12"
              cy="12"
              r="11"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M8 12l3 3 5-5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="celebration-text">
            <p className="celebration-title">{title}</p>
            <p className="celebration-description">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
