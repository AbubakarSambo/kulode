import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  Delete02Icon,
  Settings02Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import {
  cn,
  formatCurrency,
  formatAmountInput,
  parseAmountInput,
} from "@/lib/utils";
import { useOnboarding } from "./OnboardingContext";

export function Step3BillingItems() {
  const {
    billingItems,
    activeItemIndexStep3,
    setActiveItemIndexStep3,
    isMobile,
    showAdvanced,
    setShowAdvanced,
    vatEnabled,
    setVatEnabled,
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
    total,
    installmentsTotal,
    handleAddItem,
    handleRemoveItem,
    handleUpdateItem,
  } = useOnboarding();

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="hidden lg:block bg-[#f8f9ff] p-3 rounded-2xl border border-[#0037b0]/5 text-left">
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
            <div className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center text-[10px] font-bold cursor-help transition-all">
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

        {/* Desktop Table Headers */}
        <div className="hidden sm:grid grid-cols-12 gap-4 px-6 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-left">
          <span className="col-span-2">Type</span>
          <span className="col-span-5">Description</span>
          <span className="col-span-2">Qty</span>
          <span className="col-span-2">Unit Price</span>
          <span className="col-span-1"></span>
        </div>

        <div className="space-y-4 pr-1">
          {billingItems.map((item, index) => {
            const isExpanded = activeItemIndexStep3 === index || !isMobile;
            return (
              <div
                key={item.id}
                className="bg-white border border-slate-100/60 rounded-[24px] relative shadow-[0_12px_32px_rgba(0,55,176,0.08)] text-left flex flex-col sm:grid sm:grid-cols-12 gap-5 sm:gap-4 p-5 sm:p-4 sm:items-center transition-all duration-200 animate-in fade-in"
              >
                {/* Summary Card for Mobile when collapsed */}
                {!isExpanded && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveItemIndexStep3(index);
                      setShowAdvanced(false);
                    }}
                    className="w-full flex sm:hidden justify-between items-center p-4 text-left border-0 select-none bg-transparent hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#0037b0]/5 text-[#0037b0] flex items-center justify-center text-xs font-bold shrink-0">
                        #{index + 1}
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-[#121c28] truncate">
                          {item.description || "Untitled item"}
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                          {item.quantity} x {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-700">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </span>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="text-slate-400" />
                    </div>
                  </button>
                )}

                {/* Full Form Card (always visible on desktop, conditionally visible on mobile) */}
                <div className={cn("p-5 sm:p-0 flex flex-col gap-5 sm:gap-4 sm:contents w-full", isExpanded ? "block" : "hidden sm:grid sm:grid-cols-12")}>
                  {/* Header row for Mobile */}
                  <div className="flex justify-between items-center pb-3 border-b border-slate-200/40 sm:hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Item #{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => setActiveItemIndexStep3(-1)}
                        className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold border-0 cursor-pointer"
                      >
                        Collapse
                      </button>
                    </div>
                    {billingItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          handleRemoveItem(index);
                          setActiveItemIndexStep3(0);
                        }}
                        className="w-11 h-11 rounded-xl flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer border-0 active:scale-95 transition-all"
                        aria-label="Delete item"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>

                  {/* Toggle Selector */}
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-left sm:hidden">Type</span>
                    <div className="flex w-full gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/30 h-11 items-center">
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(index, "type", "service")}
                        className={cn(
                          "h-9 text-xs font-bold rounded-lg transition-all border-0 cursor-pointer flex-1 flex items-center justify-center",
                          item.type === "service"
                            ? "bg-[#0037b0] text-white shadow-sm font-bold"
                            : "text-slate-500 hover:text-slate-700 bg-transparent"
                        )}
                      >
                        Service
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(index, "type", "product")}
                        className={cn(
                          "h-9 text-xs font-bold rounded-lg transition-all border-0 cursor-pointer flex-1 flex items-center justify-center",
                          item.type === "product"
                            ? "bg-[#0037b0] text-white shadow-sm font-bold"
                            : "text-slate-500 hover:text-slate-700 bg-transparent"
                        )}
                      >
                        Product
                      </button>
                    </div>
                  </div>

                  {/* Description Input */}
                  <div className="flex flex-col gap-1.5 sm:col-span-5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-left sm:hidden">Description</span>
                    <input
                      type="text"
                      placeholder={item.type === "service" ? "Service Description (e.g. Web Design)" : "Product Description (e.g. Office Chair)"}
                      value={item.description}
                      onChange={(e) => handleUpdateItem(index, "description", e.target.value)}
                      className="w-full h-11 px-3 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
                    />
                  </div>

                  {/* Quantity and Unit Price Wrapper for mobile spacing */}
                  <div className="grid grid-cols-12 gap-3 sm:contents">
                    {/* Quantity */}
                    <div className="flex flex-col gap-1.5 col-span-5 sm:col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-left sm:hidden">Qty</span>
                      <div className="flex items-center rounded-xl border border-[#c4c5d7]/40 bg-white overflow-hidden h-11 w-full justify-between px-1 focus-within:border-[#0037b0] focus-within:ring-1 focus-within:ring-[#0037b0] transition-all">
                        <button
                          type="button"
                          onClick={() => {
                            const currentQty = item.quantity || 1;
                            if (currentQty > 1) {
                              handleUpdateItem(index, "quantity", currentQty - 1);
                            }
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all active:scale-90 border-0 cursor-pointer text-sm font-bold select-none shrink-0"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          placeholder="1"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={item.quantity || ""}
                          onChange={(e) => handleUpdateItem(index, "quantity", Math.max(1, Number(e.target.value)))}
                          className="w-6 text-center font-bold text-slate-700 bg-transparent border-0 outline-none p-0 focus:ring-0 text-[16px] sm:text-xs min-w-0"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const currentQty = item.quantity || 1;
                            handleUpdateItem(index, "quantity", currentQty + 1);
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#0037b0]/5 hover:bg-[#0037b0]/15 text-[#0037b0] transition-all active:scale-90 border-0 cursor-pointer text-sm font-bold select-none shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Unit Price */}
                    <div className="flex flex-col gap-1.5 col-span-7 sm:col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-left sm:hidden">Unit Price</span>
                      <div className="relative">
                        <span className="absolute left-3.5 top-3 text-xs font-bold text-slate-400 select-none">
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
                          className="w-full h-11 pl-7 pr-3 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action - Delete (Desktop only) */}
                  <div className="hidden sm:flex sm:col-span-1 justify-end items-center">
                    {billingItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="w-11 h-11 rounded-xl flex items-center justify-center bg-slate-50 text-rose-500 hover:bg-rose-50 hover:text-rose-600 cursor-pointer active:scale-95 transition-all border-0"
                        aria-label="Delete item"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Collapsible Advanced Invoice Settings */}
        <div className="mt-4 border-t border-slate-200/40 pt-4 text-left">
          <button
            type="button"
            onClick={() => {
              const nextVal = !showAdvanced;
              setShowAdvanced(nextVal);
              if (nextVal) {
                setActiveItemIndexStep3(-1);
              }
            }}
            className="flex items-center justify-between w-full py-2.5 px-1 text-xs font-bold text-[#0037b0] hover:text-[#1d4ed8] cursor-pointer bg-transparent border-0 outline-none select-none transition-colors"
          >
            <span className="flex items-center gap-2">
              <HugeiconsIcon icon={Settings02Icon} size={15} />
              {showAdvanced ? "Hide Advanced Settings" : "Show Advanced Settings (VAT, Discount, Terms, Notes...)"}
            </span>
            <div className={`transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}>
              <HugeiconsIcon icon={ArrowDown01Icon} size={15} />
            </div>
          </button>
        </div>

        {showAdvanced && (
          <div className="space-y-4 pt-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* VAT Configuration Toggle */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/40 rounded-xl flex items-center justify-between mt-0 text-left">
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
            <div className="p-3.5 bg-slate-50 border border-slate-200/40 rounded-xl mt-3 flex items-center justify-between text-left">
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
            <div className="p-3.5 bg-slate-50 border border-slate-200/40 rounded-xl mt-3 space-y-3 text-left">
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
                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 sm:p-0 bg-[#f8f9ff]/50 sm:bg-transparent rounded-lg border border-slate-200/40 sm:border-0">
                      <div className="flex items-center gap-2 flex-1 w-full">
                        <input
                          type="text"
                          placeholder="Payment Label (e.g. Deposit)"
                          value={inst.label}
                          onChange={(e) => {
                            const newInst = [...installments];
                            newInst[index].label = e.target.value;
                            setInstallments(newInst);
                          }}
                          className="flex-1 min-w-0 h-8 px-2.5 text-[16px] sm:text-xs bg-white rounded-lg border border-[#c4c5d7]/40 outline-none font-semibold text-slate-700 focus:border-[#0037b0]"
                        />
                        {installments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newInst = [...installments];
                              newInst.splice(index, 1);
                              setInstallments(newInst);
                            }}
                            className="sm:hidden w-8 h-8 rounded-lg flex items-center justify-center bg-rose-50 text-rose-500 border border-rose-100 cursor-pointer text-sm font-bold shrink-0"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 justify-between sm:justify-start w-full sm:w-auto">
                        <div className="flex items-center gap-1.5 bg-white border border-[#c4c5d7]/40 rounded-lg px-2 h-8 w-20 shrink-0">
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
                            className="w-full min-w-0 text-[16px] sm:text-xs font-bold text-[#0037b0] text-center outline-none border-0 p-0 bg-transparent"
                          />
                          <span className="text-[10px] font-bold text-slate-400 select-none">%</span>
                        </div>
                        <span className="text-[11px] sm:text-[10px] font-bold text-slate-500 sm:w-20 text-right sm:shrink-0">
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
                            className="hidden sm:flex w-6 h-6 rounded-full items-center justify-center bg-white text-rose-500 border border-slate-200 cursor-pointer text-xs font-bold shrink-0"
                          >
                            &times;
                          </button>
                        )}
                      </div>
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
        )}
      </div>
    </div>
  );
}
