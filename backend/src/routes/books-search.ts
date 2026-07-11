import { FastifyInstance } from "fastify";

export default async function booksSearchRoutes(app: FastifyInstance) {
  app.get("/search", async (req) => {
    const { q } = req.query as any;
    if (!q) return { error: "missing query param 'q'" };

    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=title,author_name,cover_i,first_publish_year,number_of_pages_median`;
    const res = await fetch(url);
    if (!res.ok) return { error: `Open Library API error ${res.status}` };
    const data = await res.json();

    const results = (data.docs ?? []).map((book: any) => ({
      title: book.title,
      author: book.author_name?.[0] ?? null,
      cover_url: book.cover_i
        ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
        : null,
      total_pages: book.number_of_pages_median ?? null,
      first_published: book.first_publish_year ?? null,
    }));

    return results;
  });
}

