"use client";

import * as React from "react";
import { Banknote, IdCard, MapPin, Save, Store, Undo2 } from "lucide-react";
import { Button, Card } from "@/components/primitives";
import { InlineError, Spinner } from "@/components/states";
import { CheckField, SectionTitle, SelectField, TextAreaField, TextField } from "./fields";
import {
  diffFields,
  fromApplication,
  hasChanges,
  unsendableChanges,
  type FormValues,
} from "./form-values";
import type { ApiError } from "@gopasal/api-client";
import type { Application, ApplicationFields, Category } from "@/lib/api/types";
import { fieldLabel } from "@/lib/onboarding-view";

/**
 * The application form.
 *
 * Its field list *is* `ApplicationFieldsDto` — nothing else can be typed here,
 * because anything else would be rejected by the whole request. The starred
 * fields are `REQUIRED_AT_SUBMIT` on the server, including the conditional payout
 * details: a bank payout needs an account, a wallet payout needs a number, and
 * the form asks for exactly one of them. Business registration, PAN and VAT are
 * unstarred on purpose — most neighbourhood shops in Nepal have none.
 *
 * Saving is explicit. An autosaving wizard would either PATCH on every keystroke
 * or quietly lose the last thing typed, and the server's answer to a save (a
 * refreshed `missing` list) is worth showing at a moment the seller chose.
 */

