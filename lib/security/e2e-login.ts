export function isE2ELoginEnabled(
  nodeEnv = process.env.NODE_ENV,
  e2eTesting = process.env.E2E_TESTING
) {
  return (
    nodeEnv !== "production" &&
    e2eTesting === "1"
  );
}
