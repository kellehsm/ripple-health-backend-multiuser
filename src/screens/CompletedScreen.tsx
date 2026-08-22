import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  Image,
  StyleSheet,
  Alert,
  Pressable,
  RefreshControl,
  Dimensions,
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { EmptyState } from "../components/EmptyState";
import { ShadowCard } from "../components/ShadowCard";
import { UndoBanner } from "../components/UndoBanner";
import { toast } from "../lib/toast";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { onSolid } from "../theme/colorUtils";
import { api } from "../api/client";
import { formatDate } from "../utils/dateUtils";

// ── Types ──────────────────────────────────────────────────────────────────────

type CompletedItem = {
  id: string;
  name: string;
  kind: "book" | "hobby";
  completed_at: string;
  author?: string;
  cover_url?: string;
  rating?: number;
  icon?: string;
  color_key?: string;
  unit_label?: string;
};

type ReadingBook = {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  status: string;
  total_pages: number | null;
};

type Progress = {
  pages_read_total: number;
  total_pages: number | null;
  percent_complete: number | null;
};

// ── Bookshelf ─────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get("window").width;
const SHELF_PAD = 12;
const SHELF_GAP = 6;
const PER_ROW = 4;
const BOOK_W = Math.floor((SCREEN_W - 32 - SHELF_PAD * 2 - SHELF_GAP * (PER_ROW - 1)) / PER_ROW);
const BOOK_MIN_H = 96;
const BOOK_MAX_H = 130;

function bookHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff;
  return Math.abs(h);
}

