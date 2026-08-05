import { FastifyInstance } from "fastify";

const HARDCOVER_GRAPHQL = "https://api.hardcover.app/v1/graphql";

// results is a raw jsonb scalar returned by Hardcover's Hasura-based API.
// Shape: { hits: [{ document: { id, title, pages, image: { url }, author_names } }], found: N }
const HARDCOVER_SEARCH_QUERY = `
  query SearchBooks($query: String!, $limit: Int!) {
    search(query: $query, query_type: "Book", per_page: $limit) {
      results
    }
  }
`;

async function searchHardcover(q: string, token: string): Promise<any[] | null> {
  const res = await fetch(HARDCOVER_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: HARDCOVER_SEARCH_QUERY,
      variables: { query: q, limit: 8 },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return null;
  const body = await res.json();
  if (body.errors?.length) return null;

  const hits: any[] = body?.data?.search?.results?.hits ?? [];
  if (!hits.length) return null;

  return hits.map((hit: any) => {
    const doc = hit.document ?? {};
    return {
      title:          doc.title ?? null,
      // Hardcover returns a flat author_names array, not nested contributions
      author:         doc.author_names?.[0] ?? null,
      cover_url:      doc.image?.url ?? null,
      total_pages:    doc.pages ?? null,
      // id is a string from jsonb; parse to int for the DB INT column
      hardcover_id:   doc.id != null ? parseInt(String(doc.id), 10) : null,
      first_published: null,
      source:         "hardcover",
    };
  });
}

async function searchOpenLibrary(q: string): Promise<any[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=title,author_name,cover_i,first_publish_year,number_of_pages_median`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();

  return (data.docs ?? []).map((book: any) => ({
    title:          book.title,
    author:         book.author_name?.[0] ?? null,
    cover_url:      book.cover_i
      ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
      : null,
    total_pages:    book.number_of_pages_median ?? null,
    hardcover_id:   null,
    first_published: book.first_publish_year ?? null,
    source:         "open_library",
  }));
}

export default async function booksSearchRoutes(app: FastifyInstance) {
  app.get("/search", async (req) => {
    const { q } = req.query as any;
    if (!q) return { error: "missing query param 'q'" };

    const hardcoverToken = process.env.HARDCOVER_API_KEY;

    // Try Hardcover first (developer-level token, same for all users)
    if (hardcoverToken) {
      try {
        const results = await searchHardcover(String(q), hardcoverToken);
        if (results && results.length > 0) return results;
      } catch {
        // Timeout or network error — fall through to Open Library
      }
    }

    // Fallback: Open Library (always available, no token required)
    try {
      return await searchOpenLibrary(String(q));
    } catch {
      return { error: "Book search unavailable" };
    }
  });
}
