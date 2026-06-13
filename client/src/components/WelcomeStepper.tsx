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
  const { isOpen, startAtStep, closeOnboarding, openOnboarding } = useOnboardingStore();
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

  // New persistent state hooks
  const [businessName, setBusinessName] = useState(() => {
    return localStorage.getItem("tari1-onboarding-businessName") || "";
  });
  const [companyAddress, setCompanyAddress] = useState(() => {
    return localStorage.getItem("tari1-onboarding-companyAddress") || "";
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  // Form States - Payout Bank Setup
  const [bankCode, setBankCode] = useState(() => {
    return localStorage.getItem("tari1-onboarding-bankCode") || "";
  });
  const [accountNumber, setAccountNumber] = useState(() => {
    return localStorage.getItem("tari1-onboarding-accountNumber") || "";
  });
  const [verifiedAccountName, setVerifiedAccountName] = useState<string | null>(() => {
    return localStorage.getItem("tari1-onboarding-verifiedAccountName") || null;
  });
  const [isVerifyingBank, setIsVerifyingBank] = useState(false);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [isBankConnected, setIsBankConnected] = useState(() => {
    const saved = localStorage.getItem("tari1-onboarding-isBankConnected");
    return saved !== null ? saved === "true" : false;
  });

  // Form States - Client details
  const [clientType, setClientType] = useState<"individual" | "business">("business");
  const [clientName, setClientName] = useState(() => {
    return localStorage.getItem("tari1-onboarding-clientName") || (IS_DEV ? "Adebayo Technology Solutions" : "");
  });
  const [clientEmail, setClientEmail] = useState(() => {
    return localStorage.getItem("tari1-onboarding-clientEmail") || (IS_DEV ? "billing@adebayotech.ng" : "");
  });
  const [clientPhone, setClientPhone] = useState(() => {
    return localStorage.getItem("tari1-onboarding-clientPhone") || "";
  });
  const [clientAddress, setClientAddress] = useState(() => {
    return localStorage.getItem("tari1-onboarding-clientAddress") || "";
  });
  const [isWhatsapp, setIsWhatsapp] = useState(() => {
    const saved = localStorage.getItem("tari1-onboarding-isWhatsapp");
    return saved !== null ? saved === "true" : true;
  });
  const [vatEnabled, setVatEnabled] = useState(() => {
    const saved = localStorage.getItem("tari1-onboarding-vatEnabled");
    return saved !== null ? saved === "true" : false;
  });
  const [taxRate, setTaxRate] = useState(() => {
    const saved = localStorage.getItem("tari1-onboarding-taxRate");
    return saved !== null ? Number(saved) : 7.5;
  });
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">(() => {
    return (localStorage.getItem("tari1-onboarding-discountType") as "PERCENTAGE" | "FIXED") || "PERCENTAGE";
  });
  const [discountPercent, setDiscountPercent] = useState<number>(() => {
    const saved = localStorage.getItem("tari1-onboarding-discountPercent");
    return saved !== null ? Number(saved) : 0;
  });
  const [enableInstallments, setEnableInstallments] = useState<boolean>(() => {
    const saved = localStorage.getItem("tari1-onboarding-enableInstallments");
    return saved !== null ? saved === "true" : false;
  });
  const [installments, setInstallments] = useState<Array<{ label: string; percentage: number }>>(() => {
    const saved = localStorage.getItem("tari1-onboarding-installments");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [
      { label: "First Payment", percentage: 75 },
      { label: "Final Payment", percentage: 25 },
    ];
  });

  // Form States - Billing details & defaults
  const [paymentTerms, setPaymentTerms] = useState(() => {
    return localStorage.getItem("tari1-onboarding-paymentTerms") || "";
  });
  const [invoiceNotes, setInvoiceNotes] = useState(() => {
    return localStorage.getItem("tari1-onboarding-invoiceNotes") || "";
  });
  const [sendEmail, setSendEmail] = useState(false);
  const [billingItems, setBillingItems] = useState<BillingItem[]>(() => {
    const saved = localStorage.getItem("tari1-onboarding-billingItems");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [
      {
        id: "1",
        description: IS_DEV ? "Enterprise Cloud Security Assessment & Compliance Audit" : "",
        quantity: 1,
        unitPrice: IS_DEV ? 450000 : 0,
        type: "service",
      },
    ];
  });

  // Persistent state updates effect
  useEffect(() => {
    localStorage.setItem("tari1-onboarding-businessName", businessName);
    localStorage.setItem("tari1-onboarding-companyAddress", companyAddress);
    localStorage.setItem("tari1-onboarding-clientType", clientType);
    localStorage.setItem("tari1-onboarding-clientName", clientName);
    localStorage.setItem("tari1-onboarding-clientEmail", clientEmail);
    localStorage.setItem("tari1-onboarding-clientPhone", clientPhone);
    localStorage.setItem("tari1-onboarding-clientAddress", clientAddress);
    localStorage.setItem("tari1-onboarding-isWhatsapp", String(isWhatsapp));
    localStorage.setItem("tari1-onboarding-vatEnabled", String(vatEnabled));
    localStorage.setItem("tari1-onboarding-taxRate", String(taxRate));
    localStorage.setItem("tari1-onboarding-discountType", discountType);
    localStorage.setItem("tari1-onboarding-discountPercent", String(discountPercent));
    localStorage.setItem("tari1-onboarding-enableInstallments", String(enableInstallments));
    localStorage.setItem("tari1-onboarding-installments", JSON.stringify(installments));
    localStorage.setItem("tari1-onboarding-billingItems", JSON.stringify(billingItems));
    localStorage.setItem("tari1-onboarding-paymentTerms", paymentTerms);
    localStorage.setItem("tari1-onboarding-invoiceNotes", invoiceNotes);
    localStorage.setItem("tari1-onboarding-bankCode", bankCode);
    localStorage.setItem("tari1-onboarding-accountNumber", accountNumber);
    if (verifiedAccountName) {
      localStorage.setItem("tari1-onboarding-verifiedAccountName", verifiedAccountName);
    } else {
      localStorage.removeItem("tari1-onboarding-verifiedAccountName");
    }
    localStorage.setItem("tari1-onboarding-isBankConnected", String(isBankConnected));
  }, [
    businessName,
    companyAddress,
    clientType,
    clientName,
    clientEmail,
    clientPhone,
    clientAddress,
    isWhatsapp,
    vatEnabled,
    taxRate,
    discountType,
    discountPercent,
    enableInstallments,
    installments,
    billingItems,
    paymentTerms,
    invoiceNotes,
    bankCode,
    accountNumber,
    verifiedAccountName,
    isBankConnected,
  ]);

  const clearOnboardingLocalStorage = () => {
    localStorage.removeItem("tari1-onboarding-step");
    localStorage.removeItem("tari1-onboarding-businessName");
    localStorage.removeItem("tari1-onboarding-companyAddress");
    localStorage.removeItem("tari1-onboarding-clientType");
    localStorage.removeItem("tari1-onboarding-clientName");
    localStorage.removeItem("tari1-onboarding-clientEmail");
    localStorage.removeItem("tari1-onboarding-clientPhone");
    localStorage.removeItem("tari1-onboarding-clientAddress");
    localStorage.removeItem("tari1-onboarding-isWhatsapp");
    localStorage.removeItem("tari1-onboarding-vatEnabled");
    localStorage.removeItem("tari1-onboarding-taxRate");
    localStorage.removeItem("tari1-onboarding-discountType");
    localStorage.removeItem("tari1-onboarding-discountPercent");
    localStorage.removeItem("tari1-onboarding-enableInstallments");
    localStorage.removeItem("tari1-onboarding-installments");
    localStorage.removeItem("tari1-onboarding-billingItems");
    localStorage.removeItem("tari1-onboarding-paymentTerms");
    localStorage.removeItem("tari1-onboarding-invoiceNotes");
    localStorage.removeItem("tari1-onboarding-bankCode");
    localStorage.removeItem("tari1-onboarding-accountNumber");
    localStorage.removeItem("tari1-onboarding-verifiedAccountName");
    localStorage.removeItem("tari1-onboarding-isBankConnected");
  };

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  // Fetch bank list
  const { data: banks } = useQuery<Bank[]>({
    queryKey: ["paystack-banks"],
    queryFn: async () => {
      const response = await apiClient.get("/paystack/banks");
      return response.data.data;
    },
    enabled: isOpen || (!user?.organization?.businessType && !isDismissed),
  });

  // Calculations for Preview
  const subtotal = billingItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount = discountType === "FIXED"
    ? Math.min(Number(discountPercent) || 0, subtotal)
    : subtotal * ((Number(discountPercent) || 0) / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatRate = vatEnabled ? Number(taxRate || 7.5) : 0;
  const vatAmount = (afterDiscount * vatRate) / 100;
  const total = afterDiscount + vatAmount;
  const installmentsTotal = installments.reduce((sum, inst) => sum + (inst.percentage || 0), 0);

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
      const target = Math.min(Math.max(startAtStep, 1), 4);
      setStep(target);
      setIsDismissed(false);
    }
  }, [isOpen, startAtStep]);

  // Sync bank connected state, VAT settings, personalization survey, logo, and terms from database
  useEffect(() => {
    if (user) {
      if (user.businessRole && !role) {
        setRole(user.businessRole);
      }
      if (user.organization) {
        const org = user.organization;
        
        if (!localStorage.getItem("tari1-onboarding-vatEnabled")) {
          setVatEnabled(!!org.vatEnabled);
        }
        if (!localStorage.getItem("tari1-onboarding-taxRate")) {
          setTaxRate(Number(org.taxRate || 7.5));
        }
        if (org.isPaystackVerified && !localStorage.getItem("tari1-onboarding-isBankConnected")) {
          setIsBankConnected(true);
          setVerifiedAccountName(org.name || "Settlement Account Linked");
        }
        
        if (org.businessType && !businessType) {
          if (org.businessType.startsWith("Other: ")) {
            setBusinessType("other");
            setCustomBusinessType(org.businessType.replace("Other: ", ""));
          } else {
            setBusinessType(org.businessType);
          }
        }
        if (org.organizationSize && !orgSize) {
          setOrgSize(org.organizationSize);
        }
        if (org.name && !businessName && !localStorage.getItem("tari1-onboarding-businessName")) {
          setBusinessName(org.name);
        }
        if (org.address && !companyAddress && !localStorage.getItem("tari1-onboarding-companyAddress")) {
          setCompanyAddress(org.address);
        }
        if (org.logo && !logoPreviewUrl && !logoFile) {
          setLogoPreviewUrl(org.logo);
        }
        if (!paymentTerms && !localStorage.getItem("tari1-onboarding-paymentTerms")) {
          setPaymentTerms(org.paymentTerms || "Payment is due within 30 days of invoice date.");
        }
        if (!invoiceNotes && !localStorage.getItem("tari1-onboarding-invoiceNotes")) {
          setInvoiceNotes(org.defaultNotes || "Thank you for your business!");
        }
      }
    }
  }, [user, role, businessType, orgSize, businessName, companyAddress, logoPreviewUrl, logoFile, paymentTerms, invoiceNotes]);

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
      if (!businessName.trim()) {
        toast.error("Please enter your business name");
        return;
      }
      setIsSavingStep(true);
      try {
        const payload: UpdateOrganizationData = {
          name: businessName.trim(),
        };
        if (companyAddress.trim()) {
          payload.address = companyAddress.trim();
        }
        await organizationsApi.updateCurrent(payload);
        if (logoFile) {
          await organizationsApi.uploadLogo(logoFile);
        }
        queryClient.invalidateQueries({ queryKey: ["organization"] });
        queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
        setStep(2);
        localStorage.setItem('tari1-onboarding-step', '2');
      } catch {
        toast.error("Failed to save branding details");
      } finally {
        setIsSavingStep(false);
      }
    } else if (step === 2) {
      if (!clientName.trim()) {
        toast.error("Please enter a client name");
        return;
      }
      if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
        toast.error("Please enter a valid email address");
        return;
      }
      setStep(3);
      localStorage.setItem('tari1-onboarding-step', '3');
    } else if (step === 3) {
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
      setStep(4);
      localStorage.setItem('tari1-onboarding-step', '4');
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

    if (sendEmail) {
      if (!clientEmail.trim()) {
        toast.error("Please enter a client email address to send the invoice");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) {
        toast.error("Please enter a valid client email address");
        return;
      }
    }

    const hasPayouts = isBankConnected || user?.organization?.isPaystackVerified;
    const isBypassed = bypassConfirm === true;
    if (!hasPayouts && !isBypassed) {
      setShowConfirmOffline(true);
      return;
    }

    setShowConfirmOffline(false);
    setIsLoading(true);
    try {
      setLoadingText("Configuring company profile…");
      const finalBusinessType =
        businessType === "other" ? `Other: ${customBusinessType.trim()}` : businessType;

      const orgUpdateData: UpdateOrganizationData = {
        name: businessName.trim(),
        vatEnabled: vatEnabled,
        taxRate: Number(taxRate),
        paymentTerms: paymentTerms.trim(),
        defaultNotes: invoiceNotes.trim(),
      };
      if (!isPersonalized) {
        orgUpdateData.businessType = finalBusinessType;
        orgUpdateData.organizationSize = orgSize;
      }
      if (companyAddress.trim()) {
        orgUpdateData.address = companyAddress.trim();
      }

      if (Object.keys(orgUpdateData).length > 0) {
        await organizationsApi.updateCurrent(orgUpdateData);
      }

      if (logoFile) {
        setLoadingText("Uploading company logo…");
        await organizationsApi.uploadLogo(logoFile);
      }

      if (!isPersonalized && role) {
        await authApi.updateProfile(user.id, {
          businessRole: role,
        });
      }

      const latestOrg = await organizationsApi.getCurrent();
      updateUser({
        businessRole: role || user.businessRole,
        organization: latestOrg,
      });

      setLoadingText("Creating client contact…");
      const client = await clientsApi.create({
        name: clientName,
        email: clientEmail || undefined,
        phone: clientPhone || undefined,
        address: clientAddress.trim() || undefined,
        notes: `Type: ${clientType === "business" ? "Business" : "Individual"}`,
      });

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
        notes: invoiceNotes.trim() || undefined,
        terms: paymentTerms.trim() || undefined,
      });

      const shouldSend = sendEmail && !!clientEmail;
      if (shouldSend) {
        setLoadingText("Publishing invoice ledger & sending email…");
        await invoicesApi.send(invoice.id);
      }

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

      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });

      clearOnboardingLocalStorage();
      setShowCelebration(true);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      const msg = error.response?.data?.message || "Failed to complete onboarding setup";
      toast.error("Error setting up workspace", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const showSurvey = !isPersonalized && (isOpen || (!isDismissed && !hasActiveUsage));
  const shouldShow = isOpen || showSurvey || showCelebration;

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

  if (showSurvey) {
    return (
      <div className="fixed inset-0 z-[9990] bg-[#f8f9ff] flex items-center justify-center p-3 sm:p-6 font-sans antialiased text-slate-900 overflow-y-auto animate-in fade-in duration-300">
        <div className="w-full max-w-[480px] bg-white rounded-[32px] pt-8 px-6 pb-24 sm:pt-10 sm:px-10 sm:pb-28 shadow-[0_20px_50px_rgba(0,55,176,0.06)] relative border border-slate-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
          
          {/* Layered Premium Fintech Badge Icon */}
          <div className="relative mb-6 flex items-center justify-center select-none">
            {/* Outer pulsating gradient halo */}
            <div className="absolute w-20 h-20 bg-gradient-to-tr from-[#0037b0]/20 to-[#1d4ed8]/5 rounded-[24px] animate-pulse blur-md" />
            
            {/* Middle decorative border card */}
            <div className="absolute w-18 h-18 bg-white border border-[#0037b0]/15 rounded-[22px] rotate-6 transition-transform duration-500 hover:rotate-12" />
            
            {/* Inner primary card with the icon */}
            <div className="relative w-16 h-16 rounded-[20px] bg-gradient-to-tr from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,55,176,0.2)]">
              <HugeiconsIcon icon={Store04Icon} size={28} strokeWidth={1.5} className="animate-bounce" />
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-[24px] font-bold text-slate-900 tracking-tight font-sans">
              Welcome, <span className="text-[#0037b0]">{user?.firstName || "there"}</span>!
            </h2>
            <p className="text-xs font-semibold text-slate-455 mt-1.5 uppercase tracking-wider">
              Let's personalize your experience
            </p>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[320px] mx-auto mt-2 text-center">
              Tell us a little bit about your business so we can customize your invoicing and tax compliance ledger.
            </p>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
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
              if (role) {
                await authApi.updateProfile(user.id, { businessRole: role });
              }
              
              // Fetch latest updated data to update store
              const latestOrg = await organizationsApi.getCurrent();
              updateUser({
                businessRole: role,
                organization: latestOrg,
              });

              queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
              
              // Open setup stepper at step 1 (Branding)
              openOnboarding(1);
              setStep(1);
              localStorage.setItem('tari1-onboarding-step', '1');
              toast.success("Profile personalized successfully!");
            } catch {
              toast.error("Failed to save profile personalization");
            } finally {
              setIsSavingStep(false);
            }
          }} className="w-full space-y-5 text-left">
            
            {/* Business Category */}
            <div className="space-y-2">
              <label htmlFor="surveyBusiness" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <HugeiconsIcon icon={Store04Icon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
                Business Category
              </label>
              <SearchableSelect
                id="surveyBusiness"
                options={BUSINESS_CATEGORIES}
                value={businessType}
                onChange={(val) => {
                  setBusinessType(val);
                  if (val !== "other") {
                    setCustomBusinessType("");
                  }
                }}
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
                  onChange={(e) => setCustomBusinessType(e.target.value)}
                  className="w-full h-11 px-4 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
                />
              </div>
            )}

            {/* Org Size */}
            <div className="space-y-2">
              <label htmlFor="surveyOrgSize" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <HugeiconsIcon icon={UserGroupIcon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
                Team / Organization Size
              </label>
              <SearchableSelect
                id="surveyOrgSize"
                options={ORG_SIZES}
                value={orgSize}
                onChange={setOrgSize}
                placeholder="Select organization size"
              />
            </div>

            {/* Your Role */}
            <div className="space-y-2">
              <label htmlFor="surveyRole" className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
                Your Job Role
              </label>
              <SearchableSelect
                id="surveyRole"
                options={ROLES}
                value={role}
                onChange={setRole}
                placeholder="Select your role"
              />
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={isSavingStep || !businessType || !orgSize || !role}
              className="w-full h-12 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] hover:from-[#002f9c] hover:to-[#173fa3] text-white rounded-xl font-bold text-sm shadow-[0_12px_32px_rgba(0,55,176,0.15)] hover:shadow-[0_12px_32px_rgba(0,55,176,0.25)] transition-all active:scale-[0.98] active:translate-y-[1px] duration-150 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 select-none min-h-[44px] border-0"
            >
              {isSavingStep ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Saving Profile...
                </>
              ) : (
                <>
                  Complete Profile & Start Setup
                  <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-1 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto overflow-x-hidden animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl sm:rounded-[24px] w-full max-w-xl shadow-[0_16px_48px_rgba(0,55,176,0.08)] flex flex-col overflow-hidden max-h-[96vh] sm:max-h-[92vh] font-sans antialiased text-slate-900 animate-in zoom-in-95 duration-200">
        
        {/* Header bar (no 1px lines, bg shift) */}
        <div className="px-4 sm:px-8 pt-8 pb-4 flex items-center justify-between bg-[#f8f9ff]/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0037b0]/8 text-[#0037b0] flex items-center justify-center">
              <HugeiconsIcon icon={
                step === 1 ? Store04Icon :
                step === 2 ? UserGroupIcon :
                step === 3 ? Invoice03Icon :
                Briefcase02Icon
              } size={20} strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <h2 className="text-base font-semibold tracking-tight text-[#121c28] flex items-center gap-1.5 flex-wrap">
                {step === 1 ? "Your Business Profile" :
                 step === 2 ? "Who Are You Billing?" :
                 step === 3 ? "What Are You Charging For?" :
                 "Review & Send"}
              </h2>
              <p className="text-[10px] font-semibold text-slate-455 mt-0.5 uppercase tracking-wider">
                {`Step ${step} of 4: Quick Setup`}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSkipOrDismiss}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-[#0037b0] transition-colors cursor-pointer min-h-[44px] flex items-center bg-transparent border-0"
          >
            Setup Later
          </button>
        </div>

        {/* Form Body Scroll Area */}
        <div className="flex-1 overflow-y-auto px-3.5 sm:px-8 py-5">
          
          {/* Progress Tracker Capsules */}
          {!isLoading && (
            <div className="flex items-center gap-1.5 mb-6 bg-slate-50 p-1.5 rounded-xl">
              {[1, 2, 3, 4].map((s) => {
                let color = "bg-slate-200";
                if (step === s) {
                  color = "bg-gradient-to-r from-[#0037b0] to-[#1d4ed8]";
                } else if (step > s) {
                  const isSkippedBranding = s === 1 && !logoFile && !companyAddress.trim() && !businessName.trim();
                  if (isSkippedBranding) {
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
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="space-y-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left">
                      Your business identity
                    </span>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed text-left">
                      Confirm or update your business name, address, and logo. We will show these details at the top of your professional invoices.
                    </p>

                    {/* Business Name input */}
                    <div className="space-y-2 text-left">
                      <label htmlFor="businessNameInput" className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                        Business / Company Name
                      </label>
                      <input
                        id="businessNameInput"
                        type="text"
                        placeholder="e.g. Amina Ventures Ltd"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="w-full h-11 px-4 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
                      />
                    </div>

                    {/* Logo upload block */}
                    <div className="space-y-2 text-left">
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
                    <div className="space-y-2 text-left">
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

              {step === 2 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-[#eef4ff]/40 p-4.5 rounded-2xl border border-[#0037b0]/5 text-left">
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Enter your client's details. Tari1 will register this contact and generate the invoice for them.
                    </p>
                    {IS_DEV && (
                      <span className="inline-block mt-2 text-[9px] font-bold text-[#0037b0] bg-[#0037b0]/5 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ⚡ Local Test: Dummy data pre-filled
                      </span>
                    )}
                  </div>

                  {/* Client Type Selector */}
                  <div className="space-y-2 text-left">
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
                            : "text-slate-400 hover:text-slate-650 bg-transparent"
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
                            : "text-slate-400 hover:text-slate-650 bg-transparent"
                        )}
                      >
                        Individual Client
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-left">
                    <label htmlFor="clientNameInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Client / Company Name
                    </label>
                    <input
                      id="clientNameInput"
                      type="text"
                      placeholder={clientType === "business" ? "e.g. Amina Ventures Ltd" : "e.g. Samir Abubakar"}
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
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
                        className="w-full h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
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
                        className="w-full h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
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
                  <div className="space-y-2 text-left">
                    <label htmlFor="clientAddressInput" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Client Billing Address (Optional)
                    </label>
                    <textarea
                      id="clientAddressInput"
                      placeholder="e.g. 45 Commercial Avenue, Sabo, Yaba, Lagos"
                      rows={2}
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      className="w-full px-4 py-3 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 resize-none leading-relaxed transition-colors focus:ring-1 focus:ring-[#0037b0]"
                    />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-[#f8f9ff] p-3 rounded-2xl border border-[#0037b0]/5 text-left">
                    <p className="text-xs text-[#434655] font-semibold leading-relaxed">
                      Add the details of the services or products you want to bill this client for, along with payment terms and notes.
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
                          <div className="space-y-2 font-medium text-left">
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
                      <div className="col-span-6 text-left">Item Description</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-3 text-left">Unit Price</div>
                      <div className="col-span-1"></div>
                    </div>

                    <div className="space-y-3 max-h-[36vh] overflow-y-auto pr-1">
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
                                      : "text-slate-450 hover:text-slate-650 bg-transparent"
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
                                      : "text-slate-450 hover:text-slate-650 bg-transparent"
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
                              className="w-full h-9 px-3 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
                            />
                          </div>

                          {/* Quantity */}
                          <div className="col-span-5 sm:col-span-2 flex flex-col sm:block gap-1.5">
                            <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">Qty</span>
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={item.quantity || ""}
                              onChange={(e) => handleUpdateItem(index, "quantity", Number(e.target.value))}
                              className="w-full h-9 px-3 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 text-center focus:ring-1 focus:ring-[#0037b0]"
                            />
                          </div>

                          {/* Unit Price */}
                          <div className="col-span-7 sm:col-span-3 flex flex-col sm:block gap-1.5">
                            <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-400 text-left">Unit Price</span>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 select-none">
                                ₦
                              </span>
                              <input
                                type="text"
                                placeholder="0.00"
                                inputMode="decimal"
                                value={item.unitPrice === 0 ? "" : formatAmountInput(item.unitPrice)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const numericValue = parseAmountInput(val);
                                  handleUpdateItem(index, "unitPrice", numericValue);
                                }}
                                className="w-full h-9 pl-7 pr-3 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
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
                            inputMode="decimal"
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
                          inputMode="decimal"
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
                                className="flex-1 h-8 px-2.5 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 outline-none font-semibold text-slate-700 focus:border-[#0037b0]"
                              />
                              <div className="flex items-center gap-1.5 bg-white border border-[#c4c5d7]/40 rounded-lg px-2 h-8">
                                <input
                                  type="number"
                                  placeholder="0"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={inst.percentage || ""}
                                  onChange={(e) => {
                                    const newInst = [...installments];
                                    newInst[index].percentage = Number(e.target.value);
                                    setInstallments(newInst);
                                  }}
                                  className="w-10 text-[16px] sm:text-xs font-bold text-[#0037b0] text-center outline-none border-0 p-0 bg-transparent"
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

                    {/* Payment Terms field */}
                    <div className="space-y-2 text-left mt-4 border-t border-slate-200/40 pt-4">
                      <label htmlFor="paymentTermsInput" className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                        Payment Terms
                      </label>
                      <input
                        id="paymentTermsInput"
                        type="text"
                        placeholder="e.g. Payment is due within 30 days of invoice date."
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className="w-full h-11 px-4 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
                      />
                    </div>

                    {/* Invoice Notes field */}
                    <div className="space-y-2 text-left mt-3">
                      <label htmlFor="invoiceNotesInput" className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                        Default Invoice Notes
                      </label>
                      <textarea
                        id="invoiceNotesInput"
                        placeholder="e.g. Thank you for your business! Please include invoice number in payment description."
                        rows={2}
                        value={invoiceNotes}
                        onChange={(e) => setInvoiceNotes(e.target.value)}
                        className="w-full px-4 py-3 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 resize-none leading-relaxed transition-colors focus:ring-1 focus:ring-[#0037b0]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Warning Banner if Settlement Bank is not connected */}
                  {(!isBankConnected && !user?.organization?.isPaystackVerified) && (
                    <div className="p-4.5 rounded-[20px] bg-amber-50/70 border border-amber-100/40 text-amber-800 flex flex-col gap-1.5 shadow-[0_8px_24px_rgba(255,221,184,0.06)] text-left">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        No Payout Bank Connected
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                        Clients will not be able to pay this invoice online (Card, Bank Transfer, USSD). You can configure a bank below or publish offline.
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-left">
                      How should clients pay you?
                    </span>
                    
                    {isBankConnected ? (
                      <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-[20px] flex items-center justify-between shadow-[0px_8px_24px_rgba(0,108,73,0.02)]">
                        <div className="text-left">
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} className="text-emerald-600" strokeWidth={2.5} />
                            Payout Bank Connected
                          </p>
                          <h4 className="text-xs font-bold text-slate-800 mt-1">
                            {verifiedAccountName || "Verified Account"}
                          </h4>
                          {accountNumber && accountNumber !== "••••••••••" && (
                            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                              Account: {accountNumber} {bankCode ? `· ${banks?.find(b => b.code === bankCode)?.name || bankCode}` : ""}
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
                          className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-655 hover:text-slate-800 text-[10px] font-bold transition-all cursor-pointer min-h-[36px] bg-white active:scale-98"
                        >
                          Clear & Change
                        </button>
                      </div>
                    ) : (
                      <div className="p-5 rounded-[20px] bg-slate-50 border border-slate-200/40 space-y-4">
                        <p className="text-[11px] text-slate-500 font-semibold leading-relaxed text-left">
                          Link your settlement bank details to **enable online invoice payments** (Cards, Bank Transfer, USSD).
                        </p>
                        
                        <div className="space-y-2 text-left">
                          <label htmlFor="step4BankSelect" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Destination Bank
                          </label>
                          <SearchableSelect
                            id="step4BankSelect"
                            options={banks ? banks.map((b) => ({ id: b.code, label: b.name })) : []}
                            value={bankCode}
                            onChange={(val) => {
                              setBankCode(val);
                              setVerifiedAccountName(null);
                            }}
                            placeholder="Choose your bank"
                          />
                        </div>

                        <div className="space-y-2 text-left">
                          <label htmlFor="step4AccountNumber" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Account Number
                          </label>
                          <div className="flex gap-3">
                            <input
                              id="step4AccountNumber"
                              type="text"
                              placeholder="0123456789"
                              maxLength={10}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={accountNumber}
                              onChange={(e) => {
                                setAccountNumber(e.target.value.replace(/\D/g, ""));
                                setVerifiedAccountName(null);
                              }}
                              className="flex-1 h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 bg-white focus:ring-1 focus:ring-[#0037b0]"
                            />
                            <button
                              type="button"
                              onClick={handleVerifyBank}
                              disabled={!bankCode || accountNumber.length !== 10 || isVerifyingBank}
                              className="h-11 px-4 rounded-xl border border-[#c4c5d7]/40 text-[#0037b0] hover:bg-[#eef4ff] text-xs font-bold disabled:opacity-40 min-h-[44px] cursor-pointer bg-white"
                            >
                              {isVerifyingBank ? "Checking…" : "Verify"}
                            </button>
                          </div>
                        </div>

                        {verifiedAccountName && (
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-[11px] animate-in fade-in duration-200 text-left">
                            <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="text-emerald-600" strokeWidth={2.5} />
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
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-left">
                    Mobile Invoice Preview
                  </span>

                  {/* Glassmorphic Invoice Preview */}
                  <div className="p-5 rounded-[20px] bg-[#f8f9ff] border border-slate-200/40 relative overflow-hidden text-slate-800">
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-left">
                        {logoPreviewUrl || user?.organization?.logo ? (
                          <img
                            src={logoPreviewUrl || user?.organization?.logo}
                            alt="Logo"
                            className="h-8 max-w-[120px] object-contain rounded-md mb-2 bg-white"
                          />
                        ) : (
                          <h4 className="text-xs font-bold text-[#0037b0] uppercase tracking-tight">
                            {businessName || user?.organizationName}
                          </h4>
                        )}
                        <p className="text-[8px] text-slate-455 font-semibold mt-0.5 whitespace-pre-wrap max-w-[180px]">
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

                    <div className="border-t border-slate-200/30 pt-3 mb-4 text-left">
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Billed To</p>
                      <p className="text-[10px] font-bold text-slate-800 mt-0.5">{clientName}</p>
                      {clientEmail && <p className="text-[8px] text-slate-400 font-medium">{clientEmail}</p>}
                      {clientAddress.trim() && (
                        <p className="text-[8px] text-slate-455 font-medium mt-0.5 whitespace-pre-wrap max-w-[200px]">
                          {clientAddress.trim()}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 mb-4 bg-white p-3 rounded-xl border border-slate-200/30 max-h-40 overflow-y-auto">
                      <div className="grid grid-cols-12 gap-2 text-[9px] font-bold border-b border-slate-50 pb-1.5 text-slate-400 uppercase tracking-wider">
                        <span className="col-span-8 text-left">Description</span>
                        <span className="col-span-1 text-center">Qty</span>
                        <span className="col-span-3 text-right">Total</span>
                      </div>
                      {billingItems.map((item) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 items-start text-[9px] font-bold text-slate-700 leading-normal pt-1.5 border-b border-slate-50/50 pb-1.5 last:border-b-0 last:pb-0">
                          <span className="col-span-8 line-clamp-2 flex items-center gap-1.5 text-left">
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
                            <div key={index} className="flex justify-between items-center text-[9px] font-bold text-slate-655 bg-white p-2 rounded-lg border border-slate-100/60">
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

                    {(paymentTerms || invoiceNotes) && (
                      <div className="border-t border-slate-200/30 pt-3 mt-3 text-left space-y-2">
                        {paymentTerms && (
                          <div>
                            <p className="text-[7px] text-slate-400 font-bold uppercase tracking-wider">Terms</p>
                            <p className="text-[8px] text-slate-500 font-semibold mt-0.5 leading-normal">{paymentTerms}</p>
                          </div>
                        )}
                        {invoiceNotes && (
                          <div>
                            <p className="text-[7px] text-slate-400 font-bold uppercase tracking-wider">Notes</p>
                            <p className="text-[8px] text-slate-500 font-semibold mt-0.5 leading-normal">{invoiceNotes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Send Email Copy Toggle Checkbox */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/50 rounded-[20px] shadow-[0px_4px_12px_rgba(0,55,176,0.02)] space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="sendEmailCheckbox"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                        className="w-4 h-4 rounded text-[#0037b0] border-[#c4c5d7]/60 focus:ring-[#0037b0] cursor-pointer"
                      />
                      <label htmlFor="sendEmailCheckbox" className="text-xs font-bold text-slate-800 cursor-pointer select-none">
                        Send email copy to client now
                      </label>
                    </div>
                    
                    {sendEmail && (
                      <div className="pl-7 space-y-1.5 text-left animate-in fade-in slide-in-from-top-1 duration-200">
                        <label htmlFor="confirmEmailInput" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">
                          Recipient Email Address
                        </label>
                        <input
                          id="confirmEmailInput"
                          type="email"
                          placeholder="client@example.com"
                          value={clientEmail}
                          onChange={(e) => setClientEmail(e.target.value)}
                          className="w-full h-10 px-3 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
                        />
                        <p className="text-[9px] text-slate-450 font-semibold leading-relaxed">
                          Please verify this address carefully to prevent delivery failures and bounced emails.
                        </p>
                      </div>
                    )}
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
                  className="h-11 px-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0037b0] hover:text-[#1d4ed8] transition-colors cursor-pointer min-h-[44px] bg-transparent border-0"
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
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in text-slate-800">
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
                  setStep(4); // Go to Payout & Send (which contains the bank details setup form)
                }}
                className="w-full h-11 bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-98 cursor-pointer border-0"
              >
                Connect Payout Bank (Recommended)
              </button>
              <button
                type="button"
                onClick={() => handleFinishSend(true)}
                className="w-full h-11 text-slate-455 hover:text-[#0037b0] text-xs font-bold transition-all cursor-pointer bg-transparent border-0"
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
