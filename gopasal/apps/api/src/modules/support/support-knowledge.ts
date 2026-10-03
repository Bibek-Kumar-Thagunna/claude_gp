export type SupportKnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  answer: string;
  keywords: string[];
};

/**
 * Release-reviewed answers are the assistant's only source of truth. Keeping
 * this initial catalogue in version control makes every wording change
 * reviewable and deployable with the same audit trail as policy copy.
 */
export const SUPPORT_KNOWLEDGE_VERSION = '2026-09-13';

export const SUPPORT_KNOWLEDGE: readonly SupportKnowledgeArticle[] = [
  {
    id: 'orders-status',
    title: 'Check an order status',
    category: 'orders',
    keywords: ['order', 'status', 'track', 'tracking', 'where', 'delivery', 'ढुवानी', 'अर्डर'],
    answer: 'Open Orders, choose the order, and follow its verified timeline. If a rider is assigned, the tracking screen shows the latest available location and whether it is current. Contact support if the status has not changed for an unreasonable time.',
  },
  {
    id: 'delivery-serviceability',
    title: 'Delivery range and address eligibility',
    category: 'delivery',
    keywords: ['range', 'radius', 'area', 'address', 'deliver', 'nearby', 'location', 'gps', 'ठेगाना', 'स्थान'],
    answer: 'GoPasal checks your selected delivery pin against each shop’s verified location and delivery range. Set an accurate GPS pin and complete written address. A shop is shown as deliverable only when the server confirms that address is inside its service area.',
  },
  {
    id: 'payment-status',
    title: 'Payment status and safe payment handling',
    category: 'payments',
    keywords: ['payment', 'paid', 'pending', 'esewa', 'khalti', 'cash', 'cod', 'wallet', 'भुक्तानी', 'पैसा'],
    answer: 'Use only the payment choices shown during GoPasal checkout. An online payment is treated as paid only after server verification; a pending screen is not proof of payment. Never share an OTP, password or wallet PIN with a shop, rider or support agent.',
  },
  {
    id: 'refund-process',
    title: 'Refunds and order disputes',
    category: 'refunds',
    keywords: ['refund', 'return', 'wrong', 'missing', 'damaged', 'dispute', 'cancel', 'फिर्ता', 'गुनासो'],
    answer: 'Open the delivered order and use its dispute option for a missing, incorrect or damaged item. Include a clear reason and evidence where available. GoPasal staff review the case; the assistant cannot approve, reject or promise a refund.',
  },
  {
    id: 'coupons-rewards',
    title: 'Coupons, referrals and GoCoins',
    category: 'rewards',
    keywords: ['coupon', 'discount', 'offer', 'referral', 'refer', 'coin', 'gocoin', 'reward', 'छुट'],
    answer: 'Eligible offers appear during checkout and can be applied with one tap. Coupon minimums, expiry and usage limits are verified by the server. Referral GoCoins become usable only after the referred customer completes the qualifying order shown on the Rewards page.',
  },
  {
    id: 'account-otp',
    title: 'Sign-in and OTP safety',
    category: 'account',
    keywords: ['login', 'sign', 'otp', 'code', 'account', 'phone', 'verify', 'लगइन', 'कोड'],
    answer: 'Request a new six-digit code from the sign-in screen and use only the newest unexpired code. GoPasal staff will never ask you to read an OTP aloud or send it in chat. If requests are rate-limited, wait for the countdown instead of repeatedly retrying.',
  },
  {
    id: 'shop-messaging',
    title: 'Contacting a shop safely',
    category: 'messages',
    keywords: ['chat', 'message', 'shop', 'seller', 'contact', 'availability', 'stock', 'पसल', 'सन्देश'],
    answer: 'Use Message shop for product or delivery questions. Customers start pre-order conversations; after an order exists, the shop may contact that customer about the order. Keep payment credentials and OTPs out of every conversation.',
  },
  {
    id: 'seller-registration',
    title: 'Registering a shop',
    category: 'seller',
    keywords: ['seller', 'register', 'business', 'document', 'pan', 'citizenship', 'shop', 'merchant', 'व्यवसाय'],
    answer: 'Start at Sell on GoPasal and complete the resumable seller application. Required identity and business documents are reviewed privately by authorized staff. Shop location may be added later, but the storefront remains hidden until its location is verified and it has an active deliverable product.',
  },
] as const;

const normalizeWord = (value: string) => {
  const word = value.toLocaleLowerCase('en');
  // Enough normalization for FAQ matching without pretending to be a language
  // model: plural English nouns such as "refunds" and "orders" match their
  // release-reviewed singular keyword. Avoid words ending in "ss" (business).
  return word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
};

const words = (value: string): Set<string> =>
  new Set((value.match(/[\p{L}\p{N}]+/gu) ?? []).map(normalizeWord));

// These terms are meaningful only with more context. A lone "phone", "shop"
// or "order" must not trigger a confident canned answer.
const BROAD_SUPPORT_TERMS = new Set([
  'account',
  'address',
  'area',
  'business',
  'code',
  'contact',
  'delivery',
  'location',
  'order',
  'phone',
  'seller',
  'shop',
  'status',
  'verify',
  'where',
]);

export function retrieveSupportKnowledge(question: string, limit = 3) {
  const query = words(question);
  return SUPPORT_KNOWLEDGE.map((article) => {
    const titleWords = words(article.title);
    const matchedKeywords = article.keywords.map(normalizeWord).filter((keyword) => query.has(keyword));
    const keywordHits = matchedKeywords.length;
    const specificHits = matchedKeywords.filter((keyword) => !BROAD_SUPPORT_TERMS.has(keyword)).length;
    const titleHits = [...titleWords].filter((word) => query.has(word)).length;
    return { article, keywordHits, specificHits, score: keywordHits * 3 + titleHits };
  })
    // A title match alone is unsafe because common words such as "a" or "the"
    // can otherwise route an unrelated question to a confident canned answer.
    // At least one release-reviewed keyword must match; title words only break
    // ties between otherwise relevant articles.
    .filter((match) => match.specificHits > 0 || match.keywordHits >= 2)
    .sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
    .slice(0, limit);
}
