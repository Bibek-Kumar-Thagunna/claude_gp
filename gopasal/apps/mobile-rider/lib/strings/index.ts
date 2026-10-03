import type { Dictionary } from "@gopasal/native-ui";
import { core } from "./core";
import { riderStrings } from "./rider";

/**
 * The rider app's dictionary: the shared chrome first, then the rider's own
 * words. A rider key that repeats a core key wins, deliberately.
 */
export const strings: Dictionary = {
  ...core,
  ...riderStrings,
};
