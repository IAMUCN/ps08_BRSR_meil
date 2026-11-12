import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { globalSearch } from "@/lib/search/global";
import { MAX_QUERY, type SearchResult } from "@/lib/search/rules";
import { protectedProcedure, router } from "@/lib/trpc/init";

// The top-bar search (feature_enhancement.md 8.3, requirement 19; A48). Open to every signed-in person; what each
// section covers depends on who asks (lib/search/global.ts).
export const searchRouter = router({
  global: protectedProcedure
    .input(
      z.object({
        q: z.string().max(MAX_QUERY * 2),
        /** The page the person is on: its section is listed first. */
        pathname: z.string().max(300).default("/"),
      }),
    )
    .query(({ ctx, input }): Promise<SearchResult> => globalSearch(db(), ctx.session, input)),
});
