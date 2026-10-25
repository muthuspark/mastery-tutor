import { z } from "zod";

export const PROFILE_MAX_LENGTH = 2_000;
export const profileSchema = z.object({
  aboutMe: z.string().max(PROFILE_MAX_LENGTH).trim(),
}).strict();
