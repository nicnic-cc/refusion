import {
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import {
  defaultArticleFilter,
  isArticleFilter,
  type ArticleFilter,
} from "@/lib/article-filter";
import { parsePositiveIntegerParam } from "@/lib/route-params";

export type { ArticleFilter } from "@/lib/article-filter";

type Navigate = ReturnType<typeof useNavigate>;

interface ListTarget {
  filter?: ArticleFilter;
  feedId?: number | null;
  groupId?: number | null;
  articleId?: number | null;
  replace?: boolean;
}

interface CurrentUrl {
  articleFilter: ArticleFilter;
  selectedFeedId: number | null;
  selectedGroupId: number | null;
  selectedArticleId: number | null;
}

function goToList(
  navigate: Navigate,
  current: CurrentUrl,
  { filter, feedId, groupId, articleId, replace }: ListTarget,
) {
  const nextFilter = filter ?? current.articleFilter;
  const nextFeedId = feedId === undefined ? current.selectedFeedId : feedId;
  const nextGroupId = groupId === undefined ? current.selectedGroupId : groupId;
  const nextArticleId =
    articleId === undefined ? current.selectedArticleId : articleId;
  const nextSearch = { article: nextArticleId ?? undefined };

  if (nextGroupId !== null) {
    navigate({
      to: "/groups/$groupId/$filter",
      params: {
        groupId: String(nextGroupId),
        filter: nextFilter,
      },
      search: nextSearch,
      replace: replace ?? true,
    });
    return;
  }

  if (nextFeedId !== null) {
    navigate({
      to: "/feeds/$feedId/$filter",
      params: {
        feedId: String(nextFeedId),
        filter: nextFilter,
      },
      search: nextSearch,
      replace: replace ?? true,
    });
    return;
  }

  navigate({
    to: "/$filter",
    params: { filter: nextFilter },
    search: nextSearch,
    replace: replace ?? true,
  });
}

function parseFilter(value: unknown): ArticleFilter {
  return typeof value === "string" && isArticleFilter(value)
    ? value
    : defaultArticleFilter;
}

// `article: false` skips subscribing to ?article= so callers that never read
// the article (sidebar) don't re-render on j/k; selectedArticleId is then null.
export function useUrlState(opts?: { article?: boolean }) {
  const navigate = useNavigate();
  const trackArticle = opts?.article !== false;
  const feedIdParam = useParams({
    strict: false,
    select: (p) => (p as { feedId?: string }).feedId,
  });
  const groupIdParam = useParams({
    strict: false,
    select: (p) => (p as { groupId?: string }).groupId,
  });
  const filterParam = useParams({
    strict: false,
    select: (p) => (p as { filter?: string }).filter,
  });
  const articleParam = useSearch({
    strict: false,
    select: (s) => (trackArticle ? (s as Record<string, unknown>).article : undefined),
  }) as unknown;

  const routeFeedId = parsePositiveIntegerParam(feedIdParam);
  const routeGroupId = parsePositiveIntegerParam(groupIdParam);
  const selectedArticleId = parsePositiveIntegerParam(articleParam);
  const routeFilter = parseFilter(filterParam);

  const selectedFeedId = routeFeedId;
  const selectedGroupId = routeGroupId;
  const articleFilter = routeFilter;

  const navigateToList = useCallback(
    (args: ListTarget = {}) =>
      goToList(
        navigate,
        { articleFilter, selectedFeedId, selectedGroupId, selectedArticleId },
        args,
      ),
    [
      articleFilter,
      navigate,
      selectedArticleId,
      selectedFeedId,
      selectedGroupId,
    ],
  );

  const setSelectedFeed = useCallback(
    (feedId: number | null) => {
      navigateToList({
        feedId,
        groupId: null,
        articleId: null,
      });
    },
    [navigateToList],
  );

  const setSelectedGroup = useCallback(
    (groupId: number | null) => {
      navigateToList({
        groupId,
        feedId: null,
        articleId: null,
      });
    },
    [navigateToList],
  );

  const setSelectedArticle = useCallback(
    (articleId: number | null) => {
      if (articleId === null) {
        navigateToList({ articleId: null, replace: true });
        return;
      }

      navigateToList({
        articleId,
        replace: selectedArticleId !== null,
      });
    },
    [navigateToList, selectedArticleId],
  );

  const setArticleFilter = useCallback(
    (filter: ArticleFilter) => {
      navigateToList({
        filter,
        articleId: null,
      });
    },
    [navigateToList],
  );

  const selectTopLevelFilter = useCallback(
    (filter: ArticleFilter) => {
      navigateToList({
        filter,
        feedId: null,
        groupId: null,
        articleId: null,
      });
    },
    [navigateToList],
  );

  const selectAll = useCallback(() => {
    selectTopLevelFilter("all");
  }, [selectTopLevelFilter]);

  return {
    selectedFeedId,
    selectedGroupId,
    selectedArticleId,
    articleFilter,
    setSelectedFeed,
    setSelectedGroup,
    setSelectedArticle,
    setArticleFilter,
    selectTopLevelFilter,
    selectAll,
  };
}

// Selected-state booleans for list rows: a row re-renders only when its own
// answer flips, not on every URL change.
export function useIsFeedSelected(feedId: number) {
  return useParams({
    strict: false,
    select: (p) =>
      parsePositiveIntegerParam((p as { feedId?: string }).feedId) === feedId,
  });
}

export function useIsGroupSelected(groupId: number) {
  return useParams({
    strict: false,
    select: (p) =>
      parsePositiveIntegerParam((p as { groupId?: string }).groupId) ===
      groupId,
  });
}

// Navigation actions with stable identity: they read the current URL when
// called, so memoized rows are not re-rendered when the URL changes.
export function useUrlActions() {
  const navigate = useNavigate();
  const router = useRouter();

  return useMemo(() => {
    const go = (args: ListTarget) => {
      const matches = router.state.matches;
      const params = (matches[matches.length - 1]?.params ?? {}) as {
        filter?: string;
        feedId?: string;
        groupId?: string;
      };
      goToList(
        navigate,
        {
          articleFilter: parseFilter(params.filter),
          selectedFeedId: parsePositiveIntegerParam(params.feedId),
          selectedGroupId: parsePositiveIntegerParam(params.groupId),
          selectedArticleId: null,
        },
        args,
      );
    };

    return {
      setSelectedFeed: (feedId: number | null) =>
        go({ feedId, groupId: null, articleId: null }),
      setSelectedGroup: (groupId: number | null) =>
        go({ groupId, feedId: null, articleId: null }),
      selectTopLevelFilter: (filter: ArticleFilter) =>
        go({ filter, feedId: null, groupId: null, articleId: null }),
    };
  }, [navigate, router]);
}
