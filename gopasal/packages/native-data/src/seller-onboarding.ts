/**
 * Becoming a seller, from a phone: the application, its documents, and what its
 * status means for the person who filed it.
 *
 * This is the one seller surface where the phone is not the narrower tool. The
 * console's registration wizard is a form somebody types at a desk; the evidence
 * it asks for — a citizenship card front and back, a business registration
 * certificate, a photograph of the shop itself — is all sitting in front of the
 * applicant, and the camera that can capture it is in the same device as the
 * form. A shopkeeper photographing their own shutter beats the same shopkeeper
 * scanning a card at home, emailing it to themselves and uploading it in a
 * browser, and registration is the moment that difference decides whether they
 * finish at all.
 *
 * Reached as `@gopasal/native-data/seller-onboarding`, and deliberately **not**
 * re-exported from `./index`: the customer app imports the same package, and a
 * barrel that pulled this in would ship the whole KYC surface to shoppers.
 *
 * Shapes mirror `toApplicantView` in
 * `apps/api/src/modules/onboarding/onboarding.service.ts` and the console's own
 * `apps/web-seller/lib/api/types.ts`, so the phone and the browser cannot
 * disagree about one wire. Where `@gopasal/api-client` already exports a wire
 * type — `ApplicationDocument`, `ApplicationCategory`, the three enums — it is
 * imported rather than redeclared.
 *
 * ## Writes do not go through the outbox
 *
 * For the same reason the rest of the seller surface does not (see the long note
 * at the top of `./seller.ts`), and one more that is specific to this module.
 * Every write here is guarded by the application's *status*, which a reviewer can
 * change at any moment: a PATCH queued while the application was a draft and
 * replayed ten minutes later lands on an application that has since been
 * submitted, and answers 409. A shopkeeper who is told "not saved, try again"
 * while they are still looking at the form can act on that; one who is told
 * nothing and finds their answers missing tomorrow cannot. The document upload is
 * stronger still — an `OTHER` attachment *accumulates*, so a replayed upload
 * leaves two copies of the same paper for a reviewer to choose between.
 *
 * ## Deliberate omissions
 *
 *  - **The reviewer's surface.** `onboarding.admin.controller.ts` is GoPasal's
 *    own queue and needs PLATFORM permissions an applicant cannot hold.
 *  - **The category list.** `GET /categories` is a catalog read and already has
 *    a hook: `useCategories` in `./customer`, exported from the package root. A
 *    second definition of one endpoint is exactly what these modules exist to
 *    avoid.
 *  - **A map pin.** `lat`, `lng` and the location-capture columns come back on
 *    the view but are not on `ApplicationFieldsDto`, so there is no route that
 *    sets them during registration. See the note on `SellerApplication`.
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ApplicationCategory,
  ApplicationDocument,
  ApplicationStatus,
  DocumentKind,
  PayoutMethod,
  ShopLifecycle,
} from "@gopasal/api-client/types";
import { useGopasal } from "./GopasalProvider";
import { appendFilePart } from "./file-part";
import { ApiError } from "./http";
// The freshness tiers are `./seller`'s, imported rather than re-derived: two
// files' worth of parallel numbers is how one screen ends up a minute behind
// another for no reason a reader can find.
import { SELLER_STALE } from "./seller";
import {
  DOCUMENT_FILE_FIELD,
  apiErrorDetails,
  apiErrorMessage,
  applicationStanding,
  checkDocumentPick,
  checkDraft,
  draftFields,
  draftFromApplication,
  mergeDraft,
  oqk,
  parseJsonBody,
  withoutFields,
  type ApplicationDraft,
  type DocumentPick,
  type DraftProblem,
  type PickedFile,
} from "./seller-onboarding-wire";

export { oqk } from "./seller-onboarding-wire";

/**
 * The pure half, re-exported so a screen has one import.
 *
 * All of it lives in `./seller-onboarding-wire` because this file cannot be
 * loaded off a phone — `react-native` is on line two — and the status rules, the
 * upload gate and the draft diff are precisely the parts that must be tested.
 */
