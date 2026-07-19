import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { useOnboarding } from "./OnboardingContext";

export function Step1BusinessProfile() {
  const {
    businessName,
    setBusinessName,
    businessPhone,
    setBusinessPhone,
    companyAddress,
    setCompanyAddress,
    logoPreviewUrl,
    setLogoPreviewUrl,
    setLogoFile,
    handleLogoFile,
  } = useOnboarding();

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="hidden lg:block space-y-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left">
          Your business identity
        </span>
        <p className="text-[11px] text-slate-500 font-medium leading-relaxed text-left">
          Confirm or update your business name, address, and logo. We will show these details at the top of your professional invoices.
        </p>
      </div>
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
          <div className="flex items-center gap-4 p-3 bg-slate-50/60 rounded-xl border border-slate-200/40 animate-in fade-in duration-200">
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
            className="flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-[#0037b0] bg-[#f8f9ff]/30 hover:bg-[#f8f9ff]/80 text-slate-400 hover:text-[#0037b0] transition-all cursor-pointer select-none group text-center"
          >
            <ImagePlus className="h-6 w-6 text-slate-400 group-hover:scale-110 group-hover:text-[#0037b0] transition-all duration-205" />
            <div className="text-xs font-bold text-slate-600 group-hover:text-slate-800">Drag logo here or click to browse</div>
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

      {/* Business Phone input */}
      <div className="space-y-2 text-left">
        <label htmlFor="businessPhoneInput" className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
          Business Phone
        </label>
        <input
          id="businessPhoneInput"
          type="tel"
          placeholder="e.g. 0803 123 4567"
          value={businessPhone}
          onChange={(e) => setBusinessPhone(e.target.value)}
          className="w-full h-11 px-4 text-[16px] sm:text-xs bg-white rounded-xl border border-[#c4c5d7]/40 focus:border-[#0037b0] outline-none font-semibold text-slate-700 focus:ring-1 focus:ring-[#0037b0]"
        />
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
  );
}
