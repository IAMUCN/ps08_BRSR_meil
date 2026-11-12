import { redirect } from "next/navigation";

export default async function CarbonCreditsRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ org?: string | string[]; subtab?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const org = typeof params.org === "string" ? params.org : undefined;
  const subtab = typeof params.subtab === "string" ? params.subtab : "quotation";
  redirect(`/admin/carbon-intelligence?tab=credits&subtab=${subtab}${org ? `&org=${org}` : ""}`);
}
