"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

export async function mintCreditAction(input: {
  orgUnitId: string;
  projectName: string;
  registry:
    "CCTS_INDIA" | "VERRA_VCS" | "GOLD_STANDARD" | "I_REC" | "BEE_ESCERT" | "INTERNAL_SHADOW";
  registryProjectId: string;
  serialNumberStart: string;
  serialNumberEnd: string;
  quantityTco2e: number;
  vintageYear: number;
  methodologyCode: string;
  creditType: string;
  issuanceDate: string;
  verifierName: string;
  notes?: string;
}) {
  return runAction((api) => api.carbonCredits.mint(input));
}

export async function retireCreditAction(input: {
  creditId: string;
  quantityTco2e: number;
  reportingPeriodId: string;
  beneficiaryOrgUnitId: string;
  targetScope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
  retirementReason: string;
}) {
  return runAction((api) => api.carbonCredits.retire(input));
}

export async function transferCreditAction(input: {
  creditId: string;
  quantityTco2e: number;
  counterpartyName: string;
  counterpartyRegistryAccount: string;
  notes?: string;
}) {
  return runAction((api) => api.carbonCredits.transfer(input));
}

export async function getReconciliationAction(input: {
  orgUnitId: string;
  reportingPeriodId?: string;
}) {
  return runAction((api) => api.carbonCredits.reconciliation(input));
}

export async function getSummaryAction(input?: { orgUnitId?: string }) {
  return runAction((api) => api.carbonCredits.summary(input));
}

export async function listBatchesAction(input?: {
  orgUnitId?: string;
  status?: "MINTED" | "HELD" | "TRANSFERRED" | "RETIRED";
  registry?:
    "CCTS_INDIA" | "VERRA_VCS" | "GOLD_STANDARD" | "I_REC" | "BEE_ESCERT" | "INTERNAL_SHADOW";
  vintageYear?: number;
}) {
  return runAction((api) => api.carbonCredits.list(input));
}

export async function evaluateCapexAction(input: {
  orgUnitId: string;
  projectName: string;
  baselineAnnualEmissionsTco2e: number;
  projectedAnnualEmissionsTco2e: number;
  capexAmount: number;
  operationalAnnualSavings: number;
  projectLifespanYears: number;
  discountRatePercent?: number;
}) {
  return runAction((api) => api.carbonCredits.evaluateCapex(input));
}

export async function createIcpAction(input: {
  orgUnitId: string;
  effectiveFrom: string;
  shadowPricePerTco2e: number;
  currency?: string;
  priceType?: "SHADOW_PRICE" | "INTERNAL_FEE" | "IMPLICIT_PRICE";
  appliesToScopes?: string[];
  sourceRational: string;
}) {
  return runAction((api) => api.carbonCredits.icpCreate(input));
}

// Carbon-credit links (feature_enhancement.md 6.3). Super Admin only, checked again by each procedure.
type LinkFields = {
  name: string;
  url: string;
  description: string;
  kind: "india_official" | "exchange" | "registry";
  position?: number;
};

export async function createCarbonLinkAction(input: LinkFields) {
  const result = await runAction((api) => api.carbonLinks.create(input));
  if (result.ok) revalidatePath("/admin/carbon-credits");
  return result;
}

export async function updateCarbonLinkAction(input: LinkFields & { id: string; active: boolean }) {
  const result = await runAction((api) => api.carbonLinks.update(input));
  if (result.ok) revalidatePath("/admin/carbon-credits");
  return result;
}

export async function removeCarbonLinkAction(input: { id: string }) {
  const result = await runAction((api) => api.carbonLinks.remove(input));
  if (result.ok) revalidatePath("/admin/carbon-credits");
  return result;
}

export async function checkCarbonLinksAction() {
  const result = await runAction((api) => api.carbonLinks.check());
  if (result.ok) revalidatePath("/admin/carbon-credits");
  return result;
}
