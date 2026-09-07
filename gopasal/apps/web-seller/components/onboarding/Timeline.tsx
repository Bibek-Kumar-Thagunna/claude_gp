import * as React from "react";
import { History } from "lucide-react";
import { Card } from "@/components/primitives";
import { SectionTitle } from "./fields";
import type { TimelineEntry } from "@/lib/api/types";
import { fullDateTime, timelineLabel } from "@/lib/onboarding-view";

/**
 * Everything that has happened to this application, as the API recorded it.
 *
 * The entries are the server's own audit trail — including the ones written by a
 * reviewer — so this is also the seller's evidence of what was asked and when.
 * Nothing is synthesised here; an empty list means the API sent none.
 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <Card className="space-y-4 p-5">
      <SectionTitle icon={<History className="h-4 w-4" />} title="History" />
      <ol className="relative space-y-4 border-l border-ink-100 pl-5">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span
              className="absolute -left-[1.4375rem] top-1.5 h-2 w-2 rounded-full bg-crimson-300"
              aria-hidden
            />
            <p className="text-sm font-medium text-ink-800">{timelineLabel(entry.type)}</p>
            {entry.message && (
              <p className="mt-0.5 whitespace-pre-line text-sm text-ink-500">{entry.message}</p>
            )}
            <p className="mt-0.5 text-xs text-ink-400">{fullDateTime(entry.at)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
