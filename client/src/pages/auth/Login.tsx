import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import {
  Button,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui";
import { useLogin, useResendVerification } from "@/hooks";
import { posthog } from "@/lib/posthog";
import { Mail, MessageCircle, Pointer, ArrowLeft, Eye, EyeOff } from "lucide-react";

const GOOGLE_AUTH_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1/auth/google`
  : "/api/v1/auth/google";

const LANDING_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:4321`
  : "https://www.kulode.app";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const login = useLogin();
  const resend = useResendVerification();
  const [showResend, setShowResend] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [overscrollActive, setOverscrollActive] = useState(false);

  useEffect(() => {
    let timeoutId: any;
    const handleScroll = () => {
      const threshold = 10;
      const totalHeight = document.documentElement.scrollHeight;
      const scrollPosition = window.innerHeight + window.scrollY;

      if (totalHeight > window.innerHeight && scrollPosition >= totalHeight - threshold) {
        setOverscrollActive(true);
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setOverscrollActive(false);
        }, 500);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timeoutId);
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginForm) => {
    setShowResend(false);
    setLoginEmail(data.email);
    login.mutate(data, {
      onError: (error: any) => {
        const message = error.response?.data?.message || "";
        if (message.includes("verify your email")) {
          setShowResend(true);
        }
      },
    });
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#faf8ff] font-sans antialiased">
      
      {/* Left Branding Panel (7 cols on large screens) */}
      <div className="hidden lg:flex lg:col-span-7 flex-col justify-between p-16 text-white relative overflow-hidden bg-[#00247d] bg-gradient-to-br from-[#001c66] via-[#00247d] to-[#0037b0] border-r border-white/5">
        {/* Floating decorative circles */}
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none"></div>
        
        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center font-black text-white text-lg">
            K
          </div>
          <span className="text-2xl font-extrabold tracking-tighter">Kulode</span>
        </div>
        
        {/* Center Content & Animated Mockups */}
        <div className="relative z-10 my-auto py-6 grid grid-cols-1 xl:grid-cols-12 gap-8 items-center">
          <div className="xl:col-span-6 space-y-6">
            <h1 className="text-4xl xl:text-5xl font-black leading-[1.1] tracking-tight text-white">
              Nigeria's modern invoicing & <span className="bg-gradient-to-r from-blue-300 via-indigo-200 to-white bg-clip-text text-transparent">compliance engine</span>
            </h1>
            <p className="text-base text-blue-100/80 leading-relaxed max-w-lg">
              Automate your billing, track expenses under tax categories, and auto-generate e-filing summaries compliant with FIRS & NFIU.
            </p>
          </div>
          
          {/* Animated illustration container */}
          <div className="xl:col-span-6 relative flex justify-center items-center py-6 scale-90 xl:scale-100">
            {/* Background decorative pulse circle */}
            <div className="absolute w-[300px] h-[300px] rounded-full bg-white/5 blur-3xl -z-10 animate-pulse"></div>

            {/* Cutout Image Card of Person Looking at Phone */}
            <div className="relative w-[240px] h-[320px] rounded-[32px] overflow-visible flex items-center justify-center border border-white/10 shadow-2xl bg-white p-2">
              <img src="/person_looking_at_phone.png" alt="Person looking at phone" className="w-full h-full object-cover rounded-[24px] filter" />
              
              {/* Animation overlays */}
              
              {/* Email flying card */}
              <div className="absolute -top-6 -left-10 glass-card p-3 rounded-[20px] shadow-lg border border-white/20 max-w-[170px] flex items-center gap-3 animate-float-email text-slate-800">
                <div className="w-8 h-8 rounded-full bg-[#0037b0] flex items-center justify-center text-white shrink-0">
                  <Mail size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-900 leading-tight">Invoice Sent</p>
                  <p className="text-[8px] text-slate-500 leading-tight">via email ✉️</p>
                </div>
              </div>

              {/* WhatsApp Chat bubble */}
              <div className="absolute top-[35%] -right-12 bg-[#d9fdd3] p-3 rounded-[20px] rounded-tr-none shadow-md border border-[#c2f0b7] max-w-[190px] flex items-start gap-2.5 animate-slide-whatsapp text-slate-800">
                <div className="w-6 h-6 rounded-full bg-[#25d366] flex items-center justify-center text-white shrink-0 mt-0.5">
                  <MessageCircle size={12} className="text-white fill-white" />
                </div>
                <div>
                  <p className="text-[8px] text-[#128c7e] font-bold">Kulode Notification</p>
                  <p className="text-[9px] text-slate-800 leading-snug mt-0.5">Pay instantly at <span className="text-blue-600 underline">pay.kulode.app/inv-001</span></p>
                </div>
              </div>

              {/* Clicking to pay animation bubble */}
              <div className="absolute -bottom-6 -left-6 bg-white p-3.5 rounded-[24px] shadow-2xl border border-slate-100 max-w-[190px] animate-pay-flow text-slate-800">
                <div className="text-center">
                  <p className="text-[9px] text-slate-400">Amount Due</p>
                  <p className="text-xs font-extrabold text-[#0037b0] mb-1.5 tabular-nums">₦150,000.00</p>
                  <div className="relative inline-block w-full">
                    <div className="w-full text-white text-[9px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 relative animate-btn-pay select-none min-h-[28px]">
                      <span className="pay-text-paynow absolute inset-0 flex items-center justify-center animate-text-paynow">PAY NOW</span>
                      <span className="pay-text-paid absolute inset-0 flex items-center justify-center animate-text-paid opacity-0 text-[#006c49] bg-emerald-50 font-extrabold rounded-lg">PAID ✓</span>
                    </div>
                    {/* Hand clicking cursor */}
                    <div className="absolute right-2 bottom-[-12px] w-5 h-5 text-[#0037b0] animate-cursor-click pointer-events-none">
                      <Pointer size={18} className="rotate-90 fill-[#0037b0]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex justify-between items-center text-xs text-blue-200/50">
          <p>© {new Date().getFullYear()} Kulode. All rights reserved.</p>
          <a href="/privacy" className="hover:text-white transition-colors">Privacy & Terms</a>
        </div>
      </div>

      {/* Right Form Panel (5 cols on large screens) */}
      <div className="flex flex-col items-center justify-center p-6 md:p-12 lg:col-span-5 bg-background">
        {/* Back navigation — lives ABOVE the card, not inside it */}
        <div className="w-full max-w-md mb-4">
          <a
            href={LANDING_URL}
            className="inline-flex items-center gap-2 min-h-[44px] px-1 text-sm font-semibold text-slate-500 hover:text-[#00247d] transition-all duration-200 group cursor-pointer"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white border border-slate-200/80 shadow-sm group-hover:shadow-md group-hover:border-[#0037b0]/20 transition-all duration-200">
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform duration-200" />
            </span>
            <span>Back to website</span>
          </a>
        </div>

        <Card className={`w-full max-w-md border border-slate-200/60 shadow-[0_20px_50px_rgba(0,55,176,0.06)] bg-white rounded-[32px] p-2 transition-transform duration-300 ${overscrollActive ? "animate-rubber-bottom" : ""}`}>
          <CardHeader className="text-center pb-4 pt-6">
            <div className="mb-4 lg:hidden flex justify-center">
              <span className="text-3xl font-extrabold tracking-tighter text-[#00247d]">Kulode</span>
            </div>
            <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">Welcome back</CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1">Sign in to your account to continue</CardDescription>

          </CardHeader>

          <CardContent className="space-y-4">
            <a href={GOOGLE_AUTH_URL} className="w-full block" onClick={() => posthog.capture('google_oauth_initiated', { page: 'login' })}>
              <Button type="button" variant="outline" className="w-full gap-3 py-6 rounded-2xl border-slate-200/80 hover:bg-slate-50 text-slate-700 font-bold active:scale-98 transition-all duration-200">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </Button>
            </a>
            
            <div className="relative w-full py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-slate-400 font-bold tracking-wider">or email login</span>
              </div>
            </div>
          </CardContent>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-500">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="rounded-2xl border-slate-200/80 focus:border-[#0037b0] focus:ring-2 focus:ring-[#0037b0]/10 py-5"
                  {...register("email")}
                  error={errors.email?.message}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-500">Password</Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="rounded-2xl border-slate-200/80 focus:border-[#0037b0] focus:ring-2 focus:ring-[#0037b0]/10 py-5 pr-12"
                    {...register("password")}
                    error={errors.password?.message}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0037b0] transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="text-right mt-1">
                  <Link
                    to="/forgot-password"
                    className="text-xs text-[#0037b0] hover:underline font-extrabold min-h-[44px] inline-flex items-center"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
              
              {showResend && (
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs">
                  <p className="text-slate-600">
                    Your email is not verified yet.{" "}
                    <button
                      type="button"
                      className="text-[#0037b0] hover:underline font-extrabold ml-1"
                      onClick={() => resend.mutate(loginEmail)}
                      disabled={resend.isPending}
                    >
                      {resend.isPending ? "Sending..." : "Resend verification email"}
                    </button>
                  </p>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-5 pb-6">
              <Button
                type="submit"
                className="w-full py-6 rounded-2xl text-sm font-bold shadow-lg shadow-[#0037b0]/20 active:scale-98 transition-all btn-gradient"
                isLoading={login.isPending}
              >
                Sign in
              </Button>
              <p className="text-center text-xs text-slate-500">
                New to Kulode?{" "}
                <Link to="/register" className="text-[#0037b0] hover:underline font-extrabold">
                  Create an account
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
