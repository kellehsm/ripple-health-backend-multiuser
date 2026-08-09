import { useReducer, useCallback } from "react";

// Central switchboard for a screen's boolean modal flags.
// Avoids the useState<boolean>(false) fanout that grows every time a new modal is added.
//
//   const { isOpen, open, close, closeAll } = useModals<"foodScan" | "barcodeScan">();
//   open("foodScan");
//   isOpen("foodScan") // true
export function useModals<K extends string>() {
  const [state, dispatch] = useReducer(
    (s: Set<K>, action: { type: "open" | "close"; key: K } | { type: "closeAll" }) => {
      if (action.type === "closeAll") return new Set<K>();
      const next = new Set(s);
      if (action.type === "open") next.add(action.key);
      else next.delete(action.key);
      return next;
    },
    new Set<K>()
  );

  const open = useCallback((key: K) => dispatch({ type: "open", key }), []);
  const close = useCallback((key: K) => dispatch({ type: "close", key }), []);
  const closeAll = useCallback(() => dispatch({ type: "closeAll" }), []);
  const isOpen = useCallback((key: K) => state.has(key), [state]);

  return { open, close, closeAll, isOpen };
}
