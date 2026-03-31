import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  X,
  Building2,
  Package,
  Users,
  FileText,
  CreditCard,
  Tags,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { organizationsApi } from "@/api/organizations";

const steps = [
  {
    key: "businessProfile" as const,
    label: "Complete your business profile",
    description: "Add your email and address",
    href: "/settings/organization",
    icon: Building2,
  },
  {
    key: "inventoryItems" as const,
    label: "Add a product or service",
    description: "Set up inventory items or services you sell",
    href: "/inventory",
    icon: Package,
  },
  {
    key: "firstClient" as const,
    label: "Add your first client",
    description: "Start building your client list",
    href: "/clients/new",
    icon: Users,
  },
  {
    key: "firstInvoice" as const,
    label: "Create your first invoice",
    description: "Send a professional invoice",
    href: "/invoices/new",
    icon: FileText,
  },
  {
    key: "onlinePayments" as const,
    label: "Set up online payments",
    description: "Accept payments via Paystack",
    href: "/settings/paystack",
    icon: CreditCard,
  },
  {
    key: "expenseCategories" as const,
    label: "Customize expense categories",
    description: "Organize your spending",
    href: "/settings/categories",
    icon: Tags,
  },
];

export function OnboardingChecklist() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: organizationsApi.getOnboardingStatus,
    staleTime: 30_000,
  });

  const dismissMutation = useMutation({
    mutationFn: organizationsApi.dismissOnboarding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
    },
  });

  if (isLoading || !status || status.dismissed || status.allComplete) {
    return null;
  }

  const progressPercent = (status.completedCount / status.totalSteps) * 100;

  return (
    <Card className="mb-6">
      <CardHeader className="relative pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Getting Started</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {status.completedCount} of {status.totalSteps} completed
            </span>
            <button
              onClick={() => dismissMutation.mutate()}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss checklist"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1">
          {steps.map((step) => {
            const completed = status.steps[step.key];
            const Icon = step.icon;

            return (
              <li key={step.key}>
                <Link
                  to={step.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted ${
                    completed ? "opacity-60" : ""
                  }`}
                >
                  {completed ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        completed ? "line-through" : ""
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  {!completed && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
