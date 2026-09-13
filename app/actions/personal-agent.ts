"use server";

import { revalidatePath } from "next/cache";

import { requireSettingsAccess } from "@/lib/auth/settings-access";
import {
  createPairingToken,
  revokePersonalAgent,
} from "@/lib/personal-agent/pairing";

export async function createPersonalAgentPairingToken() {
  const user = await requireSettingsAccess();
  const result = await createPairingToken(user.id);
  revalidatePath("/settings");
  return {
    pairingToken: result.pairingToken,
    expiresAt: result.expiresAt.toISOString(),
  };
}

export async function revokeCurrentPersonalAgent() {
  const user = await requireSettingsAccess();
  await revokePersonalAgent(user.id);
  revalidatePath("/settings");
}
