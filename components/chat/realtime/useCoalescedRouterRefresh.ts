"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";

const REFRESH_COALESCING_WINDOW_MS = 25;

export function useCoalescedRouterRefresh(
  refresh: () => void
) {
  const refreshRef = useRef(refresh);

  const refreshTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (
        refreshTimerRef.current !== null
      ) {
        clearTimeout(
          refreshTimerRef.current
        );
      }
    };
  }, []);

  return useCallback(() => {
    if (
      refreshTimerRef.current !== null
    ) {
      return;
    }

    refreshTimerRef.current = setTimeout(
      () => {
        refreshTimerRef.current = null;
        refreshRef.current();
      },
      REFRESH_COALESCING_WINDOW_MS
    );
  }, []);
}
