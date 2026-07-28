import { useCallback, useState } from "react";
import { createPlaidLinkSession, LinkSuccess, LinkExit } from "react-native-plaid-link-sdk";
import { api } from "../api/client";

export type PlaidLinkState = "idle" | "loading" | "linking" | "syncing" | "done" | "error";

export function usePlaidLink(onComplete?: (added: number) => void) {
  const [state, setState] = useState<PlaidLinkState>("idle");
  const [error, setError] = useState<string | null>(null);

  const openLink = useCallback(async () => {
    setError(null);
    setState("loading");

    try {
      const { link_token } = await api.plaidCreateLinkToken();

      setState("linking");
      const session = await createPlaidLinkSession({
        token: link_token,
        onSuccess: async (success: LinkSuccess) => {
          try {
            setState("syncing");
            const meta = success.metadata;
            await api.plaidExchangeToken(
              success.publicToken,
              meta.institution?.id,
              meta.institution?.name
            );
            const { total_added } = await api.plaidSync();
            setState("done");
            onComplete?.(total_added ?? 0);
          } catch (err: any) {
            setError(err?.message ?? "Failed to connect bank account");
            setState("error");
          }
        },
        onExit: (exit: LinkExit) => {
          if (exit.error) {
            setError(exit.error.displayMessage ?? exit.error.errorMessage ?? "Link cancelled");
            setState("error");
          } else {
            setState("idle");
          }
        },
      });

      await session.open();
    } catch (err: any) {
      setError(err?.message ?? "Failed to open Plaid Link");
      setState("error");
    }
  }, [onComplete]);

  return { openLink, state, error };
}
