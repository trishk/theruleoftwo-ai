const inviteTails = new Map<
  string,
  Promise<void>
>();

export async function withInviteLock<T>(
  token: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous =
    inviteTails.get(token) ??
    Promise.resolve();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.then(() => gate);

  inviteTails.set(token, current);
  await previous;

  try {
    return await operation();
  } finally {
    release();

    if (inviteTails.get(token) === current) {
      inviteTails.delete(token);
    }
  }
}
