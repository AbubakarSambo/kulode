/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuthStore } from "@/stores/auth";
import type { User } from "@/types";
import { useOnboardingStore } from "@/stores/onboarding";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { organizationsApi, UpdateOrganizationData } from "@/api/organizations";
import { authApi } from "@/api/auth";
import { clientsApi } from "@/api/clients";
import { invoicesApi } from "@/api/invoices";
import { inventoryApi } from "@/api/inventory";
import apiClient from "@/api/client";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";

// Onboarding draft keys are global in localStorage; this key records which user
// wrote them so another account's stale draft is never shown (e.g. junk business names).
export const ONBOARDING_OWNER_KEY = "tari1-onboarding-owner";

const ONBOARDING_STORAGE_KEYS = [
  "tari1-onboarding-step",
  "tari1-onboarding-businessName",
  "tari1-onboarding-businessPhone",
  "tari1-onboarding-companyAddress",
  "tari1-onboarding-clientType",
  "tari1-onboarding-clientName",
  "tari1-onboarding-clientEmail",
  "tari1-onboarding-clientPhone",
  "tari1-onboarding-clientAddress",
  "tari1-onboarding-isWhatsapp",
  "tari1-onboarding-vatEnabled",
  "tari1-onboarding-taxRate",
  "tari1-onboarding-discountType",
  "tari1-onboarding-discountPercent",
  "tari1-onboarding-enableInstallments",
  "tari1-onboarding-installments",
  "tari1-onboarding-billingItems",
  "tari1-onboarding-paymentTerms",
  "tari1-onboarding-invoiceNotes",
  "tari1-onboarding-bankCode",
  "tari1-onboarding-accountNumber",
  "tari1-onboarding-verifiedAccountName",
  "tari1-onboarding-isBankConnected",
  "tari1-onboarding-completedSteps",
];

export const clearOnboardingLocalStorage = () => {
  ONBOARDING_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
};

export const claimOnboardingDraftForUser = (userId: string | undefined) => {
  if (typeof window === "undefined" || !userId) return;
  const owner = localStorage.getItem(ONBOARDING_OWNER_KEY);
  if (owner !== userId) {
    clearOnboardingLocalStorage();
    localStorage.setItem(ONBOARDING_OWNER_KEY, userId);
  }
};

export interface Bank {
  name: string;
  code: string;
}

export interface BillingItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  type: "service" | "product";
}

