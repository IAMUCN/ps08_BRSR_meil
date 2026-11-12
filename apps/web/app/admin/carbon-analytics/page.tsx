import { redirect } from "next/navigation";

export default async function CarbonAnalyticsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ org?: string | string[] }>;
}) {
  const params = await searchParams;
  const org = typeof params.org === "string" ? params.org : undefined;
  redirect(`/admin/carbon-intelligence?tab=overview${org ? `&org=${org}` : ""}`);
}
