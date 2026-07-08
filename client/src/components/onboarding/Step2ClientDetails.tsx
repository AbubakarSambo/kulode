import { PhoneInput } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";
import { useOnboarding } from "./OnboardingContext";

const IS_DEV = import.meta.env.DEV;

export function Step2ClientDetails() {
  const {
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
  } = useOnboarding();

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="hidden lg:block bg-[#eef4ff]/40 p-4.5 rounded-2xl border border-[#0037b0]/5 text-left">
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
                : "text-slate-400 hover:text-slate-655 bg-transparent"
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
                : "text-slate-400 hover:text-slate-655 bg-transparent"
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
          <PhoneInput
            id="clientPhoneInput"
            value={clientPhone}
            onChange={setClientPhone}
            placeholder="803 123 4567"
          />
          {clientPhone && (
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isWhatsapp}
                onChange={(e) => setIsWhatsapp(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#0037b0] border-[#c4c5d7]/60 focus:ring-[#0037b0]"
              />
              <span className="text-[10px] text-slate-400 font-semibold">
                This client has agreed to receive invoice and payment messages from us via WhatsApp
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
  );
}
