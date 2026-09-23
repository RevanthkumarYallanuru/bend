import { z } from "zod";

export { rangeQuerySchema } from "../../utils/dateRange";
export type { RangeQuery } from "../../utils/dateRange";

export const outstandingQuerySchema = z.object({
  search: z.string().trim().optional(),
  onlyOutstanding: z.enum(["true", "false"]).default("true"),
});

export type OutstandingQuery = z.infer<typeof outstandingQuerySchema>;
