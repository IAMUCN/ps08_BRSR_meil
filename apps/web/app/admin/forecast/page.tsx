import { redirect } from "next/navigation";

export default async function ForecastRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ org?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const org = typeof params.org === "string" ? params.org : undefined;
  redirect(`/admin/carbon-intelligence?tab=forecast${org ? `&org=${org}` : ""}`);
}
