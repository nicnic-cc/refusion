import { Navigate } from "@tanstack/react-router";
import { defaultArticleFilter } from "@/lib/article-filter";

// Unknown URLs land on the default list, like single-segment ones already do
// via the /$filter route. The root session guard runs before this renders.
export function NotFoundRedirect() {
  return (
    <Navigate
      to="/$filter"
      params={{ filter: defaultArticleFilter }}
      replace
    />
  );
}
