import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Render Error (debug)</Text>
          <Text style={styles.message}>{error.message}</Text>
          <Text style={styles.stack}>{error.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a0000" },
  content: { padding: 24, paddingTop: 60 },
  heading: { color: "#ff6b6b", fontSize: 20, fontWeight: "700", marginBottom: 12 },
  message: { color: "#ffcccc", fontSize: 14, marginBottom: 16, lineHeight: 20 },
  stack: { color: "#ff9999", fontSize: 11, lineHeight: 16 },
});
