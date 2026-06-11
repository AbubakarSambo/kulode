import { useEffect, useRef, useState } from "react";
import { Sparkles, Trophy } from "lucide-react";

interface WowCelebrationProps {
  title: string;
  description: string;
  onClose: () => void;
}

interface ConfettiParticle {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
}

const COLORS = [
  "#0037b0", // primary blue
  "#1d4ed8", // secondary blue
  "#006c49", // emerald success
  "#6ffbbe", // mint light
  "#ffddb8", // orange/gold warning
  "#fbbf24", // amber
  "#ec4899", // pink
];

export function WowCelebration({ title, description, onClose }: WowCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    // Fade in card
    const timer = setTimeout(() => setShowCard(true), 100);

    // Confetti Animation logic
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Resize listener
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Create particles
    const particles: ConfettiParticle[] = [];
    const particleCount = 150;

    // Burst from center-bottom (where user clicks send) and top-left/right sides
    for (let i = 0; i < particleCount; i++) {
      const isSide = Math.random() > 0.4;
      let x = width / 2;
      let y = height * 0.8;
      let speedX = (Math.random() - 0.5) * 15;
      let speedY = -Math.random() * 20 - 5;

      if (isSide) {
        // burst from sides
        x = Math.random() > 0.5 ? 0 : width;
        y = height * 0.3;
        speedX = x === 0 ? Math.random() * 15 + 5 : -Math.random() * 15 - 5;
        speedY = -Math.random() * 12 - 3;
      }

      particles.push({
        x,
        y,
        size: Math.random() * 8 + 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        speedX,
        speedY,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }

    // Animation Loop
    const gravity = 0.45;
    const friction = 0.98;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      let particlesActive = false;

      particles.forEach((p) => {
        p.x += p.x > width / 2 ? p.speedX * 0.95 : p.speedX;
        p.speedY += gravity;
        p.speedX *= friction;
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;

        // Draw particle
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        // Alternate square vs circle
        if (p.size % 2 === 0) {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Check if still on screen
        if (p.y < height + 20 && p.x > -20 && p.x < width + 20) {
          particlesActive = true;
        }
      });

      if (particlesActive) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none">
      {/* Confetti Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Celebration Modal Card */}
      <div
        className={`relative max-w-md w-full bg-white rounded-[32px] p-8 text-center border border-slate-100 shadow-[0_32px_64px_rgba(0,55,176,0.12)] transition-all duration-500 ease-out transform ${
          showCard ? "translate-y-0 opacity-100 scale-100" : "translate-y-12 opacity-0 scale-90"
        }`}
      >
        {/* Floating Ring & Icon */}
        <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-lg shadow-[#0037b0]/20 mb-6 animate-bounce">
          <Trophy className="w-10 h-10" strokeWidth={1.5} />
        </div>

        {/* Milestone Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[#006c49] text-[10px] font-bold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          Milestone Unlocked
        </div>

        <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mb-2">
          {title}
        </h3>
        <p className="text-xs text-slate-500 font-medium leading-relaxed mb-8 px-2">
          {description}
        </p>

        <button
          onClick={() => {
            setShowCard(false);
            setTimeout(onClose, 300);
          }}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-sm font-bold shadow-lg shadow-[#0037b0]/20 hover:opacity-95 active:scale-98 transition-all cursor-pointer"
        >
          Awesome, Let's Go!
        </button>
      </div>
    </div>
  );
}
