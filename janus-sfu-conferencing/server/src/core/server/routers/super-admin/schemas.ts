import z from "zod";

export const registerSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  newPassword: z.string().min(6, "New password must be at least 6 characters long"),
});
