import { StatusBadge } from "@/components/ui/status-badge";
import { stageOf, type Statuses } from "@/lib/records/stage";

export function StageBadge({ row }: { row: Statuses }) {
  const stage = stageOf(row);
  return <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>;
}
