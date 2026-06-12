import { useState, useEffect, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useOnboardingStore } from "@/stores/onboarding";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { organizationsApi, UpdateOrganizationData } from "@/api/organizations";
import { authApi } from "@/api/auth";
import { clientsApi } from "@/api/clients";
import { invoicesApi } from "@/api/invoices";
import { inventoryApi } from "@/api/inventory";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  PlusSignIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { WowCelebration } from "./WowCelebration";
import { formatCurrency, cn, formatAmountInput, parseAmountInput } from "@/lib/utils";

const IS_DEV = import.meta.env.DEV;

// Nigerian DNFBP and standard categories
const BUSINESS_CATEGORIES = [
  {
    group: "Standard Categories",
    items: [
      { id: "freelancer", label: "Freelancer / Sole Proprietor" },
      { id: "agency", label: "Creative / Marketing Agency" },
      { id: "consulting", label: "Consulting / Professional Services" },
      { id: "retail", label: "Retail / E-commerce" },
      { id: "tech", label: "Tech / Software" },
    ],
  },
  {
    group: "Nigerian DNFBP Compliance Categories",
    items: [
      { id: "dnfbp_real_estate", label: "DNFBP: Real Estate Agent / Developer" },
      { id: "dnfbp_law_firm", label: "DNFBP: Law Firm / Legal Practitioner" },
      { id: "dnfbp_accounting", label: "DNFBP: Accounting / Tax Consultant" },
      { id: "dnfbp_hospitality", label: "DNFBP: Hotels & Hospitality Services" },
      { id: "dnfbp_car_dealer", label: "DNFBP: Car & Vehicle Dealer" },
      { id: "dnfbp_ngo", label: "DNFBP: Non-Governmental Organization (NGO/NPO)" },
    ],
  },
  {
    group: "Other",
    items: [{ id: "other", label: "Other / Custom Category..." }],
  },
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

interface BillingItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  type: "service" | "product";
}

