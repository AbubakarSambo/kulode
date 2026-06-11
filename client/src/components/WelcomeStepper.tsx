import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import { useOnboardingStore } from "@/stores/onboarding";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { organizationsApi } from "@/api/organizations";
import { authApi } from "@/api/auth";
import { clientsApi } from "@/api/clients";
import { invoicesApi } from "@/api/invoices";
import apiClient from "@/api/client";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Store04Icon,
  UserGroupIcon,
  Invoice03Icon,
  CheckmarkCircle02Icon,
  Briefcase02Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Sent02Icon,
} from "@hugeicons/core-free-icons";
import { WowCelebration } from "./WowCelebration";
import { formatCurrency, cn } from "@/lib/utils";

const IS_DEV = import.meta.env.DEV;

// Nigerian DNFBP and standard categories
const BUSINESS_CATEGORIES = [
  { group: "Standard Categories", items: [
    { id: "freelancer", label: "Freelancer / Sole Proprietor" },
    { id: "agency", label: "Creative / Marketing Agency" },
    { id: "consulting", label: "Consulting / Professional Services" },
    { id: "retail", label: "Retail / E-commerce" },
    { id: "tech", label: "Tech / Software" },
  ]},
  { group: "Nigerian DNFBP Compliance Categories", items: [
    { id: "dnfbp_real_estate", label: "DNFBP: Real Estate Agent / Developer" },
    { id: "dnfbp_law_firm", label: "DNFBP: Law Firm / Legal Practitioner" },
    { id: "dnfbp_accounting", label: "DNFBP: Accounting / Tax Consultant" },
    { id: "dnfbp_hospitality", label: "DNFBP: Hotels & Hospitality Services" },
    { id: "dnfbp_car_dealer", label: "DNFBP: Car & Vehicle Dealer" },
    { id: "dnfbp_ngo", label: "DNFBP: Non-Governmental Organization (NGO/NPO)" },
  ]},
  { group: "Other", items: [
    { id: "other", label: "Other / Custom Category..." }
  ]}
];

const ORG_SIZES = [
  { id: "1", label: "Just me (Solo)" },
  { id: "2-10", label: "2 - 10 people" },
  { id: "11-50", label: "11 - 50 people" },
  { id: "51+", label: "51+ people" },
];

const ROLES = [
  { id: "founder", label: "Founder / Owner / CEO" },
  { id: "accountant", label: "Accountant / Finance" },
  { id: "manager", label: "Operations / Product Manager" },
  { id: "other", label: "Employee / Other" },
];

interface Bank {
  name: string;
  code: string;
}

