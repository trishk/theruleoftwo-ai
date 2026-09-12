"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MentionPicker,
  NoConfiguredAiNotice,
} from "./MentionPicker";
import { ReplyPreview } from "./ReplyPreview";
import { PROVIDER_LIST } from "@/lib/llm/providerMeta";

import type { ChatReply } from "../conversation/types";
import type { Provider } from "@/lib/llm/types";

type Props = {
  message: string;
  sending: boolean;
  error: string | null;
  replyTo: ChatReply | null;
  configuredProviders: Provider[];
  canUseAi?: boolean;

  onMessageChange: (message: string) => void;
  onCancelReply: () => void;
  onSubmit: () => Promise<void>;
  onStopGeneration: () => void;
};

export function MessageComposer({
  message,
  sending,
  error,
  replyTo,
  configuredProviders,
  canUseAi = true,
  onMessageChange,
  onCancelReply,
  onSubmit,
  onStopGeneration,
}: Props) {
  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );
  const wasSendingRef =
    useRef(sending);
  const pendingCaretRef = useRef<number | null>(null);
  const listboxId = useId();
  const [mentionRange, setMentionRange] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const configuredOptions = useMemo(
    () =>
      PROVIDER_LIST.filter((provider) =>
        configuredProviders.includes(provider.id)
      ),
    [configuredProviders]
  );
  const filteredOptions = useMemo(() => {
    const query = mentionRange?.query.toLocaleLowerCase() ?? "";

    return configuredOptions.filter((provider) =>
      [provider.name, provider.mention, provider.id].some((value) =>
        value.toLocaleLowerCase().includes(query)
      )
    );
  }, [configuredOptions, mentionRange?.query]);
  const pickerOpen =
    canUseAi && !sending &&
    mentionRange !== null &&
    configuredOptions.length > 0 &&
    message.slice(mentionRange.start, mentionRange.end) ===
      `@${mentionRange.query}`;

  function findActiveMention(value: string, caret: number) {
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/(?:^|[^\p{L}\p{N}_])@([^\s@]*)$/u);

    if (!match) {
      return null;
    }

    const fragment = match[0].startsWith("@")
      ? match[0]
      : match[0].slice(1);

    return {
      start: caret - fragment.length,
      end: caret,
      query: fragment.slice(1),
    };
  }

  function selectMention(mention: string) {
    if (!mentionRange) {
      return;
    }

    const after = message.slice(mentionRange.end);
    const needsSpace = after.length === 0 || !/^\s/u.test(after);
    const replacement = `${mention}${needsSpace ? " " : ""}`;
    const nextMessage =
      message.slice(0, mentionRange.start) + replacement + after;
    const nextCaret = mentionRange.start + replacement.length;

    setMentionRange(null);
    onMessageChange(nextMessage);
    pendingCaretRef.current = nextCaret;
  }

  function openMentionPicker() {
    const textarea = textareaRef.current;

    if (!textarea || sending || !canUseAi || configuredOptions.length === 0) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentRange = start === end
      ? findActiveMention(message, start)
      : null;

    if (currentRange) {
      setMentionRange(currentRange);
      setActiveIndex(0);
      textarea.focus();
      return;
    }

    const needsDelimiter = /[\p{L}\p{N}_]$/u.test(message.slice(0, start));
    const insertion = `${needsDelimiter ? " " : ""}@`;
    const mentionStart = start + insertion.length - 1;
    const nextMessage =
      message.slice(0, start) + insertion + message.slice(end);
    const nextCaret = start + insertion.length;
    onMessageChange(nextMessage);
    setMentionRange({ start: mentionStart, end: nextCaret, query: "" });
    setActiveIndex(0);
    pendingCaretRef.current = nextCaret;
  }

  useLayoutEffect(() => {
    if (pendingCaretRef.current === null) {
      return;
    }

    const caret = pendingCaretRef.current;
    pendingCaretRef.current = null;
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(caret, caret);
  }, [message]);

  useEffect(() => {
    const textarea =
      textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height =
      "auto";

    textarea.style.height =
      `${Math.min(
        textarea.scrollHeight,
        160
      )}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > 160
        ? "auto"
        : "hidden";
  }, [message]);

  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus();
    }
  }, [replyTo]);

  useEffect(() => {
    if (
      wasSendingRef.current &&
      !sending
    ) {
      textareaRef.current?.focus();
    }

    wasSendingRef.current = sending;
  }, [sending]);

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    await onSubmit();
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (pickerOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();

        if (filteredOptions.length > 0) {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          setActiveIndex((current) =>
            (current + direction + filteredOptions.length) %
            filteredOptions.length
          );
        }
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        const option = filteredOptions[activeIndex];
        if (option) {
          event.preventDefault();
          selectMention(option.mention);
          return;
        }

        setMentionRange(null);
        if (event.key === "Tab") {
          return;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setMentionRange(null);
        return;
      }
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      event.currentTarget.form
        ?.requestSubmit();
    }
  }

  return (
    <div className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 pb-6 pt-4 sm:px-6">
        <form
          onSubmit={handleSubmit}
        >
          {error && (
            <div
              role="alert"
              className="mb-2 text-sm text-red-500"
            >
              {error}
            </div>
          )}

          {!canUseAi ? (
            <p className="mb-2 text-xs text-muted-foreground" role="status">
              AI mentions are unavailable because the conversation owner has not enabled shared AI usage. You can still send a human-only message.
            </p>
          ) : configuredOptions.length === 0 ? <NoConfiguredAiNotice /> : null}

          <div
            data-testid="composer-shell"
            className="relative w-full min-w-0 rounded-2xl border border-border bg-muted/30 shadow-sm transition-colors focus-within:border-muted-foreground/50"
          >
            {replyTo && (
              <ReplyPreview
                replyTo={replyTo}
                onCancel={
                  onCancelReply
                }
              />
            )}

            <div className="flex min-w-0 items-end gap-2 p-2">
              <MentionPicker
                open={pickerOpen}
                disabled={sending || !canUseAi || configuredOptions.length === 0}
                disabledReason={!canUseAi ? "AI mentions unavailable: the conversation owner has not enabled shared AI usage." : undefined}
                options={filteredOptions}
                activeIndex={activeIndex}
                listboxId={listboxId}
                onTrigger={openMentionPicker}
                onSelect={(provider) => selectMention(provider.mention)}
              />

              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => {
                  const value = event.target.value;
                  const caret = event.target.selectionStart;
                  onMessageChange(value);
                  setMentionRange(findActiveMention(value, caret));
                  setActiveIndex(0);
                }}
                onKeyDown={
                  handleKeyDown
                }
                aria-label="Message"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={pickerOpen}
                aria-controls={pickerOpen ? listboxId : undefined}
                aria-activedescendant={
                  pickerOpen && filteredOptions[activeIndex]
                    ? `${listboxId}-${filteredOptions[activeIndex].id}`
                    : undefined
                }
                placeholder="Ask for another perspective..."
                rows={1}
                maxLength={4000}
                disabled={sending}
                className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm"
              />

              <button
                type={
                  sending
                    ? "button"
                    : "submit"
                }
                onClick={
                  sending
                    ? onStopGeneration
                    : undefined
                }
                disabled={
                  !sending &&
                  !message.trim()
                }
                aria-label={
                  sending
                    ? "Stop generation"
                    : "Send message"
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30 md:h-10 md:w-10"
              >
                {sending ? (
                  <span
                    className="h-3.5 w-3.5 rounded-sm bg-current"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="text-lg leading-none">
                    ↑
                  </span>
                )}
              </button>
            </div>
            {message.length >= 3800 && (
              <div className="px-4 pb-2 text-right text-xs text-muted-foreground" role="status" aria-live="polite">
                {4000 - message.length} characters remaining
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
