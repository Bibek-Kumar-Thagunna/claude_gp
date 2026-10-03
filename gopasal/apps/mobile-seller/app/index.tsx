import * as React from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { useGopasal } from "@gopasal/native-data";
import { useSelectedShop } from "@gopasal/native-data/seller";
import { useMyPendingInvites } from "@gopasal/native-data/seller-team";
import { Skeleton, theme } from "@gopasal/native-ui";
import { takePendingJoin } from "../lib/pending-join";

/**
 * The first screen, which is not a screen.
 *
 * Three questions decide where a shopkeeper lands, and they have to be asked in
 * this order because each one only makes sense once the last is answered:
 *
 *  1. **Is there a session?** Until the keystore has been read there is no
 *     honest answer — `ready` is false — and guessing means either flashing the
 *     sign-in screen at somebody who is already signed in, or worse, flashing
 *     the queue at somebody who is not.
 *  2. **Which shop?** Every seller route is `/seller/shops/:shopId/...`, so a
 *     queue cannot be asked for before this is settled. One shop needs no
 *     question; several with none chosen does.
 *  3. **Then the counter.**
 *
 * Two detours sit in front of registration. An invite link opened before
 * sign-in comes back here with its token, and goes to that invite. And a
 * number with no shop but an invitation waiting goes to "join a shop" rather
 * than "register one" — a shop assistant should never be asked for a PAN.
 *
 * A placeholder rather than a spinner while it decides: this resolves in a
 * frame or two from disk, and a spinner that appears and vanishes that fast
 * reads as a flicker, not as progress.
 */
export default function Gate() {
  const { user, ready } = useGopasal();
  const shop = useSelectedShop();
  const invites = useMyPendingInvites();
  // Taken once, on the first render with a session, so the gate cannot loop.
  const [join] = React.useState(() => (user ? takePendingJoin() : null));

  if (!ready) return <Waiting />;
  if (!user) return <Redirect href="/auth/phone" />;
  if (join) return <Redirect href={{ pathname: "/join/[token]", params: { token: join } }} />;

  // The shop list is a network call; the stored id is not. Both have to land
  // before "which shop" has an answer that will not change under the customer.
  if (!shop.ready) return <Waiting />;
  // Never had a shop, and the list said so rather than failing to answer.
  // Straight into registration: landing somebody on a shop *picker* with no
  // shops to pick is a screen that has to explain itself before it can help.
  // An error is a different thing — the picker owns that, because it is the
  // one with a retry on it.
  if (shop.shops.length === 0 && !shop.error) {
    if (invites.isPending) return <Waiting />;
    const waiting = (invites.data ?? []).some((invite) => invite.scope === "SHOP");
    return <Redirect href={waiting ? "/join" : "/register"} />;
  }

  if (shop.needsChoice || !shop.shopId) return <Redirect href="/shop-picker" />;

  return <Redirect href="/(tabs)/queue" />;
}

function Waiting() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.background,
        padding: theme.spacing[4],
        gap: theme.spacing[3],
        paddingTop: theme.spacing[16],
      }}
    >
      <Skeleton width="52%" height={22} />
      <Skeleton width="100%" height={96} radius={theme.radii.lg} delay={60} />
      <Skeleton width="100%" height={96} radius={theme.radii.lg} delay={120} />
    </View>
  );
}
