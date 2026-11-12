import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateAndSaveForecast, getForecastSnapshot } from "@/lib/predictive/service";
import { consumptionMetricTypeEnum } from "@/lib/predictive/types";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const predictiveRouter = router({
  /**
   * Retrieves an existing forecast snapshot or automatically generates one if missing.
   */
  getSnapshot: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        metricType: consumptionMetricTypeEnum,
      }),
    )
    .query(async ({ input }) => {
      const sql = db();
      const existing = await getForecastSnapshot(sql, input);
      if (existing) return existing;
      return await generateAndSaveForecast(sql, input);
    }),

  /**
   * Runs predictive tournament (GBDT, exponential smoothing, linear trend, naive drift),
   * evaluates candidate models, scans for anomalies, and saves the snapshot.
   */
  forecast: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        metricType: consumptionMetricTypeEnum,
        horizonSteps: z.number().int().min(1).max(12).optional(),
        growthThresholdPct: z.number().min(0.01).max(2.0).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const sql = db();
      return await generateAndSaveForecast(sql, input);
    }),

  /**
   * Compares candidate models in the tournament and returns scorecard rankings.
   */
  compareModels: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        metricType: consumptionMetricTypeEnum,
      }),
    )
    .query(async ({ input }) => {
      const sql = db();
      const forecast =
        (await getForecastSnapshot(sql, input)) ?? (await generateAndSaveForecast(sql, input));
      return {
        championModel: forecast.championModel,
        championModelName: forecast.championModelName,
        evaluationMetrics: forecast.evaluationMetrics,
        tournament: forecast.tournament,
      };
    }),

  /**
   * Returns pre-submission statistical anomaly findings on historical data.
   */
  detectAnomalies: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        metricType: consumptionMetricTypeEnum,
      }),
    )
    .query(async ({ input }) => {
      const sql = db();
      const forecast =
        (await getForecastSnapshot(sql, input)) ?? (await generateAndSaveForecast(sql, input));
      return forecast.anomaliesDetected;
    }),
});
