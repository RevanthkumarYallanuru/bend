import { z } from "zod";

const rangeEnum = z.enum(["today", "week", "month", "year", "custom"]);

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

export const outstandingQuerySchema = z.object({
  search: z.string().trim().optional(),
  onlyOutstanding: z.enum(["true", "false"]).default("true"),
});

export type RangeQuery = z.infer<typeof rangeQuerySchema>;
export type OutstandingQuery = z.infer<typeof outstandingQuerySchema>;
