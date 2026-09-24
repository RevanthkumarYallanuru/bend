import { z } from "zod";

export const rangeEnum = z.enum([
  "today",
  "last3days",
  "week",
  "last30days",
  "month",
  "year",
  "all",
  "custom",
]);

/** Optional range fields shared by every list endpoint that offers the
 * quick date filter. Unset (or "all") means no date filter at all. */
export const optionalRangeFields = {
  range: rangeEnum.optional(),
  start_date: z.string().trim().optional(),
  end_date: z.string().trim().optional(),
};

export function refineCustomRange(
  data: { range?: string; start_date?: string; end_date?: string },
  ctx: z.RefinementCtx
) {
  if (data.range === "custom" && (!data.start_date || !data.end_date)) {
    ctx.addIssue({
      code: "custom",
      message: "start_date and end_date are required when range=custom",
      path: ["start_date"],
    });
  }
}

export const rangeQuerySchema = z
  .object({
    range: rangeEnum.default("today"),
    start_date: z.string().trim().optional(),
    end_date: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.range === "custom" && (!data.start_date || !data.end_date)) {
      ctx.addIssue({
        code: "custom",
        message:
          "start_date and end_date are required when range=custom",
        path: ["start_date"],
      });
    }
  });

export type RangeQuery = z.infer<typeof rangeQuerySchema>;

/**
 * All ranges are resolved in UTC to avoid depending on the server's
 * local timezone. "week" is a rolling 7-day window (today - 6 days
 * through today) rather than an ISO calendar week, and "month" is
 * the current calendar month to date — both simple, unambiguous,
 * and easy for a small business to reason about.
 */
export function resolveDateRange(query: RangeQuery): {
  start: Date;
  end: Date;
} {
  const now = new Date();

  if (query.range === "custom") {
    const startStr = query.start_date!.includes("T")
      ? query.start_date!
      : `${query.start_date}T00:00:00.000Z`;
    const endStr = query.end_date!.includes("T")
      ? query.end_date!
      : `${query.end_date}T23:59:59.999Z`;

    return { start: new Date(startStr), end: new Date(endStr) };
  }

  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  if (query.range === "today") {
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    return { start: startOfToday, end: endOfToday };
  }

  if (
    query.range === "last3days" ||
    query.range === "week" ||
    query.range === "last30days"
  ) {
    // Rolling windows that include today: 3 days = today + 2 back,
    // week = 7 days, 30 days = today + 29 back.
    const daysBack =
      query.range === "last3days" ? 2 : query.range === "week" ? 6 : 29;
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - daysBack);
    start.setUTCHours(0, 0, 0, 0);

    return { start, end: endOfToday };
  }

  if (query.range === "month") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
    );

    return { start, end: endOfToday };
  }

  if (query.range === "all") {
    // Everything ever recorded, through today — the epoch is safely
    // before any real row's date, so this is a plain unbounded lower
    // bound rather than a special case in each query.
    return { start: new Date(0), end: endOfToday };
  }

  // year: 1st of January of the current calendar year through today
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));

  return { start, end: endOfToday };
}

/**
 * Turns a list endpoint's optional range fields into Prisma-style date
 * bounds, or undefined when no date filter applies. `range` wins when
 * present ("all" = no filter); a bare start_date/end_date (the older,
 * pre-range API) still works so existing callers keep behaving the same.
 */
export function rangeToBounds(query: {
  range?: RangeQuery["range"];
  start_date?: string;
  end_date?: string;
}): { gte?: Date; lte?: Date } | undefined {
  if (query.range) {
    if (query.range === "all") return undefined;

    const { start, end } = resolveDateRange({
      range: query.range,
      start_date: query.start_date,
      end_date: query.end_date,
    });

    return { gte: start, lte: end };
  }

  if (!query.start_date && !query.end_date) return undefined;

  const bounds: { gte?: Date; lte?: Date } = {};

  if (query.start_date) {
    bounds.gte = new Date(
      query.start_date.includes("T")
        ? query.start_date
        : `${query.start_date}T00:00:00.000Z`
    );
  }

  if (query.end_date) {
    bounds.lte = new Date(
      query.end_date.includes("T")
        ? query.end_date
        : `${query.end_date}T23:59:59.999Z`
    );
  }

  return bounds;
}
