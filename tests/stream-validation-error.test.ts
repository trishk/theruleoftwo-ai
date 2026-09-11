import { afterEach, describe, expect, it, vi } from "vitest";

import { streamValidationErrorResponse } from "@/lib/chat-stream/stream-validation-error";

describe("stream validation error logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not log the raw error or arbitrary properties", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const rawError = {
      message: "unexpected",
      arbitrary: "must-not-be-logged",
    };

    const response = streamValidationErrorResponse(rawError);

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(
      "Stream request validation failed with an unknown code."
    );
    expect(consoleError).not.toHaveBeenCalledWith(rawError);
  });
});
