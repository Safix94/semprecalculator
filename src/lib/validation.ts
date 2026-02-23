import { z } from 'zod';

export const createRfqSchema = z.object({
  customer_name: z.string().optional().nullable(),
  material: z.string().min(1, 'Materiaal is verplicht'),
  material_id: z.string().uuid('Ongeldige materiaal ID').optional().nullable(),
  finish: z.string().min(1, 'Afwerking is verplicht'),
  length: z.coerce.number().positive('Lengte moet positief zijn'),
  width: z.coerce.number().positive('Breedte moet positief zijn'),
  height: z.coerce.number().positive('Hoogte moet positief zijn'),
  thickness: z.coerce.number().positive('Dikte moet positief zijn'),
  shape: z.string().min(1, 'Vorm is verplicht'),
  notes: z.string().optional().nullable(),
  supplier_ids: z.array(z.string().uuid()).optional(),
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

export const createMaterialSchema = z.object({
  name: z.string().min(1, 'Materiaalnaam is verplicht').max(100, 'Materiaalnaam mag maximaal 100 karakters zijn'),
  finish_options: z.array(z.string().min(1, 'Afwerking mag niet leeg zijn')).min(1, 'Minimaal één afwerkingsoptie is verplicht'),
  supplier_ids: z.array(z.string().uuid()).optional(),
});

export const updateMaterialSchema = z.object({
  name: z.string().min(1, 'Materiaalnaam is verplicht').max(100, 'Materiaalnaam mag maximaal 100 karakters zijn').optional(),
  finish_options: z.array(z.string().min(1, 'Afwerking mag niet leeg zijn')).min(1, 'Minimaal één afwerkingsoptie is verplicht').optional(),
  is_active: z.boolean().optional(),
});

export const linkMaterialSupplierSchema = z.object({
  material_id: z.string().uuid('Ongeldige materiaal ID'),
  supplier_id: z.string().uuid('Ongeldige leverancier ID'),
});

export type CreateRfqInput = z.infer<typeof createRfqSchema>;
export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;
export type SubmitQuoteInput = z.infer<typeof submitQuoteSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type LinkMaterialSupplierInput = z.infer<typeof linkMaterialSupplierSchema>;
