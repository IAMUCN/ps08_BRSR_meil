/**
 * Gradient Boosted Decision Tree (GBDT) Regressor.
 *
 * Implements XGBoost / LightGBM architecture for ESG time-series:
 * - Second-order gradient/hessian split optimization
 * - L2 leaf regularization (lambda)
 * - Tree depth constraint & shrinkage (learning rate)
 * - Multi-lag tabular autoregression (Lag-1, Lag-2, Rolling Mean, Rolling Momentum)
 * - Recursive multi-step forward horizon projection
 */

export type TabularRow = {
  features: number[];
  target: number;
};

export type TreeNode = {
  isLeaf: boolean;
  value?: number;
  featureIndex?: number;
  splitThreshold?: number;
  left?: TreeNode;
  right?: TreeNode;
};

export type GbdtConfig = {
  numTrees?: number;
  maxDepth?: number;
  learningRate?: number;
  l2Regularization?: number; // Lambda
  minSamplesSplit?: number;
};

export class GradientBoostedRegressor {
  private numTrees: number;
  private maxDepth: number;
  private learningRate: number;
  private l2Regularization: number;
  private minSamplesSplit: number;

  private baseValue = 0;
  private trees: TreeNode[] = [];
  public residualVariance = 0;

  constructor(config?: GbdtConfig) {
    this.numTrees = config?.numTrees ?? 15;
    this.maxDepth = config?.maxDepth ?? 3;
    this.learningRate = config?.learningRate ?? 0.15;
    this.l2Regularization = config?.l2Regularization ?? 1.0;
    this.minSamplesSplit = config?.minSamplesSplit ?? 2;
  }

  /**
   * Fits GBDT ensemble on tabular training instances.
   */
  fit(data: TabularRow[]): void {
    if (data.length === 0) return;

    // 1. Initial base prediction is sample mean
    this.baseValue = data.reduce((acc, row) => acc + row.target, 0) / data.length;

    const currentPredictions = new Array<number>(data.length).fill(this.baseValue);
    this.trees = [];

    // 2. Sequential Boosting Rounds
    for (let round = 0; round < this.numTrees; round++) {
      // Compute Gradients and Hessians under MSE: L = 1/2 * (y - y_hat)^2
      // g_i = (y_hat_i - y_i), h_i = 1.0
      const gradients = data.map((row, i) => currentPredictions[i] - row.target);
      const hessians = new Array<number>(data.length).fill(1.0);

      const tree = this.buildTree(
        data,
        gradients,
        hessians,
        0,
        Array.from({ length: data.length }, (_, i) => i),
      );
      this.trees.push(tree);

      // Update predictions with shrinkage
      for (let i = 0; i < data.length; i++) {
        const treePred = this.predictNode(tree, data[i].features);
        currentPredictions[i] += this.learningRate * treePred;
      }
    }

    // 3. Compute residual variance
    let sumSquaredError = 0;
    for (let i = 0; i < data.length; i++) {
      const residual = data[i].target - currentPredictions[i];
      sumSquaredError += residual * residual;
    }
    this.residualVariance = data.length > 1 ? sumSquaredError / (data.length - 1) : 0;
  }

  private buildTree(
    data: TabularRow[],
    gradients: number[],
    hessians: number[],
    depth: number,
    indices: number[],
  ): TreeNode {
    // If max depth reached or too few samples, create regularized leaf
    if (depth >= this.maxDepth || indices.length < this.minSamplesSplit) {
      return {
        isLeaf: true,
        value: this.calculateLeafWeight(gradients, hessians, indices),
      };
    }

    let bestGain = -Infinity;
    let bestFeature = -1;
    let bestThreshold = 0;
    let bestLeftIndices: number[] = [];
    let bestRightIndices: number[] = [];

    const numFeatures = data[0].features.length;

    // Evaluate all feature splits
    for (let f = 0; f < numFeatures; f++) {
      const values = Array.from(new Set(indices.map((i) => data[i].features[f]))).sort(
        (a, b) => a - b,
      );
      if (values.length <= 1) continue;

      for (let v = 0; v < values.length - 1; v++) {
        const threshold = (values[v] + values[v + 1]) / 2;
        const left: number[] = [];
        const right: number[] = [];

        for (const idx of indices) {
          if (data[idx].features[f] <= threshold) {
            left.push(idx);
          } else {
            right.push(idx);
          }
        }

        if (left.length === 0 || right.length === 0) continue;

        // XGBoost / LightGBM split gain formula:
        // Gain = 1/2 * [ G_L^2 / (H_L + lambda) + G_R^2 / (H_R + lambda) - G^2 / (H + lambda) ]
        const gain = this.calculateSplitGain(gradients, hessians, indices, left, right);
        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = threshold;
          bestLeftIndices = left;
          bestRightIndices = right;
        }
      }
    }

