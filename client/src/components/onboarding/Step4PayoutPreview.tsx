import { HugeiconsIcon } from "@hugeicons/react";
import {
  Store04Icon,
  CheckmarkCircle02Icon,
  Invoice03Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOnboarding } from "./OnboardingContext";
import { PremiumInvoicePreview } from "./PremiumInvoicePreview";

export function Step4PayoutPreview() {
  const {
    isBankConnected,
    setIsBankConnected,
    verifiedAccountName,
    setVerifiedAccountName,
    accountNumber,
    setAccountNumber,
    bankCode,
    setBankCode,
    banks,
    showBankAccordion,
    setShowBankAccordion,
    isVerifyingBank,
    isSavingBank,
    handleVerifyBank,
    handleSaveBank,
    activeStep4Tab,
    setActiveStep4Tab,
  } = useOnboarding();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Accordion Wrapper */}
      <div className="lg:space-y-6 space-y-4">
        
        {/* Panel 1: Payout Bank Setup */}
        <div className="rounded-[24px] border border-slate-100/60 bg-white shadow-[0_12px_32px_rgba(0,55,176,0.06)] relative z-50">
          {/* Header button (collapsible on mobile, static on desktop) */}
          <button
            type="button"
            onClick={() => {
              setActiveStep4Tab(activeStep4Tab === "bank" ? "preview" : "bank");
            }}
            className="w-full flex items-center justify-between p-4 bg-slate-50/50 lg:pointer-events-none lg:bg-transparent border-0 select-none text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Store04Icon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
              <span className="text-xs sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Payout Bank
              </span>
            </div>
            <div className="lg:hidden text-slate-400">
              <HugeiconsIcon icon={activeStep4Tab === "bank" ? ArrowUp01Icon : ArrowDown01Icon} size={18} strokeWidth={2} />
            </div>
          </button>

          {/* Content panel */}
          <div className={cn(
            "p-4 pt-0 lg:pt-4 border-t border-slate-100 lg:border-t-0 animate-in fade-in slide-in-from-top-2 duration-200",
            activeStep4Tab === "bank" ? "block" : "hidden lg:block"
          )}>
            <div className="space-y-4">
              <div className="lg:hidden pt-4">
                <span className="text-xs sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-left">
                  How should clients pay you?
                </span>
              </div>
              
              {isBankConnected ? (
                <div className="p-4 bg-[#006c49]/5 border border-[#006c49]/15 rounded-[20px] flex items-center justify-between shadow-[0px_8px_24px_rgba(0,108,73,0.02)] text-left">
                  <div>
                    <p className="text-xs sm:text-[10px] font-bold text-[#006c49] uppercase tracking-widest flex items-center gap-1.5">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} className="text-[#006c49]" strokeWidth={2.5} />
                      Payout Bank Connected
                    </p>
                    <h4 className="text-xs font-bold text-[#121c28] mt-1">
                      {verifiedAccountName || "Verified Account"}
                    </h4>
                    {accountNumber && accountNumber !== "••••••••••" && (
                      <p className="text-xs sm:text-[10px] text-slate-500 mt-0.5 font-semibold">
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
                    className="px-3 py-1.5 rounded-lg border border-[#c4c5d7]/20 hover:bg-slate-50 text-slate-600 hover:text-slate-800 text-xs sm:text-[10px] font-bold transition-all cursor-pointer min-h-[38px] bg-white active:scale-98"
                  >
                    Clear & Change
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-left pr-4">
                      <p className="text-xs font-bold text-[#121c28]">Configure Payout Bank</p>
                      <p className="text-xs sm:text-[10px] text-slate-500 font-semibold mt-0.5 leading-normal">
                        Link your settlement bank to enable online invoice payments (Cards, Bank Transfer, USSD).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBankAccordion(!showBankAccordion)}
                      className="h-10 sm:h-9 px-4 rounded-lg bg-white border border-[#c4c5d7]/20 hover:bg-[#eef4ff] text-xs sm:text-[10px] font-bold text-[#0037b0] min-h-[38px] cursor-pointer shrink-0 transition-all active:scale-98"
                    >
                      {showBankAccordion ? "Hide" : "Set Up"}
                    </button>
                  </div>

                  {showBankAccordion && (
                    <div className="pt-4 border-t border-slate-200/50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
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
                            className="flex-1 min-w-0 h-11 px-4 text-[16px] sm:text-xs rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 bg-white focus:ring-1 focus:ring-[#0037b0]"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyBank}
                            disabled={!bankCode || accountNumber.length !== 10 || isVerifyingBank}
                            className="h-11 px-4 rounded-xl border border-[#c4c5d7]/40 text-[#0037b0] hover:bg-[#eef4ff] text-xs font-bold disabled:opacity-40 min-h-[44px] cursor-pointer bg-white shrink-0"
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
              )}
            </div>
          </div>
        </div>

        {/* Panel 2: Invoice Preview */}
        <div className="rounded-[24px] border border-slate-100/60 overflow-hidden bg-white shadow-[0_12px_32px_rgba(0,55,176,0.06)]">
          {/* Header button (collapsible on mobile, static on desktop) */}
          <button
            type="button"
            onClick={() => {
              setActiveStep4Tab(activeStep4Tab === "preview" ? "bank" : "preview");
            }}
            className="w-full flex items-center justify-between p-4 bg-slate-50/50 lg:pointer-events-none lg:bg-transparent border-0 select-none text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Invoice03Icon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
              <span className="text-xs sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Invoice Preview
              </span>
            </div>
            <div className="lg:hidden text-slate-400">
              <HugeiconsIcon icon={activeStep4Tab === "preview" ? ArrowUp01Icon : ArrowDown01Icon} size={18} strokeWidth={2} />
            </div>
          </button>

          {/* Content panel */}
          <div className={cn(
            "p-4 pt-0 lg:pt-4 border-t border-slate-100 lg:border-t-0 animate-in fade-in slide-in-from-top-2 duration-200",
            activeStep4Tab === "preview" ? "block" : "hidden lg:block"
          )}>
            <PremiumInvoicePreview />
          </div>
        </div>

      </div>
    </div>
  );
}
