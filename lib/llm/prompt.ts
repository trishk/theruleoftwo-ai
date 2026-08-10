import { PROVIDER_LIST } from "./providerMeta";

export function stripMentions(content: string) {
  return PROVIDER_LIST.reduce(
    (result, provider) =>
      result.replace(
        new RegExp(provider.mention, "ig"),
        ""
      ),
    content
  )
    .replace(/\s+/g, " ")
    .trim();
}