export const BUSINESS_CATEGORIES = [
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

export const ORG_MODULES = [
  { id: "POS", label: "Point of Sale", description: "Selling in person — tables, orders, shifts" },
  { id: "INVOICING", label: "Invoicing & Billing", description: "Billing clients — invoices, payments" },
  { id: "BOTH", label: "Both", description: "I need POS and invoicing" },
];

export const ORG_SIZES = [
  { id: "1", label: "Just me (Solo)" },
  { id: "2-10", label: "2 - 10 people" },
  { id: "11-50", label: "11 - 50 people" },
  { id: "51+", label: "51+ people" },
];

export const ROLES = [
  { id: "founder", label: "Founder / Owner / CEO" },
  { id: "accountant", label: "Accountant / Finance" },
  { id: "manager", label: "Operations / Product Manager" },
  { id: "other", label: "Employee / Other" },
];

interface OnboardingContextProps {
  // Global Stores State
  user: User | null;
  updateUser: (userData: Partial<User>) => void;
  isOpen: boolean;
  startAtStep: number;
  closeOnboarding: () => void;
  openOnboarding: (step?: number) => void;

  // Step state
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  isMobile: boolean;

  // Async & Loading states
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isSavingStep: boolean;
  setIsSavingStep: React.Dispatch<React.SetStateAction<boolean>>;
  loadingText: string;
  setLoadingText: React.Dispatch<React.SetStateAction<string>>;
  showCelebration: boolean;
  setShowCelebration: React.Dispatch<React.SetStateAction<boolean>>;
  isDismissed: boolean;
  setIsDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  showConfirmOffline: boolean;
  setShowConfirmOffline: React.Dispatch<React.SetStateAction<boolean>>;

  // Created Invoice details for Celebration
  createdInvoiceId: string | undefined;
  setCreatedInvoiceId: React.Dispatch<React.SetStateAction<string | undefined>>;
  createdInvoiceNumber: string | undefined;
  setCreatedInvoiceNumber: React.Dispatch<React.SetStateAction<string | undefined>>;
  createdPaymentUrl: string | null | undefined;
  setCreatedPaymentUrl: React.Dispatch<React.SetStateAction<string | null | undefined>>;
  createdInvoiceTotal: number | undefined;
  setCreatedInvoiceTotal: React.Dispatch<React.SetStateAction<number | undefined>>;
  createdShareToken: string | null | undefined;
  setCreatedShareToken: React.Dispatch<React.SetStateAction<string | null | undefined>>;
  createdDueDate: string | undefined;
  setCreatedDueDate: React.Dispatch<React.SetStateAction<string | undefined>>;

  // Form States - Personalization Survey (Step 0)
  businessType: string;
  setBusinessType: React.Dispatch<React.SetStateAction<string>>;
  customBusinessType: string;
  setCustomBusinessType: React.Dispatch<React.SetStateAction<string>>;
  orgSize: string;
  setOrgSize: React.Dispatch<React.SetStateAction<string>>;
  role: string;
  setRole: React.Dispatch<React.SetStateAction<string>>;
  enabledModules: string;
  setEnabledModules: React.Dispatch<React.SetStateAction<string>>;

  // Form States - Step 1: Branding
  businessName: string;
  setBusinessName: React.Dispatch<React.SetStateAction<string>>;
  businessPhone: string;
  setBusinessPhone: React.Dispatch<React.SetStateAction<string>>;
  companyAddress: string;
  setCompanyAddress: React.Dispatch<React.SetStateAction<string>>;
  logoFile: File | null;
  setLogoFile: React.Dispatch<React.SetStateAction<File | null>>;
  logoPreviewUrl: string | null;
  setLogoPreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;

  // Form States - Step 4: Payout Bank Setup
  bankCode: string;
  setBankCode: React.Dispatch<React.SetStateAction<string>>;
  accountNumber: string;
  setAccountNumber: React.Dispatch<React.SetStateAction<string>>;
  verifiedAccountName: string | null;
  setVerifiedAccountName: React.Dispatch<React.SetStateAction<string | null>>;
  isVerifyingBank: boolean;
  isSavingBank: boolean;
  isBankConnected: boolean;
  setIsBankConnected: React.Dispatch<React.SetStateAction<boolean>>;
  showBankAccordion: boolean;
  setShowBankAccordion: React.Dispatch<React.SetStateAction<boolean>>;
  activeStep4Tab: "bank" | "preview";
  setActiveStep4Tab: React.Dispatch<React.SetStateAction<"bank" | "preview">>;

  // Form States - Step 3: Billing & Advanced options
  activeItemIndexStep3: number;
  setActiveItemIndexStep3: React.Dispatch<React.SetStateAction<number>>;
  completedSteps: Set<number>;
  setCompletedSteps: React.Dispatch<React.SetStateAction<Set<number>>>;

  // Form States - Step 2: Client details
  clientType: "individual" | "business";
  setClientType: React.Dispatch<React.SetStateAction<"individual" | "business">>;
  clientName: string;
  setClientName: React.Dispatch<React.SetStateAction<string>>;
  clientEmail: string;
  setClientEmail: React.Dispatch<React.SetStateAction<string>>;
  clientPhone: string;
  setClientPhone: React.Dispatch<React.SetStateAction<string>>;
  clientAddress: string;
  setClientAddress: React.Dispatch<React.SetStateAction<string>>;
  isWhatsapp: boolean;
  setIsWhatsapp: React.Dispatch<React.SetStateAction<boolean>>;

  // Step 3 advanced billing defaults
  vatEnabled: boolean;
  setVatEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  showAdvanced: boolean;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  taxRate: number;
  setTaxRate: React.Dispatch<React.SetStateAction<number>>;
  discountType: "PERCENTAGE" | "FIXED";
  setDiscountType: React.Dispatch<React.SetStateAction<"PERCENTAGE" | "FIXED">>;
  discountPercent: number;
  setDiscountPercent: React.Dispatch<React.SetStateAction<number>>;
  enableInstallments: boolean;
  setEnableInstallments: React.Dispatch<React.SetStateAction<boolean>>;
  installments: Array<{ label: string; percentage: number }>;
  setInstallments: React.Dispatch<React.SetStateAction<Array<{ label: string; percentage: number }>>>;

  paymentTerms: string;
  setPaymentTerms: React.Dispatch<React.SetStateAction<string>>;
  invoiceNotes: string;
  setInvoiceNotes: React.Dispatch<React.SetStateAction<string>>;

  billingItems: BillingItem[];
  setBillingItems: React.Dispatch<React.SetStateAction<BillingItem[]>>;

  // Queries & Derived State
  banks: Bank[] | undefined;
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  installmentsTotal: number;
  isPersonalized: boolean;
  hasActiveUsage: boolean;
  showSurvey: boolean;
  shouldShow: boolean;
  orgName: string;

  // Actions
  handleLogoFile: (file: File) => void;
  clearOnboardingLocalStorage: () => void;
  handleVerifyBank: () => Promise<void>;
  handleSaveBank: () => Promise<void>;
  handleAddItem: () => void;
  handleRemoveItem: (index: number) => void;
  handleUpdateItem: <K extends keyof BillingItem>(
    index: number,
    key: K,
    val: BillingItem[K]
  ) => void;
  handleNext: () => Promise<void>;
  handleBack: () => void;
  handleSkipOrDismiss: () => Promise<void>;
  handleFinishSend: (bypassConfirm?: boolean) => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextProps | undefined>(undefined);

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();
  const { isOpen, startAtStep, closeOnboarding, openOnboarding } = useOnboardingStore();

  // Must run before the state initializers below read the draft from localStorage,
  // so a previous account's draft never leaks into this user's onboarding.
  claimOnboardingDraftForUser(user?.id);

  const [step, setStep] = useState(1);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 640 : false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
  const [createdDueDate, setCreatedDueDate] = useState<string | undefined>(undefined);

  // Form States - Step 1: Personalization
  const [businessType, setBusinessType] = useState("");
  const [customBusinessType, setCustomBusinessType] = useState("");
  const [orgSize, setOrgSize] = useState("");
  const [role, setRole] = useState("");
  const [enabledModules, setEnabledModules] = useState("");

  // New persistent state hooks
  const [businessName, setBusinessName] = useState(() => {
    return localStorage.getItem("tari1-onboarding-businessName") || "";
  });
  const [businessPhone, setBusinessPhone] = useState(() => {
    return localStorage.getItem("tari1-onboarding-businessPhone") || "";
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
  const [showBankAccordion, setShowBankAccordion] = useState(false);
  const [activeStep4Tab, setActiveStep4Tab] = useState<"bank" | "preview">(isBankConnected ? "preview" : "bank");
  const [activeItemIndexStep3, setActiveItemIndexStep3] = useState<number>(0);

  // Track which steps the user has completed (as a Set of step numbers)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(() => {
    const saved = localStorage.getItem("tari1-onboarding-completedSteps");
    if (saved) {
      try {
        return new Set(JSON.parse(saved) as number[]);
      } catch {
        /* ignore */
      }
    }
    return new Set<number>();
  });

  // Form States - Client details
  const [clientType, setClientType] = useState<"individual" | "business">(
    (localStorage.getItem("tari1-onboarding-clientType") as "individual" | "business") || "business"
  );
  const [clientName, setClientName] = useState(() => {
    return localStorage.getItem("tari1-onboarding-clientName") || "";
  });
  const [clientEmail, setClientEmail] = useState(() => {
    return localStorage.getItem("tari1-onboarding-clientEmail") || "";
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
  // VAT defaults live on the organization (same field Settings → Invoice
  // Defaults edits); the draft only carries in-progress edits, and finishing
  // onboarding writes back to the org so both UIs share one source of truth.
  const [vatEnabled, setVatEnabled] = useState(() => {
    const saved = localStorage.getItem("tari1-onboarding-vatEnabled");
    if (saved !== null) return saved === "true";
    const org = useAuthStore.getState().user?.organization;
    return org?.vatEnabled ?? true;
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [taxRate, setTaxRate] = useState(() => {
    const saved = localStorage.getItem("tari1-onboarding-taxRate");
    if (saved !== null) return Number(saved);
    const org = useAuthStore.getState().user?.organization;
    return org?.taxRate != null ? Number(org.taxRate) : 7.5;
  });
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">((localStorage.getItem("tari1-onboarding-discountType") as "PERCENTAGE" | "FIXED") || "PERCENTAGE");
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
      { label: "Payment 1", percentage: 75 },
      { label: "Payment 2", percentage: 25 },
    ];
  });

  // Form States - Billing details & defaults
  const [paymentTerms, setPaymentTerms] = useState(() => {
    return localStorage.getItem("tari1-onboarding-paymentTerms") || "";
  });
  const [invoiceNotes, setInvoiceNotes] = useState(() => {
    return localStorage.getItem("tari1-onboarding-invoiceNotes") || "";
  });

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
        description: "",
        quantity: 1,
        unitPrice: 0,
        type: "service",
      },
    ];
  });

  // Persistent state updates effect
  useEffect(() => {
    localStorage.setItem("tari1-onboarding-businessName", businessName);
    localStorage.setItem("tari1-onboarding-businessPhone", businessPhone);
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
    businessPhone,
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

  // Automatically check and rename split items consistently (Payment 1, Payment 2, etc.) when added or removed
  useEffect(() => {
    let changed = false;
    const updated = installments.map((inst, i) => {
      const expectedLabel = `Payment ${i + 1}`;
      if (inst.label !== expectedLabel) {
        changed = true;
        return { ...inst, label: expectedLabel };
      }
      return inst;
    });
    if (changed && installments.length > 0) {
      setInstallments(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installments.length]);

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
    queryFn: async (): Promise<Bank[]> => {
      const response = await apiClient.get("/paystack/banks");
      return response.data.data;
    },
    enabled: isOpen || !!(user && !user.organization?.businessType && !isDismissed),
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

  // Org-level only — this reflects whether the BUSINESS has been set up, not whether the
  // current user has. Invited staff/admins never get a `businessRole` seeded on invite, so
  // gating on `user.businessRole` here would show this survey to every invited teammate
  // forever, even after the org owner already completed it.
  const isPersonalized =
    !!(user?.organization?.businessType &&
    user?.organization?.organizationSize);

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
        if (org.enabledModules && !enabledModules) {
          setEnabledModules(org.enabledModules);
        }
        if (org.name && !businessName && !localStorage.getItem("tari1-onboarding-businessName")) {
          setBusinessName(org.name);
        }
        if (org.phone && !businessPhone && !localStorage.getItem("tari1-onboarding-businessPhone")) {
          setBusinessPhone(org.phone);
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
  }, [user, role, businessType, orgSize, enabledModules, businessName, businessPhone, companyAddress, logoPreviewUrl, logoFile, paymentTerms, invoiceNotes]);

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
      toast.dismiss();
      toast.success("Account details verified successfully", { duration: 2000 });
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
      posthog.capture("onboarding_bank_connected");
      toast.dismiss();
      toast.success("Payout bank connected successfully", { duration: 2000 });

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
    setActiveItemIndexStep3(billingItems.length);
    setShowAdvanced(false);
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
    toast.dismiss();
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
        if (businessPhone.trim()) {
          payload.phone = businessPhone.trim();
        }
        if (companyAddress.trim()) {
          payload.address = companyAddress.trim();
        }
        // Backfill the org contact email from the account email for orgs created before it was set at registration
        if (!user?.organization?.email && user?.email) {
          payload.email = user.email;
        }
        await organizationsApi.updateCurrent(payload);
        if (logoFile) {
          await organizationsApi.uploadLogo(logoFile);
          setLogoFile(null);
        }
        posthog.capture("onboarding_org_profile_saved");
        queryClient.invalidateQueries({ queryKey: ["organization"] });
        queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
        setStep(2);
        localStorage.setItem("tari1-onboarding-step", "2");
        setCompletedSteps((prev) => {
          const next = new Set(prev);
          next.add(1);
          localStorage.setItem("tari1-onboarding-completedSteps", JSON.stringify([...next]));
          return next;
        });
      } catch (err) {
        const error = err as { response?: { data?: { message?: string } } };
        const msg = error.response?.data?.message || "Failed to save branding details";
        toast.error("Error saving business profile", { description: msg });
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
      localStorage.setItem("tari1-onboarding-step", "3");
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        next.add(2);
        localStorage.setItem("tari1-onboarding-completedSteps", JSON.stringify([...next]));
        return next;
      });
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
      localStorage.setItem("tari1-onboarding-step", "4");
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        next.add(3);
        localStorage.setItem("tari1-onboarding-completedSteps", JSON.stringify([...next]));
        return next;
      });
    }
  };

  const handleBack = () => {
    toast.dismiss();
    if (step > 1) {
      const newStep = step - 1;
      setStep(newStep);
      localStorage.setItem("tari1-onboarding-step", newStep.toString());
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

    posthog.capture("onboarding_dismissed", { step });
    setIsDismissed(true);
    closeOnboarding();
  };

  const handleFinishSend = async (bypassConfirm = false) => {
    if (!user) return;

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
      if (businessPhone.trim()) {
        orgUpdateData.phone = businessPhone.trim();
      }
      if (companyAddress.trim()) {
        orgUpdateData.address = companyAddress.trim();
      }
      if (!user?.organization?.email && user?.email) {
        orgUpdateData.email = user.email;
      }

      if (Object.keys(orgUpdateData).length > 0) {
        await organizationsApi.updateCurrent(orgUpdateData);
      }

      if (logoFile) {
        setLoadingText("Uploading company logo…");
        try {
          await organizationsApi.uploadLogo(logoFile);
        } catch (logoErr) {
          console.error("Failed to upload logo:", logoErr);
          toast.warning("Logo upload failed, but continuing setup...", {
            description: "You can upload your logo later in Settings.",
          });
        }
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
        whatsappOptIn: isWhatsapp,
      });
      posthog.capture("onboarding_client_created");

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

      posthog.capture("onboarding_invoice_created", { invoice_id: invoice.id });

      let paymentUrl: string | null = null;
      const hasPayouts = isBankConnected || user?.organization?.isPaystackVerified;
      if (hasPayouts && clientEmail) {
        setLoadingText("Initializing Paystack transaction link…");
        try {
          const linkData = await invoicesApi.generatePaymentLink(invoice.id, clientEmail, total);
          paymentUrl = linkData.paymentUrl;
        } catch (linkErr) {
          console.warn("Could not auto-generate payment link:", linkErr);
          const error = linkErr as { response?: { data?: { message?: string } } };
          const msg = error.response?.data?.message || "Verify your payment gateway configuration or account setup.";
          toast.warning("Payment link generation failed", {
            description: msg,
          });
        }
      }

      setCreatedInvoiceId(invoice.id);
      setCreatedInvoiceNumber(invoice.invoiceNumber);
      setCreatedPaymentUrl(paymentUrl || invoice.paymentUrl);
      setCreatedInvoiceTotal(total);
      setCreatedShareToken(invoice.shareToken);
      setCreatedDueDate(dueDate);

      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["service-items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });

      posthog.capture("onboarding_completed", {
        bank_connected: isBankConnected || !!user?.organization?.isPaystackVerified,
        invoice_sent: false,
      });
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

  // Only the org owner can actually submit this survey (PATCH /organizations/current and
  // PATCH /users/:id are both SUPER_ADMIN[/ADMIN]-gated on the backend) — never show it to an
  // invited teammate who'd otherwise be stuck on it with no way to complete or skip.
  const showSurvey =
    !!user?.roles.includes("SUPER_ADMIN") && !isPersonalized && (isOpen || (!isDismissed && !hasActiveUsage));
  const shouldShow = isOpen || showSurvey || showCelebration;
  const orgName = user?.organization?.name || "your business";

  return (
    <OnboardingContext.Provider
      value={{
        user,
        updateUser,
        isOpen,
        startAtStep,
        closeOnboarding,
        openOnboarding,

        step,
        setStep,
        isMobile,

        isLoading,
        setIsLoading,
        isSavingStep,
        setIsSavingStep,
        loadingText,
        setLoadingText,
        showCelebration,
        setShowCelebration,
        isDismissed,
        setIsDismissed,
        showConfirmOffline,
        setShowConfirmOffline,

        createdInvoiceId,
        setCreatedInvoiceId,
        createdInvoiceNumber,
        setCreatedInvoiceNumber,
        createdPaymentUrl,
        setCreatedPaymentUrl,
        createdInvoiceTotal,
        setCreatedInvoiceTotal,
        createdShareToken,
        setCreatedShareToken,
        createdDueDate,
        setCreatedDueDate,

        businessType,
        setBusinessType,
        customBusinessType,
        setCustomBusinessType,
        orgSize,
        setOrgSize,
        enabledModules,
        setEnabledModules,
        role,
        setRole,

        businessName,
        setBusinessName,
        businessPhone,
        setBusinessPhone,
        companyAddress,
        setCompanyAddress,
        logoFile,
        setLogoFile,
        logoPreviewUrl,
        setLogoPreviewUrl,

        bankCode,
        setBankCode,
        accountNumber,
        setAccountNumber,
        verifiedAccountName,
        setVerifiedAccountName,
        isVerifyingBank,
        isSavingBank,
        isBankConnected,
        setIsBankConnected,
        showBankAccordion,
        setShowBankAccordion,
        activeStep4Tab,
        setActiveStep4Tab,

        activeItemIndexStep3,
        setActiveItemIndexStep3,
        completedSteps,
        setCompletedSteps,

        clientType,
        setClientType,
        clientName,
        setClientName,
        clientEmail,
        setClientEmail,
        clientPhone,
        setClientPhone,
        clientAddress,
        setClientAddress,
        isWhatsapp,
        setIsWhatsapp,

        vatEnabled,
        setVatEnabled,
        showAdvanced,
        setShowAdvanced,
        taxRate,
        setTaxRate,
        discountType,
        setDiscountType,
        discountPercent,
        setDiscountPercent,
        enableInstallments,
        setEnableInstallments,
        installments,
        setInstallments,

        paymentTerms,
        setPaymentTerms,
        invoiceNotes,
        setInvoiceNotes,

        billingItems,
        setBillingItems,

        banks,
        subtotal,
        discountAmount,
        afterDiscount,
        vatRate,
        vatAmount,
        total,
        installmentsTotal,
        isPersonalized,
        hasActiveUsage,
        showSurvey,
        shouldShow,
        orgName,

        handleLogoFile,
        clearOnboardingLocalStorage,
        handleVerifyBank,
        handleSaveBank,
        handleAddItem,
        handleRemoveItem,
        handleUpdateItem,
        handleNext,
        handleBack,
        handleSkipOrDismiss,
        handleFinishSend,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
};
