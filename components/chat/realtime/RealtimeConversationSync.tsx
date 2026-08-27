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
import { useCoalescedRouterRefresh } from "./useCoalescedRouterRefresh";

type RealtimeContextValue = {
  broadcastMessageCreated: () => Promise<void>;
  broadcastConversationUpdated: () => Promise<void>;
  isReady: boolean;
};

const RealtimeContext =
  createContext<RealtimeContextValue | null>(
    null
  );

type Props = {
  conversationPublicId: string;
  children: ReactNode;
};

export function RealtimeConversationSync({
  conversationPublicId,
  children,
}: Props) {
  const router = useRouter();

  const scheduleRefresh =
    useCoalescedRouterRefresh(
      router.refresh
    );

  const supabaseRef = useRef(
    createClient()
  );

  const channelRef =
    useRef<RealtimeChannel | null>(
      null
    );

  const [isReady, setIsReady] =
    useState(false);

  useEffect(() => {
    const supabase =
      supabaseRef.current;

    const channel = supabase
      .channel(
        `conversation:${conversationPublicId}`
      )
      .on(
        "broadcast",
        {
          event: "message-created",
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

    channelRef.current =
      channel;

    channel.subscribe(
      (status, error) => {
        if (
          status === "SUBSCRIBED"
        ) {
          setIsReady(true);
        }

        if (
          status ===
            "CHANNEL_ERROR" ||
          status ===
            "TIMED_OUT"
        ) {
          console.error(
            "Realtime channel error:",
            status,
            error
          );
        }
      }
    );

    return () => {
      setIsReady(false);

      channelRef.current =
        null;

      void supabase.removeChannel(
        channel
      );
    };
  }, [
    conversationPublicId,
    scheduleRefresh,
  ]);

  const broadcastMessageCreated =
    useCallback(async () => {
      const channel =
        channelRef.current;

      if (!channel) {
        return;
      }

      await channel.send({
        type: "broadcast",
        event:
          "message-created",
        payload: {},
      });
    }, []);

  const broadcastConversationUpdated =
    useCallback(async () => {
      const channel =
        channelRef.current;

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

  return (
    <RealtimeContext.Provider
      value={{
        broadcastMessageCreated,
        broadcastConversationUpdated,
        isReady,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useConversationRealtime() {
  const context =
    useContext(
      RealtimeContext
    );

  if (!context) {
    throw new Error(
      "useConversationRealtime must be used inside RealtimeConversationSync."
    );
  }

  return context;
}

export function useOptionalConversationRealtime() {
  return useContext(
    RealtimeContext
  );
}
