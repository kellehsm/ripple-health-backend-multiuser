import { query } from "../db.js";

const HARDCOVER_GRAPHQL = "https://api.hardcover.app/v1/graphql";

// 1=Want to Read, 2=Currently Reading, 3=Read, 5=Did Not Finish
const LOCAL_TO_HC: Record<string, number> = {
  want_to_read: 1,
  reading:      2,
  finished:     3,
  dropped:      5,
};
const HC_TO_LOCAL: Record<number, string> = {
  1: "want_to_read",
  2: "reading",
  3: "finished",
  5: "dropped",
};

type Logger = { info: (...a: any[]) => void; error: (...a: any[]) => void };

async function hcGraphql(token: string, gql: string, variables?: Record<string, any>) {
  const res = await fetch(HARDCOVER_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query: gql, variables }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Hardcover HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message ?? "GraphQL error");
  return body.data;
}

// FIX #1: Fetch all user_books in a single query instead of one per book.
// Returns a Map<hardcover_book_id, hcBook>.
async function getAllHcUserBooks(token: string, bookIds: number[]): Promise<Map<number, any>> {
  if (!bookIds.length) return new Map();
  const data = await hcGraphql(token, `
    query GetUserBooks($ids: [Int!]!) {
      user_books(where: {book_id: {_in: $ids}}) {
        id
        book_id
        status_id
        updated_at
        user_book_reads(order_by: {id: desc}, limit: 1) {
          id
          progress_pages
          started_at
        }
      }
    }
  `, { ids: bookIds });
  const map = new Map<number, any>();
  for (const ub of data?.user_books ?? []) map.set(ub.book_id, ub);
  return map;
}

async function upsertUserBook(token: string, bookId: number, statusId: number) {
  const data = await hcGraphql(token, `
    mutation UpsertUserBook($bookId: Int!, $statusId: Int!) {
      insert_user_book(object: {book_id: $bookId, status_id: $statusId}) { id error }
    }
  `, { bookId, statusId });
  const result = data?.insert_user_book;
  if (result?.error) throw new Error(`insert_user_book error: ${result.error}`);
  return result;
}

async function updateUserBook(token: string, userBookId: number, statusId: number) {
  const data = await hcGraphql(token, `
    mutation UpdateUserBook($id: Int!, $statusId: Int!) {
      update_user_book(id: $id, object: {status_id: $statusId}) { id error }
    }
  `, { id: userBookId, statusId });
  const result = data?.update_user_book;
  if (result?.error) throw new Error(`update_user_book error: ${result.error}`);
  return result;
}

async function insertUserBookRead(
  token: string, userBookId: number, progressPages: number, startedAt: string | null
) {
  const data = await hcGraphql(token, `
    mutation InsertUserBookRead($userBookId: Int!, $progressPages: Int!, $startedAt: date) {
      insert_user_book_read(
        user_book_id: $userBookId
        user_book_read: {progress_pages: $progressPages, started_at: $startedAt}
      ) { id error }
    }
  `, { userBookId, progressPages, startedAt: startedAt ?? null });
  const result = data?.insert_user_book_read;
  if (result?.error) throw new Error(`insert_user_book_read error: ${result.error}`);
  return result;
}

async function updateUserBookRead(token: string, readId: number, progressPages: number) {
  const data = await hcGraphql(token, `
    mutation UpdateUserBookRead($id: Int!, $progressPages: Int!) {
      update_user_book_read(id: $id, object: {progress_pages: $progressPages}) { id error }
    }
  `, { id: readId, progressPages });
  const result = data?.update_user_book_read;
  if (result?.error) throw new Error(`update_user_book_read error: ${result.error}`);
  return result;
}