    if (bestGain <= 0.0001 || bestFeature === -1) {
      return {
        isLeaf: true,
        value: this.calculateLeafWeight(gradients, hessians, indices),
      };
    }

    return {
      isLeaf: false,
      featureIndex: bestFeature,
      splitThreshold: bestThreshold,
      left: this.buildTree(data, gradients, hessians, depth + 1, bestLeftIndices),
      right: this.buildTree(data, gradients, hessians, depth + 1, bestRightIndices),
    };
  }

  /**
   * Optimal regularized leaf weight: w* = -G / (H + lambda)
   */
  private calculateLeafWeight(gradients: number[], hessians: number[], indices: number[]): number {
    let sumG = 0;
    let sumH = 0;
    for (const idx of indices) {
      sumG += gradients[idx];
      sumH += hessians[idx];
    }
    return -sumG / (sumH + this.l2Regularization);
  }

  private calculateSplitGain(
    gradients: number[],
    hessians: number[],
    parent: number[],
    left: number[],
    right: number[],
  ): number {
    let gP = 0,
      hP = 0;
    for (const i of parent) {
      gP += gradients[i];
      hP += hessians[i];
    }

    let gL = 0,
      hL = 0;
    for (const i of left) {
      gL += gradients[i];
      hL += hessians[i];
    }

    let gR = 0,
      hR = 0;
    for (const i of right) {
      gR += gradients[i];
      hR += hessians[i];
    }

    const scoreP = (gP * gP) / (hP + this.l2Regularization);
    const scoreL = (gL * gL) / (hL + this.l2Regularization);
    const scoreR = (gR * gR) / (hR + this.l2Regularization);

    return 0.5 * (scoreL + scoreR - scoreP);
  }

  private predictNode(node: TreeNode, features: number[]): number {
    if (node.isLeaf) {
      return node.value ?? 0;
    }
    const featVal = features[node.featureIndex ?? 0];
    if (featVal <= (node.splitThreshold ?? 0)) {
      return node.left ? this.predictNode(node.left, features) : 0;
    }
    return node.right ? this.predictNode(node.right, features) : 0;
  }

  /**
   * Predicts target for a feature vector.
   */
  predict(features: number[]): number {
    let pred = this.baseValue;
    for (const tree of this.trees) {
      pred += this.learningRate * this.predictNode(tree, features);
    }
    return pred;
  }
}

/**
 * Transforms historical time-series into tabular feature vectors for GBDT.
 * Features: [lag_1, lag_2, rolling_mean_3, momentum, time_index, seasonal_quad]
 */
export function buildAutoregressiveDataset(series: number[]): TabularRow[] {
  const rows: TabularRow[] = [];
  if (series.length < 3) return rows;

  for (let t = 2; t < series.length; t++) {
    const lag1 = series[t - 1];
    const lag2 = series[t - 2];
    const rolling3 = (series[t - 1] + series[t - 2] + (t >= 3 ? series[t - 3] : lag2)) / 3;
    const momentum = lag1 - lag2;
    const timeIndex = t / series.length;
    const seasonalQuad = t % 4; // Quarterly phase indicator

    rows.push({
      features: [lag1, lag2, rolling3, momentum, timeIndex, seasonalQuad],
      target: series[t],
    });
  }

  return rows;
}

/**
 * Runs multi-step forward autoregressive forecast using trained GBDT.
 */
export function forecastWithGbdt(
  model: GradientBoostedRegressor,
  series: number[],
  horizonSteps: number,
): number[] {
  const currentSeries = [...series];
  const predictions: number[] = [];

  for (let step = 0; step < horizonSteps; step++) {
    const n = currentSeries.length;
    const lag1 = currentSeries[n - 1];
    const lag2 = currentSeries[n - 2];
    const rolling3 = (currentSeries[n - 1] + currentSeries[n - 2] + currentSeries[n - 3]) / 3;
    const momentum = lag1 - lag2;
    const timeIndex = (n + step) / n;
    const seasonalQuad = (n + step) % 4;

    const nextVal = model.predict([lag1, lag2, rolling3, momentum, timeIndex, seasonalQuad]);
    // Physical quantities cannot be negative
    const clampedVal = Math.max(0, Number(nextVal.toFixed(2)));
    predictions.push(clampedVal);
    currentSeries.push(clampedVal);
  }

  return predictions;
}
