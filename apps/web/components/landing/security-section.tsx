import { ShieldCheck, Lock, ScrollText, GitPullRequestArrow, Layers, UserX } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { SectionHeading } from "@/components/landing/section-heading";

const ITEMS = [
  {
    icon: ShieldCheck,
    title: "Scoped by role",
    text: "Every request is checked on the server against role, organization scope and state.",
  },
  {
    icon: Lock,
    title: "Private evidence",
    text: "Source documents live in private storage and are served only to authorized users.",
  },
  {
    icon: ScrollText,
    title: "Audit log",
    text: "Each change writes an audit entry in the same transaction as the change.",
  },
  {
    icon: GitPullRequestArrow,
    title: "Approval workflow",
    text: "Return with a reason, approve, and no self-approval of your own submission.",
  },
  {
    icon: Layers,
    title: "Versioned factors",
    text: "Factors keep a source and effective dates. A version already used never changes.",
  },
  {
    icon: UserX,
    title: "Admin-provisioned",
    text: "No public sign-up. Deactivated users lose access immediately.",
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="bg-white px-3 sm:px-6 lg:px-8 py-14 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Security and control" title="Controls an auditor can inspect" />
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ icon: Icon, title, text }, i) => (
            <BlurFade inView key={title} delay={i * 0.05} className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
