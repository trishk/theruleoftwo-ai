export function streamValidationErrorResponse(
  error: unknown
) {
  const code =
    error instanceof Error
      ? error.message
      : "";

  switch (code) {
    case "INVALID_REQUEST_BODY":
      return new Response(
        "Invalid request body.",
        { status: 400 }
      );

    case "INVALID_CONVERSATION_ID":
      return new Response(
        "Invalid conversation id.",
        { status: 400 }
      );

    case "INVALID_MESSAGE_ID":
      return new Response(
        "Invalid message id.",
        { status: 400 }
      );

    case "INVALID_PROVIDER":
      return new Response(
        "Invalid provider.",
        { status: 400 }
      );

    case "CONVERSATION_NOT_FOUND":
      return new Response(
        "Conversation not found.",
        { status: 404 }
      );

    case "MESSAGE_NOT_FOUND":
      return new Response(
        "Message not found.",
        { status: 404 }
      );

    case "PROVIDER_NOT_MENTIONED":
      return new Response(
        "Provider was not mentioned in this message.",
        { status: 400 }
      );

    case "MEMBER_AI_USAGE_NOT_ALLOWED":
      return new Response(
        "The conversation owner has not enabled shared AI usage.",
        {
          status: 403,
          headers: {
            "X-Chat-Error-Code":
              "member_ai_usage_not_allowed",
          },
        }
      );

    default:
      console.error(
        "Stream request validation failed:",
        error
      );

      return new Response(
        "Could not validate request.",
        { status: 500 }
      );
  }
}
