import * as React from "react";
import { Banknote, IdCard, MapPin, Store } from "lucide-react";
import { Card } from "@/components/primitives";
import { ReadField, SectionTitle } from "./fields";
import type { Application } from "@/lib/api/types";

/**
 * What was sent, once it can no longer be edited.
 *
 * The same fields as the form, read-only, because a seller waiting on a decision
 * still needs to see exactly what the reviewer is looking at. Editability is the
 * API's `canEdit`, never a guess from the status.
 */
export function ApplicationSummary({ app }: { app: Application }) {
  const payout =
    app.payoutMethod === "BANK"
      ? "Bank account"
      : app.payoutMethod === "ESEWA"
        ? "eSewa wallet"
        : app.payoutMethod === "KHALTI"
          ? "Khalti wallet"
          : "";

  return (
    <div className="space-y-4">
      <Card className="space-y-5 p-5">
        <SectionTitle icon={<Store className="h-4 w-4" />} title="Your shop" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label="Shop name" value={app.shopName} />
          <ReadField
            label="Shop name in Nepali"
            value={app.shopNameNp ? <span className="deva">{app.shopNameNp}</span> : null}
          />
          <ReadField label="Shop type" value={app.category?.en} />
          <ReadField label="Shop phone number" value={app.contactPhone} />
          <ReadField label="Shop email" value={app.contactEmail} />
          <ReadField label="Opening hours" value={app.hours} />
        </div>
        {app.description && <ReadField label="About the shop" value={app.description} />}
      </Card>

      <Card className="space-y-5 p-5">
        <SectionTitle icon={<MapPin className="h-4 w-4" />} title="Where you are" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label="Area" value={app.area} />
          <ReadField label="Full address" value={app.fullAddress} />
          <ReadField
            label="Map location"
            value={app.lat !== null && app.lng !== null ? `${app.lat}, ${app.lng}` : null}
          />
          <ReadField label="How far you deliver" value={`${app.deliveryRadiusKm} km`} />
          <ReadField label="Solo mode" value={app.soloMode ? "On" : "Off"} />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <SectionTitle icon={<IdCard className="h-4 w-4" />} title="Who runs the shop" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label="Owner's full name" value={app.ownerName} />
          <ReadField
            label="Owner's name in Nepali"
            value={app.ownerNameNp ? <span className="deva">{app.ownerNameNp}</span> : null}
          />
          <ReadField label="Citizenship number" value={app.citizenshipNo} />
          <ReadField label="Business registration number" value={app.registrationNo} />
          <ReadField label="PAN number" value={app.panNo} />
          <ReadField label="VAT number" value={app.vatNo} />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <SectionTitle icon={<Banknote className="h-4 w-4" />} title="How you get paid" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label="Payout method" value={payout} />
          {app.payoutMethod === "BANK" ? (
            <>
              <ReadField label="Bank name" value={app.bankName} />
              <ReadField label="Branch" value={app.bankBranch} />
              <ReadField label="Account number" value={app.bankAccountNo} />
              <ReadField label="Account holder's name" value={app.bankAccountName} />
            </>
          ) : (
            <ReadField label="Wallet number" value={app.walletNumber} />
          )}
        </div>
      </Card>
    </div>
  );
}
