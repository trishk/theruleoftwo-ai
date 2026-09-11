import type { ChatMessage } from "./types";
import { doesStreamingMessageMatchPersisted } from "./reconcileStreamingMessages";

type TimelineInputs = {
  persistedMessages: ChatMessage[];
  optimisticMessages: ChatMessage[];
  streamingMessages: ChatMessage[];
};

function toTimestamp(value: Date) {
  const date = value instanceof Date
    ? value
    : new Date(value);

  return date.getTime();
}

function getTimestamp(message: ChatMessage) {
  const timestamp = toTimestamp(
    message.timelineCreatedAt ?? message.createdAt
  );

  return Number.isFinite(timestamp)
    ? timestamp
    : Number.POSITIVE_INFINITY;
}

function compareMessageIds(
  leftId: number,
  rightId: number
) {
  const leftIsPersisted = leftId > 0;
  const rightIsPersisted = rightId > 0;

  if (leftIsPersisted !== rightIsPersisted) {
    return leftIsPersisted ? -1 : 1;
  }

  return leftIsPersisted
    ? leftId - rightId
    : rightId - leftId;
}

function compareTimelineMessages(
  left: ChatMessage,
  right: ChatMessage
) {
  const timestampDifference =
    getTimestamp(left) - getTimestamp(right);

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  const idDifference = compareMessageIds(
    left.timelineOrderId ?? left.id,
    right.timelineOrderId ?? right.id
  );

  if (idDifference !== 0) {
    return idDifference;
  }

  return (left.timelineKey ?? "").localeCompare(
    right.timelineKey ?? ""
  );
}

function isOptimisticMatch(
  optimisticMessage: ChatMessage,
  persistedMessage: ChatMessage
) {
  if (optimisticMessage.persistedMessageId !== undefined) {
    return (
      persistedMessage.id ===
      optimisticMessage.persistedMessageId
    );
  }

  return (
    persistedMessage.authorType === "human" &&
    persistedMessage.isOwnMessage &&
    persistedMessage.content === optimisticMessage.content
  );
}


function findClosestAvailableMatch(
  temporaryMessage: ChatMessage,
  persistedMessages: ChatMessage[],
  availablePersistedIndexes: Set<number>,
  matches: (
    temporaryMessage: ChatMessage,
    persistedMessage: ChatMessage
  ) => boolean
) {
  const temporaryTimestamp = toTimestamp(
    temporaryMessage.createdAt
  );
  let closestIndex = -1;
  let closestDistance = Number.POSITIVE_INFINITY;

  persistedMessages.forEach(
    (persistedMessage, index) => {
      if (
        !availablePersistedIndexes.has(index) ||
        !matches(
          temporaryMessage,
          persistedMessage
        )
      ) {
        return;
      }

      const persistedTimestamp = toTimestamp(
        persistedMessage.createdAt
      );
      const distance =
        Number.isFinite(temporaryTimestamp) &&
        Number.isFinite(persistedTimestamp)
          ? Math.abs(
              persistedTimestamp - temporaryTimestamp
            )
          : Number.POSITIVE_INFINITY;

      if (
        distance < closestDistance ||
        (distance === closestDistance &&
          (closestIndex === -1 ||
            persistedMessage.id <
              persistedMessages[closestIndex]!.id))
      ) {
        closestIndex = index;
        closestDistance = distance;
      }
    }
  );

  return closestIndex;
}

function reconcileTemporaryMessages(
  temporaryMessages: ChatMessage[],
  persistedMessages: ChatMessage[],
  availablePersistedIndexes: Set<number>,
  timelineByPersistedIndex: ChatMessage[],
  matches: (
    temporaryMessage: ChatMessage,
    persistedMessage: ChatMessage
  ) => boolean
) {
  const unmatchedTemporaryMessages: ChatMessage[] = [];

  for (const temporaryMessage of temporaryMessages) {
    const matchIndex = findClosestAvailableMatch(
      temporaryMessage,
      persistedMessages,
      availablePersistedIndexes,
      matches
    );
    const timelineKey =
      temporaryMessage.timelineKey ??
      `temporary:${temporaryMessage.id}`;

    if (matchIndex === -1) {
      unmatchedTemporaryMessages.push({
        ...temporaryMessage,
        timelineKey,
      });
      continue;
    }

    availablePersistedIndexes.delete(matchIndex);
    timelineByPersistedIndex[matchIndex] = {
      ...persistedMessages[matchIndex]!,
      ...(temporaryMessage.authorType === "ai" && temporaryMessage.content.length > persistedMessages[matchIndex]!.content.length
        ? { content: temporaryMessage.content }
        : {}),
      ...(temporaryMessage.authorType === "ai" && temporaryMessage.isStreaming
        ? { isStreaming: true }
        : {}),
      timelineKey,
      timelineCreatedAt:
        temporaryMessage.timelineCreatedAt ??
        temporaryMessage.createdAt,
      timelineOrderId:
        temporaryMessage.timelineOrderId ?? temporaryMessage.id,
    };
  }

  return unmatchedTemporaryMessages;
}

/**
 * Builds one conversation timeline. Valid creation timestamps sort ascending.
 * A reconciled persisted row retains its temporary row's timestamp and key so
 * replacement cannot move or remount it. Within one millisecond, persisted
 * IDs sort ascending, then temporary IDs sort descending because temporary
 * IDs decrease as they are created. Invalid timestamps sort last. The final
 * timeline key comparison is a deterministic guard for malformed collisions.
 */
export function buildConversationTimeline({
  persistedMessages,
  optimisticMessages,
  streamingMessages,
}: TimelineInputs) {
  const availablePersistedIndexes = new Set(
    persistedMessages.map((_, index) => index)
  );
  const timelineByPersistedIndex =
    persistedMessages.map((message) => ({
      ...message,
      timelineKey: `persisted:${message.id}`,
    }));

  const acknowledgedOptimisticMessages =
    optimisticMessages.filter(
      (message) => message.persistedMessageId !== undefined
    );
  const unacknowledgedOptimisticMessages =
    optimisticMessages.filter(
      (message) => message.persistedMessageId === undefined
    );
  const unmatchedAcknowledgedOptimisticMessages =
    reconcileTemporaryMessages(
      acknowledgedOptimisticMessages,
      persistedMessages,
      availablePersistedIndexes,
      timelineByPersistedIndex,
      isOptimisticMatch
    );
  const unmatchedUnacknowledgedOptimisticMessages =
    reconcileTemporaryMessages(
      unacknowledgedOptimisticMessages,
      persistedMessages,
      availablePersistedIndexes,
      timelineByPersistedIndex,
      isOptimisticMatch
    );
  const unmatchedStreamingMessages =
    reconcileTemporaryMessages(
      streamingMessages,
      persistedMessages,
      availablePersistedIndexes,
      timelineByPersistedIndex,
      doesStreamingMessageMatchPersisted
    );

  return [
    ...timelineByPersistedIndex,
    ...unmatchedAcknowledgedOptimisticMessages,
    ...unmatchedUnacknowledgedOptimisticMessages,
    ...unmatchedStreamingMessages,
  ].sort(compareTimelineMessages);
}
