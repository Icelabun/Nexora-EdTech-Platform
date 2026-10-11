export function hasArenaAccess(user: {
  subscriptionTier?: string;
  arenaAccessUntil?: Date | string | null;
}): boolean {
  if (user.subscriptionTier === "arena" || user.subscriptionTier === "institution") return true;
  if (!user.arenaAccessUntil) return false;
  return new Date(user.arenaAccessUntil).getTime() > Date.now();
}
