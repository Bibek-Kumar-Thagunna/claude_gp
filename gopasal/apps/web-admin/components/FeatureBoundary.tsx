import { Construction, ExternalLink } from "lucide-react";
import { PageHeader, Card, Button } from "@/components/primitives";

export function FeatureBoundary({ title, reason, availableAt }: { title: string; reason: string; availableAt?: { href: string; label: string } }) {
  return <><PageHeader icon={<Construction className="h-5 w-5" />} title={title} subtitle="Intentionally unavailable in this demo build" /><Card className="max-w-2xl p-6"><h2 className="font-bold text-ink-900">No simulated platform data is shown here</h2><p className="mt-2 text-sm leading-6 text-ink-600">{reason}</p>{availableAt && <Button href={availableAt.href} variant="outline" className="mt-5">{availableAt.label} <ExternalLink className="h-4 w-4" /></Button>}</Card></>;
}
