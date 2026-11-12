import { redirect } from "next/navigation";

export default async function SimulatorRedirect({
  searchParams,
}: {
  searchParams?: Promise<{
    org?: string;
    fromForecast?: string;
    forecastTco2e?: string;
    scope?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : {};
  const qs = new URLSearchParams();
  qs.set("tab", "simulator");
  if (params.org) qs.set("org", params.org);
  if (params.fromForecast) qs.set("fromForecast", params.fromForecast);
  if (params.forecastTco2e) qs.set("forecastTco2e", params.forecastTco2e);
  if (params.scope) qs.set("scope", params.scope);
  redirect(`/admin/carbon-intelligence?${qs.toString()}`);
}
