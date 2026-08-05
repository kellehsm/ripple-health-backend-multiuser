import { query } from "../db.js";

const HARDCOVER_GRAPHQL = "https://api.hardcover.app/v1/graphql";

// Ripple status ↔ Hardcover status_id mapping
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

// Get the current Hardcover state for a single book (scoped to the authenticated user)
async function getHcUserBook(token: string, bookId: number) {
  const data = await hcGraphql(token, `
    query GetUserBook($bookId: Int!) {
      user_books(where: {book_id: {_eq: $bookId}}, limit: 1) {
        id
        status_id
        updated_at
        user_book_reads(order_by: {id: desc}, limit: 1) {
          id
          progress_pages
          started_at
        }
      }
    }
  `, { bookId });
  return data?.user_books?.[0] ?? null;
}

// Create a new user_book entry for this book, or update it if it already exists.
// insert_user_book handles upsert internally on Hardcover's side.
async function upsertUserBook(token: string, bookId: number, statusId: number) {
  const data = await hcGraphql(token, `
    mutation UpsertUserBook($bookId: Int!, $statusId: Int!) {
      insert_user_book(object: {book_id: $bookId, status_id: $statusId}) {
        id
        error
      }
    }
  `, { bookId, statusId });
  const result = data?.insert_user_book;
  if (result?.error) throw new Error(`insert_user_book error: ${result.error}`);
  return result;
}

// Update status on an existing user_book row
async function updateUserBook(token: string, userBookId: number, statusId: number) {
  const data = await hcGraphql(token, `
    mutation UpdateUserBook($id: Int!, $statusId: Int!) {
      update_user_book(id: $id, object: {status_id: $statusId}) {
        id
        error
      }
    }
  `, { id: userBookId, statusId });
  const result = data?.update_user_book;
  if (result?.error) throw new Error(`update_user_book error: ${result.error}`);
  return result;
}

// Add a reading session with progress
async function insertUserBookRead(
  token: string,
  userBookId: number,
  progressPages: number,
  startedAt: string | null
) {
  const data = await hcGraphql(token, `
    mutation InsertUserBookRead($userBookId: Int!, $progressPages: Int!, $startedAt: date) {
      insert_user_book_read(
        user_book_id: $userBookId
        user_book_read: {progress_pages: $progressPages, started_at: $startedAt}
      ) {
        id
        error
      }
    }
  `, { userBookId, progressPages, startedAt: startedAt ?? null });
  const result = data?.insert_user_book_read;
  if (result?.error) throw new Error(`insert_user_book_read error: ${result.error}`);
  return result;
}

