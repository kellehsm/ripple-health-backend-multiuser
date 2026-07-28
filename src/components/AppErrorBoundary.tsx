import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

interface State {
  error: Error | null;
  info: string;
}

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary] Caught render error:", error.message);
    console.error("[AppErrorBoundary] Stack:", error.stack);
    console.error("[AppErrorBoundary] Component tree:", info.componentStack);
    this.setState({ info: info.componentStack ?? "" });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Render Error (diagnostic mode)</Text>
          <Text style={styles.message}>{String(this.state.error.message)}</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.stack}>{this.state.error.stack}</Text>
            {this.state.info ? (
              <Text style={styles.stack}>{"--- Component Tree ---\n" + this.state.info}</Text>
            ) : null}
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A0000",
    padding: 16,
    justifyContent: "center",
  },
  title: { color: "#FF6B6B", fontSize: 18, fontWeight: "800", marginBottom: 8 },
  message: { color: "#FFAAAA", fontSize: 14, marginBottom: 12 },
  scroll: { flex: 1 },
  stack: { color: "#FF9999", fontSize: 11, fontFamily: "monospace" },
});
