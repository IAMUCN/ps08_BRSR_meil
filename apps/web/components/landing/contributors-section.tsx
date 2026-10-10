import { User, Compass, Users2, ShieldCheck, Handshake, FileBarChart } from "lucide-react";

const roles = [
  {
    title: "Project Manager",
    icon: User,
  },
  {
    title: "EHS /\nEnvironment",
    icon: Compass,
  },
  {
    title: "HR\nWorkforce",
    icon: Users2,
  },
  {
    title: "Finance\nCSR",
    icon: ShieldCheck,
  },
  {
    title: "Procurement\nSuppliers",
    icon: Handshake,
  },
  {
    title: "Corporate ESG\nReporting",
    icon: FileBarChart,
  },
];

export function ContributorsSection() {
  return (
    <section id="governance" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        
        {/* Section Heading */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#313490]/10 text-[#313490] text-xs font-bold uppercase tracking-wider mb-2">
            Multi-Tier Governance
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#333333] tracking-tight">
            Built for Every Contributor
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-2">
            Tailored document collection for operational roles across MEIL&apos;s 28 subsidiaries and projects.
          </p>
        </div>

        {/* 6 Role Cards in a Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
          {roles.map((role, idx) => {
            const Icon = role.icon;
            return (
              <div
                key={idx}
                className="bg-[#f0f9ff]/70 border border-sky-100 rounded-2xl p-6 flex flex-col items-center text-center shadow-xs hover:shadow-md hover:bg-white hover:border-[#313490]/30 transition-all group h-[170px] justify-between"
              >
                <div className="w-12 h-12 rounded-xl bg-white border border-sky-200/60 shadow-xs flex items-center justify-center text-[#313490] group-hover:scale-105 transition-transform">
                  <Icon className="w-6 h-6 stroke-[2]" />
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug whitespace-pre-line">
                  {role.title}
                </h3>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
