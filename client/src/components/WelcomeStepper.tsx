import { useEffect, useRef } from "react";
import { WowCelebration } from "./WowCelebration";
import { formatCurrency, cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import {
  Briefcase02Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Sent02Icon,
} from "@hugeicons/core-free-icons";
import { OnboardingProvider, useOnboarding } from "./onboarding/OnboardingContext";
import { Step1BusinessProfile } from "./onboarding/Step1BusinessProfile";
import { Step2ClientDetails } from "./onboarding/Step2ClientDetails";
import { PersonalizationSurvey } from "./onboarding/PersonalizationSurvey";
import { Step3BillingItems } from "./onboarding/Step3BillingItems";
import { Step4PayoutPreview } from "./onboarding/Step4PayoutPreview";



export function WelcomeStepper() {
  return (
    <OnboardingProvider>
      <WelcomeStepperContent />
    </OnboardingProvider>
  );
}

function WelcomeStepperContent() {
  const {
    user,
    step,
    isLoading,
    isSavingStep,
    loadingText,
    showCelebration,
    setShowCelebration,
    setIsDismissed,
    showConfirmOffline,
    setShowConfirmOffline,
    createdInvoiceId,
    createdInvoiceNumber,
    createdPaymentUrl,
    createdInvoiceTotal,
    createdShareToken,
    createdDueDate,
    businessName,
    clientName,
    clientPhone,
    isWhatsapp,
    total,
    showSurvey,
    shouldShow,
    handleNext,
    handleBack,
    handleFinishSend,
    closeOnboarding,
    handleSkipOrDismiss,
    completedSteps,
    setStep,
    logoPreviewUrl,
    clientEmail,
    clientAddress,
    paymentTerms,
    invoiceNotes,
    isBankConnected,
  } = useOnboarding();

  // Helper to determine if a completed step is missing recommended details
  const getStepStatus = (s: number): "pending" | "warning" | "complete" => {
    const isDone = completedSteps.has(s);
    if (!isDone) return "pending";

    if (s === 1) {
      const hasLogo = logoPreviewUrl || user?.organization?.logo;
      if (!hasLogo) return "warning";
    }
    if (s === 2) {
      if (!clientEmail?.trim() || !clientAddress?.trim()) {
        return "warning";
      }
    }
    if (s === 3) {
      if (!paymentTerms?.trim() || !invoiceNotes?.trim()) {
        return "warning";
      }
    }
    if (s === 4) {
      if (!isBankConnected) {
        return "warning";
      }
    }

    return "complete";
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to top of the content container whenever step changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [step]);

  if (!shouldShow || !user) {
    return null;
  }

  if (showCelebration) {
    return (
      <WowCelebration
        title="You're all set!"
        description={`Your profile is ready and your first invoice for ${formatCurrency(createdInvoiceTotal || total)} is created.`}
        invoiceId={createdInvoiceId}
        invoiceNumber={createdInvoiceNumber}
        paymentUrl={createdPaymentUrl}
        total={createdInvoiceTotal}
        clientName={clientName}
        shareToken={createdShareToken}
        clientPhone={isWhatsapp ? clientPhone : undefined}
        dueDate={createdDueDate}
        orgName={businessName || undefined}
        onClose={() => {
          setShowCelebration(false);
          setIsDismissed(true);
          localStorage.removeItem("tari1-onboarding-step");
          closeOnboarding();
        }}
      />
    );
  }

  if (showSurvey) {
    return <PersonalizationSurvey />;
  }

  return (
    <div className="fixed inset-0 z-[9990] bg-[#f8f9ff] flex flex-col items-center overflow-y-auto overflow-x-hidden font-sans antialiased text-slate-900 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl min-h-full flex flex-col border-x border-slate-200/40 relative animate-in zoom-in-95 duration-200 shadow-sm">
        
        {/* Header bar with Skip/Later action */}
        <div className="flex px-4 sm:px-8 pt-4 lg:pt-6 pb-2 items-center justify-end bg-transparent shrink-0">
          <button
            onClick={handleSkipOrDismiss}
            disabled={isLoading}
            className="ml-auto px-3 py-2 text-xs font-semibold text-slate-400 hover:text-[#0037b0] transition-colors cursor-pointer min-h-[44px] flex items-center bg-transparent border-0"
          >
            Setup Later
          </button>
        </div>

        {/* Form Body Scroll Area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3.5 sm:px-8 py-5">
          
          {/* Segmented progress tracker & editorial title headers */}
          {!isLoading && (
            <div className="mb-8">
              
               {/* Segmented Progress Stepper (Pill Bar) */}
              <div className="flex gap-2 w-full mt-1 mb-6">
                {[1, 2, 3, 4].map((s) => {
                  const status = getStepStatus(s);
                  const isActive = s === step;
                  const isInteractive = status === "complete" || status === "warning" || s < step;
                  return (
                    <div
                      key={s}
                      onClick={() => {
                        if (isInteractive) {
                          setStep(s);
                        } else {
                          toast.info(`Please complete the current step first.`);
                        }
                      }}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-all duration-300 relative",
                        isInteractive ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed",
                        isActive
                          ? "bg-[#0037b0]"
                          : status === "complete"
                          ? "bg-[#006c49]"
                          : status === "warning"
                          ? "bg-[#ffddb8]"
                          : "bg-slate-100"
                      )}
                    >
                      {status === "warning" && (
                        <span className="absolute -top-1 -right-0.5 flex h-3.5 w-3.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 items-center justify-center text-[9px] font-bold text-white leading-none">!</span>
                        </span>
                      )}
                      {status === "complete" && (
                        <span className="absolute -top-1 -right-0.5 flex h-3.5 w-3.5 bg-[#006c49] rounded-full items-center justify-center text-[9px] font-bold text-white leading-none">✓</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step Active Titles (Unified for Desktop and Mobile) */}
              <div className="text-left mb-6 animate-in fade-in duration-200">
                <span className="text-[11px] font-semibold text-slate-400 tracking-[0.15em] uppercase block">
                  {step === 1 ? `Step 1 of 4 · Business Profile` :
                   step === 2 ? `Step 2 of 4 · Client Details` :
                   step === 3 ? `Step 3 of 4 · Invoice Items` :
                   `Step 4 of 4 · Review & Payout`}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-2.5">
                  {step === 1 ? "Your business profile" :
                   step === 2 ? "Who are you billing?" :
                   step === 3 ? "What are you charging for?" :
                   "Review & send"}
                </h3>
                <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                  {step === 1 ? "This appears at the top of every invoice you send." :
                   step === 2 ? "We'll save this client and send them the invoice." :
                   step === 3 ? "Add the details of the services or products you want to bill this client for." :
                   "Link a payout bank so clients can pay online."}
                </p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="relative w-14 h-14 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-[#0037b0]/10" />
                <div className="absolute inset-0 rounded-full border-4 border-[#0037b0] border-t-transparent animate-spin" />
              </div>
              <h4 className="text-sm font-semibold text-[#121c28] tracking-tight">{loadingText}</h4>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">Configuring your digital ledger…</p>
            </div>
          ) : (
            <>
              {step === 1 && <Step1BusinessProfile />}

              {step === 2 && <Step2ClientDetails />}

              {step === 3 && <Step3BillingItems />}

              {step === 4 && <Step4PayoutPreview />}
            </>
          )}
        </div>

        {/* Footer Actions (no 1px lines, bg shift) */}
        {!isLoading && (
          <div className="px-5 sm:px-8 pt-5 pb-7 sm:py-5 bg-slate-50/50 flex items-center justify-between shrink-0">
            <div>
              {step > 1 && (
                <button
                  onClick={handleBack}
                  className="h-12 sm:h-11 px-4 inline-flex items-center gap-1.5 text-sm sm:text-xs font-bold text-[#0037b0] hover:text-[#1d4ed8] transition-colors cursor-pointer bg-transparent border-0"
                >
                  <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
                  Back
                </button>
              )}
            </div>

            <div>
              {step < 4 ? (
                <button
                  onClick={handleNext}
                  disabled={isSavingStep}
                  className="h-12 sm:h-11 px-6 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-sm sm:text-xs font-bold shadow-[0_4px_12px_rgba(0,55,176,0.15)] flex items-center gap-2 hover:opacity-95 cursor-pointer border-0 disabled:opacity-50"
                >
                  {isSavingStep ? "Saving..." : "Continue"}
                  {!isSavingStep && <HugeiconsIcon icon={ArrowRight02Icon} size={16} />}
                </button>
              ) : (
                <button
                  onClick={() => handleFinishSend()}
                  className="h-12 sm:h-11 px-6 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-sm sm:text-xs font-bold shadow-[0_4px_12px_rgba(0,55,176,0.15)] flex items-center gap-2 hover:opacity-95 cursor-pointer border-0"
                >
                  Publish Invoice
                  <HugeiconsIcon icon={Sent02Icon} size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Soft Confirmation Intercept Dialog */}
      {showConfirmOffline && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in text-slate-800">
          <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_16px_48px_rgba(0,55,176,0.12)] border border-slate-200/20 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={Briefcase02Icon} size={22} strokeWidth={1.5} className="text-amber-600" />
            </div>
            <div className="space-y-1.5 text-center">
              <h4 className="text-sm font-bold text-slate-900 leading-snug">How would you like to send this invoice?</h4>
              <p className="text-[11px] text-[#434655] font-semibold leading-relaxed">
                Without a linked payout bank, your customer receives a static invoice and pays you directly.
                You can connect a bank now, or anytime later from your dashboard.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleFinishSend(true)}
                className="w-full h-11 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-98 cursor-pointer border-0"
              >
                Publish Invoice
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmOffline(false);
                  setStep(4);
                }}
                className="w-full h-11 bg-white text-[#0037b0] rounded-xl font-bold text-xs border border-[#0037b0]/30 hover:bg-[#eef4ff]/60 transition-all active:scale-98 cursor-pointer"
              >
                Connect Payout Bank First
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
