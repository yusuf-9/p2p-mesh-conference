import z from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  expiresAt: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, "Date must be in UTC format (YYYY-MM-DDTHH:mm:ss.sssZ)")
    .refine((date) => new Date(date).getTime() > Date.now(), {
      message: "Expiration date must be in the future (UTC)"
    })
});

export const updateApiKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  expiresAt: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, "Date must be in UTC format (YYYY-MM-DDTHH:mm:ss.sssZ)")
    .refine((date) => new Date(date).getTime() > Date.now(), {
      message: "Expiration date must be in the future (UTC)"
    })
});

export const apiKeyParamsSchema = z.object({
  id: z.string().uuid("Invalid API key ID format"),
}); 