function BookShelf({
  readingBooks,
  completedBooks,
  progress,
}: {
  readingBooks: ReadingBook[];
  completedBooks: CompletedItem[];
  progress: Record<string, Progress>;
}) {
  const { theme } = useTheme();
  const ink = theme.ink;
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  type ShelfBook = {
    id: string;
    title: string;
    author: string | null;
    cover_url: string | null;
    finished: boolean;
    pct: number;
    rating?: number;
  };

  const allBooks: ShelfBook[] = [
    ...readingBooks.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      cover_url: b.cover_url,
      finished: false,
      pct: progress[b.id]?.percent_complete ?? 0,
    })),
    ...completedBooks.map((b) => ({
      id: b.id,
      title: b.name,
      author: b.author ?? null,
      cover_url: b.cover_url ?? null,
      finished: true,
      pct: 100,
      rating: b.rating,
    })),
  ];

  if (allBooks.length === 0) return null;

  const SPINE_COLORS = [
    theme.teal.solid,
    theme.coral.solid,
    (theme.blue as any)?.solid ?? "#3b82f6",
    theme.berry.solid,
    (theme.amber as any)?.solid ?? "#f59e0b",
    (theme.violet as any)?.solid ?? theme.purple.solid,
    theme.purple.solid,
  ];

  const rows: ShelfBook[][] = [];
  for (let i = 0; i < allBooks.length; i += PER_ROW) rows.push(allBooks.slice(i, i + PER_ROW));

  return (
    <View style={{ borderWidth: 2, borderColor: ink, borderRadius: 18, overflow: "hidden", backgroundColor: theme.card, marginBottom: 4 }}>
      <View style={{ paddingHorizontal: SHELF_PAD, paddingTop: 10, paddingBottom: 6, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 0.8, color: theme.textSoft }}>📚 YOUR SHELF</Text>
        <Text style={{ fontSize: 9, color: theme.textSoft, flex: 1, textAlign: "right" }}>
          {readingBooks.length} reading · {completedBooks.length} finished
        </Text>
      </View>

      <View style={{ paddingHorizontal: SHELF_PAD }}>
        {rows.map((row, rowIdx) => {
          const rowMaxH = Math.max(...row.map((b) => BOOK_MIN_H + (bookHash(b.id + "h") % (BOOK_MAX_H - BOOK_MIN_H))));
          // Check if any book in this row is selected
          const rowHasSelected = row.some((b) => b.id === selectedBookId);
          const selectedBook = rowHasSelected ? row.find((b) => b.id === selectedBookId) ?? null : null;
          return (
            <View key={rowIdx}>
              <View style={{ flexDirection: "row", gap: SHELF_GAP, alignItems: "flex-end", height: rowMaxH }}>
                {row.map((book) => {
                  const color = SPINE_COLORS[bookHash(book.id) % SPINE_COLORS.length];
                  const textColor = onSolid(color);
                  const h = BOOK_MIN_H + (bookHash(book.id + "h") % (BOOK_MAX_H - BOOK_MIN_H));
                  const fillH = h * (book.pct / 100);
                  const isSelected = book.id === selectedBookId;

                  return (
                    <Pressable
                      key={book.id}
                      style={{ width: BOOK_W, height: h }}
                      onPress={() => setSelectedBookId(isSelected ? null : book.id)}
                      accessibilityRole="button"
                      accessibilityLabel={book.title + (book.finished ? ", finished" : ", " + book.pct + "% read")}
                    >
                      {book.cover_url ? (
                        <View style={{ flex: 1, borderRadius: 3, borderTopRightRadius: 6, overflow: "hidden", borderWidth: isSelected ? 2.5 : 1.5, borderColor: isSelected ? theme.teal.solid : ink }}>
                          <Image source={{ uri: book.cover_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                          {!book.finished && book.pct > 0 && (
                            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: "rgba(0,0,0,0.3)" }}>
                              <View style={{ height: 3, width: `${book.pct}%` as any, backgroundColor: theme.teal.solid }} />
                            </View>
                          )}
                          {book.finished && (
                            <View style={{ position: "absolute", top: 3, right: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.teal.solid, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 8, color: "#fff", fontWeight: "900" }}>✓</Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={{ flex: 1, backgroundColor: color, borderRadius: 3, borderTopRightRadius: 6, overflow: "hidden", borderWidth: isSelected ? 2.5 : 1.5, borderColor: isSelected ? theme.teal.solid : ink, position: "relative" }}>
                          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: "rgba(255,255,255,0.22)" }} />
                          {fillH > 0 && (
                            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: fillH, backgroundColor: "rgba(0,0,0,0.2)" }} />
                          )}
                          {book.finished && (
                            <View style={{ position: "absolute", top: 4, right: 4, width: 12, height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 7, fontWeight: "900", color: color }}>✓</Text>
                            </View>
                          )}
                          <View
                            style={{
                              position: "absolute",
                              width: h,
                              height: BOOK_W,
                              left: (BOOK_W - h) / 2,
                              top: (h - BOOK_W) / 2,
                              transform: [{ rotate: "-90deg" }],
                              justifyContent: "center",
                              paddingHorizontal: 6,
                            }}
                          >
                            <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: "800", color: textColor, letterSpacing: 0.2 }}>
                              {book.title}
                            </Text>
                            {book.author && (
                              <Text numberOfLines={1} style={{ fontSize: 9, color: textColor, opacity: 0.7, marginTop: 1 }}>
                                {book.author}
                              </Text>
                            )}
                          </View>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
                {row.length < PER_ROW && Array.from({ length: PER_ROW - row.length }).map((_, i) => (
                  <View key={`gap-${i}`} style={{ width: BOOK_W }} />
                ))}
              </View>
              {/* Inline popover — appears between books and plank when a book in this row is selected (Feature 8) */}
              {selectedBook && (
                <View style={{
                  backgroundColor: theme.card,
                  borderWidth: 2,
                  borderColor: ink,
                  borderRadius: 14,
                  padding: 12,
                  marginTop: 6,
                  marginBottom: 2,
                }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: "900", color: theme.textStrong }} numberOfLines={2}>{selectedBook.title}</Text>
                      {selectedBook.author && (
                        <Text style={{ fontSize: 11, color: theme.textSoft, marginTop: 2 }}>{selectedBook.author}</Text>
                      )}
                      <View style={{ marginTop: 6 }}>
                        {selectedBook.finished ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ fontSize: 12, color: theme.teal.solid, fontWeight: "700" }}>Finished ✓</Text>
                            {selectedBook.rating ? (
                              <View style={{ flexDirection: "row", gap: 2 }}>
                                {[1,2,3,4,5].map((i) => (
                                  <Text key={i} style={{ fontSize: 11, color: i <= (selectedBook.rating ?? 0) ? theme.amber.solid : theme.cardBorder }}>★</Text>
                                ))}
                              </View>
                            ) : null}
                          </View>
                        ) : (
                          <View>
                            <Text style={{ fontSize: 12, color: theme.textSoft, fontWeight: "600" }}>{selectedBook.pct}% complete</Text>
                            <View style={{ height: 4, backgroundColor: theme.cardBorder, borderRadius: 2, overflow: "hidden", marginTop: 4, width: 80 }}>
                              <View style={{ height: 4, width: `${selectedBook.pct}%` as any, backgroundColor: theme.teal.solid, borderRadius: 2 }} />
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                    <Pressable
                      onPress={() => setSelectedBookId(null)}
                      hitSlop={8}
                      accessibilityLabel="Dismiss book preview"
                      style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.cardBorder, alignItems: "center", justifyContent: "center" }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "900", color: theme.textSoft }}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              <View style={{ height: 14, backgroundColor: theme.cardBorder, borderTopWidth: 2, borderTopColor: ink }} />
              {rowIdx < rows.length - 1 && <View style={{ height: 14 }} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────


function StarRating({ rating }: { rating: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 2, marginTop: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= rating ? "star" : "star-outline"} size={12} color={theme.amber.solid} />
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function CompletedScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;
  const styles = useMemo(() => makeStyles(ink), [ink]);

  const [items, setItems] = useState<CompletedItem[]>([]);
  const [readingBooks, setReadingBooks] = useState<ReadingBook[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [completedData, readingData] = await Promise.all([
        api.completed(),
        api.books("reading"),
      ]);
      setItems(Array.isArray(completedData) ? completedData : []);
      const rb: ReadingBook[] = Array.isArray(readingData) ? readingData : [];
      setReadingBooks(rb);
      // Fetch progress for reading books
      const progEntries = await Promise.all(
        rb.map(async (b) => {
          try { return [b.id, await api.bookProgress(b.id)] as [string, Progress]; }
          catch { return null; }
        })
      );
      const progMap: Record<string, Progress> = {};
      for (const entry of progEntries) { if (entry) progMap[entry[0]] = entry[1]; }
      setProgress(progMap);
    } catch (e) {
      if (__DEV__) console.error("Failed to load bookshelf", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const [pendingDelete, setPendingDelete] = React.useState<null | { id: string; name: string; item: CompletedItem; timer: any }>(null);

  function handleDeleteBook(id: string, name: string) {
    const victim = items.find((i) => i.id === id);
    if (!victim) return;
    // Optimistic remove — the API call fires after a 5s undo window so the user
    // can cancel without the delete ever hitting the server.
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (pendingDelete?.timer) clearTimeout(pendingDelete.timer);
    const timer = setTimeout(async () => {
      setPendingDelete(null);
      try { await api.deleteBook(id); }
      catch (e) {
        if (__DEV__) console.error(e);
        toast("Couldn't remove that book. Try again.", "error");
        load();
      }
    }, 5000);
    setPendingDelete({ id, name, item: victim, timer });
  }

  function handleUndoDelete() {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timer);
    setItems((prev) => [...prev, pendingDelete.item]);
    setPendingDelete(null);
  }

  const completedBooks = items.filter((i) => i.kind === "book");
  const completedHobbies = items.filter((i) => i.kind === "hobby");

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.bar} />}
    >
      {loading ? (
        <View style={{ gap: 12 }}>
          <ShadowCard skeleton skeletonHeight={180} />
          <ShadowCard skeleton skeletonHeight={88} />
          <ShadowCard skeleton skeletonHeight={88} />
        </View>
      ) : (
        <>
          {loadError && (
            <ShadowCard size="card" bg={theme.coral.tint}>
              <Text style={{ color: theme.coral.fg, fontSize: 13 }}>
                Couldn't load your bookshelf. Pull down to retry.
              </Text>
            </ShadowCard>
          )}

          <BookShelf readingBooks={readingBooks} completedBooks={completedBooks} progress={progress} />

          {completedBooks.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>BOOKS READ · {completedBooks.length}</Text>
              {completedBooks.map((item) => (
                <View key={item.id} style={[styles.card, { backgroundColor: theme.teal.tint }]}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {item.cover_url ? (
                      <Image source={{ uri: item.cover_url }} style={styles.cover} />
                    ) : (
                      <View style={[styles.cover, { backgroundColor: theme.teal.bg, borderWidth: 2, borderColor: ink }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <Text style={[styles.title, { color: theme.textStrong, flex: 1 }]}>{item.name}</Text>
                        <Pressable onPress={() => handleDeleteBook(item.id, item.name)} hitSlop={8} style={{ marginLeft: 8 }}>
                          <Ionicons name="trash-outline" size={16} color={theme.textSoft} />
                        </Pressable>
                      </View>
                      {item.author ? <Text style={{ color: theme.textSoft, fontSize: 12 }}>{item.author}</Text> : null}
                      {item.rating ? <StarRating rating={item.rating} /> : null}
                      <Text style={[styles.dateLabel, { color: theme.textSoft }]}>Finished {formatDate(item.completed_at)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {readingBooks.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>CURRENTLY READING · {readingBooks.length}</Text>
              {readingBooks.map((book) => {
                const prog = progress[book.id];
                const pct = prog?.percent_complete ?? null;
                return (
                  <View key={book.id} style={[styles.card, { backgroundColor: theme.coral.tint }]}>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {book.cover_url ? (
                        <Image source={{ uri: book.cover_url }} style={styles.cover} />
                      ) : (
                        <View style={[styles.cover, { backgroundColor: theme.coral.bg, borderWidth: 2, borderColor: ink }]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: theme.textStrong }]} numberOfLines={2}>{book.title}</Text>
                        {book.author ? <Text style={{ color: theme.textSoft, fontSize: 12 }}>{book.author}</Text> : null}
                        {pct !== null && (
                          <View style={{ marginTop: 6 }}>
                            <View style={{ height: 5, backgroundColor: theme.cardBorder, borderRadius: 3, overflow: "hidden" }}>
                              <View style={{ height: 5, width: `${pct}%` as any, backgroundColor: theme.teal.solid, borderRadius: 3 }} />
                            </View>
                            <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 3 }}>{pct}% complete</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {completedHobbies.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>HOBBIES COMPLETED · {completedHobbies.length}</Text>
              {completedHobbies.map((item) => (
                <View key={item.id} style={[styles.card, { backgroundColor: theme.violet.tint }]}>
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <View style={[styles.iconTile, { backgroundColor: theme.violet.bg, borderColor: ink }]}>
                      <Text style={{ fontSize: 20 }}>{item.icon || "🎯"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.title, { color: theme.textStrong }]} numberOfLines={2}>{item.name}</Text>
                      <Text style={[styles.dateLabel, { color: theme.textSoft }]}>Completed {formatDate(item.completed_at)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {completedBooks.length === 0 && readingBooks.length === 0 && completedHobbies.length === 0 && !loadError && (
            <EmptyState icon="📚" title="No books yet" subtitle="Add one from the Life tab to start your shelf." />
          )}

        </>
      )}
    </ScrollView>
    {pendingDelete && (
      <UndoBanner
        message={`Removed "${pendingDelete.name.slice(0, 40)}${pendingDelete.name.length > 40 ? '…' : ''}"`}
        onUndo={handleUndoDelete}
        theme={theme}
      />
    )}
    </View>
  );
}

function makeStyles(ink: string) {
  return StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    sectionLabel: {
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.6,
      marginBottom: -4,
      marginTop: 4,
      textTransform: "uppercase",
    },
    card: {
      borderRadius: 22,
      borderWidth: 2,
      borderColor: ink,
      padding: 14,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    cover: { width: 44, height: 64, borderRadius: 4 },
    title: { fontSize: 15, fontWeight: "900", marginBottom: 2 },
    dateLabel: { fontSize: 11, marginTop: 4 },
    iconTile: {
      width: 44,
      height: 44,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