export {
  APPLICATION_FIELDS,
  DELIVERY_RADIUS_RANGE,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  DRAFT_LIMITS,
  MAX_DOCUMENTS_PER_APPLICATION,
  MULTIPART_HARD_LIMIT_BYTES,
  applicationStanding,
  canChangeDocuments,
  canEditApplication,
  checkDocumentPick,
  checkDraft,
  documentSlotAvailable,
  draftDiff,
  draftFields,
  draftFromApplication,
  fieldProblem,
  isApplicationOpen,
  isApplicationTerminal,
  isSingleInstanceKind,
  mergeDraft,
  mimeFromFileName,
  normaliseDocumentMime,
  submitRefusal,
  withoutFields,
  type ApplicationDraft,
  type ApplicationField,
  type ApplicationNextStep,
  type ApplicationStanding,
  type DocumentFilePart,
  type DocumentMime,
  type DocumentPick,
  type DocumentPickRejection,
  type DraftProblem,
  type DraftRule,
  type FieldProblem,
  type PickedFile,
} from "./seller-onboarding-wire";

export type { ApplicationCategory, ApplicationDocument, ApplicationStatus, DocumentKind, PayoutMethod };

const BASE = "/seller/onboarding/applications";

/**
 * How long an upload may take before it is abandoned.
 *
 * Four times the transport's own 15 seconds, because the transport's number was
 * chosen for a JSON round trip and this is up to ten megabytes of photograph
 * leaving a phone on a prepaid connection in Kathmandu. Fifteen seconds would
 * abort uploads that were going to succeed, and an aborted upload of a
 * citizenship card is the single most discouraging thing that can happen in this
 * flow.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

/** Refresh this far ahead of expiry, matching `REFRESH_SKEW_MS` in `./http`. */
const REFRESH_SKEW_MS = 30_000;

/** How long the form waits for typing to stop before it saves. */
const AUTOSAVE_QUIET_MS = 1_200;

/* ── the application ──────────────────────────────────────────────────────── */

/** One entry of the applicant's timeline. `meta` is reviewer-only and absent here. */
export type ApplicationTimelineEntry = {
  id: string;
  /** `ShopApplicationEvent.type`, e.g. `submitted`, `document_replaced`. */
  type: string;
  message: string | null;
  at: string;
};

/**
 * The applicant's own view of their application — `toApplicantView`.
 *
 * Nullable columns arrive as `null`, never `undefined`, exactly as Prisma
 * serialises them. Three things are worth knowing before rendering it:
 *
 *  - **`statusLabel`, `missing` and `missingDocuments` are computed server-side**
 *    and are the whole point of this payload. `missing` names required fields
 *    that are still empty; `missingDocuments` names required kinds that are not
 *    yet *usable*, which is not the same as "not attached" — a document a
 *    reviewer has REJECTED stops satisfying its requirement.
 *  - **The location block is read-only.** `lat`, `lng`, `locationAccuracyM`,
 *    `locationCapturedAt` and `locationCaptureMethod` come back, but
 *    `ApplicationFieldsDto` does not declare them, so nothing on this surface can
 *    set them and sending one would be a 400. A verified pin is captured from the
 *    approved shop's settings instead; until then the storefront query keeps the
 *    shop private. This is the one place a phone-first flow is visibly worse than
 *    it should be — see the note on `useApplicationDraft`.
 *  - **There is no reviewer identity anywhere.** The applicant is told what
 *    GoPasal decided, never which member of staff decided it.
 */
export type SellerApplication = {
  id: string;
  /** Human-facing code, e.g. `GP-K7M2QX`. What support asks for on the phone. */
  reference: string;
  status: ApplicationStatus;
  /** A phrase, not an enum: "waiting for your changes". Render it, do not map it. */
  statusLabel: string;
  canEdit: boolean;
  isOpen: boolean;
  /** Required fields still empty. Names match the keys of `ApplicationDraft`. */
  missing: string[];
  missingDocuments: DocumentKind[];

  shopName: string | null;
  shopNameNp: string | null;
  categoryId: string | null;
  description: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  area: string | null;
  fullAddress: string | null;
  /** Read-only on this surface. See the note above. */
  lat: number | null;
  lng: number | null;
  locationAccuracyM: number | null;
  locationCapturedAt: string | null;
  locationCaptureMethod: string | null;
  deliveryRadiusKm: number;
  hours: string | null;
  soloMode: boolean;

  ownerName: string | null;
  ownerNameNp: string | null;
  /** Reviewer-visible KYC. Echoed back to the applicant who typed it, nobody else. */
  citizenshipNo: string | null;
  registrationNo: string | null;
  panNo: string | null;
  vatNo: string | null;

  payoutMethod: PayoutMethod | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  walletNumber: string | null;

  category: ApplicationCategory | null;
  /** Stamped at submission from the published policy in force at that moment. */
  terms: { acceptedAt: string | null; version: string | null };
  review: {
    submittedAt: string | null;
    decidedAt: string | null;
    submitCount: number;
    /** `decisionNote` — the reviewer's words, written to be read by the applicant. */
    note: string | null;
    /** Field names the reviewer asked to be changed. Validated against `EDITABLE_FIELDS`. */
    changesRequested: string[];
  };
  /** Non-null once approved: the shop the application became. */
  shop: { id: string; slug: string; name: string; status: ShopLifecycle } | null;
  documents: ApplicationDocument[];
  timeline: ApplicationTimelineEntry[];
  createdAt: string;
  updatedAt: string;
};

