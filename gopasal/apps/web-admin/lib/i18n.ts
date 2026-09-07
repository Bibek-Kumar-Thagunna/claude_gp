/** Admin console bilingual labels (English + Nepali). */

export type Lang = "en" | "np";

export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "np", label: "Nepali", native: "नेपाली" },
];

export const dict = {
  dashboard: { en: "Dashboard", np: "ड्यासबोर्ड" },
  shops: { en: "Shops", np: "पसलहरू" },
  approvals: { en: "Approvals", np: "स्वीकृति" },
  users: { en: "Users", np: "प्रयोगकर्ता" },
  catalog: { en: "Catalog moderation", np: "क्याटलग नियन्त्रण" },
  disputes: { en: "Disputes", np: "विवाद" },
  fraud: { en: "Fraud", np: "जालसाजी" },
  support: { en: "Support", np: "सहयोग" },
  policies: { en: "Policies", np: "नीतिहरू" },
  analytics: { en: "Analytics", np: "विश्लेषण" },
  finance: { en: "Finance", np: "वित्त" },
  roles: { en: "Roles & permissions", np: "भूमिका र अनुमति" },
  staff: { en: "Platform staff", np: "प्लेटफर्म स्टाफ" },
  audit: { en: "Audit log", np: "अडिट लग" },
  settings: { en: "Settings", np: "सेटिङ" },
  pending: { en: "Pending", np: "प्रतीक्षारत" },
  active: { en: "Active", np: "सक्रिय" },
  suspended: { en: "Suspended", np: "निलम्बित" },
  approve: { en: "Approve", np: "स्वीकृत" },
  reject: { en: "Reject", np: "अस्वीकृत" },
  suspend: { en: "Suspend", np: "निलम्बन" },
  reactivate: { en: "Reactivate", np: "पुनः सक्रिय" },
  resolve: { en: "Resolve", np: "समाधान" },
  needsAction: { en: "Needs action", np: "कारबाही चाहिन्छ" },
} as const;

export type DictKey = keyof typeof dict;

export function t(key: DictKey, lang: Lang): string {
  return dict[key][lang];
}
