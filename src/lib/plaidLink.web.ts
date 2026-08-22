// Web build: the Plaid native SDK doesn't exist in the browser; bank linking
// is a phone-only flow.
import { useState } from "react";

export type PlaidLinkState = "idle" | "loading" | "linking" | "syncing" | "done" | "error";

export function usePlaidLink(_onComplete?: (added: number) => void) {
  const [state] = useState<PlaidLinkState>("idle");
  return {
    openLink: async () => {},
    state,
    error: "Bank linking is only available in the mobile app",
  };
}
