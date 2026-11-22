import {
  Anchor,
  Compass,
  Cpu,
  Crown,
  Flame,
  Gem,
  Landmark,
  Leaf,
  Orbit,
  Rocket,
  Shield,
  Zap,
} from "lucide-react";
import { AVATAR_MAP, normalizeAvatarId, type AvatarId } from "@/lib/avatars";

interface ProfileAvatarProps {
  icon?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ICONS: Record<AvatarId, typeof Compass> = {
  vault: Landmark,
  flame: Flame,
  cpu: Cpu,
  rocket: Rocket,
  compass: Compass,
  shield: Shield,
  crown: Crown,
  gem: Gem,
  zap: Zap,
  anchor: Anchor,
  leaf: Leaf,
  orbit: Orbit,
};

const SIZES = {
  sm: { box: "h-7 w-7 rounded-lg", icon: "h-3.5 w-3.5" },
  md: { box: "h-9 w-9 rounded-xl", icon: "h-4 w-4" },
  lg: { box: "h-11 w-11 rounded-xl", icon: "h-5 w-5" },
};

export function ProfileAvatar({
  icon,
  size = "md",
  className = "",
}: ProfileAvatarProps) {
  const id = normalizeAvatarId(icon);
  const preset = AVATAR_MAP[id];
  const Icon = ICONS[id];
  const dims = SIZES[size];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ring-1 ring-inset ${dims.box} ${preset.bgClass} ${preset.textClass} ${preset.ringClass} ${className}`}
    >
      <Icon className={dims.icon} />
    </span>
  );
}
