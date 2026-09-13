import { prisma } from "@/lib/db/prisma";
import {
  credentialHashesMatch,
  hashCredential,
  parseCredentialId,
} from "./credentials";

export class PersonalAgentAuthenticationError extends Error {
  constructor() {
    super("personal_agent_unauthorized");
  }
}

export async function authenticatePersonalAgent(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  const credential = match?.[1];
  if (!credential) throw new PersonalAgentAuthenticationError();
  const agentId = parseCredentialId(credential, "pa1");
  if (!agentId) throw new PersonalAgentAuthenticationError();

  const agent = await prisma.personalAgent.findUnique({
    where: { id: agentId },
  });
  if (!agent || agent.revokedAt ||
      !credentialHashesMatch(agent.credentialHash, hashCredential(credential))) {
    throw new PersonalAgentAuthenticationError();
  }
  return agent;
}