/* ── reads ────────────────────────────────────────────────────────────────── */

/**
 * Every application this account has ever filed, newest first.
 *
 * A bare array rather than a page: the server returns `{ data: [...] }` with no
 * `meta`, because a person files one application and occasionally a second after
 * a rejection.
 *
 * `SELLER_STALE.counter` rather than one of the longer tiers. The thing that
 * changes this list is a *reviewer*, at a moment the applicant cannot predict,
 * and the applicant is very likely staring at the screen waiting for exactly
 * that — so a minute is the honest ceiling on how long an approval may sit
 * unseen. `SELLER_STALE.money` would be right for a record nobody is waiting on;
 * this is the opposite of that.
 */
export function useMyApplications() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: oqk.applications(),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await http.request<{ data: SellerApplication[] }>(BASE);
      return res.data;
    },
  });
}

/**
 * The application still in flight, or `null`.
 *
 * `null` is a normal answer, not a 404 — "you have no application" is what the
 * server says to most people. Use this for a cheap "am I mid-registration?"
 * badge somewhere in a tab bar; use {@link useApplicationJourney} for the
 * registration screen itself, which needs the *decided* application too and can
 * get both from one request.
 */
export function useCurrentApplication() {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: oqk.current(),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await http.request<{ application: SellerApplication | null }>(`${BASE}/current`);
      return res.application;
    },
  });
}

/** One application in full. 404s for an application belonging to somebody else. */
export function useApplication(applicationId: string | null | undefined) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: oqk.application(applicationId ?? ""),
    staleTime: SELLER_STALE.counter,
    enabled: Boolean(applicationId) && Boolean(user),
    queryFn: () =>
      http.request<SellerApplication>(`${BASE}/${encodeURIComponent(applicationId!)}`),
  });
}

/**
 * The whole registration screen's state, in one hook.
 *
 * "The open application if there is one, otherwise the most recent" — the same
 * choice the console makes, and for the same reason: an applicant whose
 * application was rejected or withdrawn must still see *that*, with the
 * reviewer's note, rather than an empty "become a seller" pitch that reads as if
 * GoPasal had forgotten them. `GET …/current` cannot answer that in one request,
 * so the list is what this reads.
 *
 * `standing` is the interpretation — what they can still edit, what they are
 * waiting for, what was rejected and why — computed by
 * {@link applicationStanding} in the wire companion so the rules exist once.
 */
export function useApplicationJourney() {
  const applications = useMyApplications();
  const list = applications.data;
  const application = list ? (list.find((a) => a.isOpen) ?? list[0] ?? null) : null;

  return {
    application,
    /** Null until the list has loaded, or when this account has never applied. */
    standing: application ? applicationStanding(application) : null,
    /** Every application, for the rare account with a rejected one behind it. */
    applications: list ?? [],
    /** True when this account has never filed anything — show the pitch. */
    neverApplied: Boolean(list) && list!.length === 0,
    isPending: applications.isPending,
    error: applications.error,
    refetch: applications.refetch,
  };
}

/* ── starting one ─────────────────────────────────────────────────────────── */

