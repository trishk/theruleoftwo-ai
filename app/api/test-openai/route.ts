import { NextResponse } from "next/server";

import { askLLM } from "@/lib/llm/registry";

export async function GET() {
  const response = await askLLM({
    provider: "openai",
    messages: [
      {
        role: "user",
        content: "Say hello in exactly three words.",
      },
    ],
  });

  return NextResponse.json(response);
}