export async function syncUserHardcover(
  user_id: string,
  token: string,
  log: Logger = { info: () => {}, error: () => {} }
): Promise<{ books_checked: number; pushed: number; pulled: number; errors: number }> {
  const books = await query<any>(
    `SELECT b.id, b.hardcover_id, b.status, b.updated_at, b.hardcover_synced_at, b.started_at,
            COALESCE(SUM(rl.pages_read), 0)::int AS pages_read_total
     FROM books b
     LEFT JOIN reading_logs rl ON rl.book_id = b.id
     WHERE b.user_id = $1 AND b.hardcover_id IS NOT NULL
     GROUP BY b.id`,
    [user_id]
  );

  if (!books.length) return { books_checked: 0, pushed: 0, pulled: 0, errors: 0 };

  // FIX #1: one batch query to HC instead of N individual calls
  const hcMap = await getAllHcUserBooks(token, books.map((b: any) => b.hardcover_id));

  let pushed = 0, pulled = 0, errors = 0;

  for (const book of books) {
    try {
      const hcBook  = hcMap.get(book.hardcover_id) ?? null;
      const syncedAt = book.hardcover_synced_at ? new Date(book.hardcover_synced_at) : null;
      const localAt  = new Date(book.updated_at);
      const hcAt     = hcBook?.updated_at ? new Date(hcBook.updated_at) : null;

      if (!syncedAt) {
        if (hcBook) {
          await doPull(user_id, book, hcBook, log);
          pulled++;
        } else {
          if (await doPush(token, user_id, book, null, log)) pushed++;
        }
      } else if (hcAt && hcAt > syncedAt) {
        await doPull(user_id, book, hcBook, log);
        pulled++;
      } else if (localAt > syncedAt) {
        if (await doPush(token, user_id, book, hcBook, log)) pushed++;
      }
    } catch (err: any) {
      errors++;
      log.error({ user_id, book_id: book.id, err: err?.message }, "Hardcover sync: book error");
    }
  }

  // FIX #6: drain retry queue with batched GraphQL aliases (1–2 HC calls for up to 10 items)
  const queued = await query<any>(
    `SELECT * FROM hardcover_sync_queue
     WHERE user_id = $1 AND retry_count < 5
     ORDER BY created_at LIMIT 10`,
    [user_id]
  );

  if (queued.length) {
    const validItems = queued.filter((item: any) => LOCAL_TO_HC[item.payload.status]);
    const succeeded: string[] = [];
    const failed: Array<{ id: string; err: string }> = [];

    if (validItems.length) {
      // Batch all status upserts in one aliased mutation
      const statusMutation = validItems.map((item: any, i: number) => {
        const p = item.payload;
        return `r${i}: insert_user_book(object: {book_id: ${p.hardcover_id}, status_id: ${LOCAL_TO_HC[p.status]}}) { id error }`;
      }).join("\n      ");

      let statusResults: Record<string, any> = {};
      try {
        statusResults = await hcGraphql(token, `mutation { ${statusMutation} }`);
      } catch (err: any) {
        // Entire batch failed — mark all for retry increment
        validItems.forEach((item: any) => failed.push({ id: item.id, err: err?.message ?? "batch failed" }));
      }

      // For items that got a user_book id back, batch progress inserts
      const progressItems: Array<{ alias: string; user_book_id: number; item: any }> = [];
      validItems.forEach((item: any, i: number) => {
        const r = statusResults[`r${i}`];
        if (r?.id && !r.error && item.payload.pages_read > 0) {
          progressItems.push({ alias: `p${i}`, user_book_id: r.id, item });
        } else if (r?.id && !r.error) {
          succeeded.push(item.id);
        } else if (r?.error) {
          failed.push({ id: item.id, err: r.error });
        }
      });

      if (progressItems.length) {
        const progressMutation = progressItems.map(({ alias, user_book_id, item }) => {
          const p = item.payload;
          const started = p.started_at ? `"${p.started_at}"` : "null";
          return `${alias}: insert_user_book_read(user_book_id: ${user_book_id}, user_book_read: {progress_pages: ${p.pages_read}, started_at: ${started}}) { id error }`;
        }).join("\n      ");

        try {
          const progressResults = await hcGraphql(token, `mutation { ${progressMutation} }`);
          progressItems.forEach(({ alias, item }) => {
            const r = progressResults[alias];
            if (r?.id && !r.error) succeeded.push(item.id);
            else failed.push({ id: item.id, err: r?.error ?? "progress failed" });
          });
        } catch (err: any) {
          progressItems.forEach(({ item }) => failed.push({ id: item.id, err: err?.message ?? "progress batch failed" }));
        }
      }
    }

    // Batch DB cleanup: delete successes, increment retries for failures
    if (succeeded.length) {
      await query(
        `DELETE FROM hardcover_sync_queue WHERE id = ANY($1::uuid[])`,
        [succeeded]
      );
      pushed += succeeded.length;
    }
    for (const { id, err } of failed) {
      await query(
        `UPDATE hardcover_sync_queue SET retry_count = retry_count + 1, last_error = $2 WHERE id = $1`,
        [id, err]
      );
    }
  }

  // FIX #7: only write last_synced_at when something actually changed
  if (pushed + pulled > 0) {
    await query(
      `UPDATE user_settings
       SET settings = settings || jsonb_build_object('hardcover',
         COALESCE(settings->'hardcover', '{}'::jsonb) ||
         jsonb_build_object('last_synced_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
       WHERE user_id = $1`,
      [user_id]
    );
  }

  return { books_checked: books.length, pushed, pulled, errors };
}

