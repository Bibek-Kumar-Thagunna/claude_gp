"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  LocateFixed,
  LockKeyhole,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  User,
} from "lucide-react";
import { Button, Container, Badge } from "@/components/primitives";
import { useAuth, useLang } from "@/components/providers";
import {
  customerApi,
  type AccountDeletionEligibility,
  type Address,
} from "@/lib/api/customer";
import { reverseGeocode } from "@/lib/api/customer";
import { PlaceSearch } from "@/components/location/PlaceSearch";

const LocationMap = dynamic(
  () => import("@/components/location/LocationMap").then((module) => module.LocationMap),
  { ssr: false, loading: () => <div className="h-[280px] animate-pulse rounded-2xl bg-ink-100" /> },
);

type AddressForm = Omit<Address, "id">;
const blankAddress = (name = "", phone = ""): AddressForm => ({
  label: "Home",
  recipientName: name,
  phone,
  area: "",
  landmark: null,
  fullAddress: "",
  lat: null,
  lng: null,
  isDefault: false,
});
const input =
  "w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-crimson-400 focus:ring-2 focus:ring-crimson-100";

export default function AccountPage() {
  const router = useRouter();
  const auth = useAuth();
  const { setLang } = useLang();
  const [profile, setProfile] = React.useState({
    name: "",
    email: "",
    locale: "en" as "en" | "np",
  });
  const [addresses, setAddresses] = React.useState<Address[]>([]);
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [showAddressMap, setShowAddressMap] = React.useState(false);
  const [address, setAddress] = React.useState<AddressForm>(blankAddress());
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [privacyBusy, setPrivacyBusy] = React.useState<"export" | "eligibility" | "code" | "delete" | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [eligibility, setEligibility] = React.useState<AccountDeletionEligibility | null>(null);
  const [deletionCode, setDeletionCode] = React.useState("");
  const [deletionReason, setDeletionReason] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [acknowledgeRetention, setAcknowledgeRetention] = React.useState(false);
  const [codeSent, setCodeSent] = React.useState(false);
  const [developmentCode, setDevelopmentCode] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const [user, rows] = await Promise.all([customerApi.profile(), customerApi.addresses()]);
    setProfile({
      name: user.name ?? "",
      email: user.email ?? "",
      locale: user.locale === "np" ? "np" : "en",
    });
    setAddresses(rows);
    return user;
  }, []);
  React.useEffect(() => {
    if (auth.status === "anonymous") {
      router.replace("/login?returnTo=%2Faccount");
      return;
    }
    if (auth.status === "authenticated")
      void load().catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load your account"),
      );
  }, [auth.status, load, router]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await customerApi.updateProfile({
        name: profile.name.trim(),
        email: profile.email.trim() || undefined,
        locale: profile.locale,
      });
      await auth.reload();
      setLang(profile.locale);
      setNotice("Profile saved across your account.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  };
  const startNew = () => {
    setAddress(blankAddress(profile.name, auth.user?.phone ?? ""));
    setShowAddressMap(false);
    setEditing("new");
    setError(null);
  };
  const startEdit = (row: Address) => {
    setAddress({ ...row });
    setShowAddressMap(false);
    setEditing(row.id);
    setError(null);
  };
  const saveAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") await customerApi.createAddress(address);
      else if (editing) await customerApi.updateAddress(editing, address);
      await load();
      setEditing(null);
      setNotice("Delivery address saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save address");
    } finally {
      setBusy(false);
    }
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser. Enter the address manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setAddress((current) => ({
          ...current,
          ...point,
        }));
        setNotice("Map pin captured. Check the written address before saving.");
        void reverseGeocode(point)
          .then((result) => {
            if (!result.address) return;
            setAddress((current) => ({
              ...current,
              area: current.area.trim() ? current.area : result.address!,
              fullAddress: current.fullAddress.trim() ? current.fullAddress : result.address!,
            }));
          })
          .catch(() => undefined);
      },
      () =>
        setError("Location permission was not granted. You can still enter the address manually."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  const makeDefault = async (id: string) => {
    setBusy(true);
    try {
      await customerApi.setDefaultAddress(id);
      await load();
      setNotice("Default address updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update default address");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (row: Address) => {
    if (!window.confirm(`Delete ${row.label}? Orders already placed keep their delivery snapshot.`))
      return;
    setBusy(true);
    try {
      await customerApi.removeAddress(row.id);
      await load();
      setNotice("Address removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove address");
    } finally {
      setBusy(false);
    }
  };

  const downloadData = async () => {
    setPrivacyBusy("export");
    setError(null);
    setNotice(null);
    try {
      const blob = await customerApi.exportMyData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `gopasal-account-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Your GoPasal data copy has been downloaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export your data");
    } finally {
      setPrivacyBusy(null);
    }
  };

  const refreshDeletionEligibility = async () => {
    setPrivacyBusy("eligibility");
    setError(null);
    try {
      setEligibility(await customerApi.deletionEligibility());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check deletion eligibility");
    } finally {
      setPrivacyBusy(null);
    }
  };

  const openDeletion = async () => {
    if (deleteOpen) {
      setDeleteOpen(false);
      return;
    }
    setDeleteOpen(true);
    await refreshDeletionEligibility();
  };

  const requestDeletionCode = async () => {
    setPrivacyBusy("code");
    setError(null);
    try {
      const result = await customerApi.requestDeletionCode();
      setCodeSent(true);
      setDevelopmentCode(result.developmentCode ?? null);
      setNotice(
        result.delivered
          ? "A deletion verification code was sent to your verified phone."
          : "The verification code was created by the configured local SMS provider.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the deletion code");
    } finally {
      setPrivacyBusy(null);
    }
  };

  const deleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (confirmation !== "DELETE MY ACCOUNT" || !acknowledgeRetention) return;
    setPrivacyBusy("delete");
    setError(null);
    try {
      await customerApi.deleteAccount({
        code: deletionCode,
        confirmation: "DELETE MY ACCOUNT",
        acknowledgeRetention: true,
        reason: deletionReason.trim() || undefined,
      });
      await auth.signOut();
      router.replace("/?account=deleted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete your account");
      try {
        setEligibility(await customerApi.deletionEligibility());
      } catch {
        // The original, actionable error stays visible.
      }
    } finally {
      setPrivacyBusy(null);
    }
  };

  if (auth.status !== "authenticated")
    return (
      <Container className="py-16">
        <p className="text-sm text-ink-500">Checking your account…</p>
      </Container>
    );
  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-paper/70 to-white py-8 sm:py-10">
      <Container>
        <div className="mb-7 flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-crimson-50 text-crimson-600">
            <User className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold text-ink-900">Your account</h1>
            <p className="mt-2 text-sm text-ink-500">
              Manage your verified profile, language, and delivery locations.
            </p>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-5 rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
            {notice}
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <section className="h-fit rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
            <h2 className="text-lg font-extrabold text-ink-900">Personal details</h2>
            <p className="mt-1 text-xs text-ink-500">
              Used for your orders and account communication.
            </p>
            <form onSubmit={saveProfile} className="mt-5 space-y-4">
              <Field label="Full name">
                <input
                  required
                  maxLength={80}
                  className={input}
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                />
              </Field>
              <Field label="Verified mobile number">
                <input
                  disabled
                  className={`${input} bg-ink-50`}
                  value={`+977 ${auth.user?.phone ?? ""}`}
                />
                <span className="mt-1 block text-xs text-ink-500">
                  The verified login number cannot be edited here.
                </span>
              </Field>
              <Field label="Email (optional)">
                <input
                  type="email"
                  className={input}
                  value={profile.email}
                  onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                />
              </Field>
              <Field label="Preferred language">
                <select
                  className={input}
                  value={profile.locale}
                  onChange={(event) =>
                    setProfile({ ...profile, locale: event.target.value as "en" | "np" })
                  }
                >
                  <option value="en">English</option>
                  <option value="np">Nepali</option>
                </select>
              </Field>
              <Button className="w-full sm:w-auto" disabled={busy || !profile.name.trim()}>
                Save profile
              </Button>
            </form>
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink-900">Delivery addresses</h2>
                <p className="text-sm text-ink-500">GPS pin plus a complete written address</p>
              </div>
              <Button size="sm" onClick={startNew}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {editing ? (
              <form
                onSubmit={saveAddress}
                className="grid gap-4 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:grid-cols-2 sm:p-6"
              >
                <Field label="Label">
                  <input
                    required
                    maxLength={40}
                    className={input}
                    value={address.label}
                    onChange={(event) => setAddress({ ...address, label: event.target.value })}
                  />
                </Field>
                <Field label="Recipient">
                  <input
                    required
                    maxLength={80}
                    className={input}
                    value={address.recipientName}
                    onChange={(event) =>
                      setAddress({ ...address, recipientName: event.target.value })
                    }
                  />
                </Field>
                <Field label="Contact phone">
                  <input
                    required
                    maxLength={20}
                    className={input}
                    value={address.phone}
                    onChange={(event) => setAddress({ ...address, phone: event.target.value })}
                  />
                </Field>
                <Field label="Area">
                  <input
                    required
                    maxLength={160}
                    className={input}
                    value={address.area}
                    onChange={(event) => setAddress({ ...address, area: event.target.value })}
                  />
                </Field>
                <Field label="Complete address" className="sm:col-span-2">
                  <textarea
                    required
                    maxLength={240}
                    rows={3}
                    className={input}
                    value={address.fullAddress}
                    onChange={(event) =>
                      setAddress({ ...address, fullAddress: event.target.value })
                    }
                  />
                </Field>
                <Field label="Landmark (optional)" className="sm:col-span-2">
                  <input
                    maxLength={160}
                    className={input}
                    value={address.landmark ?? ""}
                    onChange={(event) =>
                      setAddress({ ...address, landmark: event.target.value || null })
                    }
                  />
                </Field>
                <div className="sm:col-span-2">
                  <PlaceSearch
                    near={
                      address.lat != null && address.lng != null
                        ? { lat: address.lat, lng: address.lng }
                        : null
                    }
                    onSelect={(place) => {
                      setAddress((current) => ({
                        ...current,
                        lat: place.lat,
                        lng: place.lng,
                        area: place.type === "GOOGLE" ? current.area : place.address || place.name,
                        fullAddress: place.type === "GOOGLE" ? current.fullAddress : place.address || place.name,
                      }));
                      setShowAddressMap(true);
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="button" variant="outline" onClick={locate}>
                    <LocateFixed className="h-4 w-4" />{" "}
                    {address.lat != null ? "Location pin captured ✓" : "Use my current GPS pin"}
                  </Button>
                </div>
                {address.lat != null && address.lng != null && (
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-xs font-semibold text-ink-500">
                      Move the pin to the exact gate where the rider should stop.
                    </p>
                    {!showAddressMap && <Button type="button" variant="outline" onClick={() => setShowAddressMap(true)}>Adjust pin on map</Button>}
                    {showAddressMap && <LocationMap
                      point={{ lat: address.lat, lng: address.lng }}
                      onChange={(point) =>
                        setAddress((current) => ({ ...current, lat: point.lat, lng: point.lng }))
                      }
                    />}
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={address.isDefault}
                    onChange={(event) =>
                      setAddress({ ...address, isDefault: event.target.checked })
                    }
                  />{" "}
                  Make this my default address
                </label>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button disabled={busy}>Save address</Button>
                </div>
              </form>
            ) : addresses.length === 0 ? (
              <div className="gp-panel p-8 text-center">
                <MapPin className="mx-auto h-8 w-8 text-ink-300" />
                <h3 className="mt-3 font-bold text-ink-800">No delivery address yet</h3>
                <p className="mt-1 text-sm text-ink-500">Add one now so checkout is faster.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {addresses.map((row) => (
                  <article
                    key={row.id}
                    className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition hover:border-crimson-100 sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-ink-900">{row.label}</h3>
                          {row.isDefault && (
                            <Badge tone="green">
                              <Check className="h-3 w-3" /> Default
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-ink-700">{row.fullAddress}</p>
                        <p className="mt-1 text-xs text-ink-500">
                          {row.area}
                          {row.landmark ? ` · ${row.landmark}` : ""} · {row.recipientName} ·{" "}
                          {row.phone}
                        </p>
                        {row.lat != null && (
                          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#EAF7EF] px-2.5 py-1 text-xs font-semibold text-[#0B7E58]">
                            <LocateFixed className="h-3 w-3" /> Location pin saved
                          </p>
                        )}
                      </div>
                      <MapPin className="h-5 w-5 shrink-0 text-crimson-500" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      {!row.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void makeDefault(row.id)}
                        >
                          Set default
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void remove(row)}
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-8 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#EAF7EF] text-[#0B7E58]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-ink-900">Privacy and account control</h2>
              <p className="mt-1 text-sm text-ink-500">
                Download a portable copy of your information or permanently close this account.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-ink-100 bg-ink-50/40 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Download className="mt-0.5 h-5 w-5 shrink-0 text-crimson-600" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-ink-900">Download my data</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-500">
                    Get your profile, addresses, orders, messages, support history, rewards,
                    referrals, saved items and seller applications as JSON. Password-equivalent
                    tokens and internal security data are excluded.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-4"
                    disabled={privacyBusy !== null}
                    onClick={() => void downloadData()}
                  >
                    <Download className="h-4 w-4" />
                    {privacyBusy === "export" ? "Preparing…" : "Download data copy"}
                  </Button>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-red-100 bg-red-50/40 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-ink-900">Delete my account</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-500">
                    Your sessions and profile are removed and personal identifiers are anonymised.
                    GoPasal retains only records required for completed transactions, accounting,
                    fraud prevention and legal claims.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-4 border-red-200 text-red-700 hover:bg-red-50"
                    disabled={privacyBusy !== null}
                    onClick={() => void openDeletion()}
                  >
                    <LockKeyhole className="h-4 w-4" />
                    {deleteOpen ? "Close deletion controls" : "Review account deletion"}
                  </Button>
                </div>
              </div>
            </article>
          </div>

          {deleteOpen && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-white p-4 sm:p-5">
              {privacyBusy === "eligibility" && !eligibility ? (
                <p className="text-sm text-ink-500">Checking for active responsibilities…</p>
              ) : eligibility && !eligibility.eligible ? (
                <div>
                  <h3 className="font-bold text-red-800">This account cannot be deleted yet</h3>
                  <p className="mt-1 text-sm text-ink-600">
                    GoPasal will not interrupt an order, refund, support case or business duty.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {eligibility.blockers.map((blocker) => (
                      <li
                        key={blocker.code}
                        className="flex gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"
                      >
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {blocker.message} {blocker.count > 1 ? `(${blocker.count})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-3"
                    disabled={privacyBusy !== null}
                    onClick={() => {
                      setEligibility(null);
                      void refreshDeletionEligibility();
                    }}
                  >
                    Check again
                  </Button>
                </div>
              ) : eligibility?.eligible ? (
                <form onSubmit={deleteAccount} className="max-w-2xl">
                  <h3 className="font-bold text-red-800">Permanent account deletion</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-600">
                    Download your data first if you need a copy. This action cannot be reversed and
                    your current phone number will no longer open this account.
                  </p>

                  <div className="mt-4 rounded-xl bg-ink-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                      Records retained for limited legal purposes
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-ink-600">
                      {eligibility.retained.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>

                  {!codeSent ? (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-4"
                      disabled={privacyBusy !== null}
                      onClick={() => void requestDeletionCode()}
                    >
                      {privacyBusy === "code" ? "Sending…" : "Send verification code"}
                    </Button>
                  ) : (
                    <div className="mt-5 space-y-4">
                      {developmentCode && (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          Local SMS provider code: <strong>{developmentCode}</strong>. Production
                          never returns this value.
                        </p>
                      )}
                      <Field label="Verification code">
                        <input
                          required
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          minLength={4}
                          maxLength={8}
                          className={input}
                          value={deletionCode}
                          onChange={(event) =>
                            setDeletionCode(event.target.value.replace(/\D/g, ""))
                          }
                        />
                      </Field>
                      <Field label='Type "DELETE MY ACCOUNT" to confirm'>
                        <input
                          required
                          className={input}
                          value={confirmation}
                          onChange={(event) => setConfirmation(event.target.value)}
                        />
                      </Field>
                      <Field label="Reason (optional)">
                        <textarea
                          maxLength={500}
                          rows={3}
                          className={input}
                          value={deletionReason}
                          onChange={(event) => setDeletionReason(event.target.value)}
                        />
                      </Field>
                      <label className="flex items-start gap-2 text-sm text-ink-700">
                        <input
                          required
                          type="checkbox"
                          className="mt-1"
                          checked={acknowledgeRetention}
                          onChange={(event) => setAcknowledgeRetention(event.target.checked)}
                        />
                        I understand the limited retention described above and that deletion is
                        permanent.
                      </label>
                      <Button
                        disabled={
                          privacyBusy !== null ||
                          deletionCode.length < 4 ||
                          confirmation !== "DELETE MY ACCOUNT" ||
                          !acknowledgeRetention
                        }
                        className="bg-red-700 shadow-none hover:bg-red-800"
                      >
                        {privacyBusy === "delete" ? "Deleting account…" : "Permanently delete account"}
                      </Button>
                    </div>
                  )}
                </form>
              ) : null}
            </div>
          )}
        </section>
      </Container>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-ink-700">{label}</span>
      {children}
    </label>
  );
}
