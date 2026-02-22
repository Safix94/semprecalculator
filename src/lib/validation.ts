import { z } from 'zod';

export const createRfqSchema = z.object({
  customer_name: z.string().optional().nullable(),
  material: z.string().min(1, 'Materiaal is verplicht'),
  length: z.coerce.number().positive('Lengte moet positief zijn'),
  width: z.coerce.number().positive('Breedte moet positief zijn'),
  height: z.coerce.number().positive('Hoogte moet positief zijn'),
  thickness: z.coerce.number().positive('Dikte moet positief zijn'),
  shape: z.string().min(1, 'Vorm is verplicht'),
  notes: z.string().optional().nullable(),
});

export const updateRfqSchema = createRfqSchema.partial();

export const submitQuoteSchema = z.object({
  basePrice: z.coerce
    .number()
    .positive('Basisprijs moet positief zijn'),
  volumeM3: z.coerce
    .number()
    .positive('Volume moet positief zijn')
    .refine((v) => {
      const parts = v.toString().split('.');
      return !parts[1] || parts[1].length <= 3;
    }, 'Volume mag maximaal 3 decimalen hebben'),
  leadTimeDays: z.coerce.number().int().positive().optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
});

export type CreateRfqInput = z.infer<typeof createRfqSchema>;
export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;
export type SubmitQuoteInput = z.infer<typeof submitQuoteSchema>;
