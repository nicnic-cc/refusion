import type { Feed, Group } from "@/lib/api";

// Backend fallback folder: feeds without a folder land here and it cannot be deleted.
export const DEFAULT_GROUP_ID = 1;

// The sidebar hides the fallback folder while it holds no feeds.
export function getSidebarGroups(groups: Group[], feeds: Feed[]): Group[] {
  return groups.filter(
    (group) =>
      group.id !== DEFAULT_GROUP_ID ||
      feeds.some((feed) => feed.group_id === DEFAULT_GROUP_ID),
  );
}
