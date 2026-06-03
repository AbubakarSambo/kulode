import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Building2,
  Package,
  Users,
  FileText,
  CreditCard,
  Tags,
  Check,
  Sparkles,
} from "lucide-react";
import { organizationsApi } from "@/api/organizations";
import { cn } from "@/lib/utils";

const steps = [
  {
    key: "businessProfile" as const,
    label: "Business Details",
    description: "Add company name, phone, & address",
    href: "/settings/organization",
    icon: Building2,
    color: "text-amber-600",
    bgColor: "bg-amber-50/70 border-amber-100/50",
  },
  {
    key: "onlinePayments" as const,
    label: "Link Paystack Account",
    description: "Crucial step to receive payments online",
    href: "/settings/paystack",
    icon: CreditCard,
    color: "text-[#0037b0]",
    bgColor: "bg-[#0037b0]/5 border-[#0037b0]/10",
  },
  {
    key: "firstClient" as const,
    label: "Add Your First Client",
    description: "Add client contacts & billing details",
    href: "/clients/new",
    icon: Users,
    color: "text-blue-600",
    bgColor: "bg-blue-50/70 border-blue-100/50",
  },
  {
    key: "inventoryItems" as const,
    label: "Products & Services",
    description: "Define service rates or item inventories",
    href: "/inventory",
    icon: Package,
    color: "text-teal-600",
    bgColor: "bg-teal-50/70 border-teal-100/50",
  },
  {
    key: "firstInvoice" as const,
    label: "Create First Invoice",
    description: "Draft & send your first payment link",
    href: "/invoices/new",
    icon: FileText,
    color: "text-violet-600",
    bgColor: "bg-violet-50/70 border-violet-100/50",
  },
  {
    key: "expenseCategories" as const,
    label: "Expense Ledger",
    description: "Tailor tax-deductible categories",
    href: "/settings/categories",
    icon: Tags,
    color: "text-slate-600",
    bgColor: "bg-slate-50 border-slate-100/55",
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
    <div className="mb-8 p-6 md:p-8 bg-gradient-to-br from-[#0037b0]/5 to-[#1d4ed8]/[0.01] border border-[#0037b0]/8 rounded-[24px] shadow-[0_12px_32px_rgba(0,55,176,0.02)] relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-[#0037b0]/5 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0037b0]/8 text-[#0037b0] flex items-center justify-center">
            <Sparkles className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              Get Paid Automatically
            </h2>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              Complete these steps to send your first invoice and start accepting Paystack settlements.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
          <span className="text-xs font-bold text-[#0037b0] bg-[#0037b0]/8 px-3 py-1 rounded-full">
            {status.completedCount} / {status.totalSteps} Completed
          </span>
          <button
            onClick={() => dismissMutation.mutate()}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            aria-label="Dismiss checklist"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Progress Track */}
      <div className="relative mb-6">
        <div className="h-2 w-full rounded-full bg-slate-100/80 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 3-Column Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((step) => {
          const completed = status.steps[step.key];
          const Icon = step.icon;

          return (
            <Link
              key={step.key}
              to={step.href}
              className={cn(
                "group flex items-start gap-3.5 p-4 rounded-[20px] bg-white border border-slate-200/50 shadow-[0_4px_12px_rgba(0,55,176,0.01)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,55,176,0.04)] hover:border-[#0037b0]/15 hover:bg-white transition-all duration-300",
                completed && "opacity-60 hover:opacity-80"
              )}
            >
              {/* Left Circle Checklist Indicator */}
              <div className="shrink-0 mt-0.5 relative">
                {completed ? (
                  <div className="w-5.5 h-5.5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </div>
                ) : (
                  <div className="w-5.5 h-5.5 rounded-full border-2 border-slate-200 group-hover:border-[#0037b0]/40 transition-colors" />
                )}
              </div>

              {/* Middle Description */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-xs font-bold text-slate-800 tracking-tight",
                  completed && "line-through text-slate-400"
                )}>
                  {step.label}
                </p>
                <p className="text-[10px] font-semibold text-slate-400 mt-1 leading-normal group-hover:text-slate-500 transition-colors">
                  {step.description}
                </p>
              </div>

              {/* Right Custom Icon Badge */}
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 transition-colors duration-300",
                step.bgColor
              )}>
                <Icon className={cn("w-4.5 h-4.5", step.color)} strokeWidth={1.5} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
