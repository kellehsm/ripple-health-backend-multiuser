/**
 * Per-screen error boundary.
 *
 * WHY: AppErrorBoundary blanks the whole app when any screen crashes. A
 * per-screen boundary contains the failure to the tab that broke and shows
 * a recover-in-place UI instead. Wrap every top-level screen in this.
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import { ScaledText } from "./ScaledText";
import { Button } from "./Button";
import { EmptyState, EMPTY_STATES } from "./EmptyState";

interface State { hasError: boolean; message?: string }
interface Props { children: React.ReactNode; screenName?: string; onReset?: () => void }

export class ScreenErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(err: any): State { return { hasError: true, message: err?.message ?? String(err) }; }
  componentDidCatch(err: any, info: any) {
    console.error(`[ScreenError:${this.props.screenName ?? "?"}]`, err, info);
    // TODO: report to error tracking if configured
  }
  reset = () => {
    this.setState({ hasError: false, message: undefined });
    this.props.onReset?.();
  };
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <EmptyState {...EMPTY_STATES.error(this.reset)} />
        {this.state.message && (
          <ScaledText size={11} color="#888" center style={{ marginTop: 12, paddingHorizontal: 24 }}>
            {this.state.message}
          </ScaledText>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