export function WelcomeStepper() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();
  const { isOpen, startAtStep, closeOnboarding } = useOnboardingStore();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Form States - Step 1: Personalization
  const [businessType, setBusinessType] = useState("");
  const [customBusinessType, setCustomBusinessType] = useState("");
  const [orgSize, setOrgSize] = useState("");
  const [role, setRole] = useState("");

  // Form States - Step 2: Bank Payout Setup
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [verifiedAccountName, setVerifiedAccountName] = useState<string | null>(null);
  const [isVerifyingBank, setIsVerifyingBank] = useState(false);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [isBankConnected, setIsBankConnected] = useState(false);

  // Form States - Step 3: Client details (Pre-filled in DEV mode)
  const [clientName, setClientName] = useState(IS_DEV ? "Adebayo Technology Solutions" : "");
  const [clientEmail, setClientEmail] = useState(IS_DEV ? "billing@adebayotech.ng" : "");

  // Form States - Step 4: Billing details (Pre-filled in DEV mode)
  const [itemDesc, setItemDesc] = useState(
    IS_DEV ? "Enterprise Cloud Security Assessment & Compliance Audit" : ""
  );
  const [itemQty, setItemQty] = useState(IS_DEV ? 1 : 0);
  const [itemPrice, setItemPrice] = useState(IS_DEV ? 450000 : 0);

  // Fetch bank list for Step 2
  const { data: banks } = useQuery<Bank[]>({
    queryKey: ["paystack-banks"],
    queryFn: async () => {
      const response = await apiClient.get("/paystack/banks");
      return response.data.data;
    },
    enabled: isOpen || (!user?.organization?.businessType && !isDismissed),
  });

  // Calculations for Step 5 Preview
  const subtotal = itemQty * itemPrice;
  const vatRate = user?.organization?.vatEnabled ? Number(user?.organization?.taxRate || 7.5) : 0;
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  // Track if they have already personalized profile
  const isPersonalized =
    user?.organization?.businessType &&
    user?.organization?.organizationSize &&
    user?.businessRole;

  // Sync step with store start step
  useEffect(() => {
    if (isOpen) {
      setStep(startAtStep);
      setIsDismissed(false);
    }
  }, [isOpen, startAtStep]);

  const handleVerifyBank = async () => {
    if (!bankCode || accountNumber.length !== 10) return;
    setIsVerifyingBank(true);
    setVerifiedAccountName(null);
    try {
      const response = await apiClient.post("/paystack/verify-account", {
        accountNumber,
        bankCode,
      });
      setVerifiedAccountName(response.data.data.account_name);
      toast.success("Account details verified successfully");
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error("Failed to verify bank account", {
        description: error.response?.data?.message || "Invalid account number or bank",
      });
    } finally {
      setIsVerifyingBank(false);
    }
  };

  const handleSaveBank = async () => {
    if (!bankCode || accountNumber.length !== 10 || !verifiedAccountName) return;
    setIsSavingBank(true);
    try {
      await apiClient.post("/organizations/setup-paystack", {
        bankCode,
        accountNumber,
      });
      setIsBankConnected(true);
      toast.success("Payout bank connected successfully");
      
      // Force refresh user & onboarding status query keys
      queryClient.invalidateQueries({ queryKey: ["paystack-status"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      
      setStep(3); // Advance
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error("Failed to connect bank details", {
        description: error.response?.data?.message || "Something went wrong",
      });
    } finally {
      setIsSavingBank(false);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!businessType) {
        toast.error("Please select a business category");
        return;
      }
      if (businessType === "other" && !customBusinessType.trim()) {
        toast.error("Please specify your business category");
        return;
      }
      if (!orgSize) {
        toast.error("Please select your organization size");
        return;
      }
      if (!role) {
        toast.error("Please select your role");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      // Step 2 is optional. If they filled details but didn't save, warn them or let them continue
      setStep(3);
    } else if (step === 3) {
      if (!clientName.trim()) {
        toast.error("Please enter a client name");
        return;
      }
      if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
        toast.error("Please enter a valid email address");
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (!itemDesc.trim()) {
        toast.error("Please enter item description");
        return;
      }
      if (itemQty <= 0) {
        toast.error("Quantity must be greater than 0");
        return;
      }
      if (itemPrice <= 0) {
        toast.error("Unit price must be greater than 0");
        return;
      }
      setStep(5);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Skip / Setup Later handler (Dismisses stepper and saves Step 1 if completed)
  const handleSkipOrDismiss = async () => {
    if (!user) return;
    if (step > 1 && !isPersonalized && businessType && orgSize && role) {
      try {
        const finalBusinessType =
          businessType === "other" ? `Other: ${customBusinessType.trim()}` : businessType;

        await organizationsApi.updateCurrent({
          businessType: finalBusinessType,
          organizationSize: orgSize,
        });

        await authApi.updateProfile(user.id, {
          businessRole: role,
        });

        updateUser({
          businessRole: role,
          organization: {
            id: user.organization?.id || "",
            name: user.organization?.name || "",
            slug: user.organization?.slug || "",
            isPaystackVerified: user.organization?.isPaystackVerified || false,
            businessType: finalBusinessType,
            organizationSize: orgSize,
          },
        });
      } catch {
        // Silently skip if step 1 save fails
      }
    }

    setIsDismissed(true);
    closeOnboarding();
  };

  // Submit complete workflow (creates client + creates invoice + sends + generates payment link)
  const handleFinishSend = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. If Step 1 details are not yet personalized, save them first
      if (!isPersonalized) {
        setLoadingText("Personalizing workspace profile…");
        const finalBusinessType =
          businessType === "other" ? `Other: ${customBusinessType.trim()}` : businessType;

        await organizationsApi.updateCurrent({
          businessType: finalBusinessType,
          organizationSize: orgSize,
        });

        await authApi.updateProfile(user.id, {
          businessRole: role,
        });

        updateUser({
          businessRole: role,
          organization: {
            id: user.organization?.id || "",
            name: user.organization?.name || "",
            slug: user.organization?.slug || "",
            isPaystackVerified: user.organization?.isPaystackVerified || false,
            businessType: finalBusinessType,
            organizationSize: orgSize,
          },
        });
      }

      // 2. Add Client
      setLoadingText("Creating client contact…");
      const client = await clientsApi.create({
        name: clientName,
        email: clientEmail || undefined,
      });

      // 3. Draft Invoice
      setLoadingText("Generating compliance invoice…");
      const today = new Date().toISOString().split("T")[0];
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const dueDate = nextWeek.toISOString().split("T")[0];

      const invoice = await invoicesApi.create({
        clientId: client.id,
        issueDate: today,
        dueDate: dueDate,
        items: [
          {
            description: itemDesc,
            quantity: Number(itemQty),
            unitPrice: Number(itemPrice),
          },
        ],
      });

      // 4. Send Invoice (Updates status to SENT)
      setLoadingText("Publishing invoice ledger…");
      await invoicesApi.send(invoice.id);

      // 5. Generate Payment Link (If bank payouts setup is active)
      const hasPayouts = isBankConnected || user?.organization?.isPaystackVerified;
      if (hasPayouts && clientEmail) {
        setLoadingText("Initializing Paystack transaction link…");
        try {
          await invoicesApi.generatePaymentLink(invoice.id, clientEmail, total);
        } catch (linkErr) {
          // Gracefully continue if link generation fails (e.g. mock connection failure in live mode)
          console.warn("Could not auto-generate payment link:", linkErr);
        }
      }

      // Invalidate React Query caches
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });

      // Trigger celebration
      setShowCelebration(true);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      const msg = error.response?.data?.message || "Failed to complete onboarding setup";
      toast.error("Error setting up workspace", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const shouldShow = isOpen || (!isPersonalized && !isDismissed);

  if (!shouldShow || !user) {
    return null;
  }

  if (showCelebration) {
    return (
      <WowCelebration
        title="Setup Complete! 🚀"
        description={`Success! Your profile is personalized and your first invoice for ${formatCurrency(
          total
        )} has been sent to ${clientName}.`}
        onClose={() => {
          setShowCelebration(false);
          setIsDismissed(true);
          closeOnboarding();
        }}
      />
    );
  }



  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white rounded-[24px] w-full max-w-xl shadow-[0_16px_48px_rgba(0,55,176,0.08)] flex flex-col overflow-hidden max-h-[92vh] font-sans antialiased text-slate-900">
        
        {/* Header bar (no 1px lines, colored tint anchor) */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between bg-[#f8f9ff]/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0037b0]/8 text-[#0037b0] flex items-center justify-center">
              <HugeiconsIcon icon={
                step === 1 ? Store04Icon :
                step === 2 ? Briefcase02Icon :
                step === 3 ? UserGroupIcon :
                Invoice03Icon
              } size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-[#121c28]">
                {step === 1 ? "Welcome to Tari1" : 
                 step === 2 ? "Configure Payout Bank" :
                 step === 3 ? "Register First Client" :
                 step === 4 ? "Add Billing Details" :
                 "Preview & Publish"}
              </h2>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5 uppercase tracking-wider">
                {step === 1 ? "Step 1 of 5: Personalization" : `Step ${step} of 5: Quick Setup`}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSkipOrDismiss}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-[#0037b0] transition-colors cursor-pointer min-h-[44px] flex items-center"
          >
            {step === 1 ? "Skip Setup" : "Setup Later"}
          </button>
        </div>

        {/* Form Body Scroll Area */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          
          {/* Progress Tracker Capsules */}
          {!isLoading && (
            <div className="flex items-center gap-1.5 mb-6 bg-slate-50 p-1.5 rounded-xl">
              {[1, 2, 3, 4, 5].map((s) => (
                <div 
                  key={s}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-all duration-300",
                    step === s ? "bg-gradient-to-r from-[#0037b0] to-[#1d4ed8]" :
                    step > s ? "bg-[#006c49]" :
                    "bg-slate-200"
                  )} 
                />
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="relative w-14 h-14 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-[#0037b0]/10" />
                <div className="absolute inset-0 rounded-full border-4 border-[#0037b0] border-t-transparent animate-spin" />
              </div>
              <h4 className="text-sm font-extrabold text-[#121c28] tracking-tight">{loadingText}</h4>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">Configuring your digital ledger…</p>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-6">
                  {/* Business category */}
                  <div className="space-y-2.5">
                    <label htmlFor="businessSelect" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <HugeiconsIcon icon={Store04Icon} size={15} strokeWidth={1.5} className="text-slate-400" />
                      Business Category
                    </label>
                    <select
                      id="businessSelect"
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      className="w-full h-11 px-4 text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 cursor-pointer shadow-[0_4px_12px_rgba(0,55,176,0.01)]"
                    >
                      <option value="" disabled>-- Select your Business type --</option>
                      {BUSINESS_CATEGORIES.map((group) => (
                        <optgroup key={group.group} label={group.group}>
                          {group.items.map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Progressive Custom Type field */}
                  {businessType === "other" && (
                    <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <label htmlFor="customType" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                        Specify Nature of Business
                      </label>
                      <input
                        id="customType"
                        type="text"
                        placeholder="e.g. Photography, Logistics, Agriculture, Car Rental"
                        value={customBusinessType}
                        onChange={(e) => setCustomBusinessType(e.target.value)}
                        className="w-full h-11 px-4 text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                      />
                    </div>
                  )}

                  {/* Team Size */}
                  <div className="space-y-2.5">
                    <label htmlFor="orgSizeSelect" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <HugeiconsIcon icon={UserGroupIcon} size={15} strokeWidth={1.5} className="text-slate-400" />
                      Team / Organization Size
                    </label>
                    <select
                      id="orgSizeSelect"
                      value={orgSize}
                      onChange={(e) => setOrgSize(e.target.value)}
                      className="w-full h-11 px-4 text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 cursor-pointer shadow-[0_4px_12px_rgba(0,55,176,0.01)]"
                    >
                      <option value="" disabled>-- Select organization size --</option>
                      {ORG_SIZES.map((size) => (
                        <option key={size.id} value={size.id}>{size.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Your Job Role */}
                  <div className="space-y-2.5">
                    <label htmlFor="roleSelect" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} strokeWidth={1.5} className="text-slate-400" />
                      Your Job Role
                    </label>
                    <select
                      id="roleSelect"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full h-11 px-4 text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 cursor-pointer shadow-[0_4px_12px_rgba(0,55,176,0.01)]"
                    >
                      <option value="" disabled>-- Select your role --</option>
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="bg-[#eef4ff]/40 p-4.5 rounded-2xl border border-[#0037b0]/5">
                    <p className="text-xs text-[#434655] font-semibold leading-relaxed">
                      Link your settlement bank details to **automatically enable online invoice payments** (Cards, Bank Transfer, USSD). This step is optional and can be completed later in Settings.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="bankSelect" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Destination Bank
                    </label>
                    <select
                      id="bankSelect"
                      value={bankCode}
                      onChange={(e) => {
                        setBankCode(e.target.value);
                        setVerifiedAccountName(null);
                      }}
                      className="w-full h-11 px-4 text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="">Choose your bank</option>
                      {banks?.map((bank) => (
                        <option key={bank.code} value={bank.code}>{bank.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="payoutAccountNumber" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Account Number
                    </label>
                    <div className="flex gap-3">
                      <input
                        id="payoutAccountNumber"
                        type="text"
                        placeholder="0123456789"
                        maxLength={10}
                        value={accountNumber}
                        onChange={(e) => {
                          setAccountNumber(e.target.value.replace(/\D/g, ""));
                          setVerifiedAccountName(null);
                        }}
                        className="flex-1 h-11 px-4 text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyBank}
                        disabled={!bankCode || accountNumber.length !== 10 || isVerifyingBank}
                        className="h-11 px-5 rounded-xl border border-[#c4c5d7]/40 text-[#0037b0] hover:bg-[#eef4ff] text-xs font-bold disabled:opacity-40 min-h-[44px] cursor-pointer"
                      >
                        {isVerifyingBank ? "Checking…" : "Verify"}
                      </button>
                    </div>
                  </div>

                  {verifiedAccountName && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs">
                      <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} className="text-emerald-600" strokeWidth={2} />
                        Verified: {verifiedAccountName}
                      </p>
                    </div>
                  )}

                  {verifiedAccountName && (
                    <button
                      type="button"
                      onClick={handleSaveBank}
                      disabled={isSavingBank}
                      className="w-full h-11 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-98 min-h-[44px] cursor-pointer"
                    >
                      {isSavingBank ? "Connecting Bank…" : "Confirm & Link Payout Bank"}
                    </button>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="bg-[#eef4ff]/40 p-4.5 rounded-2xl border border-[#0037b0]/5">
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Enter the name and email of your first client. Tari1 will securely store this in your client directory.
                    </p>
                    {IS_DEV && (
                      <span className="inline-block mt-2 text-[9px] font-bold text-[#0037b0] bg-[#0037b0]/5 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ⚡ Local Test: Dummy data pre-filled
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="clientNameInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Client / Company Name
                    </label>
                    <input
                      id="clientNameInput"
                      type="text"
                      placeholder="e.g. Amina Ventures Ltd"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full h-11 px-4 text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="clientEmailInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Client Email Address
                    </label>
                    <input
                      id="clientEmailInput"
                      type="email"
                      placeholder="e.g. billing@amina.ng"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="w-full h-11 px-4 text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div className="bg-[#eef4ff]/40 p-4.5 rounded-2xl border border-[#0037b0]/5">
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Add the details of the service or product you want to bill this client for.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="itemDescInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Billing Item Description
                    </label>
                    <input
                      id="itemDescInput"
                      type="text"
                      placeholder="e.g. Consulting, Design project"
                      value={itemDesc}
                      onChange={(e) => setItemDesc(e.target.value)}
                      className="w-full h-11 px-4 text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1 space-y-2">
                      <label htmlFor="itemQtyInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Qty
                      </label>
                      <input
                        id="itemQtyInput"
                        type="number"
                        min="1"
                        value={itemQty || ""}
                        onChange={(e) => setItemQty(Number(e.target.value))}
                        className="w-full h-11 px-4 text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 text-center"
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <label htmlFor="itemPriceInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Unit Price (₦)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-3 text-xs font-bold text-slate-400 select-none">
                          ₦
                        </span>
                        <input
                          id="itemPriceInput"
                          type="number"
                          placeholder="0.00"
                          value={itemPrice || ""}
                          onChange={(e) => setItemPrice(Number(e.target.value))}
                          className="w-full h-11 pl-8 pr-4 text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Mobile Invoice Preview
                  </span>

                  {/* Glassmorphic Invoice Preview */}
                  <div className="p-5 rounded-[20px] bg-[#f8f9ff] border border-slate-200/40 relative overflow-hidden text-slate-800">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-xs font-black text-[#0037b0] uppercase tracking-tight">
                          {user?.organizationName}
                        </h4>
                        <p className="text-[8px] text-slate-400 font-semibold mt-0.5">Lagos, Nigeria</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-[#006c49] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider">
                          Draft
                        </span>
                        <p className="text-[8px] text-slate-400 font-bold mt-1">INV-001 (Preview)</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-200/30 pt-3 mb-4">
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Billed To</p>
                      <p className="text-[10px] font-extrabold text-slate-800 mt-0.5">{clientName}</p>
                      {clientEmail && <p className="text-[8px] text-slate-400 font-medium">{clientEmail}</p>}
                    </div>

                    <div className="space-y-2 mb-4 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center text-[9px] font-bold border-b border-slate-50 pb-1.5 text-slate-400 uppercase tracking-wider">
                        <span>Description</span>
                        <div className="flex gap-4">
                          <span>Qty</span>
                          <span>Total</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-start text-[9px] font-bold text-slate-700 leading-normal pt-1">
                        <span className="line-clamp-2 max-w-[200px]">{itemDesc}</span>
                        <div className="flex gap-6 shrink-0">
                          <span>{itemQty}</span>
                          <span>{formatCurrency(subtotal)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 border-t border-slate-200/30 pt-3">
                      <div className="flex justify-between w-full max-w-[150px] text-[8px] font-semibold text-slate-400">
                        <span>Subtotal:</span>
                        <span className="tabular-nums font-bold text-slate-700">{formatCurrency(subtotal)}</span>
                      </div>
                      {vatRate > 0 && (
                        <div className="flex justify-between w-full max-w-[150px] text-[8px] font-semibold text-slate-400">
                          <span>VAT ({vatRate}%):</span>
                          <span className="tabular-nums font-bold text-slate-700">{formatCurrency(vatAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between w-full max-w-[150px] text-[10px] font-bold border-t border-slate-200/30 pt-1.5">
                        <span className="text-[#0037b0]">Amount Due:</span>
                        <span className="tabular-nums text-slate-900 font-black">{formatCurrency(total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions (no 1px lines, bg shift) */}
        {!isLoading && (
          <div className="px-8 py-5 bg-slate-50/50 flex items-center justify-between shrink-0">
            <div>
              {step > 1 && (
                <button
                  onClick={handleBack}
                  className="h-11 px-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0037b0] hover:text-[#1d4ed8] transition-colors cursor-pointer min-h-[44px]"
                >
                  <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
                  Back
                </button>
              )}
            </div>

            <div>
              {step < 5 ? (
                <button
                  onClick={handleNext}
                  className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-xs font-bold shadow-[0_4px_12px_rgba(0,55,176,0.15)] flex items-center gap-2 hover:opacity-95 cursor-pointer min-h-[44px] border-0"
                >
                  Continue
                  <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
                </button>
              ) : (
                <button
                  onClick={handleFinishSend}
                  className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#006c49] to-[#059669] text-white text-xs font-bold shadow-[0_4px_12px_rgba(0,108,73,0.15)] flex items-center gap-2 hover:opacity-95 cursor-pointer min-h-[44px] border-0"
                >
                  Send Invoice & Finish
                  <HugeiconsIcon icon={Sent02Icon} size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
