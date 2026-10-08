import { FileCheck, UserCheck, Calculator, Building2, ClipboardCheck } from "lucide-react";

export function TrustBadgesSection() {
  const badges = [
    {
      icon: <FileCheck className="w-6 h-6 text-blue-600" />,
      iconBg: "bg-blue-100/70 border border-blue-200/50",
      title: "Evidence-first",
      description: "Every number is linked to a source document.",
    },
    {
      icon: <UserCheck className="w-6 h-6 text-blue-600" />,
      iconBg: "bg-blue-100/70 border border-blue-200/50",
      title: "Human-verified",
      description: "AI extracts, people confirm.",
    },
    {
      icon: <Calculator className="w-6 h-6 text-amber-600" />,
      iconBg: "bg-amber-100/70 border border-amber-200/50",
      title: "Deterministic",
      description: "Regulatory calculations using standard factors.",
    },
    {
      icon: <Building2 className="w-6 h-6 text-emerald-600" />,
      iconBg: "bg-emerald-100/70 border border-emerald-200/50",
      title: "Enterprise scale",
      description: "From projects to corporate reporting.",
    },
    {
      icon: <ClipboardCheck className="w-6 h-6 text-red-600" />,
      iconBg: "bg-red-100/70 border border-red-200/50",
      title: "BRSR-ready",
      description: "Mapped to relevant BRSR indicators.",
    },
  ];

  return (
    <section className="pb-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {badges.map((badge, index) => (
            <div
              key={index}
              className="bg-[#f0f9ff]/70 border border-sky-100/90 rounded-2xl p-5 flex flex-col items-center text-center shadow-xs hover:shadow-md hover:bg-sky-50 transition-all group"
            >
              <div className={`w-12 h-12 rounded-xl ${badge.iconBg} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                {badge.icon}
              </div>
              <h3 className="text-sm font-bold text-slate-900">{badge.title}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{badge.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