export function WelcomeStepper() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();
  const { isOpen, startAtStep, closeOnboarding } = useOnboardingStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File is too large", { description: "Maximum file size is 2MB" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file type", { description: "Only image files are allowed" });
      return;
    }
    setLogoFile(file);
    const url = URL.createObjectURL(file);
    setLogoPreviewUrl(url);
  };

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showConfirmOffline, setShowConfirmOffline] = useState(false);

  // Completed Invoice State for Celebration
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | undefined>(undefined);
  const [createdInvoiceNumber, setCreatedInvoiceNumber] = useState<string | undefined>(undefined);
  const [createdPaymentUrl, setCreatedPaymentUrl] = useState<string | null | undefined>(undefined);
  const [createdInvoiceTotal, setCreatedInvoiceTotal] = useState<number | undefined>(undefined);
  const [createdShareToken, setCreatedShareToken] = useState<string | null | undefined>(undefined);

  // Form States - Step 1: Personalization
  const [businessType, setBusinessType] = useState("");
  const [customBusinessType, setCustomBusinessType] = useState("");
  const [orgSize, setOrgSize] = useState("");
  const [role, setRole] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  // Form States - Step 2: Bank Payout Setup
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [verifiedAccountName, setVerifiedAccountName] = useState<string | null>(null);
  const [isVerifyingBank, setIsVerifyingBank] = useState(false);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [isBankConnected, setIsBankConnected] = useState(false);

  // Form States - Step 3: Client details
  const [clientType, setClientType] = useState<"individual" | "business">("business");
  const [clientName, setClientName] = useState(IS_DEV ? "Adebayo Technology Solutions" : "");
  const [clientEmail, setClientEmail] = useState(IS_DEV ? "billing@adebayotech.ng" : "");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [isWhatsapp, setIsWhatsapp] = useState(true);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(7.5);
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [enableInstallments, setEnableInstallments] = useState<boolean>(false);
  const [installments, setInstallments] = useState<Array<{ label: string; percentage: number }>>([
    { label: "First Payment", percentage: 75 },
    { label: "Final Payment", percentage: 25 },
  ]);

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  // Form States - Step 4: Billing details (Multi-item support)
  const [sendEmail, setSendEmail] = useState(true);
  const [billingItems, setBillingItems] = useState<BillingItem[]>([
    {
      id: "1",
      description: IS_DEV ? "Enterprise Cloud Security Assessment & Compliance Audit" : "",
      quantity: IS_DEV ? 1 : 1,
      unitPrice: IS_DEV ? 450000 : 0,
      type: "service",
    },
  ]);

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
  const subtotal = billingItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount = discountType === "FIXED"
    ? Math.min(Number(discountPercent) || 0, subtotal)
    : subtotal * ((Number(discountPercent) || 0) / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatRate = vatEnabled ? Number(taxRate || 7.5) : 0;
  const vatAmount = (afterDiscount * vatRate) / 100;
  const total = afterDiscount + vatAmount;
  const installmentsTotal = installments.reduce((sum, inst) => sum + (inst.percentage || 0), 0);

  // Track if they have already personalized profile
  const isPersonalized =
    !!(user?.organization?.businessType &&
    user?.organization?.organizationSize &&
    user?.businessRole);

  // Fetch onboarding status to check for pre-existing usage
  const { data: onboardingStatus } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: organizationsApi.getOnboardingStatus,
    staleTime: 30_000,
  });

  const hasActiveUsage =
    !!(onboardingStatus?.steps?.firstClient ||
       onboardingStatus?.steps?.firstInvoice);

  // Sync step with store start step
  useEffect(() => {
    if (isOpen) {
      setStep(startAtStep);
      setIsDismissed(false);
    }
  }, [isOpen, startAtStep]);

  // Sync bank connected state & VAT settings from database
  useEffect(() => {
    if (user?.organization) {
      setVatEnabled(!!user.organization.vatEnabled);
      setTaxRate(Number(user.organization.taxRate || 7.5));
      if (user.organization.isPaystackVerified) {
        setIsBankConnected(true);
        setVerifiedAccountName(user.organization.name || "Settlement Account Linked");
      }
    }
  }, [user]);

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

      queryClient.invalidateQueries({ queryKey: ["paystack-status"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });

      // Let the user see the linked bank card and manually click Continue
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error("Failed to connect bank details", {
        description: error.response?.data?.message || "Something went wrong",
      });
    } finally {
      setIsSavingBank(false);
    }
  };

  const handleAddItem = () => {
    setBillingItems([
      ...billingItems,
      {
        id: Date.now().toString(),
        description: "",
        quantity: 1,
        unitPrice: 0,
        type: "service",
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (billingItems.length > 1) {
      const updated = [...billingItems];
      updated.splice(index, 1);
      setBillingItems(updated);
    }
  };

  const handleUpdateItem = <K extends keyof BillingItem>(
    index: number,
    key: K,
    val: BillingItem[K]
  ) => {
    const updated = [...billingItems];
    updated[index] = { ...updated[index], [key]: val };
    setBillingItems(updated);
  };

  const handleNext = async () => {
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
      
      setIsSavingStep(true);
      try {
        const finalBusinessType = businessType === "other" ? `Other: ${customBusinessType.trim()}` : businessType;
        await organizationsApi.updateCurrent({
          businessType: finalBusinessType,
          organizationSize: orgSize,
        });
        if (user && role) {
          await authApi.updateProfile(user.id, { businessRole: role });
        }
        queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
        setStep(2);
        localStorage.setItem('tari1-onboarding-step', '2');
      } catch (err) {
        toast.error("Failed to save profile");
      } finally {
        setIsSavingStep(false);
      }
    } else if (step === 2) {
      setIsSavingStep(true);
      try {
        if (companyAddress.trim()) {
          await organizationsApi.updateCurrent({ address: companyAddress.trim() });
        }
        if (logoFile) {
          await organizationsApi.uploadLogo(logoFile);
        }
        setStep(3);
        localStorage.setItem('tari1-onboarding-step', '3');
      } catch (err) {
        toast.error("Failed to save branding details");
      } finally {
        setIsSavingStep(false);
      }
    } else if (step === 3) {
      setStep(4);
      localStorage.setItem('tari1-onboarding-step', '4');
    } else if (step === 4) {
      if (!clientName.trim()) {
        toast.error("Please enter a client name");
        return;
      }
      if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
        toast.error("Please enter a valid email address");
        return;
      }
      setStep(5);
      localStorage.setItem('tari1-onboarding-step', '5');
    } else if (step === 5) {
      // Validate all billing items
      for (let i = 0; i < billingItems.length; i++) {
        const item = billingItems[i];
        if (!item.description.trim()) {
          toast.error(`Please enter a description for item #${i + 1}`);
          return;
        }
        if (item.quantity <= 0) {
          toast.error(`Quantity for item #${i + 1} must be greater than 0`);
          return;
        }
        if (item.unitPrice <= 0) {
          toast.error(`Price for item #${i + 1} must be greater than 0`);
          return;
        }
      }
      if (enableInstallments) {
        if (installments.length === 0) {
          toast.error("Please add at least one installment or disable split payments");
          return;
        }
        if (installmentsTotal !== 100) {
          toast.error(`Installment percentages must add up to exactly 100% (currently ${installmentsTotal}%)`);
          return;
        }
        for (let i = 0; i < installments.length; i++) {
          if (!installments[i].label.trim()) {
            toast.error(`Please enter a label for installment #${i + 1}`);
            return;
          }
          if (installments[i].percentage <= 0) {
            toast.error(`Installment #${i + 1} percentage must be greater than 0%`);
            return;
          }
        }
      }
      setStep(6);
      localStorage.setItem('tari1-onboarding-step', '6');
    }
  };

  const handleBack = () => {
    if (step > 1) {
      const newStep = step - 1;
      setStep(newStep);
      localStorage.setItem('tari1-onboarding-step', newStep.toString());
    }
  };

  const handleSkipOrDismiss = async () => {
    if (!user) return;
    if (step > 1 && !isPersonalized && businessType && orgSize && role) {
      try {
        const finalBusinessType =
          businessType === "other" ? `Other: ${customBusinessType.trim()}` : businessType;

        const orgUpdateData: UpdateOrganizationData = {
          businessType: finalBusinessType,
          organizationSize: orgSize,
        };
        if (companyAddress.trim()) {
          orgUpdateData.address = companyAddress.trim();
        }

        await organizationsApi.updateCurrent(orgUpdateData);

        if (logoFile) {
          await organizationsApi.uploadLogo(logoFile);
        }

        await authApi.updateProfile(user.id, {
          businessRole: role,
        });

        const latestOrg = await organizationsApi.getCurrent();
        updateUser({
          businessRole: role,
          organization: latestOrg,
        });
      } catch {
        // Silently skip
      }
    }

    setIsDismissed(true);
    closeOnboarding();
  };

  const handleFinishSend = async (bypassConfirm = false) => {
    if (!user) return;

    // Check if bank details are missing and intercept
    const hasPayouts = isBankConnected || user?.organization?.isPaystackVerified;
    const isBypassed = bypassConfirm === true;
    if (!hasPayouts && !isBypassed) {
      setShowConfirmOffline(true);
      return;
    }

    setShowConfirmOffline(false);
    setIsLoading(true);
    try {
      // 1. Personalize & Update Organization Profile
      setLoadingText("Configuring company profile…");
      const finalBusinessType =
        businessType === "other" ? `Other: ${customBusinessType.trim()}` : businessType;

      const orgUpdateData: UpdateOrganizationData = {
        vatEnabled: vatEnabled,
        taxRate: Number(taxRate),
      };
      if (!isPersonalized) {
        orgUpdateData.businessType = finalBusinessType;
        orgUpdateData.organizationSize = orgSize;
      }
      if (companyAddress.trim()) {
        orgUpdateData.address = companyAddress.trim();
      }

      // If we have fields to update, update them
      if (Object.keys(orgUpdateData).length > 0) {
        await organizationsApi.updateCurrent(orgUpdateData);
      }

      // If we have a logo file, upload it
      if (logoFile) {
        setLoadingText("Uploading company logo…");
        await organizationsApi.uploadLogo(logoFile);
      }

      // Update user businessRole if not personalized
      if (!isPersonalized && role) {
        await authApi.updateProfile(user.id, {
          businessRole: role,
        });
      }

      // Fetch the latest updated organization to keep store fully in sync
      const latestOrg = await organizationsApi.getCurrent();
      updateUser({
        businessRole: role || user.businessRole,
        organization: latestOrg,
      });

      // 2. Add Client
      setLoadingText("Creating client contact…");
      const client = await clientsApi.create({
        name: clientName,
        email: clientEmail || undefined,
        phone: clientPhone || undefined,
        address: clientAddress.trim() || undefined,
        notes: `Type: ${clientType === "business" ? "Business" : "Individual"}`,
      });

      // 3. Register Items in Catalog & Build Invoice Payload
      setLoadingText("Registering catalog and generating invoice…");
      const today = new Date().toISOString().split("T")[0];
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const dueDate = nextWeek.toISOString().split("T")[0];

      const invoiceItems = [];
      for (const item of billingItems) {
        if (item.type === "service") {
          try {
            const service = await invoicesApi.createServiceItem({
              name: item.description,
              description: "Created during onboarding",
              unitPrice: item.unitPrice,
            });
            invoiceItems.push({
              serviceItemId: service.id,
              description: item.description,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
            });
          } catch {
            invoiceItems.push({
              description: item.description,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
            });
          }
        } else {
          try {
            const product = await inventoryApi.create({
              name: item.description,
              description: "Created during onboarding",
              unitPrice: item.unitPrice,
              initialStock: 10,
            });
            invoiceItems.push({
              inventoryItemId: product.id,
              description: item.description,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
            });
          } catch {
            invoiceItems.push({
              description: item.description,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
            });
          }
        }
      }

      const invoice = await invoicesApi.create({
        clientId: client.id,
        issueDate: today,
        dueDate: dueDate,
        items: invoiceItems,
        discountType,
        discountPercent: Number(discountPercent) || 0,
        installments: enableInstallments ? installments.map((inst) => ({
          label: inst.label,
          percentage: inst.percentage,
        })) : undefined,
      });

      // 4. Send Invoice
      const shouldSend = sendEmail && !!clientEmail;
      if (shouldSend) {
        setLoadingText("Publishing invoice ledger & sending email…");
        await invoicesApi.send(invoice.id);
      }

      // 5. Generate Payment Link
      let paymentUrl: string | null = null;
      const hasPayouts = isBankConnected || user?.organization?.isPaystackVerified;
      if (hasPayouts && clientEmail) {
        setLoadingText("Initializing Paystack transaction link…");
        try {
          const linkData = await invoicesApi.generatePaymentLink(invoice.id, clientEmail, total);
          paymentUrl = linkData.paymentUrl;
        } catch (linkErr) {
          console.warn("Could not auto-generate payment link:", linkErr);
        }
      }

      setCreatedInvoiceId(invoice.id);
      setCreatedInvoiceNumber(invoice.invoiceNumber);
      setCreatedPaymentUrl(paymentUrl || invoice.paymentUrl);
      setCreatedInvoiceTotal(total);
      setCreatedShareToken(invoice.shareToken);

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });

      setShowCelebration(true);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      const msg = error.response?.data?.message || "Failed to complete onboarding setup";
      toast.error("Error setting up workspace", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const shouldShow = isOpen || (!isPersonalized && !isDismissed && !hasActiveUsage) || showCelebration;

  if (!shouldShow || !user) {
    return null;
  }

  if (showCelebration) {
    return (
      <WowCelebration
        title="Setup Complete! 🚀"
        description={
          sendEmail && clientEmail
            ? `Success! Your profile is personalized and your first invoice for ${formatCurrency(
                total
              )} has been sent to ${clientName}.`
            : `Success! Your profile is personalized and your first invoice for ${formatCurrency(
                total
              )} is created and ready.`
        }
        invoiceId={createdInvoiceId}
        invoiceNumber={createdInvoiceNumber}
        paymentUrl={createdPaymentUrl}
        total={createdInvoiceTotal}
        clientName={clientName}
        shareToken={createdShareToken}
        clientPhone={isWhatsapp ? clientPhone : undefined}
        onClose={() => {
          setShowCelebration(false);
          setIsDismissed(true);
          localStorage.removeItem('tari1-onboarding-step');
          closeOnboarding();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto overflow-x-hidden">
      <div className="bg-white rounded-[24px] w-full max-w-xl shadow-[0_16px_48px_rgba(0,55,176,0.08)] flex flex-col overflow-hidden max-h-[92vh] font-sans antialiased text-slate-900">
        
        {/* Header bar (no 1px lines, bg shift) */}
        <div className="px-4 sm:px-8 pt-8 pb-4 flex items-center justify-between bg-[#f8f9ff]/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0037b0]/8 text-[#0037b0] flex items-center justify-center">
              <HugeiconsIcon icon={
                step === 1 ? Store04Icon :
                step === 2 ? Store04Icon :
                step === 3 ? Briefcase02Icon :
                step === 4 ? UserGroupIcon :
                Invoice03Icon
              } size={20} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[#121c28] flex items-center gap-1.5 flex-wrap">
                {step === 1 ? (
                  <>
                    Welcome, <span className="text-primary">{user?.firstName || "there"}</span> to <img src="/logo.svg" alt="Tari1" className="h-5 w-auto inline-block" />
                  </>
                ) : 
                 step === 2 ? "Company Branding" :
                 step === 3 ? "Configure Payout Bank" :
                 step === 4 ? "Register First Client" :
                 step === 5 ? "Add Billing Details" :
                 "Preview & Publish"}
              </h2>
              <p className="text-[10px] font-semibold text-slate-450 mt-0.5 uppercase tracking-wider">
                {step === 1 ? "Step 1 of 6: Personalization" : `Step ${step} of 6: Quick Setup`}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSkipOrDismiss}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-[#0037b0] transition-colors cursor-pointer min-h-[44px] flex items-center bg-transparent border-0"
          >
            {step === 1 ? "Skip Setup" : "Setup Later"}
          </button>
        </div>

        {/* Form Body Scroll Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          
          {/* Progress Tracker Capsules */}
          {!isLoading && (
            <div className="flex items-center gap-1.5 mb-6 bg-slate-50 p-1.5 rounded-xl">
              {[1, 2, 3, 4, 5, 6].map((s) => {
                let color = "bg-slate-200";
                if (step === s) {
                  color = "bg-gradient-to-r from-[#0037b0] to-[#1d4ed8]";
                } else if (step > s) {
                  const isSkippedBranding = s === 2 && !logoFile && !companyAddress.trim();
                  const isSkippedBank = s === 3 && !isBankConnected;
                  if (isSkippedBranding || isSkippedBank) {
                    color = "bg-[#ffb04f]"; // warm amber for skipped optional steps
                  } else {
                    color = "bg-[#006c49]"; // green for completed
                  }
                }
                return (
                  <div 
                    key={s}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-all duration-300",
                      color
                    )} 
                  />
                );
              })}
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
              {step === 1 && (
                <div className="space-y-6 min-h-[350px] pb-12">
                  {/* Business category */}
                  <div className="space-y-2.5">
                    <label htmlFor="businessSelect" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <HugeiconsIcon icon={Store04Icon} size={15} strokeWidth={1.5} className="text-slate-400" />
                      Business Category
                    </label>
                    <SearchableSelect
                      id="businessSelect"
                      options={BUSINESS_CATEGORIES}
                      value={businessType}
                      onChange={(val) => {
                        setBusinessType(val);
                        if (val !== "other") {
                          setCustomBusinessType("");
                        }
                      }}
                      placeholder="Select your Business category"
                    />
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
                        className="w-full h-11 px-4 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                      />
                    </div>
                  )}

                  {/* Team Size */}
                  <div className="space-y-2.5">
                    <label htmlFor="orgSizeSelect" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <HugeiconsIcon icon={UserGroupIcon} size={15} strokeWidth={1.5} className="text-slate-400" />
                      Team / Organization Size
                    </label>
                    <SearchableSelect
                      id="orgSizeSelect"
                      options={ORG_SIZES}
                      value={orgSize}
                      onChange={setOrgSize}
                      placeholder="Select organization size"
                    />
                  </div>

                  {/* Your Job Role */}
                  <div className="space-y-2.5">
                    <label htmlFor="roleSelect" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} strokeWidth={1.5} className="text-slate-400" />
                      Your Job Role
                    </label>
                    <SearchableSelect
                      id="roleSelect"
                      options={ROLES}
                      value={role}
                      onChange={setRole}
                      placeholder="Select your role"
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Company Invoice Customization Section */}
                  <div className="space-y-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                      Invoice Customization (Optional)
                    </span>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                      Add your company address and logo now to automatically display them on your professional invoices.
                    </p>

                    {/* Logo upload block */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                        Company Logo
                      </label>
                      
                      {logoPreviewUrl ? (
                        <div className="flex items-center gap-4 p-3 bg-slate-50/60 rounded-xl border border-slate-150 animate-in fade-in duration-200">
                          <img
                            src={logoPreviewUrl}
                            alt="Logo preview"
                            className="h-14 max-w-[140px] rounded-lg object-contain bg-white border border-slate-200 p-1 shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setLogoFile(null);
                              setLogoPreviewUrl(null);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px] bg-white active:scale-98"
                          >
                            <X size={14} />
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (file) handleLogoFile(file);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          className="flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-[#0037b0] bg-[#f8f9ff]/30 hover:bg-[#f8f9ff]/80 text-slate-450 hover:text-[#0037b0] transition-all cursor-pointer select-none group text-center"
                        >
                          <ImagePlus className="h-6 w-6 text-slate-400 group-hover:scale-110 group-hover:text-[#0037b0] transition-all duration-205" />
                          <div className="text-xs font-bold text-slate-650 group-hover:text-slate-800">Drag logo here or click to browse</div>
                          <div className="text-[9px] font-semibold text-slate-400">PNG, JPG, or SVG · Max 2MB</div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleLogoFile(file);
                              e.target.value = "";
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Company Address block */}
                    <div className="space-y-2">
                      <label htmlFor="companyAddressInput" className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                        Company Address
                      </label>
                      <textarea
                        id="companyAddressInput"
                        placeholder="e.g. Suite 12, CleanTex Plaza, Ikeja, Lagos"
                        rows={2}
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        className="w-full px-4 py-3 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] focus:ring-1 focus:ring-[#0037b0] outline-none font-semibold text-slate-700 resize-none leading-relaxed transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5 animate-in fade-in duration-200 min-h-[350px] pb-16">
                  <div className="bg-[#eef4ff]/40 p-4.5 rounded-2xl border border-[#0037b0]/5">
                    <p className="text-xs text-[#434655] font-semibold leading-relaxed">
                      Link your settlement bank details to **automatically enable online invoice payments** (Cards, Bank Transfer, USSD). This step is optional and can be completed later in Settings.
                    </p>
                  </div>

                  {isBankConnected ? (
                    <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-center justify-between animate-in fade-in duration-200 shadow-[0px_8px_24px_rgba(0,108,73,0.02)]">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">
                          Settlement Bank Linked
                        </p>
                        <h4 className="text-sm font-bold text-slate-800 mt-1.5">
                          {verifiedAccountName || "Verified Account"}
                        </h4>
                        {accountNumber && accountNumber !== "••••••••••" && (
                          <p className="text-xs text-slate-500 mt-0.5 font-medium">
                            Account: {accountNumber} {bankCode ? `· Bank: ${banks?.find(b => b.code === bankCode)?.name || bankCode}` : ""}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsBankConnected(false);
                          setVerifiedAccountName(null);
                          setAccountNumber("");
                          setBankCode("");
                          toast.info("Payout bank details cleared. You can now configure a new account.");
                        }}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-650 hover:text-slate-800 text-xs font-bold transition-all cursor-pointer min-h-[40px] bg-white active:scale-98"
                      >
                        Clear & Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label htmlFor="bankSelect" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Destination Bank
                        </label>
                        <SearchableSelect
                          id="bankSelect"
                          options={banks ? banks.map((b) => ({ id: b.code, label: b.name })) : []}
                          value={bankCode}
                          onChange={(val) => {
                            setBankCode(val);
                            setVerifiedAccountName(null);
                          }}
                          placeholder="Choose your bank"
                        />
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
                            className="flex-1 h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyBank}
                            disabled={!bankCode || accountNumber.length !== 10 || isVerifyingBank}
                            className="h-11 px-5 rounded-xl border border-[#c4c5d7]/40 text-[#0037b0] hover:bg-[#eef4ff] text-xs font-bold disabled:opacity-40 min-h-[44px] cursor-pointer bg-white"
                          >
                            {isVerifyingBank ? "Checking…" : "Verify"}
                          </button>
                        </div>
                      </div>

                      {verifiedAccountName && (
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs animate-in fade-in duration-200">
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
                          className="w-full h-11 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-98 min-h-[44px] cursor-pointer border-0"
                        >
                          {isSavingBank ? "Connecting Bank…" : "Confirm & Link Payout Bank"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div className="bg-[#eef4ff]/40 p-4.5 rounded-2xl border border-[#0037b0]/5">
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Enter the name, phone number, and email of your first client.
                    </p>
                    {IS_DEV && (
                      <span className="inline-block mt-2 text-[9px] font-bold text-[#0037b0] bg-[#0037b0]/5 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ⚡ Local Test: Dummy data pre-filled
                      </span>
                    )}
                  </div>

                  {/* Client Type Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Client Type
                    </label>
                    <div className="flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/40 h-11 items-center w-full">
                      <button
                        type="button"
                        onClick={() => setClientType("business")}
                        className={cn(
                          "flex-1 h-9 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer",
                          clientType === "business"
                            ? "bg-white text-[#0037b0] shadow-sm"
                            : "text-slate-400 hover:text-slate-600 bg-transparent"
                        )}
                      >
                        Business / Organization
                      </button>
                      <button
                        type="button"
                        onClick={() => setClientType("individual")}
                        className={cn(
                          "flex-1 h-9 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer",
                          clientType === "individual"
                            ? "bg-white text-[#0037b0] shadow-sm"
                            : "text-slate-400 hover:text-slate-600 bg-transparent"
                        )}
                      >
                        Individual Client
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="clientNameInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Client / Company Name
                    </label>
                    <input
                      id="clientNameInput"
                      type="text"
                      placeholder={clientType === "business" ? "e.g. Amina Ventures Ltd" : "e.g. Samir Abubakar"}
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        className="w-full h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="clientPhoneInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Client Phone Number (Optional)
                      </label>
                      <input
                        id="clientPhoneInput"
                        type="text"
                        placeholder="e.g. +234 80 123 4567"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        className="w-full h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                      />
                      {clientPhone && (
                        <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isWhatsapp}
                            onChange={(e) => setIsWhatsapp(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-[#0037b0] border-[#c4c5d7]/60 focus:ring-[#0037b0]"
                          />
                          <span className="text-[10px] text-slate-450 font-semibold">
                            This is a WhatsApp number (enables direct sharing)
                          </span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Client Billing Address (Optional) */}
                  <div className="space-y-2">
                    <label htmlFor="clientAddressInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Client Billing Address (Optional)
                    </label>
                    <textarea
                      id="clientAddressInput"
                      placeholder="e.g. 45 Commercial Avenue, Sabo, Yaba, Lagos"
                      rows={2}
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      className="w-full px-4 py-3 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 resize-none leading-relaxed transition-colors"
                    />
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <div className="bg-[#f8f9ff] p-3 rounded-2xl border border-[#0037b0]/5">
                    <p className="text-xs text-[#434655] font-semibold leading-relaxed">
                      Add the details of the services or products you want to bill this client for.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 group/tooltip relative">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Billing Items
                        </label>
                        <div className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-450 hover:text-slate-600 flex items-center justify-center text-[10px] font-bold cursor-help transition-all">
                          ?
                        </div>
                        {/* Tooltip Popup */}
                        <div className="pointer-events-none opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 absolute bottom-[calc(100%+8px)] left-0 w-72 p-3 bg-slate-900 text-white rounded-xl shadow-lg text-[10px] leading-relaxed z-50">
                          <div className="space-y-2 font-medium">
                            <div>
                              <span className="font-bold text-[#6ffbbe]">• Services:</span> Time-based/hourly work or consulting. No stock tracking.
                            </div>
                            <div>
                              <span className="font-bold text-[#ffddb8">• Products:</span> Physical items or tangible goods. Tari1 automatically tracks stock levels in Inventory.
                            </div>
                          </div>
                          <div className="absolute top-full left-4 -mt-1 w-2.5 h-2.5 bg-slate-900 rotate-45" />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="text-xs font-bold text-[#0037b0] hover:text-[#1d4ed8] flex items-center gap-1 cursor-pointer bg-transparent border-0"
                      >
                        <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.5} />
                        Add Line Item
                      </button>
                    </div>

                    <div className="hidden sm:grid grid-cols-12 gap-3 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <div className="col-span-6">Item Description</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-3">Unit Price</div>
                      <div className="col-span-1"></div>
                    </div>

                    <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
                      {billingItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="p-3 bg-slate-50/40 border border-slate-200/40 rounded-xl grid grid-cols-12 gap-3 items-end relative animate-in fade-in duration-200"
                        >
                          {/* Toggle & Details */}
                          <div className="col-span-12 sm:col-span-6 flex flex-col gap-2">
                            <div className="flex justify-between items-center sm:justify-start gap-2">
                              {/* Mobile label */}
                              <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-400">Type</span>
                              {/* Service/Product Toggle */}
                              <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-slate-200/50">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(index, "type", "service")}
                                  className={cn(
                                    "px-2 py-0.5 text-[9px] font-bold rounded-md transition-all border-0 cursor-pointer",
                                    item.type === "service"
                                      ? "bg-[#0037b0] text-white shadow-sm"
                                      : "text-slate-400 hover:text-slate-650 bg-transparent"
                                  )}
                                >
                                  Service
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(index, "type", "product")}
                                  className={cn(
                                    "px-2 py-0.5 text-[9px] font-bold rounded-md transition-all border-0 cursor-pointer",
                                    item.type === "product"
                                      ? "bg-[#0037b0] text-white shadow-sm"
                                      : "text-slate-400 hover:text-slate-650 bg-transparent"
                                  )}
                                >
                                  Product
                                </button>
                              </div>
                            </div>
                            
                            <input
                              type="text"
                              placeholder={item.type === "service" ? "Service Description (e.g. Web Design)" : "Product Description (e.g. Office Chair)"}
                              value={item.description}
                              onChange={(e) => handleUpdateItem(index, "description", e.target.value)}
                              className="w-full h-9 px-3 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                            />
                          </div>

                          {/* Quantity */}
                          <div className="col-span-5 sm:col-span-2 flex flex-col sm:block gap-1.5">
                            <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">Qty</span>
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={item.quantity || ""}
                              onChange={(e) => handleUpdateItem(index, "quantity", Number(e.target.value))}
                              className="w-full h-9 px-3 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 text-center"
                            />
                          </div>

                          {/* Unit Price */}
                          <div className="col-span-7 sm:col-span-3 flex flex-col sm:block gap-1.5">
                            <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-400">Unit Price</span>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 select-none">
                                ₦
                              </span>
                              <input
                                type="text"
                                placeholder="0.00"
                                value={item.unitPrice === 0 ? "" : formatAmountInput(item.unitPrice)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const numericValue = parseAmountInput(val);
                                  handleUpdateItem(index, "unitPrice", numericValue);
                                }}
                                className="w-full h-9 pl-7 pr-3 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700"
                              />
                            </div>
                          </div>

                          {/* Action - Delete */}
                          <div className="absolute top-2 right-2 sm:static sm:col-span-1 flex justify-end">
                            {billingItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="w-7 h-7 rounded-full flex items-center justify-center bg-white text-rose-500 hover:bg-rose-50 border border-slate-200 cursor-pointer"
                              >
                                <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.5} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* VAT Configuration Toggle */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200/40 rounded-xl flex items-center justify-between mt-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="vatEnabledCheckbox"
                          checked={vatEnabled}
                          onChange={(e) => setVatEnabled(e.target.checked)}
                          className="w-4 h-4 rounded text-[#0037b0] border-[#c4c5d7]/60 focus:ring-[#0037b0] cursor-pointer"
                        />
                        <label htmlFor="vatEnabledCheckbox" className="text-xs font-bold text-slate-800 cursor-pointer select-none">
                          Apply VAT (7.5%) to this invoice & save as default
                        </label>
                      </div>
                      {vatEnabled && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold animate-in fade-in duration-200">
                          <span>Rate:</span>
                          <input
                            type="number"
                            value={taxRate}
                            onChange={(e) => setTaxRate(Number(e.target.value))}
                            className="w-12 h-7 px-1.5 text-center bg-white border border-[#c4c5d7]/40 rounded-md font-bold text-[#0037b0]"
                          />
                          <span>%</span>
                        </div>
                      )}
                    </div>

                    {/* Discount Configuration */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200/40 rounded-xl mt-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Add Discount</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={discountPercent || ""}
                          onChange={(e) => setDiscountPercent(Number(e.target.value))}
                          className="w-20 h-8 px-2 text-center bg-white border border-[#c4c5d7]/40 rounded-lg font-bold text-[#0037b0] text-[16px] sm:text-xs outline-none focus:border-[#0037b0]"
                        />
                        <div className="flex rounded-lg border border-[#c4c5d7]/40 overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => setDiscountType("PERCENTAGE")}
                            className={`px-2.5 py-1 text-xs font-bold cursor-pointer border-0 ${
                              discountType === "PERCENTAGE"
                                ? "bg-[#0037b0] text-white"
                                : "text-slate-500 hover:bg-slate-50 bg-transparent"
                            }`}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountType("FIXED")}
                            className={`px-2.5 py-1 text-xs font-bold cursor-pointer border-0 ${
                              discountType === "FIXED"
                                ? "bg-[#0037b0] text-white"
                                : "text-slate-500 hover:bg-slate-50 bg-transparent"
                            }`}
                          >
                            ₦
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Split Payments Card */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200/40 rounded-xl mt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="splitPaymentsCheckbox"
                            checked={enableInstallments}
                            onChange={(e) => setEnableInstallments(e.target.checked)}
                            className="w-4 h-4 rounded text-[#0037b0] border-[#c4c5d7]/60 focus:ring-[#0037b0] cursor-pointer"
                          />
                          <label htmlFor="splitPaymentsCheckbox" className="text-xs font-bold text-slate-800 cursor-pointer select-none">
                            Enable Split Payments / Installments
                          </label>
                        </div>
                        {enableInstallments && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            installmentsTotal === 100 
                              ? "bg-emerald-50 text-[#006c49] border border-emerald-100" 
                              : "bg-rose-50 text-rose-600 border border-rose-100"
                          }`}>
                            {installmentsTotal}%
                          </span>
                        )}
                      </div>

                      {enableInstallments && (
                        <div className="space-y-2 pt-3 border-t border-slate-200/30 animate-in fade-in duration-200">
                          {installments.map((inst, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Payment Label (e.g. Deposit)"
                                value={inst.label}
                                onChange={(e) => {
                                  const newInst = [...installments];
                                  newInst[index].label = e.target.value;
                                  setInstallments(newInst);
                                }}
                                className="flex-1 h-8 px-2.5 text-xs bg-white rounded-lg border border-[#c4c5d7]/40 outline-none font-semibold text-slate-700 focus:border-[#0037b0]"
                              />
                              <div className="flex items-center gap-1.5 bg-white border border-[#c4c5d7]/40 rounded-lg px-2 h-8">
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={inst.percentage || ""}
                                  onChange={(e) => {
                                    const newInst = [...installments];
                                    newInst[index].percentage = Number(e.target.value);
                                    setInstallments(newInst);
                                  }}
                                  className="w-10 text-xs font-bold text-[#0037b0] text-center outline-none border-0 p-0 bg-transparent"
                                />
                                <span className="text-[10px] font-bold text-slate-400 select-none">%</span>
                              </div>
                              <span className="text-[10px] font-bold text-slate-650 w-20 text-right shrink-0">
                                {formatCurrency(total * ((inst.percentage || 0) / 100))}
                              </span>
                              {installments.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newInst = [...installments];
                                    newInst.splice(index, 1);
                                    setInstallments(newInst);
                                  }}
                                  className="w-6 h-6 rounded-full flex items-center justify-center bg-white text-rose-500 border border-slate-200 cursor-pointer text-xs font-bold flex items-center justify-center"
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          ))}
                          
                          <div className="flex gap-2 justify-end pt-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setInstallments([...installments, { label: `Payment ${installments.length + 1}`, percentage: 0 }]);
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-md cursor-pointer"
                            >
                              + Add Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const count = installments.length;
                                const basePercent = Math.floor(100 / count);
                                const remainder = 100 % count;
                                const updated = installments.map((inst, i) => ({
                                  ...inst,
                                  percentage: basePercent + (i < remainder ? 1 : 0),
                                }));
                                setInstallments(updated);
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-md cursor-pointer"
                            >
                              Split Equally
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}                {step === 6 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Warning Banner if Settlement Bank is not connected */}
                  {(!isBankConnected && !user?.organization?.isPaystackVerified) && (
                    <div className="p-4.5 rounded-[20px] bg-amber-50/70 border border-amber-100/40 text-amber-800 flex flex-col gap-1.5 shadow-[0_8px_24px_rgba(255,221,184,0.06)]">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        No Payout Bank Connected
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                        Clients will not be able to pay this invoice online (Card, Bank Transfer, USSD).{" "}
                        <button
                          type="button"
                          onClick={() => setStep(3)}
                          className="text-[#0037b0] hover:text-[#1d4ed8] underline font-bold cursor-pointer inline bg-transparent p-0 border-0"
                        >
                          Link your bank details now (Step 3) →
                        </button>
                      </p>
                    </div>
                  )}

                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Mobile Invoice Preview
                  </span>

                  {/* Glassmorphic Invoice Preview */}
                  <div className="p-5 rounded-[20px] bg-[#f8f9ff] border border-slate-200/40 relative overflow-hidden text-slate-800">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        {logoPreviewUrl || user?.organization?.logo ? (
                          <img
                            src={logoPreviewUrl || user?.organization?.logo}
                            alt="Logo"
                            className="h-8 max-w-[120px] object-contain rounded-md mb-2 bg-white"
                          />
                        ) : (
                          <h4 className="text-xs font-bold text-[#0037b0] uppercase tracking-tight">
                            {user?.organizationName}
                          </h4>
                        )}
                        <p className="text-[8px] text-slate-450 font-semibold mt-0.5 whitespace-pre-wrap max-w-[180px]">
                          {companyAddress.trim() || user?.organization?.address || "Lagos, Nigeria"}
                        </p>
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
                      <p className="text-[10px] font-bold text-slate-800 mt-0.5">{clientName}</p>
                      {clientEmail && <p className="text-[8px] text-slate-400 font-medium">{clientEmail}</p>}
                      {clientAddress.trim() && (
                        <p className="text-[8px] text-slate-450 font-medium mt-0.5 whitespace-pre-wrap max-w-[200px]">
                          {clientAddress.trim()}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 mb-4 bg-white p-3 rounded-xl border border-slate-200/30 max-h-40 overflow-y-auto">
                      <div className="grid grid-cols-12 gap-2 text-[9px] font-bold border-b border-slate-50 pb-1.5 text-slate-400 uppercase tracking-wider">
                        <span className="col-span-8">Description</span>
                        <span className="col-span-1 text-center">Qty</span>
                        <span className="col-span-3 text-right">Total</span>
                      </div>
                      {billingItems.map((item) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 items-start text-[9px] font-bold text-slate-700 leading-normal pt-1.5 border-b border-slate-50/50 pb-1.5 last:border-b-0 last:pb-0">
                          <span className="col-span-8 line-clamp-2 flex items-center gap-1.5">
                            <span className="text-[7px] px-1 py-0.2 bg-slate-100 rounded text-slate-500 uppercase tracking-wider scale-90 origin-left select-none shrink-0">
                              {item.type === "service" ? "SRV" : "PRD"}
                            </span>
                            <span className="truncate">{item.description}</span>
                          </span>
                          <span className="col-span-1 text-center tabular-nums">{item.quantity}</span>
                          <span className="col-span-3 text-right tabular-nums">{formatCurrency(item.quantity * item.unitPrice)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col items-end gap-1.5 border-t border-slate-200/30 pt-3">
                      <div className="flex justify-between w-full max-w-[150px] text-[8px] font-semibold text-slate-400">
                        <span>Subtotal:</span>
                        <span className="tabular-nums font-bold text-slate-700">{formatCurrency(subtotal)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between w-full max-w-[150px] text-[8px] font-semibold text-[#006c49]">
                          <span>Discount {discountType === "PERCENTAGE" ? `(${discountPercent}%)` : ""}:</span>
                          <span className="tabular-nums font-bold">-{formatCurrency(discountAmount)}</span>
                        </div>
                      )}
                      {vatRate > 0 && (
                        <div className="flex justify-between w-full max-w-[150px] text-[8px] font-semibold text-slate-400">
                          <span>VAT ({vatRate}%):</span>
                          <span className="tabular-nums font-bold text-slate-700">{formatCurrency(vatAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between w-full max-w-[150px] text-[10px] font-bold border-t border-slate-200/30 pt-1.5">
                        <span className="text-[#0037b0]">Amount Due:</span>
                        <span className="tabular-nums text-slate-900 font-bold">{formatCurrency(total)}</span>
                      </div>
                    </div>

                    {enableInstallments && (
                      <div className="border-t border-slate-200/30 pt-3 mt-3 w-full animate-in fade-in duration-200">
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mb-2 text-left">Payment Schedule</p>
                        <div className="space-y-1.5">
                          {installments.map((inst, index) => (
                            <div key={index} className="flex justify-between items-center text-[9px] font-bold text-slate-650 bg-white p-2 rounded-lg border border-slate-100/60">
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0037b0]" />
                                {inst.label} <span className="text-slate-400 font-semibold">({inst.percentage}%)</span>
                              </span>
                              <span className="tabular-nums text-slate-800">{formatCurrency(total * ((inst.percentage || 0) / 100))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Send Email Copy Toggle Checkbox */}
                  {clientEmail && (
                    <label className="flex items-center gap-3 p-3.5 bg-slate-50 hover:bg-[#eef4ff]/50 border border-slate-200/50 rounded-xl cursor-pointer select-none transition-all duration-200 shadow-[0px_4px_12px_rgba(0,55,176,0.02)]">
                      <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                        className="w-4 h-4 rounded text-[#0037b0] border-[#c4c5d7]/60 focus:ring-[#0037b0] cursor-pointer"
                      />
                      <div className="text-left">
                        <span className="text-xs font-bold text-slate-800 block">
                          Send email copy to client now
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold mt-0.5 block">
                          Deliver invoice PDF and online payment link immediately to {clientEmail}
                        </span>
                      </div>
                    </label>
                  )}
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
                  className="h-11 px-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0037b0] hover:text-[#1d4ed8] transition-colors cursor-pointer min-h-[44px] bg-transparent border-0"
                >
                  <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
                  Back
                </button>
              )}
            </div>

            <div>
              {step < 6 ? (
                <button
                  onClick={handleNext}
                  disabled={isSavingStep}
                  className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-xs font-bold shadow-[0_4px_12px_rgba(0,55,176,0.15)] flex items-center gap-2 hover:opacity-95 cursor-pointer min-h-[44px] border-0 disabled:opacity-50"
                >
                  {isSavingStep ? "Saving..." : "Continue"}
                  {!isSavingStep && <HugeiconsIcon icon={ArrowRight02Icon} size={16} />}
                </button>
              ) : (
                <button
                  onClick={() => handleFinishSend()}
                  className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#006c49] to-[#059669] text-white text-xs font-bold shadow-[0_4px_12px_rgba(0,108,73,0.15)] flex items-center gap-2 hover:opacity-95 cursor-pointer min-h-[44px] border-0"
                >
                  {sendEmail && clientEmail ? "Publish & Send Invoice" : "Publish Invoice"}
                  <HugeiconsIcon icon={Sent02Icon} size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Soft Confirmation Intercept Dialog */}
      {showConfirmOffline && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_16px_48px_rgba(0,55,176,0.12)] border border-slate-200/20 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={Briefcase02Icon} size={22} strokeWidth={1.5} className="text-amber-600" />
            </div>
            <div className="space-y-1.5 text-center">
              <h4 className="text-sm font-bold text-slate-900 leading-snug">Send without online payments?</h4>
              <p className="text-[11px] text-[#434655] font-semibold leading-relaxed">
                You haven't linked a settlement bank account. Your customer will receive a static invoice and won't have a direct button to pay online.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmOffline(false);
                  setStep(3); // Go to Settlement Bank
                }}
                className="w-full h-11 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-98 cursor-pointer border-0"
              >
                Connect Payout Bank (Recommended)
              </button>
              <button
                type="button"
                onClick={() => handleFinishSend(true)}
                className="w-full h-11 text-slate-450 hover:text-[#0037b0] text-xs font-bold transition-all cursor-pointer bg-transparent border-0"
              >
                Publish Offline / Static Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
