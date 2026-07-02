import { useOnboarding } from "./OnboardingContext";
import { formatCurrency } from "@/lib/utils";

export function PremiumInvoicePreview() {
  const {
    user,
    businessName,
    companyAddress,
    logoPreviewUrl,
    clientName,
    clientEmail,
    clientAddress,
    billingItems,
    subtotal,
    discountAmount,
    discountType,
    discountPercent,
    vatRate,
    vatAmount,
    total,
    enableInstallments,
    installments,
    paymentTerms,
    invoiceNotes,
  } = useOnboarding();

  return (
    <div className="p-5 sm:p-6 rounded-[24px] bg-[#f8f9ff] border border-[#c4c5d7]/20 relative overflow-hidden text-slate-800 shadow-[0px_12px_32px_rgba(0,55,176,0.04)]">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div className="text-left">
          {logoPreviewUrl || user?.organization?.logo ? (
            <img
              src={logoPreviewUrl || user?.organization?.logo}
              alt="Logo"
              className="h-10 max-w-[140px] object-contain rounded-xl mb-3 bg-white p-1 shadow-[0_4px_12px_rgba(0,0,0,0.02)]"
            />
          ) : (
            <h4 className="text-sm sm:text-base font-bold text-[#0037b0] uppercase tracking-tight">
              {businessName || user?.organizationName}
            </h4>
          )}
          <p className="text-xs text-slate-500 font-semibold mt-1 whitespace-pre-wrap max-w-[220px] leading-relaxed">
            {companyAddress.trim() || user?.organization?.address || "Lagos, Nigeria"}
          </p>
        </div>
        <div className="text-left sm:text-right w-full sm:w-auto flex sm:flex-col justify-between sm:justify-start items-center sm:items-end gap-2">
          <span className="text-xs font-bold text-[#006c49] bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-wider">
            Draft
          </span>
          <p className="text-xs text-slate-400 font-bold sm:mt-1">INV-001 (Preview)</p>
        </div>
      </div>

      <div className="pt-4 mb-6 text-left border-t border-slate-200/40">
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Billed To</p>
        <p className="text-sm font-bold text-slate-800">{clientName || "Client Name"}</p>
        {clientEmail && <p className="text-xs text-slate-500 font-medium mt-0.5">{clientEmail}</p>}
        {clientAddress.trim() && (
          <p className="text-xs text-slate-500 font-medium mt-1 whitespace-pre-wrap max-w-[240px] leading-relaxed">
            {clientAddress.trim()}
          </p>
        )}
      </div>

      {/* Table-free responsive billing items */}
      <div className="space-y-2 mb-6 bg-white p-4 rounded-[20px] border border-[#c4c5d7]/20">
        <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-bold pb-2 text-slate-400 uppercase tracking-wider border-b border-slate-50">
          <span className="col-span-8 text-left">Description</span>
          <span className="col-span-1 text-center">Qty</span>
          <span className="col-span-3 text-right">Total</span>
        </div>
        
        {billingItems.map((item, idx) => (
          <div 
            key={item.id} 
            className={`flex flex-col sm:grid sm:grid-cols-12 gap-2 p-3 sm:p-2 rounded-xl text-left ${
              idx % 2 === 0 ? "bg-[#f8f9ff]/50" : "bg-white"
            }`}
          >
            <div className="col-span-8 flex items-start sm:items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-700 leading-normal break-words">
                {item.description || "Untitled item"}
              </span>
            </div>
            
            <div className="col-span-1 text-xs text-slate-500 font-semibold sm:text-center flex sm:block justify-between items-center mt-1 sm:mt-0">
              <span className="sm:hidden text-[10px] text-slate-400 uppercase tracking-wider font-bold">Quantity</span>
              <span className="tabular-nums font-bold text-slate-700">{item.quantity}</span>
            </div>
            
            <div className="col-span-3 text-xs sm:text-sm text-[#121c28] font-bold sm:text-right flex sm:block justify-between items-center mt-1 sm:mt-0 border-t border-dashed border-slate-100 sm:border-0 pt-1.5 sm:pt-0">
              <span className="sm:hidden text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total</span>
              <span className="tabular-nums font-bold text-slate-800">{formatCurrency(item.quantity * item.unitPrice)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-end gap-2.5 pt-4 border-t border-slate-200/40">
        <div className="flex justify-between w-full max-w-[200px] text-xs font-semibold text-slate-500">
          <span>Subtotal:</span>
          <span className="tabular-nums font-bold text-[#121c28]">{formatCurrency(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between w-full max-w-[200px] text-xs font-semibold text-[#006c49]">
            <span>Discount {discountType === "PERCENTAGE" ? `(${discountPercent}%)` : ""}:</span>
            <span className="tabular-nums font-bold">-{formatCurrency(discountAmount)}</span>
          </div>
        )}
        {vatRate > 0 && (
          <div className="flex justify-between w-full max-w-[200px] text-xs font-semibold text-slate-500">
            <span>VAT ({vatRate}%):</span>
            <span className="tabular-nums font-bold text-[#121c28]">{formatCurrency(vatAmount)}</span>
          </div>
        )}
        <div className="flex justify-between w-full max-w-[220px] text-sm sm:text-base font-bold border-t border-slate-200/40 pt-2.5">
          <span className="text-[#0037b0]">Amount Due:</span>
          <span className="tabular-nums text-slate-900 font-bold">{formatCurrency(total)}</span>
        </div>
      </div>

      {enableInstallments && (
        <div className="pt-4 mt-4 w-full animate-in fade-in duration-200 border-t border-slate-200/40">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3 text-left">Payment Schedule</p>
          <div className="space-y-2">
            {installments.map((inst, index) => (
              <div key={index} className="flex justify-between items-center text-xs font-bold text-slate-700 bg-white p-3 rounded-xl border border-[#c4c5d7]/20 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#0037b0]" />
                  <span>{inst.label}</span>
                  <span className="text-slate-400 font-semibold text-[10px]">({inst.percentage}%)</span>
                </span>
                <span className="tabular-nums text-slate-900 font-bold">{formatCurrency(total * ((inst.percentage || 0) / 100))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(paymentTerms || invoiceNotes) && (
        <div className="pt-4 mt-4 text-left space-y-3 border-t border-slate-200/40">
          {paymentTerms && (
            <div className="bg-[#f8f9ff] p-3 rounded-xl border-l-2 border-[#0037b0]">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Terms</p>
              <p className="text-xs text-slate-600 font-semibold mt-0.5 leading-normal">{paymentTerms}</p>
            </div>
          )}
          {invoiceNotes && (
            <div className="bg-[#f8f9ff] p-3 rounded-xl border-l-2 border-slate-300">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Notes</p>
              <p className="text-xs text-slate-600 font-semibold mt-0.5 leading-normal">{invoiceNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
