import { z } from "zod";
export const invitationSchema = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) }).strict();
