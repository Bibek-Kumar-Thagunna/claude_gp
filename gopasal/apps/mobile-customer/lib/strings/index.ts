import type { Dictionary } from "@gopasal/native-ui";
import { core } from "./core";
import { auth } from "./auth";
import { chat } from "./chat";
import { browse } from "./browse";
import { account } from "./account";
import { help } from "./help";
import { group } from "./group";
import { order } from "./order";
import { screens } from "./screens";

/**
 * The app's dictionary, assembled from one file per area.
 *
 * It was a single file until it was about six hundred lines, at which point
 * the thing it was good at — letting you see "cart" next to "cart" and keep
 * them the same word — stopped working, because nothing fits on one screen any
 * more. The split is by area rather than by screen so that the words a customer
 * reads in one sitting still sit together: every tracking string is in
 * `order.ts`, every sign-in string in `auth.ts`.
 *
 * `core.ts` holds the chrome and the shared verbs and is listed first, so a
 * later area that redefines one of its keys wins. Nothing does today; when
 * something needs to, the override should be deliberate and visible here.
 *
 * The house rules for the Nepali live at the top of `core.ts` and apply to
 * every file in this folder.
 */
export const strings: Dictionary = {
  ...core,
  ...auth,
  ...chat,
  ...browse,
  ...account,
  ...help,
  ...group,
  ...order,
  ...screens,
};
