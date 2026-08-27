"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { useCoalescedRouterRefresh } from "./useCoalescedRouterRefresh";

type SidebarRealtimeContextValue = {
  broadcastConversationUpdated: (
    conversationPublicId: string
  ) => Promise<void>;
};

const SidebarRealtimeContext =
  createContext<SidebarRealtimeContextValue | null>(
    null
  );

type Props = {
  conversationPublicIds: string[];
  activeConversationPublicId: string;
  children: ReactNode;
};

export function RealtimeSidebarSync({
  conversationPublicIds,
  activeConversationPublicId,
  children,
}: Props) {
  const router = useRouter();

  const scheduleRefresh =
    useCoalescedRouterRefresh(
      router.refresh
    );

  const supabaseRef =
    useRef(
      createClient()
    );

  const channelsRef = useRef<
    Map<string, RealtimeChannel>
  >(new Map());

  useEffect(() => {
    const supabase =
      supabaseRef.current;

    const channelsMap =
      channelsRef.current;

    const inactiveConversationPublicIds =
      conversationPublicIds.filter(
        (conversationPublicId) =>
          conversationPublicId !==
          activeConversationPublicId
      );

    const channels =
      inactiveConversationPublicIds.map(
        (conversationPublicId) => {
          const channel =
            supabase
              .channel(
                `conversation:${conversationPublicId}`
              )
              .on(
                "broadcast",
                {
                  event:
                    "message-created",
                },
                () => {
                  scheduleRefresh();
                }
              )
              .on(
                "broadcast",
                {
                  event:
                    "conversation-updated",
                },
                () => {
                  scheduleRefresh();
                }
              );

          channelsMap.set(
            conversationPublicId,
            channel
          );

          channel.subscribe(
            (
              status,
              error
            ) => {
              if (
                status ===
                  "CHANNEL_ERROR" ||
                status ===
                  "TIMED_OUT"
              ) {
                console.error(
                  `Sidebar realtime error for conversation ${conversationPublicId}:`,
                  status,
                  error
                );
              }
            }
          );

          return {
            conversationPublicId,
            channel,
          };
        }
      );

    return () => {
      for (
        const {
          conversationPublicId,
          channel,
        } of channels
      ) {
        const currentChannel =
          channelsMap.get(
            conversationPublicId
          );

        if (
          currentChannel === channel
        ) {
          channelsMap.delete(
            conversationPublicId
          );
        }

        void supabase.removeChannel(
          channel
        );
      }
    };
  }, [
    activeConversationPublicId,
    conversationPublicIds,
    scheduleRefresh,
  ]);

  const broadcastConversationUpdated =
    useCallback(
      async (
        conversationPublicId: string
      ) => {
        const channel =
          channelsRef.current.get(
            conversationPublicId
          );

        if (!channel) {
          return;
        }

        await channel.send({
          type: "broadcast",
          event:
            "conversation-updated",
          payload: {},
        });
      },
      []
    );

  return (
    <SidebarRealtimeContext.Provider
      value={{
        broadcastConversationUpdated,
      }}
    >
      {children}
    </SidebarRealtimeContext.Provider>
  );
}

export function useSidebarRealtime() {
  const context =
    useContext(
      SidebarRealtimeContext
    );

  if (!context) {
    throw new Error(
      "useSidebarRealtime must be used inside RealtimeSidebarSync."
    );
  }

  return context;
}

export function useOptionalSidebarRealtime() {
  return useContext(
    SidebarRealtimeContext
  );
}
