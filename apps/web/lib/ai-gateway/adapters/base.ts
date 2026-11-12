import { z } from "zod";
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
  GenerateTextResponse,
  ProviderId,
} from "../types.ts";

export interface AiProviderAdapter {
  readonly id: ProviderId;
  readonly name: string;
  readonly endpointType: "cloud" | "local" | "internal";

  /**
   * Generates conversational or free-form text.
   */
  generateText(req: GenerateTextRequest): Promise<GenerateTextResponse>;

  /**
   * Generates strict, structured JSON validated by a Zod schema.
   */
  generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<T>;
}
