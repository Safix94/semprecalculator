import { z } from 'zod';

export const createRfqSchema = z.object({
  customer_name: z.string().optional().nullable(),
  material: z.string().min(1, 'Material is required'),
  material_id: z.string().uuid('Invalid material ID').optional().nullable(),
  finish: z.string().min(1, 'Finish is required'),
  length: z.coerce.number().positive('Length must be positive'),
  width: z.coerce.number().positive('Width must be positive'),
  height: z.coerce.number().positive('Height must be positive'),
  thickness: z.coerce.number().positive('Thickness must be positive'),
  shape: z.string().min(1, 'Shape is required'),
  notes: z.string().optional().nullable(),
  supplier_ids: z.array(z.string().uuid()).optional(),
});

export const updateRfqSchema = createRfqSchema.partial();

export const submitQuoteSchema = z.object({
  basePrice: z.coerce
    .number()
    .positive('Base price must be positive'),
  volumeM3: z.coerce
    .number()
    .positive('Volume must be positive')
    .refine((v) => {
      const parts = v.toString().split('.');
      return !parts[1] || parts[1].length <= 3;
    }, 'Volume may have at most 3 decimal places'),
  leadTimeDays: z.coerce.number().int().positive().optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
});

export const createMaterialSchema = z.object({
  name: z.string().min(1, 'Material name is required').max(100, 'Material name may be at most 100 characters'),
  finish_options: z.array(z.string().min(1, 'Finish may not be empty')),
  supplier_ids: z.array(z.string().uuid()).optional(),
});

export const updateMaterialSchema = z.object({
  name: z.string().min(1, 'Material name is required').max(100, 'Material name may be at most 100 characters').optional(),
  finish_options: z.array(z.string().min(1, 'Finish may not be empty')).optional(),
  is_active: z.boolean().optional(),
});

export const linkMaterialSupplierSchema = z.object({
  material_id: z.string().uuid('Invalid material ID'),
  supplier_id: z.string().uuid('Invalid supplier ID'),
});

export type CreateRfqInput = z.infer<typeof createRfqSchema>;
export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;
export type SubmitQuoteInput = z.infer<typeof submitQuoteSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type LinkMaterialSupplierInput = z.infer<typeof linkMaterialSupplierSchema>;
