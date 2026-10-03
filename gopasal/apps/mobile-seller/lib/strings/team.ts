import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the team screens. House rules for the Nepali are at the top of ./core.ts. */
export const teamStrings: Dictionary = {
  /* ── confirm ─────────────────────────────────────────────────────────── */
  "team.confirm.reactivate.detail": {
    en: "They get back everything {role} allows, straight away.",
    np: "{role} ले दिने सबै कुरा उहाँले तुरुन्तै फेरि पाउनुहुन्छ।",
  },
  "team.confirm.reactivate.title": { en: "Let {name} back in?", np: "{name} लाई फेरि भित्र दिने?" },
  "team.confirm.reactivate.yes": { en: "Let them in", np: "भित्र दिनुहोस्" },
  "team.confirm.remove.detail": {
    en: "They lose this shop straight away. Their GoPasal account stays, but this can't be undone — to bring them back you'd send a new invite, with a new code.",
    np: "उहाँले यो पसल तुरुन्तै गुमाउनुहुन्छ। गोपसल खाता रहन्छ, तर यो फर्काउन मिल्दैन — फेरि ल्याउन नयाँ कोडसहित नयाँ निम्तो पठाउनुपर्छ।",
  },
  "team.confirm.remove.self": {
    en: "That's you. You'll lose this shop straight away, and this can't be undone — someone would have to invite you again.",
    np: "यो त तपाईं हो। तपाईंले यो पसल तुरुन्तै गुमाउनुहुन्छ र फर्काउन मिल्दैन — अरू कसैले फेरि निम्तो पठाउनुपर्छ।",
  },
  "team.confirm.remove.title": {
    en: "Remove {name} from the team?",
    np: "{name} लाई टिमबाट हटाउने?",
  },
  "team.confirm.remove.yes": { en: "Remove", np: "हटाउनुहोस्" },
  "team.confirm.resend.detail": {
    en: "The link and code they have now stop working, and the new ones last another {days} days. The new code is shown to you once, here.",
    np: "उहाँसँग भएको लिंक र कोड चल्न छोड्छ, नयाँ चाहिँ अर्को {days} दिन चल्छ। नयाँ कोड तपाईंलाई यहीँ एक पटक मात्र देखाइन्छ।",
  },
  "team.confirm.resend.title": { en: "Send {who} a new code?", np: "{who} लाई नयाँ कोड पठाउने?" },
  "team.confirm.resend.yes": { en: "Resend", np: "फेरि पठाउनुहोस्" },
  "team.confirm.revoke.detail": {
    en: "Their link and code stop working — if they try them, they're told the invite is no longer valid. You can invite them again any time.",
    np: "उहाँको लिंक र कोड चल्न छोड्छ — प्रयोग गरे निम्तो अब मान्य छैन भनिन्छ। जहिले पनि फेरि निम्तो पठाउन सकिन्छ।",
  },
  "team.confirm.revoke.title": {
    en: "Cancel the invite to {who}?",
    np: "{who} लाई पठाएको निम्तो रद्द गर्ने?",
  },
  "team.confirm.revoke.yes": { en: "Cancel invite", np: "निम्तो रद्द गर्नुहोस्" },
  "team.confirm.role.detail": {
    en: "From their next tap they can do only what {role} allows. Anything {current} let them do that {role} doesn't stops working straight away.",
    np: "अर्को ट्यापदेखि उहाँले {role} ले दिने कुरा मात्र गर्न पाउनुहुन्छ। {current} ले दिने तर {role} ले नदिने कुरा तुरुन्तै बन्द हुन्छ।",
  },
  "team.confirm.role.title": { en: "Make {name} {role}?", np: "{name} लाई {role} बनाउने?" },
  "team.confirm.role.yes": { en: "Change role", np: "भूमिका बदल्नुहोस्" },
  "team.confirm.suspend.detail": {
    en: "They lose access to this shop straight away — no orders, chats or stock — until you let them back in. Their role is kept and nothing they've done is undone.",
    np: "उहाँले यो पसल तुरुन्तै चलाउन पाउनुहुन्न — अर्डर, कुराकानी, स्टक केही पनि — तपाईंले फेरि भित्र नदिएसम्म। भूमिका रहन्छ, गरेको कुनै काम उल्टिँदैन।",
  },
  "team.confirm.suspend.self": {
    en: "That's you. You'll lose access to this shop straight away, and someone else will have to let you back in.",
    np: "यो त तपाईं हो। तपाईंले यो पसल तुरुन्तै चलाउन पाउनुहुन्न, अरू कसैले फेरि भित्र दिनुपर्छ।",
  },
  "team.confirm.suspend.title": { en: "Suspend {name}?", np: "{name} लाई रोक्ने?" },
  "team.confirm.suspend.yes": { en: "Suspend", np: "रोक्नुहोस्" },

  /* ── empty ───────────────────────────────────────────────────────────── */
  "team.empty.detail": {
    en: "Invite the people who help behind the counter. Each signs in with their own phone number and sees only what their role allows — nobody needs your phone or your code, and you can take access away with one tap.",
    np: "काउन्टरमा सघाउनेलाई निम्तो दिनुहोस्। हरेकले आफ्नै फोन नम्बरबाट साइन इन गर्छन् र आफ्नो भूमिकाले दिने कुरा मात्र देख्छन् — कसैलाई तपाईंको फोन वा कोड चाहिँदैन, र एक ट्यापमै पहुँच हटाउन सकिन्छ।",
  },
  "team.empty.title": { en: "Just you so far", np: "अहिलेसम्म तपाईं मात्र" },

  /* ── failed ──────────────────────────────────────────────────────────── */
  "team.failed.title": { en: "Couldn't load the team", np: "टिम देखाउन सकिएन" },

  /* ── invite ──────────────────────────────────────────────────────────── */
  "team.invite.a11yResend": {
    en: "Resend the invite to {who}",
    np: "{who} लाई निम्तो फेरि पठाउनुहोस्",
  },
  "team.invite.a11yRevoke": {
    en: "Cancel the invite to {who}",
    np: "{who} लाई पठाएको निम्तो रद्द गर्नुहोस्",
  },
  "team.invite.expired": { en: "Expired", np: "म्याद सकियो" },
  "team.invite.lapsedLine": {
    en: "The link and code have run out. Resend to make new ones.",
    np: "लिंक र कोडको म्याद सकियो। नयाँ बनाउन फेरि पठाउनुहोस्।",
  },
  "team.invite.resend": { en: "Resend", np: "फेरि पठाउनुहोस्" },
  "team.invite.revoke": { en: "Cancel invite", np: "निम्तो रद्द गर्नुहोस्" },
  "team.invite.smsFailed": {
    en: "The text message didn't go. Resend and share the new code with them directly.",
    np: "म्यासेज गएन। फेरि पठाएर नयाँ कोड उहाँलाई आफैं दिनुहोस्।",
  },
  "team.invite.triesLeft": {
    en: "{count} wrong-code tries left before it locks",
    np: "लक हुनुअघि गलत कोडका {count} प्रयास बाँकी",
  },
  "team.invite.untilLine": {
    en: "Sent {sent} · works until {date}",
    np: "{sent} मा पठाइयो · {date} सम्म चल्छ",
  },
  "team.invite.waiting": { en: "Waiting", np: "पर्खँदै" },

  /* ── general ─────────────────────────────────────────────────────────── */
  "team.inviteButton": { en: "Invite someone", np: "कसैलाई निम्तो दिनुहोस्" },
  "team.readOnly": {
    en: "Your role can see the team but not change it. Inviting, suspending and removing people is for whoever has \"Invite, suspend and remove staff\".",
    np: "तपाईंको भूमिकाले टिम हेर्न दिन्छ, बदल्न दिँदैन। निम्तो दिने, रोक्ने र हटाउने काम \"कर्मचारीलाई निम्तो दिने, रोक्ने र हटाउने\" भएकाको हो।",
  },
  "team.title": { en: "Team", np: "टिम" },

  /* ── inviteForm ──────────────────────────────────────────────────────── */
  "team.inviteForm.another": { en: "Invite someone else", np: "अरू कसैलाई निम्तो दिनुहोस्" },
  "team.inviteForm.intro": {
    en: "GoPasal texts them a link and a code. They join by signing in with their own number — nobody needs your phone or your code. The invite works for {days} days.",
    np: "गोपसलले उहाँलाई लिंक र कोड म्यासेज गर्छ। उहाँ आफ्नै नम्बरबाट साइन इन गरेर जोडिनुहुन्छ — कसैलाई तपाईंको फोन वा कोड चाहिँदैन। निम्तो {days} दिन चल्छ।",
  },
  "team.inviteForm.name": { en: "Their name (optional)", np: "उहाँको नाम (ऐच्छिक)" },
  "team.inviteForm.nameHint": {
    en: "Shown to them when they open the invite, so they know it's meant for them.",
    np: "निम्तो खोल्दा उहाँलाई देखिन्छ, आफ्नै लागि हो भनेर थाहा हुन्छ।",
  },
  "team.inviteForm.note": { en: "A note for them (optional)", np: "उहाँलाई एउटा नोट (ऐच्छिक)" },
  "team.inviteForm.noteHint": { en: "Goes in the text message.", np: "म्यासेजमै जान्छ।" },
  "team.inviteForm.notePlaceholder": {
    en: "e.g. You'll handle the evening orders",
    np: "जस्तै: बेलुकाका अर्डर तपाईंले हेर्नुहुन्छ",
  },
  "team.inviteForm.phone": { en: "Their mobile number", np: "उहाँको मोबाइल नम्बर" },
  "team.inviteForm.phoneHint": {
    en: "The number they'll sign in with. It has to be theirs, not the shop's.",
    np: "उहाँले साइन इन गर्ने नम्बर। पसलको होइन, उहाँकै हुनुपर्छ।",
  },
  "team.inviteForm.phoneNeeded": {
    en: "Their number is how they join.",
    np: "उहाँ नम्बरबाटै जोडिनुहुन्छ।",
  },
  "team.inviteForm.role": { en: "What they'll do here", np: "यहाँ उहाँले के गर्नुहुन्छ" },
  "team.inviteForm.roleNeeded": {
    en: "Choose what they'll do here.",
    np: "यहाँ उहाँले के गर्नुहुन्छ, छान्नुहोस्।",
  },
  "team.inviteForm.send": { en: "Send invite", np: "निम्तो पठाउनुहोस्" },
  "team.inviteForm.title": { en: "Invite someone", np: "कसैलाई निम्तो दिनुहोस्" },

  /* ── invites ─────────────────────────────────────────────────────────── */
  "team.invites.failed": {
    en: "Couldn't load the invites that are waiting.",
    np: "पर्खिरहेका निम्ता देखाउन सकिएन।",
  },

  /* ── leave ───────────────────────────────────────────────────────────── */
  "team.leave.go": { en: "Leave anyway", np: "तैपनि छोड्नुहोस्" },
  "team.leave.pendingDetail": {
    en: "If you leave now, its link and code can't be shown to you — you'd have to resend it, which makes new ones.",
    np: "अहिले छोड्नुभयो भने यसको लिंक र कोड देखाउन सकिँदैन — फेरि पठाउनुपर्छ, जसले नयाँ बनाउँछ।",
  },
  "team.leave.pendingTitle": { en: "The invite is still being made", np: "निम्तो अझै बन्दै छ" },
  "team.leave.showingDetail": {
    en: "This link and code are shown only once. If they haven't got them yet, you'd have to resend the invite, which makes new ones.",
    np: "यो लिंक र कोड एक पटक मात्र देखाइन्छ। उहाँले पाउनुभएको छैन भने निम्तो फेरि पठाउनुपर्छ, जसले नयाँ बनाउँछ।",
  },
  "team.leave.showingTitle": { en: "Leave without sharing?", np: "नपठाई छोड्ने?" },
  "team.leave.stay": { en: "Stay here", np: "यहीँ बस्नुहोस्" },

  /* ── member ──────────────────────────────────────────────────────────── */
  "team.member.a11y": { en: "{name}, {role}, {status}", np: "{name}, {role}, {status}" },
  "team.member.a11yReactivate": { en: "Let {name} back in", np: "{name} लाई फेरि भित्र दिनुहोस्" },
  "team.member.a11yRemove": {
    en: "Remove {name} from the team",
    np: "{name} लाई टिमबाट हटाउनुहोस्",
  },
  "team.member.a11ySuspend": { en: "Suspend {name}", np: "{name} लाई रोक्नुहोस्" },
  "team.member.active": { en: "Active", np: "सक्रिय" },
  "team.member.owner": { en: "Owner", np: "मालिक" },
  "team.member.reactivate": { en: "Let them back in", np: "फेरि भित्र दिनुहोस्" },
  "team.member.remove": { en: "Remove from the team", np: "टिमबाट हटाउनुहोस्" },
  "team.member.roleHeading": { en: "ROLE", np: "भूमिका" },
  "team.member.suspend": { en: "Suspend", np: "रोक्नुहोस्" },
  "team.member.suspended": { en: "Suspended", np: "रोकिएको" },
  "team.member.you": { en: "you", np: "तपाईं" },

  /* ── noAccess ────────────────────────────────────────────────────────── */
  "team.noAccess.detail": {
    en: "Your role here doesn't include {what}. The shop's owner can change that.",
    np: "यहाँ तपाईंको भूमिकामा {what} पर्दैन। पसलको मालिकले बदल्न सक्नुहुन्छ।",
  },
  "team.noAccess.restrictedDetail": {
    en: "{what} opens up again once GoPasal clears the shop.",
    np: "गोपसलले पसल खुला गरेपछि {what} फेरि खुल्छ।",
  },
  "team.noAccess.restrictedTitle": {
    en: "Not while the shop is in this state",
    np: "पसल यो अवस्थामा हुँदा होइन",
  },
  "team.noAccess.title": { en: "You don't have access to this", np: "तपाईंलाई यसको पहुँच छैन" },

  /* ── perm ────────────────────────────────────────────────────────────── */
  "team.perm.analytics.view": { en: "See sales figures", np: "बिक्रीको हिसाब हेर्ने" },
  "team.perm.catalog.create": { en: "Add new products", np: "नयाँ सामान थप्ने" },
  "team.perm.catalog.delete": { en: "Delete products", np: "सामान मेटाउने" },
  "team.perm.catalog.edit": { en: "Change products and prices", np: "सामान र मूल्य बदल्ने" },
  "team.perm.catalog.import": {
    en: "Bulk upload (not available yet — does nothing)",
    np: "एकैपटक धेरै अपलोड (अहिले उपलब्ध छैन — केही गर्दैन)",
  },
  "team.perm.catalog.view": { en: "See the products", np: "सामान हेर्ने" },
  "team.perm.dashboard.view": { en: "See the shop's overview", np: "पसलको सारांश हेर्ने" },
  "team.perm.delivery.assign": {
    en: "Choose which rider takes an order",
    np: "कुन राइडरले अर्डर लैजाने छान्ने",
  },
  "team.perm.delivery.update": {
    en: "Record a delivery as handed over",
    np: "डेलिभरी बुझाइयो भनी राख्ने",
  },
  "team.perm.delivery.view": { en: "See where deliveries are", np: "डेलिभरी कहाँ पुग्यो हेर्ने" },
  "team.perm.finance.view": { en: "See payouts and money owed", np: "भुक्तानी र बाँकी रकम हेर्ने" },
  "team.perm.inventory.adjust": { en: "Change stock counts", np: "स्टक संख्या बदल्ने" },
  "team.perm.inventory.view": { en: "See stock counts", np: "स्टक संख्या हेर्ने" },
  "team.perm.messages.respond": { en: "Reply to customers", np: "ग्राहकलाई जवाफ दिने" },
  "team.perm.messages.view": { en: "Read customer chats", np: "ग्राहकका कुराकानी पढ्ने" },
  "team.perm.orders.accept": { en: "Accept new orders", np: "नयाँ अर्डर स्वीकार्ने" },
  "team.perm.orders.cancel": {
    en: "Cancel orders already accepted",
    np: "स्वीकारिसकेको अर्डर रद्द गर्ने",
  },
  "team.perm.orders.complete": {
    en: "Mark delivered (old setting — does nothing on its own)",
    np: "डेलिभर भयो भनी राख्ने (पुरानो सेटिङ — आफैं केही गर्दैन)",
  },
  "team.perm.orders.dispatch": { en: "Hand orders to a rider", np: "अर्डर राइडरलाई दिने" },
  "team.perm.orders.pack": { en: "Mark orders packed", np: "अर्डर प्याक भयो भनी राख्ने" },
  "team.perm.orders.reject": { en: "Turn down orders", np: "अर्डर अस्वीकार गर्ने" },
  "team.perm.orders.view": { en: "See incoming orders", np: "आएका अर्डर हेर्ने" },
  "team.perm.promotions.manage": {
    en: "Create, change and turn off coupons",
    np: "कुपन बनाउने, बदल्ने र बन्द गर्ने",
  },
  "team.perm.promotions.view": { en: "See the shop's coupons", np: "पसलका कुपन हेर्ने" },
  "team.perm.rbac.manage": { en: "Create and change roles", np: "भूमिका बनाउने र बदल्ने" },
  "team.perm.reviews.reply": { en: "Reply to reviews", np: "रिभ्युको जवाफ दिने" },
  "team.perm.reviews.view": { en: "Read customer reviews", np: "ग्राहकका रिभ्यु पढ्ने" },
  "team.perm.settings.manage": { en: "Change shop settings", np: "पसलको सेटिङ बदल्ने" },
  "team.perm.settings.view": { en: "See shop settings", np: "पसलको सेटिङ हेर्ने" },
  "team.perm.team.invite": {
    en: "Invite, suspend and remove staff",
    np: "कर्मचारीलाई निम्तो दिने, रोक्ने र हटाउने",
  },
  "team.perm.team.view": { en: "See who works here", np: "यहाँ को-को काम गर्छन् हेर्ने" },

  /* ── permGroup ───────────────────────────────────────────────────────── */
  "team.permGroup.Analytics": { en: "Sales figures", np: "बिक्रीको हिसाब" },
  "team.permGroup.Catalog": { en: "Products", np: "सामान" },
  "team.permGroup.Delivery": { en: "Delivery", np: "डेलिभरी" },
  "team.permGroup.Finance": { en: "Money", np: "पैसा" },
  "team.permGroup.General": { en: "General", np: "सामान्य" },
  "team.permGroup.Inventory": { en: "Stock", np: "स्टक" },
  "team.permGroup.Messages": { en: "Chats", np: "कुराकानी" },
  "team.permGroup.Orders": { en: "Orders", np: "अर्डर" },
  "team.permGroup.Promotions": { en: "Coupons", np: "कुपन" },
  "team.permGroup.Reviews": { en: "Reviews", np: "रिभ्यु" },
  "team.permGroup.Settings": { en: "Shop settings", np: "पसलको सेटिङ" },
  "team.permGroup.Team": { en: "Team", np: "टिम" },

  /* ── perms ───────────────────────────────────────────────────────────── */
  "team.perms.a11yAll": { en: "Tick everything in {group}", np: "{group} का सबैमा टिक लगाउनुहोस्" },
  "team.perms.a11yNone": {
    en: "Untick everything in {group}",
    np: "{group} का सबैको टिक हटाउनुहोस्",
  },
  "team.perms.all": { en: "All", np: "सबै" },
  "team.perms.none": { en: "None", np: "कुनै पनि होइन" },
  "team.perms.other": { en: "OTHER", np: "अन्य" },

  /* ── refusal ─────────────────────────────────────────────────────────── */
  "team.refusal.already-in-that-state": {
    en: "They are already in that state.",
    np: "उहाँ पहिल्यै त्यही अवस्थामा हुनुहुन्छ।",
  },
  "team.refusal.cannot-promote-to-owner": {
    en: "Cannot promote staff to Owner",
    np: "कर्मचारीलाई मालिक बनाउन मिल्दैन",
  },
  "team.refusal.invite-already-accepted": {
    en: "This invite was already accepted.",
    np: "यो निम्तो पहिल्यै स्वीकारिसकिएको छ।",
  },
  "team.refusal.invite-was-revoked": {
    en: "This invite was revoked. Send a new one instead.",
    np: "यो निम्तो रद्द भइसक्यो। बरु नयाँ पठाउनुहोस्।",
  },
  "team.refusal.missing-permission": {
    en: "Your role doesn't allow this.",
    np: "तपाईंको भूमिकाले यो गर्न दिँदैन।",
  },
  "team.refusal.owner-cannot-be-removed": {
    en: "The owner cannot be removed",
    np: "मालिकलाई हटाउन मिल्दैन",
  },
  "team.refusal.owner-cannot-be-suspended": {
    en: "The owner cannot be suspended",
    np: "मालिकलाई रोक्न मिल्दैन",
  },
  "team.refusal.owner-role-is-fixed": {
    en: "The owner’s role cannot be changed",
    np: "मालिकको भूमिका बदल्न मिल्दैन",
  },
  "team.refusal.privileged-role-is-fixed": {
    en: "Privileged roles cannot be edited.",
    np: "विशेष भूमिका बदल्न मिल्दैन।",
  },
  "team.refusal.role-not-assignable": { en: "Role not found", np: "भूमिका भेटिएन" },
  "team.refusal.role-still-has-members": {
    en: "Reassign the members of this role before deleting it.",
    np: "मेटाउनुअघि यो भूमिकाका सदस्यलाई अर्को भूमिका दिनुहोस्।",
  },
  "team.refusal.system-role-is-a-template": {
    en: "System roles cannot be edited — clone it first.",
    np: "गोपसलका भूमिका बदल्न मिल्दैन — पहिले कपी बनाउनुहोस्।",
  },

  /* ── role ────────────────────────────────────────────────────────────── */
  "team.role.a11y": { en: "{role}, {meta}", np: "{role}, {meta}" },
  "team.role.a11yCopy": { en: "Make a copy of {role}", np: "{role} को कपी बनाउनुहोस्" },
  "team.role.a11yDelete": { en: "Delete {role}", np: "{role} मेटाउनुहोस्" },
  "team.role.a11yEdit": { en: "Edit {role}", np: "{role} बदल्नुहोस्" },
  "team.role.catalogMissing": {
    en: "Couldn't load the list of permissions.",
    np: "अनुमतिहरूको सूची देखाउन सकिएन।",
  },
  "team.role.copy": { en: "Make a copy", np: "कपी बनाउनुहोस्" },
  "team.role.delete": { en: "Delete this role", np: "यो भूमिका मेटाउनुहोस्" },
  "team.role.edit": { en: "Edit", np: "बदल्नुहोस्" },
  "team.role.everything": { en: "Everything", np: "सबै कुरा" },
  "team.role.nobody": { en: "nobody here has it", np: "यहाँ कसैसँग छैन" },
  "team.role.nothing": {
    en: "This role doesn't allow anything yet.",
    np: "यो भूमिकाले अहिलेसम्म केही गर्न दिँदैन।",
  },
  "team.role.onePerson": { en: "1 person here", np: "यहाँ 1 जना" },
  "team.role.ownerAll": {
    en: "Everything in the shop, including anything GoPasal adds later. Nobody can be given this role — it belongs to the shop's owner.",
    np: "पसलका सबै कुरा, गोपसलले पछि थप्ने कुरासमेत। यो भूमिका कसैलाई दिन मिल्दैन — यो पसलको मालिकको हो।",
  },
  "team.role.people": { en: "{count} people here", np: "यहाँ {count} जना" },
  "team.role.permCount": { en: "{count} permissions", np: "{count} अनुमति" },
  "team.role.readyMade": { en: "Ready-made", np: "तयारी" },

  /* ── roleEditor ──────────────────────────────────────────────────────── */
  "team.roleEditor.can": { en: "Someone with this role can", np: "यो भूमिका भएकाले गर्न सक्छन्" },
  "team.roleEditor.copyHalf": {
    en: "The copy was made as \"{name}\", but your changes to it didn't save: {reason}",
    np: "कपी \"{name}\" नाममा बन्यो, तर त्यसमा गरेका परिवर्तन सेभ भएनन्: {reason}",
  },
  "team.roleEditor.copyName": { en: "{name} (copy)", np: "{name} (कपी)" },
  "team.roleEditor.copyTitle": { en: "Copy a role", np: "भूमिकाको कपी" },
  "team.roleEditor.create": { en: "Create role", np: "भूमिका बनाउनुहोस्" },
  "team.roleEditor.description": { en: "What it's for (optional)", np: "केका लागि हो (ऐच्छिक)" },
  "team.roleEditor.descriptionPlaceholder": {
    en: "e.g. Takes orders and payments at the counter",
    np: "जस्तै: काउन्टरमा अर्डर र पैसा लिन्छ",
  },
  "team.roleEditor.editTitle": { en: "Edit role", np: "भूमिका बदल्नुहोस्" },
  "team.roleEditor.gone": { en: "That role isn't there any more", np: "त्यो भूमिका अब छैन" },
  "team.roleEditor.goneDetail": {
    en: "Someone may have deleted it. Go back to the list to see the roles as they are now.",
    np: "कसैले मेटाएको हुन सक्छ। अहिलेका भूमिका हेर्न सूचीमा फर्कनुहोस्।",
  },
  "team.roleEditor.heldMany": {
    en: "{count} people have this role. They all get the new list the moment you save.",
    np: "{count} जनासँग यो भूमिका छ। सेभ गर्नासाथ सबैले नयाँ सूची पाउँछन्।",
  },
  "team.roleEditor.heldOne": {
    en: "1 person has this role. They get the new list the moment you save.",
    np: "1 जनासँग यो भूमिका छ। सेभ गर्नासाथ उहाँले नयाँ सूची पाउनुहुन्छ।",
  },
  "team.roleEditor.name": { en: "Name", np: "नाम" },
  "team.roleEditor.nameLength": {
    en: "A role's name is {min} to {max} characters.",
    np: "भूमिकाको नाम {min} देखि {max} अक्षरको हुन्छ।",
  },
  "team.roleEditor.namePlaceholder": { en: "e.g. Cashier", np: "जस्तै: क्यासियर" },
  "team.roleEditor.newTitle": { en: "New role", np: "नयाँ भूमिका" },
  "team.roleEditor.nonePicked": {
    en: "Tick at least one thing. A role that allows nothing can't be saved.",
    np: "कम्तीमा एउटामा टिक लगाउनुहोस्। केही गर्न नदिने भूमिका सेभ हुँदैन।",
  },
  "team.roleEditor.ownerCopy": {
    en: "A copy of Owner is an ordinary role: it has exactly the ticks below, and it can be given to people.",
    np: "मालिकको कपी साधारण भूमिका हो: तलका टिक मात्र हुन्छन्, र मान्छेलाई दिन सकिन्छ।",
  },
  "team.roleEditor.saveCopy": { en: "Make the copy", np: "कपी बनाउनुहोस्" },
  "team.roleEditor.ticked": { en: "{count} ticked", np: "{count} टिक" },

  /* ── rolePicker ──────────────────────────────────────────────────────── */
  "team.rolePicker.a11yCurrent": {
    en: "{role}, their role now",
    np: "{role}, उहाँको अहिलेको भूमिका",
  },
  "team.rolePicker.a11yRole": { en: "{role}, {count} permissions", np: "{role}, {count} अनुमति" },
  "team.rolePicker.count": { en: "{count} things they can do", np: "{count} कुरा गर्न सक्छन्" },
  "team.rolePicker.current": { en: "Their role now", np: "अहिलेको भूमिका" },
  "team.rolePicker.empty": {
    en: "The only role in this shop is Owner, and nobody can be made Owner. Make a role first — a copy of one of GoPasal's ready-made ones is the quickest way.",
    np: "यो पसलमा मालिक मात्र भूमिका छ, र कसैलाई मालिक बनाउन मिल्दैन। पहिले भूमिका बनाउनुहोस् — गोपसलका तयारी भूमिकाको कपी सबैभन्दा छिटो उपाय हो।",
  },
  "team.rolePicker.failed": {
    en: "Couldn't load the shop's roles. Check the connection.",
    np: "पसलका भूमिका देखाउन सकिएन। इन्टरनेट हेर्नुहोस्।",
  },
  "team.rolePicker.needsRoles.change": {
    en: "Your role can't see the shop's list of roles, so it can't move people between them. Ask the owner to add \"Create and change roles\" to your role, or to make this change.",
    np: "तपाईंको भूमिकाले पसलका भूमिकाको सूची देख्दैन, त्यसैले मान्छेको भूमिका बदल्न सक्दैन। मालिकलाई तपाईंको भूमिकामा \"भूमिका बनाउने र बदल्ने\" थप्न वा यो आफैं बदल्न भन्नुहोस्।",
  },
  "team.rolePicker.needsRoles.invite": {
    en: "Inviting someone means choosing their role, and your role can't see the shop's list of roles. Ask the owner to add \"Create and change roles\" to your role, or to send this invite themselves.",
    np: "निम्तो दिँदा भूमिका छान्नुपर्छ, तर तपाईंको भूमिकाले पसलका भूमिकाको सूची देख्दैन। मालिकलाई तपाईंको भूमिकामा \"भूमिका बनाउने र बदल्ने\" थप्न वा यो निम्तो आफैं पठाउन भन्नुहोस्।",
  },
  "team.rolePicker.openRoles": { en: "Set up roles", np: "भूमिका मिलाउनुहोस्" },
  "team.rolePicker.whatCanTheyDo": {
    en: "See what each role can do",
    np: "कुन भूमिकाले के गर्न सक्छ हेर्नुहोस्",
  },
  "team.rolePicker.yours": { en: "This shop's", np: "यो पसलको" },

  /* ── roles ───────────────────────────────────────────────────────────── */
  "team.roles.deleteDetail": {
    en: "It's removed from this shop for good. Nobody has it now, so nobody loses anything.",
    np: "यो पसलबाट सधैंका लागि हट्छ। अहिले कसैसँग छैन, त्यसैले कसैले केही गुमाउँदैन।",
  },
  "team.roles.deleteTitle": { en: "Delete {role}?", np: "{role} मेटाउने?" },
  "team.roles.deleteYes": { en: "Delete", np: "मेटाउनुहोस्" },
  "team.roles.failed": { en: "Couldn't load the roles", np: "भूमिका देखाउन सकिएन" },
  "team.roles.intro": {
    en: "A role is a list of what somebody may do in the shop. Everyone on the team has exactly one, and changing a role changes it for everyone who has it, straight away.",
    np: "भूमिका भनेको पसलमा कसले के गर्न पाउँछ भन्ने सूची हो। टिमका हरेकको ठ्याक्कै एउटा हुन्छ, र भूमिका बदल्दा त्यो भएका सबैका लागि तुरुन्तै बदलिन्छ।",
  },
  "team.roles.new": { en: "New role", np: "नयाँ भूमिका" },
  "team.roles.own": { en: "THIS SHOP'S ROLES", np: "यो पसलका भूमिका" },
  "team.roles.ownEmpty": {
    en: "None yet. Copy one of the ready-made roles below and change it, or start a new one — that's how you get a role that fits how your shop works.",
    np: "अहिलेसम्म छैन। तलको तयारी भूमिकाको कपी बनाएर बदल्नुहोस्, वा नयाँ सुरु गर्नुहोस् — पसल चल्ने तरिकासँग मिल्ने भूमिका यसरी बन्छ।",
  },
  "team.roles.readyMade": { en: "GOPASAL'S READY-MADE ROLES", np: "गोपसलका तयारी भूमिका" },
  "team.roles.readyMadeNote": {
    en: "Shared by every shop on GoPasal, so they can't be changed. Make a copy to get one you can change.",
    np: "गोपसलका सबै पसलले प्रयोग गर्छन्, त्यसैले बदल्न मिल्दैन। बदल्न मिल्ने चाहिए कपी बनाउनुहोस्।",
  },
  "team.roles.row": { en: "Roles", np: "भूमिका" },
  "team.roles.rowDetail": {
    en: "What each role is allowed to do",
    np: "कुन भूमिकाले के गर्न पाउँछ",
  },
  "team.roles.title": { en: "Roles", np: "भूमिका" },

  /* ── section ─────────────────────────────────────────────────────────── */
  "team.section.invited": { en: "INVITED, NOT JOINED YET", np: "निम्तो पाएका, अझै नजोडिएका" },
  "team.section.suspended": { en: "SUSPENDED", np: "रोकिएका" },
  "team.section.suspendedNote": {
    en: "They can't do anything in this shop until you let them back in.",
    np: "तपाईंले फेरि भित्र नदिएसम्म उहाँहरू यो पसलमा केही गर्न सक्नुहुन्न।",
  },
  "team.section.working": { en: "WORKING HERE", np: "यहाँ काम गर्ने" },

  /* ── share ───────────────────────────────────────────────────────────── */
  "team.share.a11yCode": { en: "Invite code {code}", np: "निम्तो कोड {code}" },
  "team.share.as": { en: "As {role}", np: "{role} को रूपमा" },
  "team.share.button": { en: "Share link and code", np: "लिंक र कोड पठाउनुहोस्" },
  "team.share.codeHow": {
    en: "They sign in to GoPasal with {phone}, then type this code.",
    np: "उहाँ {phone} बाट गोपसलमा साइन इन गरेर यो कोड हाल्नुहुन्छ।",
  },
  "team.share.codeLabel": { en: "THEIR CODE", np: "उहाँको कोड" },
  "team.share.done": { en: "Done — they have it", np: "भयो — उहाँले पाउनुभयो" },
  "team.share.linkLabel": { en: "Or they open this link", np: "वा यो लिंक खोल्नुहोस्" },
  "team.share.message": {
    en: "You're invited to join {shop} on GoPasal as {role}.\n\nOpen this link: {link}\n\nSign in with this phone number, then enter the code {code}. It works until {date}.",
    np: "तपाईंलाई गोपसलमा {shop} मा {role} को रूपमा जोडिन निम्तो छ।\n\nयो लिंक खोल्नुहोस्: {link}\n\nयही फोन नम्बरबाट साइन इन गरेर कोड {code} हाल्नुहोस्। {date} सम्म चल्छ।",
  },
  "team.share.notSent": {
    en: "The text message to {phone} didn't go. The invite still works — share it with them yourself.",
    np: "{phone} मा म्यासेज गएन। निम्तो चल्छ — आफैं पठाइदिनुहोस्।",
  },
  "team.share.once": {
    en: "This code is shown only this once. It works until {date}. If it gets lost, resend the invite — that makes a new code and the old one stops working.",
    np: "यो कोड एक पटक मात्र देखाइन्छ। {date} सम्म चल्छ। हरायो भने निम्तो फेरि पठाउनुहोस् — नयाँ कोड बन्छ, पुरानो चल्न छोड्छ।",
  },
  "team.share.sent": {
    en: "GoPasal texted the link and code to {phone}.",
    np: "गोपसलले {phone} मा लिंक र कोड म्यासेज गर्‍यो।",
  },
  "team.share.title": { en: "Invite ready for {who}", np: "{who} का लागि निम्तो तयार" },
  "team.share.unavailable": {
    en: "Sharing isn't available here. Press and hold the code or the link to copy it.",
    np: "यहाँबाट पठाउन मिल्दैन। कपी गर्न कोड वा लिंकमा थिचिराख्नुहोस्।",
  },
  "team.share.unknownSent": {
    en: "We can't tell whether the text reached {phone}. Share it with them yourself to be sure.",
    np: "{phone} मा म्यासेज पुग्यो कि पुगेन थाहा भएन। पक्का गर्न आफैं पठाइदिनुहोस्।",
  },

  /* ── systemRole ──────────────────────────────────────────────────────── */
  "team.systemRole.delivery": { en: "Delivery", np: "डेलिभरी" },
  "team.systemRole.delivery.detail": {
    en: "Delivers orders in the shop area",
    np: "पसल वरपर अर्डर डेलिभर गर्छ",
  },
  "team.systemRole.inventoryEditor": { en: "Inventory Editor", np: "सामान र स्टक हेर्ने" },
  "team.systemRole.inventoryEditor.detail": {
    en: "Manages products and stock",
    np: "सामान र स्टक मिलाउँछ",
  },
  "team.systemRole.manager": { en: "Manager", np: "म्यानेजर" },
  "team.systemRole.manager.detail": { en: "Runs day-to-day operations", np: "दैनिक काम चलाउँछ" },
  "team.systemRole.orderHandler": { en: "Order Handler", np: "अर्डर हेर्ने" },
  "team.systemRole.orderHandler.detail": {
    en: "Accepts and prepares orders",
    np: "अर्डर स्वीकार्छ र तयार गर्छ",
  },
  "team.systemRole.owner": { en: "Owner", np: "मालिक" },
  "team.systemRole.owner.detail": { en: "Full control of the shop", np: "पसलको पूरा नियन्त्रण" },
  "team.systemRole.supportStaff": { en: "Support Staff", np: "ग्राहक सेवा" },
  "team.systemRole.supportStaff.detail": {
    en: "Handles customer questions and reviews",
    np: "ग्राहकका प्रश्न र रिभ्यु हेर्छ",
  },

  /* ── what ────────────────────────────────────────────────────────────── */
  "team.what.invite": { en: "inviting people", np: "निम्तो दिने काम" },
  "team.what.roles": { en: "roles", np: "भूमिका" },
  "team.what.roster": { en: "the team list", np: "टिमको सूची" },
};
