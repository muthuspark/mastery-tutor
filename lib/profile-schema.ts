import { z } from "zod";
import { agentSchema } from "./agent-contracts";

export const PROFILE_MAX_LENGTH = 2_000;
export const profileSchema = z.object({
  learningAgent: agentSchema.nullable().optional(),
  aboutMe: z.string().max(PROFILE_MAX_LENGTH).trim(),
});
