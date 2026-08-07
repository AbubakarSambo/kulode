import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Store04Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { organizationsApi } from "@/api/organizations";
import { authApi } from "@/api/auth";
import { cn } from "@/lib/utils";
import {
  useOnboarding,
  BUSINESS_CATEGORIES,
  ORG_SIZES,
  ROLES,
  ORG_MODULES,
} from "./OnboardingContext";

export function PersonalizationSurvey() {
  const {
    user,
    businessType,
    setBusinessType,
    customBusinessType,
    setCustomBusinessType,
    orgSize,
    setOrgSize,
    role,
    setRole,
    enabledModules,
    setEnabledModules,
    isSavingStep,
    setIsSavingStep,
    orgName,
    updateUser,
    openOnboarding,
    setStep,
  } = useOnboarding();

  const [errors, setErrors] = useState<{
    businessType?: string;
    orgSize?: string;
    role?: string;
    enabledModules?: string;
  }>({});

  const queryClient = useQueryClient();

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-[9990] bg-[#f8f9ff] flex flex-col items-center overflow-y-auto overflow-x-hidden font-sans antialiased text-slate-900 animate-in fade-in duration-300">
      <div className="w-full max-w-2xl min-h-full bg-white border-x border-slate-200/40 relative pt-10 px-6 pb-24 lg:pt-12 lg:px-12 flex flex-col items-stretch text-left animate-in zoom-in-95 duration-200 shadow-sm">
        
        <div className="mb-8 mt-2 lg:mt-0 flex gap-3.5 items-start text-left">
          <div className="w-12 h-12 rounded-2xl bg-[#0037b0]/8 text-[#0037b0] flex items-center justify-center shrink-0 mt-1">
            <HugeiconsIcon icon={Store04Icon} size={24} strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-[#0037b0] uppercase tracking-widest block">
              Welcome to Tari1
            </span>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 font-inter">
              Let's set up {orgName}
            </h2>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
              A few quick answers so Tari1 tailors your invoices and tax compliance.
            </p>
          </div>
        </div>

        <form onSubmit={async (e) => {
          e.preventDefault();
          const newErrors: typeof errors = {};
          if (!businessType) {
            newErrors.businessType = "Please select a business category";
          }
          if (businessType === "other" && !customBusinessType.trim()) {
            newErrors.businessType = "Please specify your business category";
          }
          if (!orgSize) {
            newErrors.orgSize = "Please select your organization size";
          }
          if (!role) {
            newErrors.role = "Please select your role";
          }
          if (!enabledModules) {
            newErrors.enabledModules = "Please tell us what you need Tari1 for";
          }

          if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            const firstErrorMsg = newErrors.businessType || newErrors.orgSize || newErrors.role || newErrors.enabledModules;
            toast.error(firstErrorMsg);
            return;
          }

          setIsSavingStep(true);
          try {
            const finalBusinessType = businessType === "other" ? `Other: ${customBusinessType.trim()}` : businessType;
            await organizationsApi.updateCurrent({
              businessType: finalBusinessType,
              organizationSize: orgSize,
              enabledModules: enabledModules as "POS" | "INVOICING" | "BOTH",
            });
            if (role) {
              await authApi.updateProfile(user.id, { businessRole: role });
            }
            
            const latestOrg = await organizationsApi.getCurrent();
            updateUser({
              businessRole: role,
              organization: latestOrg,
            });

            queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
            
            const savedStep = parseInt(localStorage.getItem("tari1-onboarding-step") || "1", 10);
            const resumeStep = (savedStep >= 1 && savedStep <= 4) ? savedStep : 1;
            openOnboarding(resumeStep);
            setStep(resumeStep);
            toast.dismiss();
            toast.success("Profile personalized successfully!", { duration: 2000 });
          } catch {
            toast.error("Failed to save profile personalization");
          } finally {
            setIsSavingStep(false);
          }
        }} className="w-full flex-1 flex flex-col gap-6 text-left">
          
          {/* What do you need Tari1 for */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              What do you need Tari1 for?
            </label>
            <div className={cn(
              "flex flex-wrap gap-2 p-1.5 rounded-2xl transition-all duration-200",
              errors.enabledModules && "ring-1 ring-rose-500 bg-rose-50/20"
            )}>
              {ORG_MODULES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setEnabledModules(item.id);
                    setErrors((prev) => ({ ...prev, enabledModules: undefined }));
                  }}
                  title={item.description}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer select-none active:scale-95 duration-100",
                    enabledModules === item.id
                      ? "bg-[#0037b0]/5 border-[#0037b0] text-[#0037b0] ring-1 ring-[#0037b0]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {errors.enabledModules && (
              <p className="text-xs text-rose-600 font-semibold mt-1">{errors.enabledModules}</p>
            )}
          </div>

          {/* Business Category */}
          <div className="space-y-2">
            <label htmlFor="surveyBusiness" className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Business Category
            </label>
            <SearchableSelect
              id="surveyBusiness"
              options={BUSINESS_CATEGORIES}
              value={businessType}
              onChange={(val) => {
                setBusinessType(val);
                setErrors((prev) => ({ ...prev, businessType: undefined }));
                if (val !== "other") {
                  setCustomBusinessType("");
                }
              }}
              error={errors.businessType}
              placeholder="Select your business category"
            />
          </div>

          {/* Custom Business Type input */}
          {businessType === "other" && (
            <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200">
              <label htmlFor="surveyCustomBusiness" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Specify Nature of Business
              </label>
              <input
                id="surveyCustomBusiness"
                type="text"
                placeholder="e.g. Photography, Logistics, Agriculture"
                value={customBusinessType}
                onChange={(e) => {
                  setCustomBusinessType(e.target.value);
                  setErrors((prev) => ({ ...prev, businessType: undefined }));
                }}
                className={cn(
                  "w-full h-11 px-4 text-[16px] sm:text-xs bg-white rounded-xl border outline-none font-semibold text-slate-700 transition-all",
                  errors.businessType
                    ? "border-rose-500 focus:ring-1 focus:ring-rose-500/10 focus:border-rose-500"
                    : "border-[#c4c5d7]/40 focus:border-[#0037b0] focus:ring-1 focus:ring-[#0037b0]"
                )}
              />
            </div>
          )}

          {/* Team Size */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Team Size
            </label>
            <div className={cn(
              "flex flex-wrap gap-2 p-1.5 rounded-2xl transition-all duration-200",
              errors.orgSize && "ring-1 ring-rose-500 bg-rose-50/20"
            )}>
              {ORG_SIZES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOrgSize(item.id);
                    setErrors((prev) => ({ ...prev, orgSize: undefined }));
                  }}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer select-none active:scale-95 duration-100",
                    orgSize === item.id
                      ? "bg-[#0037b0]/5 border-[#0037b0] text-[#0037b0] ring-1 ring-[#0037b0]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  {item.label === "Just me (Solo)" ? "Just me" : item.label}
                </button>
              ))}
            </div>
            {errors.orgSize && (
              <p className="text-xs text-rose-600 font-semibold mt-1">{errors.orgSize}</p>
            )}
          </div>

          {/* Your Job Role */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Your Role
            </label>
            <div className={cn(
              "flex flex-wrap gap-2 p-1.5 rounded-2xl transition-all duration-200",
              errors.role && "ring-1 ring-rose-500 bg-rose-50/20"
            )}>
              {ROLES.map((item) => {
                let displayLabel = item.label;
                if (item.id === "founder") displayLabel = "Founder / Owner";
                if (item.id === "accountant") displayLabel = "Finance";
                if (item.id === "manager") displayLabel = "Operations";
                if (item.id === "other") displayLabel = "Employee / Other";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setRole(item.id);
                      setErrors((prev) => ({ ...prev, role: undefined }));
                    }}
                    className={cn(
                      "px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer select-none active:scale-95 duration-100",
                      role === item.id
                        ? "bg-[#0037b0]/5 border-[#0037b0] text-[#0037b0] ring-1 ring-[#0037b0]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {displayLabel}
                  </button>
                );
              })}
            </div>
            {errors.role && (
              <p className="text-xs text-rose-600 font-semibold mt-1">{errors.role}</p>
            )}
          </div>

          {/* Submit CTA */}
          <div className="pt-4 lg:pt-0 mt-auto flex items-end">
            <button
              type="submit"
              disabled={isSavingStep}
              className="inline-flex h-12 px-6 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white rounded-xl font-bold text-sm shadow-[0_4px_12px_rgba(0,55,176,0.15)] flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all duration-150 border-0 disabled:opacity-50 disabled:cursor-not-allowed select-none min-h-[44px] cursor-pointer"
            >
              {isSavingStep ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Saving Profile...
                </>
              ) : (
                <>
                  Continue
                  <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
