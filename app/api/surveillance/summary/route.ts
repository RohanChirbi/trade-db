import { requireSession } from "@/lib/auth";
import { handler } from "@/lib/api";
import { mongo } from "@/lib/mongo";

// Dashboard numbers from ONE MongoDB aggregation ($facet runs the sub-pipelines in parallel)
export const GET = handler(async () => {
  await requireSession("COMPLIANCE");
  const db = await mongo();
  const [r] = await db
    .collection("alerts")
    .aggregate([
      {
        $facet: {
          byType: [
            { $group: { _id: "$type", total: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0] } } } },
            { $sort: { total: -1 } },
          ],
          byStatus: [{ $group: { _id: "$status", total: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          bySeverity: [{ $group: { _id: "$severity", total: { $sum: 1 } } }],
          byMonth: [
            { $match: { trade_date: { $ne: null } } },
            { $group: { _id: { $substrBytes: ["$trade_date", 0, 7] }, total: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          bySecurity: [
            { $match: { ticker: { $ne: null } } },
            { $group: { _id: "$ticker", total: { $sum: 1 }, high: { $sum: { $cond: [{ $eq: ["$severity", "HIGH"] }, 1, 0] } } } },
            { $sort: { total: -1 } },
          ],
          topStrategies: [
            { $match: { strategy_id: { $ne: null } } },
            { $group: { _id: { id: "$strategy_id", name: "$strategy" }, total: { $sum: 1 }, types: { $addToSet: "$type" } } },
            { $sort: { total: -1 } },
            { $limit: 5 },
          ],
          lastRun: [{ $sort: { updated_at: -1 } }, { $limit: 1 }, { $project: { _id: 0, last_run_id: 1 } }],
        },
      },
    ])
    .toArray();
  return Response.json(r);
});
