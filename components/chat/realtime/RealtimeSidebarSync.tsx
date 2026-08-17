"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

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

  const supabaseRef = useRef(
    createClient()
  );

  useEffect(() => {
    routerRef.current = router;
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

    const channels: RealtimeChannel[] =
      inactiveConversationIds.map(
        (conversationId) => {
          const channel = supabase
            .channel(
              `conversation:${conversationId}`
            )
            .on(
              "broadcast",
              {
                event: "message-created",
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

          channel.subscribe(
            (status, error) => {
              if (
                status ===
                  "CHANNEL_ERROR" ||
                status === "TIMED_OUT"
              ) {
                console.error(
                  `Sidebar realtime error for conversation ${conversationId}:`,
                  status,
                  error
                );
              }
            }
          );

          return channel;
        }
      );

    return () => {
      for (const channel of channels) {
        void supabase.removeChannel(
          channel
        );
      }
    };
  }, [
    activeConversationId,
    conversationIds,
  ]);

  return children;
}