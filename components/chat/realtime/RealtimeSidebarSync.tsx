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

type SidebarRealtimeContextValue = {
  broadcastConversationUpdated: (
    conversationId: number
  ) => Promise<void>;
};

const SidebarRealtimeContext =
  createContext<SidebarRealtimeContextValue | null>(
    null
  );

type Props = {
  conversationIds: number[];
  activeConversationId: number;
  children: ReactNode;
};

export function RealtimeSidebarSync({
  conversationIds,
  activeConversationId,
  children,
}: Props) {
  const router = useRouter();

  const routerRef =
    useRef(router);

  const supabaseRef =
    useRef(
      createClient()
    );

  const channelsRef = useRef<
    Map<number, RealtimeChannel>
  >(new Map());

  useEffect(() => {
    routerRef.current =
      router;
  }, [router]);

  useEffect(() => {
    const supabase =
      supabaseRef.current;

    const inactiveConversationIds =
      conversationIds.filter(
        (conversationId) =>
          conversationId !==
          activeConversationId
      );

    const channels =
      inactiveConversationIds.map(
        (conversationId) => {
          const channel =
            supabase
              .channel(
                `conversation:${conversationId}`
              )
              .on(
                "broadcast",
                {
                  event:
                    "message-created",
                },
                () => {
                  routerRef.current.refresh();
                }
              )
              .on(
                "broadcast",
                {
                  event:
                    "conversation-updated",
                },
                () => {
                  routerRef.current.refresh();
                }
              );

          channelsRef.current.set(
            conversationId,
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
                  `Sidebar realtime error for conversation ${conversationId}:`,
                  status,
                  error
                );
              }
            }
          );

          return {
            conversationId,
            channel,
          };
        }
      );

    return () => {
      for (
        const {
          conversationId,
          channel,
        } of channels
      ) {
        channelsRef.current.delete(
          conversationId
        );

        void supabase.removeChannel(
          channel
        );
      }
    };
  }, [
    activeConversationId,
    conversationIds,
  ]);

  const broadcastConversationUpdated =
    useCallback(
      async (
        conversationId: number
      ) => {
        const channel =
          channelsRef.current.get(
            conversationId
          );

        if (!channel) {
          return;
        }

        await channel.send({
          type: "broadcast",
          event:
            "conversation-updated",
          payload: {
            conversationId,
          },
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