// Update an existing reading session's page progress
async function updateUserBookRead(token: string, readId: number, progressPages: number) {
  const data = await hcGraphql(token, `
    mutation UpdateUserBookRead($id: Int!, $progressPages: Int!) {
      update_user_book_read(
        id: $id
        object: {progress_pages: $progressPages}
      ) {
        id
        error
      }
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
  // All local books for this user that have a hardcover_id
  const books = await query<any>(
    `SELECT b.id, b.hardcover_id, b.status, b.updated_at, b.hardcover_synced_at, b.started_at,
            COALESCE(SUM(rl.pages_read), 0)::int AS pages_read_total
     FROM books b
     LEFT JOIN reading_logs rl ON rl.book_id = b.id
     WHERE b.user_id = $1 AND b.hardcover_id IS NOT NULL
     GROUP BY b.id`,
    [user_id]
  );

  let pushed = 0, pulled = 0, errors = 0;

  for (const book of books) {
    try {
      const hcBook = await getHcUserBook(token, book.hardcover_id);
      const syncedAt = book.hardcover_synced_at ? new Date(book.hardcover_synced_at) : null;
      const localAt  = new Date(book.updated_at);
      const hcAt     = hcBook?.updated_at ? new Date(hcBook.updated_at) : null;

      if (!syncedAt) {
        // First sync: if Hardcover already has this book, pull its state;
        // otherwise push local state to Hardcover
        if (hcBook) {
          await doPull(user_id, book, hcBook, log);
          pulled++;
        } else {
          const ok = await doPush(token, user_id, book, null, log);
          if (ok) pushed++;
        }
      } else if (hcAt && hcAt > syncedAt) {
        // Hardcover updated more recently → pull
        await doPull(user_id, book, hcBook, log);
        pulled++;
      } else if (localAt > syncedAt) {
        // Local updated more recently → push
        const ok = await doPush(token, user_id, book, hcBook ?? null, log);
        if (ok) pushed++;
      }
      // else: both sides equal last sync time — nothing to do
    } catch (err: any) {
      errors++;
      log.error({ user_id, book_id: book.id, err: err?.message }, "Hardcover sync: book error");
    }
  }

  // Process retry queue (items queued from earlier push failures)
  const queued = await query<any>(
    `SELECT * FROM hardcover_sync_queue
     WHERE user_id = $1 AND retry_count < 5
     ORDER BY created_at
     LIMIT 10`,
    [user_id]
  );
  for (const item of queued) {
    try {
      const p = item.payload;
      const statusId = LOCAL_TO_HC[p.status];
      if (statusId) {
        const result = await upsertUserBook(token, p.hardcover_id, statusId);
        if (result?.id && p.pages_read > 0) {
          await insertUserBookRead(token, result.id, p.pages_read, p.started_at ?? null);
        }
      }
      await query(`DELETE FROM hardcover_sync_queue WHERE id = $1`, [item.id]);
      pushed++;
    } catch (err: any) {
      await query(
        `UPDATE hardcover_sync_queue
         SET retry_count = retry_count + 1, last_error = $2
         WHERE id = $1`,
        [item.id, err?.message ?? "retry failed"]
      );
    }
  }

  // Record last sync time in user settings
  await query(
    `UPDATE user_settings
     SET settings = settings || jsonb_build_object('hardcover',
       COALESCE(settings->'hardcover', '{}'::jsonb) ||
       jsonb_build_object('last_synced_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
     WHERE user_id = $1`,
    [user_id]
  );

  return { books_checked: books.length, pushed, pulled, errors };
}

async function doPull(user_id: string, book: any, hcBook: any, log: Logger) {
  const newStatus = hcBook.status_id != null ? HC_TO_LOCAL[hcBook.status_id] : null;
  const setParts: string[] = ["hardcover_synced_at = now()"];
  const params: any[] = [];
  let p = 1;

  if (newStatus && newStatus !== book.status) {
    setParts.push(`status = $${p++}`);
    params.push(newStatus);
  }

  params.push(book.id, user_id);
  await query(
    `UPDATE books SET ${setParts.join(", ")} WHERE id = $${p++} AND user_id = $${p++}`,
    params
  );

  if (newStatus && newStatus !== book.status) {
    await query(
      `INSERT INTO hardcover_sync_log (user_id, book_id, direction, field, detail)
       VALUES ($1, $2, 'pull', 'status', $3)`,
      [user_id, book.id, `${book.status} → ${newStatus}`]
    );
    log.info({ user_id, book_id: book.id }, `Hardcover pull: status ${book.status} → ${newStatus}`);
  }

  // Pull progress if Hardcover has more pages than local total
  const hcPages: number = hcBook.user_book_reads?.[0]?.progress_pages ?? 0;
  const localPages: number = book.pages_read_total ?? 0;
  if (hcPages > localPages) {
    const diff = hcPages - localPages;
    await query(
      `INSERT INTO reading_logs (book_id, user_id, pages_read, logged_at)
       VALUES ($1, $2, $3, current_date)`,
      [book.id, user_id, diff]
    );
    await query(
      `INSERT INTO hardcover_sync_log (user_id, book_id, direction, field, detail)
       VALUES ($1, $2, 'pull', 'progress', $3)`,
      [user_id, book.id, `+${diff} pages from Hardcover`]
    );
    log.info({ user_id, book_id: book.id }, `Hardcover pull: +${diff} pages`);
  }
}

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
      // Book exists on Hardcover — update its status
      const result = await updateUserBook(token, existingHcBook.id, statusId);
      userBookId = result.id;
    } else {
      // Book not on Hardcover yet — create it
      const result = await upsertUserBook(token, book.hardcover_id, statusId);
      userBookId = result.id;
    }

    // Push reading progress
    const pagesRead: number = book.pages_read_total ?? 0;
    if (pagesRead > 0) {
      const existingRead = existingHcBook?.user_book_reads?.[0];
      if (existingRead) {
        await updateUserBookRead(token, existingRead.id, pagesRead);
      } else {
        await insertUserBookRead(token, userBookId, pagesRead, book.started_at ?? null);
      }
    }

    await query(
      `UPDATE books SET hardcover_synced_at = now() WHERE id = $1 AND user_id = $2`,
      [book.id, user_id]
    );
    await query(
      `INSERT INTO hardcover_sync_log (user_id, book_id, direction, field, detail)
       VALUES ($1, $2, 'push', 'status', $3)`,
      [user_id, book.id, `status=${book.status}, pages=${pagesRead}`]
    );
    log.info({ user_id, book_id: book.id }, `Hardcover push: ${book.status}, ${pagesRead} pages`);
    return true;
  } catch (err: any) {
    // Queue this push for retry rather than losing the update
    await query(
      `INSERT INTO hardcover_sync_queue (user_id, book_id, operation, payload, last_error)
       VALUES ($1, $2, 'push_status', $3, $4)`,
      [
        user_id,
        book.id,
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

  for (const { user_id, api_token } of users) {
    try {
      const result = await syncUserHardcover(user_id, api_token, log);
      if (result.pushed + result.pulled > 0) {
        log.info({ user_id, ...result }, "Hardcover sync completed");
      }
    } catch (err: any) {
      log.error({ err: err?.message, user_id }, "Hardcover sync job: user sync failed");
    }
  }
}
