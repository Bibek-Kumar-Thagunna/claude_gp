"use client";

import * as React from "react";
import { History, Search } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { PageHeader, TableWrap, Th, Td, SearchInput, Badge } from "@/components/primitives";
import { adminApi, type AuditWire } from "@/lib/api/admin";

export default function AuditPage() { return <PermissionGate perm="audit.view"><Audit /></PermissionGate>; }

function Audit() {
  const [rows, setRows] = React.useState<AuditWire[]>([]);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { void adminApi.audit().then((page) => setRows(page.items)).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load audit log")); }, []);
  const visible = rows.filter((row) => `${row.action} ${row.entityType} ${row.entityId ?? ""} ${row.actor?.name ?? ""} ${row.actor?.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return <><PageHeader icon={<History className="h-5 w-5" />} title="Audit log" subtitle="Append-only record of platform management actions" actions={<Badge tone="ink">{rows.length} latest entries</Badge>} />
    <SearchInput value={q} onChange={setQ} placeholder="Action, actor, entity or ID" icon={<Search className="h-4 w-4" />} className="mb-4 w-full sm:w-96" />
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <TableWrap><thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Surface</Th><Th>IP</Th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.id}><Td>{new Date(entry.createdAt).toLocaleString("en-NP")}</Td><Td>{entry.actor?.name ?? "System"}<span className="block text-xs text-ink-500">{entry.actor?.phone ?? entry.actorId ?? "—"}</span></Td><Td><strong>{entry.action}</strong></Td><Td>{entry.entityType}<span className="block max-w-48 truncate font-mono text-xs text-ink-500">{entry.entityId ?? "—"}</span></Td><Td>{entry.surface}</Td><Td className="font-mono text-xs">{entry.ip ?? "—"}</Td></tr>)}</tbody></TableWrap></>;
}
