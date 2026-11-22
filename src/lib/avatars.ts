export const AVATAR_IDS = [
  "vault",
  "flame",
  "cpu",
  "rocket",
  "compass",
  "shield",
  "crown",
  "gem",
  "zap",
  "anchor",
  "leaf",
  "orbit",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export interface AvatarPreset {
  id: AvatarId;
  label: string;
  bgClass: string;
  textClass: string;
  ringClass: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "vault",
    label: "Vault",
    bgClass: "bg-amber-500/12",
    textClass: "text-amber-600 dark:text-amber-400",
    ringClass: "ring-amber-500/30",
  },
  {
    id: "flame",
    label: "Flame",
    bgClass: "bg-orange-500/12",
    textClass: "text-orange-600 dark:text-orange-400",
    ringClass: "ring-orange-500/30",
  },
  {
    id: "cpu",
    label: "Silicon",
    bgClass: "bg-indigo-500/12",
    textClass: "text-indigo-600 dark:text-indigo-400",
    ringClass: "ring-indigo-500/30",
  },
  {
    id: "rocket",
    label: "Rocket",
    bgClass: "bg-violet-500/12",
    textClass: "text-violet-600 dark:text-violet-400",
    ringClass: "ring-violet-500/30",
  },
  {
    id: "compass",
    label: "Compass",
    bgClass: "bg-teal-500/12",
    textClass: "text-teal-600 dark:text-teal-400",
    ringClass: "ring-teal-500/30",
  },
  {
    id: "shield",
    label: "Shield",
    bgClass: "bg-emerald-500/12",
    textClass: "text-emerald-600 dark:text-emerald-400",
    ringClass: "ring-emerald-500/30",
  },
  {
    id: "crown",
    label: "Crown",
    bgClass: "bg-yellow-500/12",
    textClass: "text-yellow-700 dark:text-yellow-400",
    ringClass: "ring-yellow-500/30",
  },
  {
    id: "gem",
    label: "Gem",
    bgClass: "bg-cyan-500/12",
    textClass: "text-cyan-600 dark:text-cyan-400",
    ringClass: "ring-cyan-500/30",
  },
  {
    id: "zap",
    label: "Spark",
    bgClass: "bg-amber-500/12",
    textClass: "text-amber-600 dark:text-amber-300",
    ringClass: "ring-amber-500/30",
  },
  {
    id: "anchor",
    label: "Anchor",
    bgClass: "bg-slate-500/12",
    textClass: "text-slate-600 dark:text-slate-300",
    ringClass: "ring-slate-500/30",
  },
  {
    id: "leaf",
    label: "Leaf",
    bgClass: "bg-green-500/12",
    textClass: "text-green-600 dark:text-green-400",
    ringClass: "ring-green-500/30",
  },
  {
    id: "orbit",
    label: "Orbit",
    bgClass: "bg-rose-500/12",
    textClass: "text-rose-600 dark:text-rose-400",
    ringClass: "ring-rose-500/30",
  },
];

export const AVATAR_MAP: Record<AvatarId, AvatarPreset> = Object.fromEntries(
  AVATAR_PRESETS.map((p) => [p.id, p])
) as Record<AvatarId, AvatarPreset>;

export function normalizeAvatarId(value?: string | null): AvatarId {
  if (value && (AVATAR_IDS as readonly string[]).includes(value)) {
    return value as AvatarId;
  }
  return "compass";
}