/**
 * Start an application, or adopt the one already open.
 *
 * `POST /seller/onboarding/applications` is resume-or-create by design — the
 * service looks for an open application first and, if it finds an *editable*
 * one, patches it with whatever was sent and returns that. So tapping "become a
 * seller" twice cannot produce two applications, and this mutation needs no
 * guard of its own.
 *
 * It is a **409**, not a fresh draft, when the open application is SUBMITTED or
 * UNDER_REVIEW: "Application GP-… is being reviewed, so it cannot be changed
 * right now." That message is worth showing verbatim.
 *
 * The optional prefill is the phone's small advantage here: the account's own
 * phone number is already known, so `contactPhone` can be filled before the
 * first screen is drawn.
 */
export function useStartApplication() {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (prefill: ApplicationDraft = {}) =>
      http.request<SellerApplication>(BASE, { method: "POST", body: prefill }),
    onSuccess: (application) => {
      writeApplication(qc, application);
      // Both, because this is one of the three writes that can change whether
      // there *is* an open application — which is the only question `current`
      // answers, and the one thing `writeApplication` refuses to guess at.
      void qc.invalidateQueries({ queryKey: oqk.applications() });
      void qc.invalidateQueries({ queryKey: oqk.current() });
    },
  });
}

/* ── the draft ────────────────────────────────────────────────────────────── */

export type ApplicationDraftHandle = {
  /** What the form shows: the server's answers with local edits over them. */
  values: ApplicationDraft;
  /** Only the keys typed since the last successful save. */
  edits: ApplicationDraft;
  dirty: boolean;
  /**
   * What the API would refuse, checked against the DTO's own bounds. Non-empty
   * stops the autosave, because an autosave that 400s is a form that has quietly
   * stopped working.
   */
  problems: DraftProblem[];
  /** Merge a partial edit and schedule a save. The only way to change a value. */
  set: (patch: ApplicationDraft) => void;
  /** Save now. Awaitable, for a Continue button or a step boundary. */
  save: () => Promise<void>;
  saving: boolean;
  /** Epoch ms of the last successful save, for a "Saved" tick. */
  savedAt: number | null;
  /** The last save's failure. Cleared by the next successful one. */
  error: ApiError | null;
  /** True when the application is not the applicant's to type into. */
  readOnly: boolean;
};

/**
 * The resumable draft: a registration form filled in over several sittings, on a
 * phone, probably standing behind a counter.
 *
 * That sentence is the whole design brief, and each half of it decides something:
 *
 *  - **Several sittings** means nothing may depend on reaching the end. Every
 *    edit is saved on its own, a second or so after the typing stops, so the
 *    application on the server is always as complete as the last thing the
 *    shopkeeper did. There is no "save and continue" that can be missed.
 *  - **On a phone** means the app can be killed at any moment — a call, a
 *    photograph, the OS reclaiming memory behind the camera. Going to the
 *    background flushes immediately rather than waiting out the debounce.
 *  - **Standing behind a counter** means interruption is the normal case, not the
 *    exception. Saves are serialised and sent as a *diff*, so typing during a
 *    save cannot lose either value: the request that is already flying carries
 *    the keys it was given, and the loop below picks up whatever arrived while it
 *    was gone.
 *
 * The shop's location goes through here too, which on a phone is the single
 * easiest field in the form: the applicant is standing in the doorway holding a
 * GPS. Set `lat`, `lng` and `locationAccuracyM` together — the server writes the
 * three as one fact and refuses a partial pin — and it stamps the provenance
 * itself. Without the pin the approved shop stays invisible behind
 * `VERIFIED_LOCATION`, so a registration screen should treat it as required
 * rather than as decoration.
 */