export function ApplicationForm({
  app,
  categories,
  problemFor,
  onSave,
  onDirtyChange,
}: {
  app: Application;
  categories: Category[];
  /** The API's verdict on a field: from `missing`, or the reviewer's list. */
  problemFor: (name: string) => string | null;
  onSave: (fields: ApplicationFields) => Promise<void>;
  /** Lets the submit panel refuse to send while something is unsaved. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [initial, setInitial] = React.useState<FormValues>(() => fromApplication(app));
  const [values, setValues] = React.useState<FormValues>(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);

  // The server is the authority on what is stored: whenever a fresh application
  // arrives (a save, a reload, a submit) the form takes its word for it.
  const stamp = `${app.id}:${app.updatedAt}`;
  const lastStamp = React.useRef(stamp);
  React.useEffect(() => {
    if (lastStamp.current === stamp) return;
    lastStamp.current = stamp;
    const next = fromApplication(app);
    setInitial(next);
    setValues(next);
  }, [stamp, app]);

  const dirty = hasChanges(initial, values);

  /**
   * What Save would send, and the changed fields it will refuse to.
   *
   * The two are not the same set: an emptied shop name, email, coordinate or
   * delivery distance has no value the API accepts, so `diffFields` leaves it out
   * rather than sending a 400 or inventing a zero. Those edits stay on screen and
   * never reach the server, which used to leave the footer reading "You have
   * unsaved changes." for as long as the page stayed open, with a Save button that
   * did nothing when pressed. Naming them is the honest way out — the seller can
   * type a value or undo.
   */
  const fields = React.useMemo(() => diffFields(initial, values), [initial, values]);
  const stuck = React.useMemo(() => unsendableChanges(initial, values), [initial, values]);
  const sendable = Object.keys(fields).length > 0;
  // `lat` and `lng` share one label ("Map location"), so a cleared pair must not
  // be listed twice.
  const stuckLabels = [...new Set(stuck.map(fieldLabel))];

  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * A field stops showing the API's complaint as soon as it is edited — the
   * complaint was about what is stored, and what is stored is about to change.
   */
  function problem(name: keyof FormValues): string | null {
    if (values[name] !== initial[name]) return null;
    return problemFor(name);
  }

  async function save() {
    if (!sendable) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(fields);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }

  const wallet = values.payoutMethod === "ESEWA" || values.payoutMethod === "KHALTI";
  const bank = values.payoutMethod === "BANK";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card className="space-y-5 p-5">
        <SectionTitle
          icon={<Store className="h-4 w-4" />}
          title="Your shop"
          hint="How customers will see you on GoPasal."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="shopName"
            label="Shop name"
            required
            value={values.shopName}
            onChange={(v) => set("shopName", v)}
            problem={problem("shopName")}
            placeholder="Sharma Kirana Pasal"
            maxLength={120}
            hint="At least two characters. It can be changed but not emptied."
          />
          <TextField
            id="shopNameNp"
            label="Shop name in Nepali"
            hint="Optional. Shown to customers reading in Nepali."
            value={values.shopNameNp}
            onChange={(v) => set("shopNameNp", v)}
            problem={problem("shopNameNp")}
            className="deva"
            placeholder="शर्मा किराना पसल"
            maxLength={120}
          />
          <SelectField
            id="categoryId"
            label="Shop type"
            required
            value={values.categoryId}
            onChange={(v) => set("categoryId", v)}
            problem={problem("categoryId")}
            placeholder={categories.length ? "Choose a shop type…" : "Loading shop types…"}
            options={categories.map((c) => ({ value: c.id, label: c.en }))}
            hint="Pick the one closest to what you mostly sell."
          />
          <TextField
            id="contactPhone"
            label="Shop phone number"
            required
            value={values.contactPhone}
            onChange={(v) => set("contactPhone", v)}
            problem={problem("contactPhone")}
            inputMode="tel"
            placeholder="98XXXXXXXX"
            hint="The number customers should call about an order."
          />
          <TextField
            id="contactEmail"
            label="Shop email"
            hint="Optional. Once saved it can be corrected but not emptied."
            value={values.contactEmail}
            onChange={(v) => set("contactEmail", v)}
            problem={problem("contactEmail")}
            inputMode="email"
            autoComplete="email"
            placeholder="shop@example.com"
            maxLength={160}
          />
          <TextField
            id="hours"
            label="Opening hours"
            hint="In your own words, e.g. 7am–8pm, closed Saturday."
            value={values.hours}
            onChange={(v) => set("hours", v)}
            problem={problem("hours")}
            placeholder="7am – 8pm"
            maxLength={120}
          />
        </div>
        <TextAreaField
          id="description"
          label="About the shop"
          hint="Optional. A line or two about what you sell."
          value={values.description}
          onChange={(v) => set("description", v)}
          problem={problem("description")}
          rows={3}
          maxLength={600}
        />
      </Card>

      <Card className="space-y-5 p-5">
        <SectionTitle
          icon={<MapPin className="h-4 w-4" />}
          title="Where you are"
          hint="Where the shop is, and how far you are willing to deliver yourself."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="area"
            label="Area"
            required
            value={values.area}
            onChange={(v) => set("area", v)}
            problem={problem("area")}
            placeholder="Baluwatar"
            hint="The neighbourhood people would name."
          />
          <TextField
            id="fullAddress"
            label="Full address"
            required
            value={values.fullAddress}
            onChange={(v) => set("fullAddress", v)}
            problem={problem("fullAddress")}
            placeholder="Ward 4, near Baluwatar chowk"
          />
          <TextField
            id="lat"
            label="Latitude"
            hint="Optional. From your phone's map, if you have it. Can be corrected later but not emptied."
            value={values.lat}
            onChange={(v) => set("lat", v)}
            problem={problem("lat")}
            inputMode="decimal"
            placeholder="27.7269"
          />
          <TextField
            id="lng"
            label="Longitude"
            hint="Optional. Can be corrected later but not emptied."
            value={values.lng}
            onChange={(v) => set("lng", v)}
            problem={problem("lng")}
            inputMode="decimal"
            placeholder="85.3320"
          />
          <TextField
            id="deliveryRadiusKm"
            label="How far you deliver (km)"
            value={values.deliveryRadiusKm}
            onChange={(v) => set("deliveryRadiusKm", v)}
            problem={problem("deliveryRadiusKm")}
            inputMode="decimal"
            hint="You deliver your own orders on GoPasal. Choose a distance you can actually manage. It can be changed but not emptied."
          />
        </div>
        <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
          <CheckField
            id="soloMode"
            checked={values.soloMode}
            onChange={(v) => set("soloMode", v)}
            label="I run the shop on my own"
            hint="Turns on the quieter set-up made for one person: fewer notifications at once, and no staff screens until you add someone."
          />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <SectionTitle
          icon={<IdCard className="h-4 w-4" />}
          title="Who runs the shop"
          hint="We check this against the documents you attach. It is never shown to customers."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="ownerName"
            label="Owner's full name"
            required
            value={values.ownerName}
            onChange={(v) => set("ownerName", v)}
            problem={problem("ownerName")}
            autoComplete="name"
            hint="Exactly as it appears on the citizenship certificate."
          />
          <TextField
            id="ownerNameNp"
            label="Owner's name in Nepali"
            hint="Optional."
            value={values.ownerNameNp}
            onChange={(v) => set("ownerNameNp", v)}
            problem={problem("ownerNameNp")}
            className="deva"
          />
          <TextField
            id="citizenshipNo"
            label="Citizenship number"
            required
            value={values.citizenshipNo}
            onChange={(v) => set("citizenshipNo", v)}
            problem={problem("citizenshipNo")}
          />
          <TextField
            id="registrationNo"
            label="Business registration number"
            hint="Optional — most neighbourhood shops have none, and that is fine."
            value={values.registrationNo}
            onChange={(v) => set("registrationNo", v)}
            problem={problem("registrationNo")}
          />
          <TextField
            id="panNo"
            label="PAN number"
            hint="Optional."
            value={values.panNo}
            onChange={(v) => set("panNo", v)}
            problem={problem("panNo")}
            inputMode="numeric"
          />
          <TextField
            id="vatNo"
            label="VAT number"
            hint="Optional — only if you are VAT registered."
            value={values.vatNo}
            onChange={(v) => set("vatNo", v)}
            problem={problem("vatNo")}
            inputMode="numeric"
          />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <SectionTitle
          icon={<Banknote className="h-4 w-4" />}
          title="How you get paid"
          hint="Where GoPasal sends the money for orders customers pay online."
        />
        <SelectField
          id="payoutMethod"
          label="Payout method"
          required
          value={values.payoutMethod}
          onChange={(v) => set("payoutMethod", v)}
          problem={problem("payoutMethod")}
          placeholder="Choose how you want to be paid…"
          options={[
            { value: "BANK", label: "Bank account" },
            { value: "ESEWA", label: "eSewa wallet" },
            { value: "KHALTI", label: "Khalti wallet" },
          ]}
          className="sm:max-w-sm"
        />

        {bank && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="bankName"
              label="Bank name"
              required
              value={values.bankName}
              onChange={(v) => set("bankName", v)}
              problem={problem("bankName")}
            />
            <TextField
              id="bankBranch"
              label="Branch"
              hint="Optional."
              value={values.bankBranch}
              onChange={(v) => set("bankBranch", v)}
              problem={problem("bankBranch")}
            />
            <TextField
              id="bankAccountNo"
              label="Account number"
              required
              value={values.bankAccountNo}
              onChange={(v) => set("bankAccountNo", v)}
              problem={problem("bankAccountNo")}
              inputMode="numeric"
              hint="Check this digit by digit — money sent to a wrong account is very hard to get back."
            />
            <TextField
              id="bankAccountName"
              label="Account holder's name"
              required
              value={values.bankAccountName}
              onChange={(v) => set("bankAccountName", v)}
              problem={problem("bankAccountName")}
              hint="As the bank has it, even if it differs from the shop name."
            />
          </div>
        )}

        {wallet && (
          <TextField
            id="walletNumber"
            label={values.payoutMethod === "ESEWA" ? "eSewa number" : "Khalti number"}
            required
            value={values.walletNumber}
            onChange={(v) => set("walletNumber", v)}
            problem={problem("walletNumber")}
            inputMode="tel"
            className="sm:max-w-sm"
            hint="The mobile number the wallet is registered to."
          />
        )}
      </Card>

      {error && (
        <InlineError message={error.message}>
          {error.offline && (
            <p className="mt-1 text-xs">
              Nothing was saved. Your answers are still on this screen — try again once you are back
              online.
            </p>
          )}
        </InlineError>
      )}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t border-ink-100 bg-white/95 px-1 py-3 backdrop-blur">
        <div className="mr-auto">
          <p className="text-xs text-ink-400">
            {dirty ? "You have unsaved changes." : "Everything on this page is saved."}
          </p>
          {stuckLabels.length > 0 && (
            <p className="mt-0.5 text-xs text-[#8a5a00]">
              {stuckLabels.join(", ")} cannot be saved as typed. What is stored stays until you type
              something GoPasal accepts — or undo the change.
            </p>
          )}
        </div>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setValues(initial)}
            disabled={saving}
          >
            <Undo2 className="h-4 w-4" /> Undo changes
          </Button>
        )}
        {/* Disabled on "nothing to send", not on "nothing changed" — pressing Save
            must never be a no-op. */}
        <Button type="submit" size="sm" disabled={!sendable || saving}>
          {saving ? <Spinner className="text-white" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
