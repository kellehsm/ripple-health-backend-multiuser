import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";

const USER_ID = "f2cde901-feae-443e-abed-ddf7302bb131";

type Book = {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  total_pages: number | null;
  total_chapters: number | null;
  current_chapter: number | null;
};

type Progress = {
  pages_read_total: number;
  total_pages: number | null;
  percent_complete: number | null;
};

export function LifeScreen() {
  const { theme } = useTheme();
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [pageInputs, setPageInputs] = useState<Record<string, string>>({});
  const [chapterInputs, setChapterInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mealText, setMealText] = useState("");

  const fetchBooks = useCallback(async () => {
    try {
      const data: Book[] = await api.books(USER_ID, "reading");
      setBooks(data);
      const progressEntries = await Promise.all(
        data.map(async (b) => {
          const p: Progress = await api.bookProgress(b.id);
          return [b.id, p] as [string, Progress];
        })
      );
      setProgress(Object.fromEntries(progressEntries));
    } catch (e) {
      console.error("Failed to load books", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  async function handleLogPages(bookId: string, pages: number) {
    if (pages <= 0) return;
    try {
      await api.logPages(bookId, pages);
      const p: Progress = await api.bookProgress(bookId);
      setProgress((prev) => ({ ...prev, [bookId]: p }));
    } catch (e) {
      console.error("Failed to log pages", e);
    }
  }

  async function handleManualPages(bookId: string) {
    const raw = pageInputs[bookId] ?? "";
    const n = parseInt(raw, 10);
    if (!n || n <= 0) return;
    await handleLogPages(bookId, n);
    setPageInputs((prev) => ({ ...prev, [bookId]: "" }));
  }

  async function handleUpdateChapter(bookId: string, chapter: number) {
    if (chapter <= 0) return;
    try {
      const updated: Book = await api.updateBook(bookId, { current_chapter: chapter });
      setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, current_chapter: updated.current_chapter } : b)));
    } catch (e) {
      console.error("Failed to update chapter", e);
    }
  }

  async function handleManualChapter(bookId: string) {
    const raw = chapterInputs[bookId] ?? "";
    const n = parseInt(raw, 10);
    if (!n || n <= 0) return;
    await handleUpdateChapter(bookId, n);
    setChapterInputs((prev) => ({ ...prev, [bookId]: "" }));
  }

  async function handleIncrementChapter(book: Book) {
    const next = (book.current_chapter ?? 0) + 1;
    await handleUpdateChapter(book.id, next);
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Currently reading</Text>

        {loading && <ActivityIndicator style={{ marginTop: 12 }} color={theme.teal.bar} />}

        {!loading && books.length === 0 && (
          <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>
            No books in progress.
          </Text>
        )}

        {books.map((book, i) => {
          const prog = progress[book.id];
          const pagesTotal = prog?.pages_read_total ?? 0;
          const totalPages = prog?.total_pages ?? null;
          const pct = prog?.percent_complete ?? null;

          return (
            <View
              key={book.id}
              style={[styles.bookRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: theme.cardBorder, marginTop: 16, paddingTop: 16 }]}
            >
              {/* Cover */}
              <View style={styles.coverArea}>
                {book.cover_url ? (
                  <Image source={{ uri: book.cover_url }} style={styles.cover} resizeMode="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: theme.teal.bg }]} />
                )}
              </View>

              <View style={styles.bookInfo}>
                <Text style={[styles.bookTitle, { color: theme.textStrong }]} numberOfLines={2}>
                  {book.title}
                </Text>
                {book.author && (
                  <Text style={[styles.bookAuthor, { color: theme.textSoft }]} numberOfLines={1}>
                    {book.author}
                  </Text>
                )}

                {/* Pages progress */}
                {totalPages ? (
                  <>
                    <View style={[styles.progressTrack, { backgroundColor: theme.teal.bg }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { backgroundColor: theme.teal.bar, width: `${Math.min(pct ?? 0, 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressText, { color: theme.textSoft }]}>
                      {pagesTotal} of {totalPages} pages · {pct ?? 0}%
                    </Text>
                  </>
                ) : (
                  pagesTotal > 0 && (
                    <Text style={[styles.progressText, { color: theme.textSoft }]}>
                      {pagesTotal} pages read
                    </Text>
                  )
                )}

                {/* Quick log buttons */}
                <View style={styles.quickRow}>
                  {[10, 20, 30].map((n) => (
                    <Pressable
                      key={n}
                      style={[styles.quickBtn, { backgroundColor: theme.teal.bg }]}
                      onPress={() => handleLogPages(book.id, n)}
                    >
                      <Text style={[styles.quickBtnText, { color: theme.teal.fg }]}>+{n}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Manual page entry */}
                <View style={styles.manualRow}>
                  <TextInput
                    placeholder="pages"
                    keyboardType="numeric"
                    value={pageInputs[book.id] ?? ""}
                    onChangeText={(v) => setPageInputs((prev) => ({ ...prev, [book.id]: v }))}
                    style={[styles.manualInput, { borderColor: theme.cardBorder, color: theme.textStrong }]}
                    placeholderTextColor={theme.textSoft}
                  />
                  <Pressable
                    style={[styles.manualBtn, { backgroundColor: theme.teal.bar }]}
                    onPress={() => handleManualPages(book.id)}
                  >
                    <Text style={styles.manualBtnText}>Log</Text>
                  </Pressable>
                </View>

                {/* Chapter tracking — only if total_chapters is set */}
                {book.total_chapters != null && (
                  <View style={styles.chapterSection}>
                    <View style={[styles.progressTrack, { backgroundColor: theme.blue.bg }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: theme.blue.sub,
                            width: `${Math.min(Math.round(((book.current_chapter ?? 0) / book.total_chapters) * 100), 100)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressText, { color: theme.textSoft }]}>
                      Chapter {book.current_chapter ?? 0} of {book.total_chapters}
                    </Text>
                    <View style={styles.quickRow}>
                      <Pressable
                        style={[styles.quickBtn, { backgroundColor: theme.blue.bg }]}
                        onPress={() => handleIncrementChapter(book)}
                      >
                        <Text style={[styles.quickBtnText, { color: theme.blue.fg }]}>+1 chapter</Text>
                      </Pressable>
                    </View>
                    <View style={styles.manualRow}>
                      <TextInput
                        placeholder="chapter #"
                        keyboardType="numeric"
                        value={chapterInputs[book.id] ?? ""}
                        onChangeText={(v) => setChapterInputs((prev) => ({ ...prev, [book.id]: v }))}
                        style={[styles.manualInput, { borderColor: theme.cardBorder, color: theme.textStrong }]}
                        placeholderTextColor={theme.textSoft}
                      />
                      <Pressable
                        style={[styles.manualBtn, { backgroundColor: theme.blue.sub }]}
                        onPress={() => handleManualChapter(book.id)}
                      >
                        <Text style={styles.manualBtnText}>Set</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Hobbies</Text>
        <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10 }}>
          Guitar practice, woodworking, etc. - each tracked like a mini book.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Log a meal</Text>
        <View style={styles.mealRow}>
          <TextInput
            placeholder="what did you eat?"
            value={mealText}
            onChangeText={setMealText}
            style={[styles.input, { borderColor: theme.cardBorder, color: theme.textStrong }]}
            placeholderTextColor={theme.textSoft}
          />
          <Pressable style={[styles.addButton, { backgroundColor: theme.teal.bar }]}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: "500", marginBottom: 4 },

  bookRow: { flexDirection: "row", gap: 12 },
  coverArea: { paddingTop: 2 },
  cover: { width: 56, height: 80, borderRadius: 6 },
  coverPlaceholder: { opacity: 0.5 },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 14, fontWeight: "600", lineHeight: 19 },
  bookAuthor: { fontSize: 12, marginTop: 1 },

  progressTrack: { height: 6, borderRadius: 6, overflow: "hidden", marginTop: 8 },
  progressFill: { height: "100%" },
  progressText: { fontSize: 11, marginTop: 4 },

  quickRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  quickBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  quickBtnText: { fontSize: 12, fontWeight: "600" },

  manualRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  manualInput: {
    width: 72,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 13,
  },
  manualBtn: { borderRadius: 8, paddingHorizontal: 12, justifyContent: "center" },
  manualBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  chapterSection: { marginTop: 10 },

  mealRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addButton: { borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
});
