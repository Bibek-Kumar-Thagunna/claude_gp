import * as React from "react";
import { useQueries, type QueryKey, type UseQueryResult } from "@tanstack/react-query";
import type { Paginated } from "@gopasal/api-client/types";

/**
 * A list the phone can read to the end.
 *
 * Every seller list used to fetch one page and stop — fifty products, fifty
 * reviews, twenty finished orders — with a line pointing at the web console for
 * the rest. A kirana with 400 products on the shelf could not find the 51st on
 * its phone. This pages the way the server already does (`page` + `limit`),
 * one query per page, so:
 *
 *  - page 1 is the *same* cache entry the screen always read (the list keys
 *    normalise a missing page to 1), and the optimistic edits that patch list
 *    queries by prefix patch every loaded page, not only the first;
 *  - "Show more" fetches exactly one more page, and the pages already on screen
 *    do not reload;
 *  - rows are de-duplicated by id, because a list sorted by something that
 *    changes (stock, newest) can shift a row onto the next page between reads.
 *
 * `resetOn` returns the list to one page when the search or filter changes.
 */
export type PagedList<T, P extends Paginated<T>> = {
  /** Page 1 — for loading, refreshing, and the page-level `summary`. */
  first: UseQueryResult<P>;
  rows: T[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  /** Refetch every loaded page (pull-to-refresh). */
  refetch: () => Promise<unknown>;
};

export function usePaged<T extends { id: string }, P extends Paginated<T>>(opts: {
  enabled: boolean;
  staleTime: number;
  key: (page: number) => QueryKey;
  fetch: (page: number) => Promise<P>;
  resetOn: string;
  refetchInterval?: number | false;
}): PagedList<T, P> {
  const [pages, setPages] = React.useState(1);
  React.useEffect(() => setPages(1), [opts.resetOn]);

  const results = useQueries({
    queries: Array.from({ length: pages }, (_, i) => ({
      queryKey: opts.key(i + 1),
      queryFn: () => opts.fetch(i + 1),
      enabled: opts.enabled,
      staleTime: opts.staleTime,
      refetchInterval: i === 0 ? (opts.refetchInterval ?? false) : false,
      refetchIntervalInBackground: false,
    })),
  }) as UseQueryResult<P>[];

  const first = results[0]!;
  const rows = React.useMemo(() => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const r of results) {
      for (const row of r.data?.data ?? []) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
    }
    return out;
    // `results` is a new array every render; the data references are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.dataUpdatedAt).join(",")]);

  const last = results[results.length - 1]!;
  const meta = first.data?.meta;
  const total = meta?.total ?? rows.length;
  const lastPage = last.data?.meta;
  const hasMore = Boolean(
    lastPage && lastPage.page < (lastPage.totalPages ?? lastPage.pages ?? lastPage.page),
  );

  return {
    first,
    rows,
    total,
    hasMore,
    loadingMore: pages > 1 && last.isPending,
    loadMore: () => {
      if (hasMore && !last.isPending) setPages((n) => n + 1);
    },
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}
