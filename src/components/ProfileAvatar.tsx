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
  sm: { box: "h-8 w-8 rounded-lg", icon: "h-4 w-4" },
  md: { box: "h-10 w-10 rounded-xl", icon: "h-5 w-5" },
  lg: { box: "h-12 w-12 rounded-xl", icon: "h-6 w-6" },
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
