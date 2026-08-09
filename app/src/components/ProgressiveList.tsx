/**
 * ProgressiveList — wraps a list render so:
 *   - shows N skeletons while loading
 *   - shows partial data as it streams in
 *   - shows a per-feature empty state when no data
 *   - shows an inline retry when an error occurs
 *
 * Frees screens from re-implementing the loading / empty / error triad.
 */

import React from "react";
import { View } from "react-native";
import { SkeletonCard } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { RetryPlaceholder } from "./RetryPlaceholder";

interface Props<T> {
  loading: boolean;
  error: string | null;
  data: T[];
  renderItem: (item: T, i: number) => React.ReactNode;
  skeletonCount?: number;
  emptyProps?: React.ComponentProps<typeof EmptyState>;
  onRetry?: () => void;
  gap?: number;
}

export function ProgressiveList<T>({
  loading,
  error,
  data,
  renderItem,
  skeletonCount = 3,
  emptyProps,
  onRetry,
  gap = 10,
}: Props<T>) {
  if (error && data.length === 0) {
    return <RetryPlaceholder message={error} onRetry={onRetry ?? (() => {})} />;
  }

  if (loading && data.length === 0) {
    return (
      <View style={{ gap }}>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    );
  }

  if (!loading && data.length === 0 && emptyProps) {
    return <EmptyState {...emptyProps} />;
  }

  return (
    <View style={{ gap }}>
      {data.map((item, i) => (
        <React.Fragment key={i}>{renderItem(item, i)}</React.Fragment>
      ))}
      {loading && data.length > 0 && <SkeletonCard />}
    </View>
  );
}
