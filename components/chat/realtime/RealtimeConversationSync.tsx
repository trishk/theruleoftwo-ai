"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

type RealtimeContextValue = {
  broadcastMessageCreated: () => Promise<void>;
  broadcastConversationUpdated: () => Promise<void>;
  broadcastSidebarUpdated: () => Promise<void>;
  isReady: boolean;
};

const RealtimeContext =
  createContext<RealtimeContextValue | null>(null);

type Props = {
  conversationId: number;
  children: ReactNode;
};

export function RealtimeConversationSync({
  conversationId,
  children,
}: Props) {
  const router = useRouter();

  const supabaseRef = useRef(
    createClient()
  );

  const conversationChannelRef =
    useRef<RealtimeChannel | null>(null);

  const activityChannelRef =
    useRef<RealtimeChannel | null>(null);

  const [conversationReady, setConversationReady] =
    useState(false);

  const [activityReady, setActivityReady] =
    useState(false);

  useEffect(() => {
    const supabase =
      supabaseRef.current;

    const conversationChannel =
      supabase
        .channel(
          `conversation:${conversationId}`
        )
        .on(
          "broadcast",
          {
            event: "message-created",
          },
          () => {
            router.refresh();
          }
        )
        .on(
          "broadcast",
          {
            event:
              "conversation-updated",
          },
          () => {
            router.refresh();
          }
        );

    const activityChannel =
      supabase.channel(
        "conversation-activity"
      );

    conversationChannelRef.current =
      conversationChannel;

    activityChannelRef.current =
      activityChannel;

    conversationChannel.subscribe(
      (status, error) => {
        if (
          status === "SUBSCRIBED"
        ) {
          setConversationReady(true);
        }

        if (
          status ===
            "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            "Realtime conversation channel error:",
            status,
            error
          );
        }
      }
    );

    activityChannel.subscribe(
      (status, error) => {
        if (
          status === "SUBSCRIBED"
        ) {
          setActivityReady(true);
        }

        if (
          status ===
            "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            "Realtime activity channel error:",
            status,
            error
          );
        }
      }
    );

    return () => {
      setConversationReady(false);
      setActivityReady(false);

      conversationChannelRef.current =
        null;

      activityChannelRef.current =
        null;

      void supabase.removeChannel(
        conversationChannel
      );

      void supabase.removeChannel(
        activityChannel
      );
    };
  }, [conversationId, router]);

  const broadcastMessageCreated =
    useCallback(async () => {
      const channel =
        conversationChannelRef.current;

      if (!channel) {
        return;
      }

      await channel.send({
        type: "broadcast",
        event: "message-created",
        payload: {},
      });
    }, []);

  const broadcastConversationUpdated =
    useCallback(async () => {
      const channel =
        conversationChannelRef.current;

      if (!channel) {
        return;
      }

      await channel.send({
        type: "broadcast",
        event:
          "conversation-updated",
        payload: {},
      });
    }, []);

  const broadcastSidebarUpdated =
    useCallback(async () => {
      const channel =
        activityChannelRef.current;

      if (!channel) {
        return;
      }

      await channel.send({
        type: "broadcast",
        event: "sidebar-updated",
        payload: {
          conversationId,
        },
      });
    }, [conversationId]);

  return (
    <RealtimeContext.Provider
      value={{
        broadcastMessageCreated,
        broadcastConversationUpdated,
        broadcastSidebarUpdated,
        isReady:
          conversationReady &&
          activityReady,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useConversationRealtime() {
  const context =
    useContext(RealtimeContext);

  if (!context) {
    throw new Error(
      "useConversationRealtime must be used inside RealtimeConversationSync."
    );
  }

  return context;
}