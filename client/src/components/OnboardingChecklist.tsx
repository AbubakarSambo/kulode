import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Building2,
  Package,
  Users,
  FileText,
  CreditCard,
  Check,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { organizationsApi } from "@/api/organizations";
import { cn } from "@/lib/utils";
import { useOnboardingStore } from "@/stores/onboarding";
import { posthog } from "@/lib/posthog";

const steps = [
  {
    key: "businessProfile" as const,
    label: "Business Details",
    description: "Add company name, phone, & address",
    href: "/settings/organization",
    icon: Building2,
    color: "text-amber-600",
    bgColor: "bg-amber-50/70 border-amber-100/50",
    optional: false,
  },
  {
    key: "firstClient" as const,
    label: "Add Your First Client",
    description: "Add client contacts & billing details",
    href: "/clients/new",
    icon: Users,
    color: "text-blue-600",
    bgColor: "bg-blue-50/70 border-blue-100/50",
    optional: false,
  },
  {
    key: "inventoryItems" as const,
    label: "Products & Services",
    description: "Define service rates or item inventories",
    href: "/inventory",
    icon: Package,
    color: "text-teal-600",
    bgColor: "bg-teal-50/70 border-teal-100/50",
    optional: false,
  },
  {
    key: "firstInvoice" as const,
    label: "Create First Invoice",
    description: "Draft & send your first invoice",
    href: "/invoices/new",
    icon: FileText,
    color: "text-violet-600",
    bgColor: "bg-violet-50/70 border-violet-100/50",
    optional: false,
  },
  {
    key: "onlinePayments" as const,
    label: "Enable Online Payments",
    description: "Let clients pay you instantly via card or bank transfer",
    href: "/settings/paystack",
    icon: CreditCard,
    color: "text-[#0037b0]",
    bgColor: "bg-[#0037b0]/5 border-[#0037b0]/10",
    optional: true,
  },
];

export function OnboardingChecklist({ onStartInvoiceWizard }: { onStartInvoiceWizard?: () => void }) {
  const queryClient = useQueryClient();
  const openOnboarding = useOnboardingStore((state) => state.openOnboarding);
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem("tari1-onboarding-checklist-expanded");
    return saved !== null ? saved === "true" : true;
  });

  const toggleExpand = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("tari1-onboarding-checklist-expanded", String(next));
      posthog.capture("onboarding_checklist_toggled", { expanded: next });
      return next;
    });
  };

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
    <div className="mb-8 p-5 md:p-8 bg-gradient-to-br from-[#0037b0]/5 to-[#1d4ed8]/[0.01] border border-[#0037b0]/8 rounded-[24px] shadow-[0_12px_32px_rgba(0,55,176,0.02)] relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-[#0037b0]/5 blur-3xl pointer-events-none" />

      {/* Header (Accordion Toggle Trigger) */}
      <div 
        onClick={toggleExpand}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none group/header"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0037b0]/8 text-[#0037b0] flex items-center justify-center">
            <Sparkles className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="text-left">
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <span>Set Up Your Business</span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100/80 group-hover/header:bg-[#0037b0]/10 text-slate-500 group-hover/header:text-[#0037b0] transition-all duration-200">
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </h2>
            <p className="text-xs font-medium text-slate-450 mt-0.5">
              A few quick steps to get invoicing and tracking payments.
            </p>
          </div>
        </div>

        {/* Buttons & Indicators (Stop propagation to prevent accordion click interference) */}
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="flex items-center gap-2.5 sm:gap-3 shrink-0 ml-auto sm:ml-0"
        >
          <button
            onClick={() => {
              const savedStep = parseInt(localStorage.getItem('tari1-onboarding-step') || '0', 10);
              let targetStep = 1;
              if (savedStep >= 1 && savedStep <= 4) {
                targetStep = savedStep;
              } else {
                if (!status.steps.businessProfile) {
                  targetStep = 1;
                } else if (!status.steps.firstClient) {
                  targetStep = 2;
                } else if (!status.steps.inventoryItems) {
                  targetStep = 3;
                } else {
                  targetStep = 4;
                }
              }
              openOnboarding(targetStep);
            }}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] hover:from-[#002f9c] hover:to-[#173fa3] rounded-full transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer flex items-center gap-1.5 select-none"
          >
            Resume Setup
          </button>
          <span className="text-[11px] font-bold text-[#0037b0] bg-[#0037b0]/8 px-2.5 py-1 rounded-full whitespace-nowrap">
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

      {/* Collapsible Content Area */}
      <div className={cn(
        "transition-all duration-300 ease-in-out origin-top",
        isExpanded ? "max-h-[1000px] opacity-100 mt-6" : "max-h-0 opacity-0 overflow-hidden mt-0"
      )}>
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
            const isWizardStep = step.key === "firstInvoice" && onStartInvoiceWizard && !completed;

            const content = (
              <>
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
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={cn(
                      "text-xs font-bold text-slate-800 tracking-tight",
                      completed && "text-slate-500"
                    )}>
                      {step.label}
                    </p>
                    {step.optional && !completed && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                        Recommended
                      </span>
                    )}
                    {isWizardStep && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/10 shrink-0 animate-pulse">
                        60s Setup
                      </span>
                    )}
                  </div>
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
              </>
            );

            if (isWizardStep) {
              return (
                <button
                  key={step.key}
                  onClick={() => {
                    let target = 2;
                    if (status.steps.firstClient) {
                      target = status.steps.inventoryItems ? 4 : 3;
                    }
                    openOnboarding(target);
                  }}
                  type="button"
                  className={cn(
                    "group flex items-start gap-3.5 p-4 rounded-[20px] bg-white border border-slate-200/50 shadow-[0_4px_12px_rgba(0,55,176,0.01)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,55,176,0.04)] hover:border-[#0037b0]/15 hover:bg-white transition-all duration-300 relative w-full cursor-pointer",
                    completed && "opacity-60 hover:opacity-80"
                  )}
                >
                  {content}
                </button>
              );
            }

            return (
              <Link
                key={step.key}
                to={step.href}
                className={cn(
                  "group flex items-start gap-3.5 p-4 rounded-[20px] bg-white border border-slate-200/50 shadow-[0_4px_12px_rgba(0,55,176,0.01)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,55,176,0.04)] hover:border-[#0037b0]/15 hover:bg-white transition-all duration-300 relative",
                  completed && "opacity-60 hover:opacity-80"
                )}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
