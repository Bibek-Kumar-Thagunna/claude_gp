"use client";

import * as React from "react";
import { LockKeyhole, Play, RefreshCcw, ShieldCheck } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { useCan } from "@/components/providers";
import { Badge, Button, Card, PageHeader, TableWrap, Td, Th } from "@/components/primitives";
import { privacyApi, type PrivacyOverview } from "@/lib/api/privacy";

const input = "w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-crimson-400 focus:ring-2 focus:ring-crimson-100";
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function PrivacyPage() {
  return <PermissionGate perm="privacy.view"><PrivacyWorkspace /></PermissionGate>;
}

function PrivacyWorkspace() {
  const can = useCan();
  const manage = can("privacy.manage");
  const [data, setData] = React.useState<PrivacyOverview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [days, setDays] = React.useState(1830);
  const [legalBasis, setLegalBasis] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [holdReason, setHoldReason] = React.useState("");
  const [holdExpiry, setHoldExpiry] = React.useState("");
  const [releaseId, setReleaseId] = React.useState<string | null>(null);
  const [releaseReason, setReleaseReason] = React.useState("");
  const [confirmRun, setConfirmRun] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const next = await privacyApi.overview();
    setData(next);
    setDays(next.policy?.days ?? 1830);
    setLegalBasis(next.policy?.legalBasis ?? "");
  }, []);

  React.useEffect(() => {
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load privacy status"));
  }, [refresh]);

  async function act(work: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      await refresh();
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  return <>
    <PageHeader
      icon={<ShieldCheck className="h-5 w-5" />}
      title="Privacy & retention"
      subtitle="Review deletion progress, preserve records under a legal hold, and remove expired personal snapshots."
      actions={<Button variant="outline" onClick={() => void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Refresh failed"))}><RefreshCcw className="h-4 w-4" /> Refresh</Button>}
    />
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!data ? <Card className="p-8 text-sm text-ink-500">Loading privacy status…</Card> : <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Past deadline (incl. holds)", data.counts.due],
          ["Pending expiry", data.counts.pending],
          ["Snapshots redacted", data.counts.purged],
          ["Active legal holds", data.counts.activeHolds],
          ["Private files pending", data.counts.objectsPending],
        ].map(([label, value]) => <Card key={label} className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p><p className="mt-2 text-3xl font-extrabold text-ink-900">{value}</p></Card>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-bold text-ink-900">Retention policy</h2>
          <p className="mt-1 text-sm text-ink-500">Applies to future account deletions. Existing deadlines are not silently shortened.</p>
          <div className="mt-4 grid gap-3">
            <label className="text-sm font-semibold">Days after deletion<input className={`${input} mt-1`} type="number" min={1830} max={36500} value={days} disabled={!manage || busy} onChange={(event) => setDays(Number(event.target.value))} /></label>
            <label className="text-sm font-semibold">Legal basis and approval note<textarea className={`${input} mt-1 min-h-24`} maxLength={1000} value={legalBasis} disabled={!manage || busy} onChange={(event) => setLegalBasis(event.target.value)} /></label>
            {manage && <Button disabled={busy || days < 1830 || legalBasis.trim().length < 15 || (days === data.policy?.days && legalBasis === data.policy?.legalBasis)} onClick={() => void act(() => privacyApi.updatePolicy(days, legalBasis.trim()), "Retention policy updated for future deletions.")}>Save policy</Button>}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-900"><LockKeyhole className="h-4 w-4" /> Place a legal hold</h2>
          <p className="mt-1 text-sm text-ink-500">A hold blocks account deletion or expiry-time redaction. Record a specific case reason; release it when preservation is no longer required.</p>
          {manage ? <form className="mt-4 grid gap-3" onSubmit={(event) => {
            event.preventDefault();
            void act(() => privacyApi.placeHold(userId.trim(), holdReason.trim(), holdExpiry ? new Date(holdExpiry).toISOString() : undefined), "Legal hold placed.").then((ok) => { if (ok) { setUserId(""); setHoldReason(""); setHoldExpiry(""); } });
          }}>
            <label className="text-sm font-semibold">User ID<input className={`${input} mt-1`} minLength={8} maxLength={100} required value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Copy from Users" /></label>
            <label className="text-sm font-semibold">Preservation reason<textarea className={`${input} mt-1 min-h-20`} minLength={15} maxLength={1000} required value={holdReason} onChange={(event) => setHoldReason(event.target.value)} placeholder="Case reference, authority, and why this record must be preserved" /></label>
            <label className="text-sm font-semibold">Expiry (optional)<input className={`${input} mt-1`} type="datetime-local" value={holdExpiry} onChange={(event) => setHoldExpiry(event.target.value)} /></label>
            <Button disabled={busy || userId.trim().length < 8 || holdReason.trim().length < 15}>Place hold</Button>
          </form> : <p className="mt-4 text-sm text-ink-500">You have read-only privacy access.</p>}
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div><h2 className="text-base font-bold text-ink-900">Erasure lifecycle</h2><p className="mt-1 text-xs text-ink-500">Due requests first, then recent history · direct account details are anonymised immediately; retained snapshots wait until their deadline.</p></div>
          {manage && (confirmRun ? <div className="flex gap-2"><Button disabled={busy} onClick={() => void act(() => privacyApi.run(), "Retention batch finished. Check its run record for item failures.").then((ok) => { if (ok) setConfirmRun(false); })}>Confirm run</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmRun(false)}>Cancel</Button></div> : <Button variant="outline" disabled={busy} onClick={() => setConfirmRun(true)}><Play className="h-4 w-4" /> Run due batch</Button>)}
        </div>
        <TableWrap><thead><tr><Th>User ID</Th><Th>Requested</Th><Th>Eligible</Th><Th>Status</Th><Th>Attempt</Th></tr></thead><tbody>
          {data.requests.map((row) => <tr key={row.id}><Td><span className="font-mono text-xs">{row.userId}</span></Td><Td>{date(row.requestedAt)}</Td><Td>{date(row.purgeEligibleAt)}</Td><Td><Badge tone={row.status === "PURGED" ? "green" : new Date(row.purgeEligibleAt).getTime() <= now ? "marigold" : "ink"}>{row.status === "PURGED" ? "Completed" : row.status === "PURGING" ? "File cleanup pending" : "Waiting"}</Badge></Td><Td>{row.attempts}{row.lastError && <span className="block max-w-64 text-xs text-red-700">{row.lastError}</span>}</Td></tr>)}
          {!data.requests.length && <tr><Td colSpan={5}>No account-deletion requests yet.</Td></tr>}
        </tbody></TableWrap>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden"><div className="p-5"><h2 className="text-base font-bold text-ink-900">Legal holds</h2><p className="mt-1 text-xs text-ink-500">Latest 100 holds, including released records.</p></div><div className="space-y-2 px-5 pb-5">
          {data.holds.map((hold) => {
            const active = !hold.releasedAt && (!hold.expiresAt || new Date(hold.expiresAt).getTime() > now);
            return <div key={hold.id} className="rounded-xl border border-ink-100 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs">{hold.subjectId}</span><Badge tone={active ? "red" : "ink"}>{active ? "Active" : hold.releasedAt ? "Released" : "Expired"}</Badge></div><p className="mt-2 text-ink-800">{hold.reason}</p><p className="mt-1 text-xs text-ink-500">Placed {date(hold.placedAt)} · expires {date(hold.expiresAt)}</p>{manage && active && <div className="mt-3">{releaseId === hold.id ? <div className="flex flex-col gap-2 sm:flex-row"><input className={input} minLength={10} maxLength={1000} value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} placeholder="Reason for releasing the hold" /><Button disabled={busy || releaseReason.trim().length < 10} onClick={() => void act(() => privacyApi.releaseHold(hold.id, releaseReason.trim()), "Legal hold released.").then((ok) => { if (ok) { setReleaseId(null); setReleaseReason(""); } })}>Release</Button><Button variant="outline" onClick={() => setReleaseId(null)}>Cancel</Button></div> : <Button size="sm" variant="outline" onClick={() => setReleaseId(hold.id)}>Release hold</Button>}</div>}</div>;
          })}
          {!data.holds.length && <p className="py-6 text-center text-sm text-ink-500">No legal holds.</p>}
        </div></Card>
        <Card className="overflow-hidden"><div className="p-5"><h2 className="text-base font-bold text-ink-900">Processing history</h2><p className="mt-1 text-xs text-ink-500">The scheduled worker runs hourly; each run handles up to 100 erasures and 100 private files.</p></div><div className="space-y-2 px-5 pb-5">
          {data.runs.map((run) => <div key={run.id} className="rounded-xl border border-ink-100 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{run.source === "MANUAL" ? "Manual" : "Scheduled"} · {date(run.startedAt)}</strong><Badge tone={run.status === "FAILED" ? "red" : run.status === "COMPLETED" && !run.failed && !run.objectFailed ? "green" : "marigold"}>{run.status === "COMPLETED" && (run.failed || run.objectFailed) ? "Completed with item failures" : run.status}</Badge></div><p className="mt-1 text-xs text-ink-500">Erasures: scanned {run.scanned} · redacted {run.purged} · held {run.held} · failed {run.failed}</p><p className="mt-1 text-xs text-ink-500">Private files: removed {run.objectsRemoved} · held {run.objectHeld} · failed {run.objectFailed}</p>{run.error && <p className="mt-1 text-xs text-red-700">{run.error}</p>}</div>)}
          {!data.runs.length && <p className="py-6 text-center text-sm text-ink-500">No retention runs yet.</p>}
        </div></Card>
      </div>
      <Card className="mt-5 overflow-hidden">
        <div className="p-5"><h2 className="text-base font-bold text-ink-900">Private evidence cleanup</h2><p className="mt-1 text-xs text-ink-500">KYC files from deleted draft, rejected or withdrawn applications. {data.counts.objectsFailed} pending file{data.counts.objectsFailed === 1 ? " has" : "s have"} a recorded failure.</p></div>
        <TableWrap><thead><tr><Th>User ID</Th><Th>Queued</Th><Th>Attempts</Th><Th>Last error</Th></tr></thead><tbody>
          {data.objectDeletions.map((task) => <tr key={task.id}><Td><span className="font-mono text-xs">{task.userId}</span></Td><Td>{date(task.createdAt)}</Td><Td>{task.attempts}</Td><Td><span className={task.lastError ? "text-red-700" : "text-ink-500"}>{task.lastError ?? "Waiting for the next run"}</span></Td></tr>)}
          {!data.objectDeletions.length && <tr><Td colSpan={4}>No private evidence cleanup is pending.</Td></tr>}
        </tbody></TableWrap>
      </Card>
    </>}
  </>;
}