export function useApplicationDraft(
  application: SellerApplication | null | undefined,
): ApplicationDraftHandle {
  const { http } = useGopasal();
  const qc = useQueryClient();

  const applicationId = application?.id ?? null;
  const readOnly = application ? !application.canEdit : true;

  const server = React.useMemo<ApplicationDraft>(
    () => (application ? draftFromApplication(application) : {}),
    [application],
  );

  const [edits, setEdits] = React.useState<ApplicationDraft>({});
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);

  // The ref, not the state, is what a save reads. React batches state updates to
  // the next render, and the loop below runs between renders: a second edit
  // arriving mid-request has to be visible to the iteration after it, which only
  // a synchronously-written ref can be.
  const pending = React.useRef<ApplicationDraft>({});
  /** The run in flight, so an awaited `save()` can wait for it rather than lie. */
  const inFlight = React.useRef<Promise<void> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = React.useRef<() => Promise<void>>(async () => {});

  const commit = React.useCallback((next: ApplicationDraft) => {
    pending.current = next;
    setEdits(next);
  }, []);

  // A different application is a different form. Keeping the edits would write
  // one application's answers into another's — the case that exists is a
  // rejected application followed by a new one, where the fields have the same
  // names and completely different truth behind them.
  React.useEffect(() => {
    // Guarded so the common case — the application arriving after the screen
    // mounted, with nothing typed yet — does not cost a render.
    if (draftFields(pending.current).length > 0) commit({});
    setError(null);
    setSavedAt(null);
  }, [applicationId, commit]);

  const schedule = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveRef.current();
    }, AUTOSAVE_QUIET_MS);
  }, []);

  /**
   * Send whatever is dirty, one request at a time, until nothing is.
   *
   * A loop rather than a single PATCH because typing does not stop for the
   * network: a value entered while a save is in the air is read by the next turn
   * and goes out on its own request, which is why nothing is ever lost and why
   * two saves can never overlap and disagree about the same column.
   */
  const drain = React.useCallback(async (): Promise<void> => {
    if (!applicationId) return;
    setSaving(true);
    try {
      for (;;) {
        const body = pending.current;
        const fields = draftFields(body);
        if (fields.length === 0) break;
        // Refusing to send a body the API will reject is the difference between
        // an input that stops at 120 characters and a save that silently stops
        // happening at 121. The screen reads `problems` and says which field.
        if (checkDraft(body).length > 0) break;

        const saved = await http.request<SellerApplication>(
          `${BASE}/${encodeURIComponent(applicationId)}`,
          { method: "PATCH", body },
        );
        writeApplication(qc, saved);
        // Exactly the keys that went, and nothing typed while they were going.
        commit(withoutFields(pending.current, fields));
        setSavedAt(Date.now());
        setError(null);
      }
    } catch (cause) {
      setError(asApiError(cause));
      // The edits stay pending on purpose: a failed save must not discard what
      // the shopkeeper typed, and the timer below gives it another go once they
      // touch anything.
    } finally {
      setSaving(false);
    }
  }, [applicationId, http, qc, commit]);

  const save = React.useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!applicationId || readOnly) return;

    // Already draining. Awaiting the run in flight and then re-entering is what
    // makes `await save()` mean "everything typed so far is on the server" —
    // which the caller is entitled to assume, because the next thing a step
    // boundary does is submit. The loop above picks up an edit that arrived in
    // time; this covers the one that arrived a moment too late.
    //
    // It terminates. The owner of a run registers its own `await` before any
    // waiter can exist, so its `finally` clears the flag first and a waiter
    // always resumes into a settled state — either with nothing pending, or as
    // the owner of a fresh run.
    const running = inFlight.current;
    if (running) {
      await running;
      if (draftFields(pending.current).length === 0) return;
      return saveRef.current();
    }

    const run = drain();
    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
      if (draftFields(pending.current).length > 0) schedule();
    }
  }, [applicationId, readOnly, drain, schedule]);

  saveRef.current = save;

  const set = React.useCallback(
    (patch: ApplicationDraft) => {
      if (readOnly) return;
      commit(mergeDraft(pending.current, patch));
      schedule();
    },
    [readOnly, commit, schedule],
  );

  // Pocketing the phone is the commonest way a sitting ends, and it is also the
  // moment the OS may decide the app is expendable. Flushing here costs one
  // request and is the difference between losing a debounce window's worth of
  // typing and not.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") void saveRef.current();
    });
    return () => sub.remove();
  }, []);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const values = React.useMemo(() => mergeDraft(server, edits), [server, edits]);
  const problems = React.useMemo(() => checkDraft(values), [values]);

  return {
    values,
    edits,
    dirty: draftFields(edits).length > 0,
    problems,
    set,
    save,
    saving,
    savedAt,
    error,
    readOnly,
  };
}

/* ── documents ────────────────────────────────────────────────────────────── */