// FIX #3: doPull — 2 DB round-trips max (was up to 4)
async function doPull(user_id: string, book: any, hcBook: any, log: Logger) {
  const newStatus = hcBook.status_id != null ? HC_TO_LOCAL[hcBook.status_id] : null;
  const statusChanged = newStatus && newStatus !== book.status;

  if (statusChanged) {
    // CTE: update book + log the status change in one round-trip
    await query(
      `WITH upd AS (
         UPDATE books SET status = $1, hardcover_synced_at = now()
         WHERE id = $2 AND user_id = $3
       )
       INSERT INTO hardcover_sync_log (user_id, book_id, direction, field, detail)
       VALUES ($3, $2, 'pull', 'status', $4)`,
      [newStatus, book.id, user_id, `${book.status} → ${newStatus}`]
    );
    log.info({ user_id, book_id: book.id }, `Hardcover pull: status ${book.status} → ${newStatus}`);
  } else {
    await query(
      `UPDATE books SET hardcover_synced_at = now() WHERE id = $1 AND user_id = $2`,
      [book.id, user_id]
    );
  }

  const hcPages: number = hcBook.user_book_reads?.[0]?.progress_pages ?? 0;
  const localPages: number = book.pages_read_total ?? 0;
  if (hcPages > localPages) {
    const diff = hcPages - localPages;
    // CTE: insert reading log + log the progress in one round-trip
    await query(
      `WITH ins AS (
         INSERT INTO reading_logs (book_id, user_id, pages_read, logged_at)
         VALUES ($1, $2, $3, current_date)
       )
       INSERT INTO hardcover_sync_log (user_id, book_id, direction, field, detail)
       VALUES ($2, $1, 'pull', 'progress', $4)`,
      [book.id, user_id, diff, `+${diff} pages from Hardcover`]
    );
    log.info({ user_id, book_id: book.id }, `Hardcover pull: +${diff} pages`);
  }
}

// FIX #3: doPush — 1 DB round-trip on success (was 2)
async function doPush(
  token: string,
  user_id: string,
  book: any,
  existingHcBook: any | null,
  log: Logger
): Promise<boolean> {
  try {
    const statusId = LOCAL_TO_HC[book.status];
    if (!statusId) return false;

    let userBookId: number;
    if (existingHcBook) {
      const result = await updateUserBook(token, existingHcBook.id, statusId);
      userBookId = result.id;
    } else {
      const result = await upsertUserBook(token, book.hardcover_id, statusId);
      userBookId = result.id;
    }

    const pagesRead: number = book.pages_read_total ?? 0;
    if (pagesRead > 0) {
      const existingRead = existingHcBook?.user_book_reads?.[0];
      if (existingRead) {
        await updateUserBookRead(token, existingRead.id, pagesRead);
      } else {
        await insertUserBookRead(token, userBookId, pagesRead, book.started_at ?? null);
      }
    }

    // CTE: mark synced + log in one round-trip
    await query(
      `WITH upd AS (
         UPDATE books SET hardcover_synced_at = now() WHERE id = $1 AND user_id = $2
       )
       INSERT INTO hardcover_sync_log (user_id, book_id, direction, field, detail)
       VALUES ($2, $1, 'push', 'status', $3)`,
      [book.id, user_id, `status=${book.status}, pages=${pagesRead}`]
    );
    log.info({ user_id, book_id: book.id }, `Hardcover push: ${book.status}, ${pagesRead} pages`);
    return true;
  } catch (err: any) {
    await query(
      `INSERT INTO hardcover_sync_queue (user_id, book_id, operation, payload, last_error)
       VALUES ($1, $2, 'push_status', $3, $4)`,
      [
        user_id, book.id,
        JSON.stringify({
          hardcover_id: book.hardcover_id,
          status: book.status,
          pages_read: book.pages_read_total ?? 0,
          started_at: book.started_at ?? null,
        }),
        err?.message ?? "push failed",
      ]
    );
    log.error({ user_id, book_id: book.id, err: err?.message }, "Hardcover push failed — queued for retry");
    return false;
  }
}

// FIX #2: run all users in parallel (independent — no shared state)
export async function runHardcoverSyncJob(log: Logger) {
  let users: { user_id: string; api_token: string }[];
  try {
    users = await query<any>(
      `SELECT user_id, settings->'hardcover'->>'api_token' AS api_token
       FROM user_settings
       WHERE settings->'hardcover'->>'api_token' IS NOT NULL
         AND settings->'hardcover'->>'api_token' != ''`
    );
  } catch (err: any) {
    log.error({ err: err?.message }, "Hardcover sync job: failed to query users");
    return;
  }

  const results = await Promise.allSettled(
    users.map(({ user_id, api_token }) =>
      syncUserHardcover(user_id, api_token, log).then((result) => {
        if (result.pushed + result.pulled > 0) {
          log.info({ user_id, ...result }, "Hardcover sync completed");
        }
      })
    )
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    log.error({ failed, total: users.length }, "Hardcover sync job: some users failed");
  }
}
