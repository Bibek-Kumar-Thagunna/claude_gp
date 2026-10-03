import type { Dictionary } from "@gopasal/native-ui";

/** The notifications inbox. House rules are at the top of ./core.ts. */
export const inboxStrings: Dictionary = {
  "inbox.title": { en: "Notifications", np: "सूचनाहरू" },
  "inbox.readAll": { en: "Mark all read", np: "सबै पढियो" },
  "inbox.empty": { en: "Nothing yet", np: "अहिलेसम्म केही छैन" },
  "inbox.emptyDetail": {
    en: "New orders, messages, reviews and payouts show up here as well as on your phone's lock screen.",
    np: "नयाँ अर्डर, सन्देश, रिभ्यु र भुक्तानी फोनको लक स्क्रिनसँगै यहाँ पनि देखिन्छ।",
  },
  "inbox.a11y.new": { en: "Not read yet", np: "नपढिएको" },
  "inbox.t.newOrder": { en: "New order", np: "नयाँ अर्डर" },
  "inbox.b.newOrder": {
    en: "New order {code} just came in. Accept it to start preparing.",
    np: "नयाँ अर्डर {code} आयो। तयारी सुरु गर्न स्वीकार गर्नुहोस्।",
  },
  "inbox.t.customerMessage": { en: "New customer message", np: "ग्राहकको नयाँ सन्देश" },
  "inbox.t.inviteAccepted": { en: "Invitation accepted", np: "निम्तो स्वीकार भयो" },
  "inbox.t.applicationReceived": { en: "Application received", np: "आवेदन प्राप्त भयो" },
  "inbox.b.applicationReceived": {
    en: "GoPasal has application {reference}. We'll tell you the moment there's an answer.",
    np: "गोपसलसँग आवेदन {reference} छ। जवाफ आउनासाथ खबर गर्छौं।",
  },
  "inbox.t.underReview": { en: "Application under review", np: "आवेदन जाँच हुँदै" },
  "inbox.b.underReview": {
    en: "A GoPasal reviewer is going through application {reference} now.",
    np: "गोपसलका जाँचकर्ताले अहिले आवेदन {reference} हेर्दै हुनुहुन्छ।",
  },
  "inbox.t.changes": { en: "We need a few changes", np: "केही सच्याउनुपर्ने छ" },
  "inbox.t.rejected": { en: "Application not approved", np: "आवेदन स्वीकृत भएन" },
  "inbox.t.approved": { en: "Your shop is on GoPasal", np: "तपाईंको पसल गोपसलमा आयो" },
  "inbox.b.approved": {
    en: "Your application was approved. Add your products from the Shelf tab to start selling.",
    np: "आवेदन स्वीकृत भयो। बेच्न सुरु गर्न सामान ट्याबबाट सामान थप्नुहोस्।",
  },
  "inbox.a11y.unread": { en: "Notifications, {count} not read", np: "सूचनाहरू, {count} नपढिएका" },
};