/**
 * Attach a document, straight from the camera roll or the camera.
 *
 * ### What the route expects
 *
 * `POST …/:applicationId/documents`, `multipart/form-data`, with exactly two
 * parts: a text field `kind` (one of `UPLOADABLE_DOCUMENT_KINDS`) and a file
 * field named **`file`**. The interceptor is
 * `FileInterceptor('file', { limits: { fileSize: 32 MiB, files: 1 } })`, so a
 * second part called `file` is dropped rather than buffered.
 *
 * ### The limits, so a screen can refuse a photograph before sending it
 *
 *  - **10 MiB** is what the file is actually judged against
 *    (`UPLOAD_MAX_DOCUMENT_BYTES`, default `10 * 1024 * 1024`), and over it the
 *    answer is **413** with the server's own sentence naming both sizes. It is an
 *    environment variable, so the constant here is a default and not a promise —
 *    which is why {@link checkDocumentPick} is an optimisation and the server
 *    stays the authority.
 *  - **32 MiB** is multer's own ceiling (`MULTIPART_HARD_LIMIT_BYTES`), and it
 *    fails *differently*: the body is cut off mid-request rather than validated,
 *    so the applicant gets a transport error instead of "that file is too big".
 *    `validateConfig` refuses to boot with a configured ceiling above it, so
 *    nothing can land between the two.
 *  - **JPEG, PNG, WebP or PDF**, and the type is decided by reading the bytes.
 *    A declared `Content-Type` or a filename extension that disagrees with them
 *    is a 400 — which is why the part's name and type are both rebuilt by
 *    {@link checkDocumentPick} rather than passed through from the picker. An
 *    iPhone handing back `IMG_0042.HEIC` for a photo it already transcoded to
 *    JPEG is the case that fails otherwise.
 *  - **Twelve documents per application**, counted as what will *remain*: a
 *    single-instance kind replaces its predecessor, so re-taking a photo is never
 *    blocked by a full application. Beyond it, 409.
 *  - **An empty file** is a 400 of its own, which matters because some pickers
 *    return a zero-byte asset for a cancelled capture.
 *
 * ### Why this one call does not go through `http.request`
 *
 * The transport `JSON.stringify`s every body and sets `content-type:
 * application/json`, which is right for every other request the apps make and
 * fatal here — a multipart body needs the boundary React Native's own `FormData`
 * generates, and it must not be stringified. So this builds the request itself,
 * and pays for that by re-implementing three things the transport owns: the
 * bearer header (with the same refresh-ahead skew), a timeout, and unwrapping the
 * API's error envelope. The envelope unwrapping lives in the wire companion so
 * the two cannot drift.
 *
 * It is never retried. A retried upload of a single-instance kind would merely
 * replace what the first attempt stored, but `OTHER` *accumulates* — so a lost
 * reply would leave a reviewer two copies of one paper and no way to tell which
 * the applicant meant.
 */
export function useUploadApplicationDocument(applicationId: string | null | undefined) {
  const { http, session } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      kind: DocumentKind;
      /** Whatever the picker produced. Checked before a byte leaves the phone. */
      file: PickedFile;
    }): Promise<ApplicationDocument> => {
      const pick = checkDocumentPick(input.file, input.kind);
      if (!pick.ok) throw pickRejection(pick);

      const stored = session.get();
      if (stored && stored.accessExpiresAt - REFRESH_SKEW_MS <= Date.now()) {
        await http.refreshSession();
      }
      const token = session.get()?.accessToken;

      const form = new FormData();
      form.append("kind", input.kind);
      // `{ uri, name, type }` on a handset, a real Blob on web — see file-part.ts.
      await appendFilePart(form, DOCUMENT_FILE_FIELD, pick.part);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      try {
        const res = await fetch(
          `${http.root()}${BASE}/${encodeURIComponent(applicationId!)}/documents`,
          {
            method: "POST",
            // No `content-type`: setting it would strip the boundary and the
            // server would see one unparseable part.
            headers: token ? { authorization: `Bearer ${token}` } : {},
            body: form,
            signal: controller.signal,
          },
        );
        const text = await res.text();
        const parsed = parseJsonBody(text);
        if (!res.ok) {
          throw new ApiError(
            res.status,
            apiErrorMessage(res.status, parsed),
            parsed,
            apiErrorDetails(parsed),
          );
        }
        return parsed as ApplicationDocument;
      } catch (cause) {
        if (cause instanceof ApiError) throw cause;
        const aborted = cause instanceof Error && cause.name === "AbortError";
        throw new ApiError(
          0,
          aborted
            ? "That upload took too long. Try again where the signal is better, or use a smaller photo."
            : "Couldn't send that document to GoPasal.",
        );
      } finally {
        clearTimeout(timeout);
      }
    },

    // Refetched rather than merged. The response is the new `DocumentView` alone,
    // and what the screen needs is `missingDocuments` — which the server
    // recomputes over the whole application and which this one row cannot imply.
    onSuccess: () => invalidateApplication(qc, applicationId),
  });
}

