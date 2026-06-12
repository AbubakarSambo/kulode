import { useEffect, useRef, useState } from "react";
import { Sparkles, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Link02Icon,
  Share02Icon,
  Download02Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import apiClient from "@/api/client";
import { formatCurrency } from "@/lib/utils";

interface WowCelebrationProps {
  title: string;
  description: string;
  invoiceId?: string;
  invoiceNumber?: string;
  paymentUrl?: string | null;
  total?: number;
  clientName?: string;
  shareToken?: string | null;
  onClose: () => void;
  clientPhone?: string;
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

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function WowCelebration({
  title,
  description,
  invoiceId,
  invoiceNumber,
  paymentUrl,
  total = 0,
  clientName,
  shareToken,
  onClose,
  clientPhone,
}: WowCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const navigate = useNavigate();

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

  const getPublicInvoiceUrl = () => {
    return `${window.location.origin}/i/${shareToken || ""}`;
  };



  const copyPublicLink = () => {
    navigator.clipboard.writeText(getPublicInvoiceUrl());
    toast.success("Public invoice link copied to clipboard");
  };

  const openPublicLink = () => {
    window.open(getPublicInvoiceUrl(), "_blank");
  };

  const shareWhatsApp = () => {
    const publicUrl = getPublicInvoiceUrl();
    const link = paymentUrl || publicUrl;
    const text = `Hello! Here is invoice ${invoiceNumber || ""} for ${formatCurrency(
      total
    )}.${link ? ` You can view details or pay online here: ${link}` : ""}`;
    const cleanPhone = clientPhone ? clientPhone.replace(/\D/g, "") : "";
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const downloadPdf = async () => {
    if (!invoiceId) return;
    setIsDownloading(true);
    try {
      const response = await apiClient.get(`/invoices/${invoiceId}/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoiceNumber || "invoice"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Invoice PDF downloaded successfully");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none overflow-y-auto">
      {/* Confetti Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Celebration Modal Card */}
      <div
        className={`relative max-w-md w-full bg-white rounded-[24px] p-6 text-center shadow-[0_32px_64px_rgba(0,55,176,0.12)] transition-all duration-500 ease-out transform my-8 ${
          showCard ? "translate-y-0 opacity-100 scale-100" : "translate-y-12 opacity-0 scale-90"
        }`}
      >
        {/* Floating Ring & Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-lg shadow-[#0037b0]/20 mb-4 animate-bounce">
          <Trophy className="w-8 h-8" strokeWidth={1.5} />
        </div>

        {/* Milestone Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[#006c49] text-[9px] font-bold uppercase tracking-wider mb-2.5">
          <Sparkles className="w-3.5 h-3.5" />
          Milestone Unlocked
        </div>

        <h3 className="text-xl font-semibold text-slate-900 tracking-tight leading-tight mb-1">
          {title}
        </h3>
        <p className="text-xs text-slate-500 font-medium leading-relaxed mb-5 px-2">
          {description}
        </p>

        {invoiceId && (
          <>
            {/* Invoice Info Panel (No 1px solid borders, bg shifts) */}
            <div className="bg-[#f8f9ff] rounded-2xl p-4 text-left mb-5 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <span>Invoice Issued</span>
                <span className="text-emerald-700 font-black">{invoiceNumber}</span>
              </div>
              <div className="text-slate-800 text-sm font-semibold truncate">
                {clientName}
              </div>
              <div className="text-[#0037b0] text-lg font-black tracking-tight">
                {formatCurrency(total)}
              </div>
            </div>

            {/* Sharing & Reusable Invoice Actions */}
            <div className="space-y-2.5 mb-6">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block text-left">
                Share Invoice & Get Paid
              </span>

              <div className="grid grid-cols-2 gap-2">
                {shareToken && (
                  <button
                    onClick={copyPublicLink}
                    className="col-span-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border-0"
                  >
                    <HugeiconsIcon icon={Link02Icon} size={15} strokeWidth={1.5} />
                    Copy Link to Pay
                  </button>
                )}
                
                <button
                  onClick={openPublicLink}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white transition-all active:scale-98"
                >
                  <HugeiconsIcon icon={Share02Icon} size={14} strokeWidth={1.5} />
                  Open Invoice
                </button>

                <button
                  onClick={shareWhatsApp}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white transition-all active:scale-98"
                >
                  <WhatsAppIcon className="h-4 w-4 text-emerald-600" />
                  WhatsApp Link
                </button>

                <button
                  onClick={downloadPdf}
                  disabled={isDownloading}
                  className="col-span-2 py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white disabled:opacity-50 transition-all active:scale-98"
                >
                  <HugeiconsIcon icon={Download02Icon} size={14} strokeWidth={1.5} />
                  {isDownloading ? "Downloading..." : "Download PDF"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Footer Navigation CTA */}
        <div className="flex flex-col gap-2 w-full mt-4">
          {invoiceId ? (
            <>
              <button
                onClick={() => {
                  setShowCard(false);
                  setTimeout(() => {
                    onClose();
                    navigate(`/invoices/${invoiceId}`);
                  }, 300);
                }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-98 transition-all cursor-pointer border-0"
              >
                Go to Invoice Details
              </button>
              <button
                onClick={() => {
                  setShowCard(false);
                  setTimeout(() => {
                    onClose();
                    navigate("/dashboard");
                  }, 300);
                }}
                className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-[#0037b0] transition-colors cursor-pointer bg-transparent border-0"
              >
                Go to Dashboard
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setShowCard(false);
                setTimeout(onClose, 300);
              }}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-98 transition-all cursor-pointer border-0"
            >
              Awesome, Let's Go!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
