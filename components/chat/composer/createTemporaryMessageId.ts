let nextTemporaryMessageId = -Date.now();

export function createTemporaryMessageId() {
  nextTemporaryMessageId -= 1;

  return nextTemporaryMessageId;
}