/**
 * Detach a document and delete its bytes.
 *
 * Allowed only while the application is the applicant's to edit: a 409 names the
 * status otherwise. Answers with the row that was removed, which is worth
 * nothing to the cache — `missingDocuments` has changed, so the application is
 * refetched.
 */
export function useRemoveApplicationDocument(applicationId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) =>
      http.request<ApplicationDocument>(
        `${BASE}/${encodeURIComponent(applicationId!)}/documents/${encodeURIComponent(documentId)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => invalidateApplication(qc, applicationId),
  });
}

/**
 * One of my own documents back, as a data URI.
 *
 * The download route is authenticated and there are no signed URLs by design, so
 * the bytes cannot be handed to an `<Image source={{ uri }}>` — that would fetch
 * them again without the bearer token and get a 401. They have to be read through
 * the transport and inlined, which is what `http.requestDataUri` does.
 *
 * Two deliberate choices about the cache. `staleTime` is infinite because a
 * document's bytes never change — replacing one creates a new id — so this is
 * never refetched. `gcTime` is five minutes, far below the provider's default
 * week, because this cache is **persisted to AsyncStorage**: a citizenship card
 * is exactly the thing that should not sit in a plain file in the app's sandbox
 * for a week after the applicant closed the preview.
 */
export function useApplicationDocumentFile(
  applicationId: string | null | undefined,
  documentId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { http, user } = useGopasal();
  return useQuery({
    queryKey: oqk.documentFile(applicationId ?? "", documentId ?? ""),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    enabled:
      Boolean(applicationId) &&
      Boolean(documentId) &&
      Boolean(user) &&
      options?.enabled !== false,
    queryFn: () =>
      http.requestDataUri(
        `${BASE}/${encodeURIComponent(applicationId!)}/documents/${encodeURIComponent(documentId!)}/file`,
      ),
  });
}

/* ── submitting ───────────────────────────────────────────────────────────── */

/**
 * Submit, or resubmit after changes were requested — one endpoint, because to the
 * applicant it is one button. {@link applicationStanding} says which of the two
 * is happening so the screen can name it.
 *
 * `acceptTerms` must be literally `true` (`@Equals(true)`), so an unticked box is
 * a 400 rather than a silent no-op, and the published seller-terms version in
 * force at that moment is stamped server-side. That is also why this is not a
 * one-tap action: the consent has to be given here, not inferred from having
 * started the form.
 *
 * A refusal is an `ApiError` whose `details` carry `missing` and
 * `missingDocuments`. Showing `error.message` alone tells the shopkeeper that
 * "some required details are still missing" without saying which — pass the
 * details through `submitRefusal` instead. In practice
 * `standing.canSubmit` should have kept the button disabled, so a refusal here
 * means the server disagrees with the last payload this app saw, which is worth
 * surfacing rather than smoothing over.
 */
export function useSubmitApplication(applicationId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { acceptTerms: true; note?: string }) =>
      http.request<SellerApplication>(
        `${BASE}/${encodeURIComponent(applicationId!)}/submit`,
        {
          method: "POST",
          // Built rather than spread: `note` is `@MaxLength(500)` and optional,
          // and `{ acceptTerms: true, note: undefined }` would serialise as a key
          // the DTO does not mind but which makes the request differ for nothing.
          body: input.note ? { acceptTerms: true, note: input.note } : { acceptTerms: true },
        },
      ),
    onSuccess: (application) => {
      writeApplication(qc, application);
      // Both, because this is one of the three writes that can change whether
      // there *is* an open application — which is the only question `current`
      // answers, and the one thing `writeApplication` refuses to guess at.
      void qc.invalidateQueries({ queryKey: oqk.applications() });
      void qc.invalidateQueries({ queryKey: oqk.current() });
    },
  });
}

/**
 * Withdraw. Terminal, and not a pause: starting again means a *new* application,
 * and this one stays as the record of what was asked for and given up on.
 *
 * `reason` is optional and recorded on the timeline (`@MaxLength(300)`).
 */
export function useWithdrawApplication(applicationId: string | null | undefined) {
  const { http } = useGopasal();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (reason?: string) =>
      http.request<SellerApplication>(
        `${BASE}/${encodeURIComponent(applicationId!)}/withdraw`,
        { method: "POST", body: reason ? { reason } : {} },
      ),
    onSuccess: (application) => {
      writeApplication(qc, application);
      // Both, because this is one of the three writes that can change whether
      // there *is* an open application — which is the only question `current`
      // answers, and the one thing `writeApplication` refuses to guess at.
      void qc.invalidateQueries({ queryKey: oqk.applications() });
      void qc.invalidateQueries({ queryKey: oqk.current() });
    },
  });
}

/* ── cache plumbing ───────────────────────────────────────────────────────── */

/**
 * Put a freshly returned application everywhere it is already being read.
 *
 * Every write on this surface answers with the *whole* `toApplicantView` payload
 * — `patch`, `submit` and `withdraw` all end in `getMine` — so unlike the rest of
 * the seller surface there is no bare row to be careful about, and writing it
 * straight into the cache is honest rather than optimistic. It is what keeps the
 * autosave from flickering: without it every save would invalidate the read the
 * form is rendering from, and the form would redraw from a refetch a second after
 * the shopkeeper stopped typing.
 *
 * The list is invalidated rather than spliced by the callers that change status,
 * because a submitted application changes its position in a list sorted by
 * nothing this file can recompute.
 */
function writeApplication(qc: QueryClient, application: SellerApplication): void {
  qc.setQueryData<SellerApplication>(oqk.application(application.id), application);
  // `current` holds one application or null. Replaced only where it already
  // holds *this* one, and otherwise left exactly as it was — including absent.
  // An applicant with a rejected application behind them has a `current` of
  // `null`, and writing the rejected one in would invent an open application;
  // writing into a key nothing has fetched would answer a question nobody asked
  // and stop the real request from ever going out. The three mutations that can
  // change whether an application is open invalidate this key instead.
  qc.setQueryData<SellerApplication | null>(oqk.current(), (existing) =>
    existing && existing.id === application.id ? application : existing,
  );
  qc.setQueryData<SellerApplication[]>(oqk.applications(), (list) =>
    list?.map((row) => (row.id === application.id ? application : row)),
  );
}

/** Everything that could have changed after a document was added or removed. */
function invalidateApplication(qc: QueryClient, applicationId: string | null | undefined): void {
  if (applicationId) {
    void qc.invalidateQueries({ queryKey: oqk.application(applicationId) });
  }
  void qc.invalidateQueries({ queryKey: oqk.current() });
  void qc.invalidateQueries({ queryKey: oqk.applications() });
}

/**
 * A locally refused pick, as the same `ApiError` a server refusal would be.
 *
 * One error type means a screen has one error path. The status mirrors what the
 * server would have answered for the same file — 413 for size, 400 for the rest —
 * so a screen that keys off `status` behaves identically whether the check
 * happened here or there.
 */
function pickRejection(pick: Extract<DocumentPick, { ok: false }>): ApiError {
  switch (pick.code) {
    case "TOO_LARGE":
      return new ApiError(
        413,
        `That file is larger than ${Math.round((pick.limit ?? 0) / (1024 * 1024))} MB. Take the photo again at a smaller size.`,
        undefined,
        { code: pick.code },
      );
    case "EMPTY":
      return new ApiError(400, "That file is empty. Please choose it again.", undefined, {
        code: pick.code,
      });
    case "UNSUPPORTED_TYPE":
      return new ApiError(
        400,
        "GoPasal accepts a JPEG, PNG or WebP photo, or a PDF. Please choose one of those.",
        undefined,
        { code: pick.code },
      );
    case "UNKNOWN_TYPE":
      return new ApiError(
        400,
        "That file did not say what kind it is. Please choose it again.",
        undefined,
        { code: pick.code },
      );
  }
}

/** Anything thrown by a save, as the error type the screens already render. */
function asApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  return new ApiError(0, cause instanceof Error ? cause.message : "Couldn't save your answers.");
}
