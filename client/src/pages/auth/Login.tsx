import { useState } from "react";
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
import { Receipt } from "lucide-react";

const GOOGLE_AUTH_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1/auth/google`
  : "/api/v1/auth/google";

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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4">
            <span className="text-3xl font-bold text-primary">Kulode</span>
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
          <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-primary-50 px-3 py-2">
            <Receipt size={14} className="text-primary shrink-0" />
            <p className="text-xs text-primary font-medium">
              <span className="font-bold">New:</span> Export your FIRS-ready tax
              pack in one click
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <a href={GOOGLE_AUTH_URL} className="w-full block" onClick={() => posthog.capture('google_oauth_initiated', { page: 'login' })}>
            <Button type="button" variant="outline" className="w-full gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
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
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
        </CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
                error={errors.email?.message}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
                error={errors.password?.message}
              />
            </div>
            {showResend && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="text-muted-foreground">
                  Your email is not verified yet.{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => resend.mutate(loginEmail)}
                    disabled={resend.isPending}
                  >
                    {resend.isPending
                      ? "Sending..."
                      : "Resend verification email"}
                  </button>
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              isLoading={login.isPending}
            >
              Sign in
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/register" className="text-primary hover:underline">
                Register
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
