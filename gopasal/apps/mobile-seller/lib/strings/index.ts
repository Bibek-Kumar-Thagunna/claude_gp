import type { Dictionary } from "@gopasal/native-ui";
import { core } from "./core";
import { registerStrings } from "./register";
import { settingsStrings } from "./settings";
import { teamStrings } from "./team";
import { promoStrings } from "./promo";
import { productStrings } from "./product";
import { deliveryStrings } from "./delivery";
import { legStrings } from "./leg";
import { joinStrings } from "./join";
import { inboxStrings } from "./inbox";

/**
 * The seller app's dictionary, assembled from one file per area.
 *
 * It was one file while the app was the counter alone. Once registration,
 * team, coupons, products, delivery and settings moved onto the phone it grew
 * past what anyone can read in one sitting, and the thing a single file was good
 * at — seeing "अर्डर" next to "अर्डर" and keeping them the same word — stopped
 * working. So it is split by area, the way the customer app's is.
 *
 * `core.ts` is first and holds the house rules for the Nepali, which apply to
 * every file here. A later file that redefines a core key wins; nothing does
 * today, and if something needs to, the override should be deliberate.
 */
export const strings: Dictionary = {
  ...core,
  ...registerStrings,
  ...settingsStrings,
  ...teamStrings,
  ...promoStrings,
  ...productStrings,
  ...deliveryStrings,
  ...legStrings,
  ...joinStrings,
  ...inboxStrings,
};
