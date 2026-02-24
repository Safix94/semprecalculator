import { z } from 'zod';

const rfqSchemaBase = z.object({
  customer_name: z.string().optional().nullable(),
  product_type: z.string().optional().nullable(),
  material: z.string().min(1, 'Material is required'),
  material_id: z.string().uuid('Invalid material ID').optional().nullable(),
  material_id_table_top: z.string().uuid('Invalid table top material ID').optional().nullable(),
  material_id_table_foot: z.string().uuid('Invalid table foot material ID').optional().nullable(),
  material_table_top: z.string().optional().nullable(),
  material_table_foot: z.string().optional().nullable(),
  finish: z.string().min(1, 'Finish is required'),
  finish_table_top: z.string().optional().nullable(),
  finish_table_foot: z.string().optional().nullable(),
  length: z.coerce.number().positive('Length must be positive'),
  width: z.coerce.number().positive('Width must be positive'),
  height: z.coerce.number().positive('Height must be positive'),
  thickness: z.coerce.number().min(0, 'Thickness must be zero or positive'),
  quantity: z.coerce.number().int('Quantity must be a whole number').positive('Quantity must be at least 1').default(1),
  shape: z.string().min(1, 'Shape is required'),
  notes: z.string().optional().nullable(),
  supplier_ids: z.array(z.string().uuid()).optional(),
});

const validateShapeThickness = (
  data: { shape?: string | null; thickness?: number },
  ctx: z.RefinementCtx
) => {
  if (data.thickness === undefined) {
    return;
  }

  const normalizedShape = data.shape?.trim().toLowerCase();

  if (!normalizedShape) {
    if (data.thickness <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thickness'],
        message: 'Thickness must be positive',
      });
    }
    return;
  }

  const isRound = normalizedShape === 'round';

  if (isRound) {
    if (data.thickness < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thickness'],
        message: 'Thickness must be zero or positive for Round shapes',
      });
    }
    return;
  }

  if (data.thickness <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['thickness'],
      message: 'Thickness must be positive',
    });
  }
};

const validateTableMaterials = (
  data: {
    product_type?: string | null;
    material_id_table_top?: string | null;
    material_id_table_foot?: string | null;
  },
  ctx: z.RefinementCtx
) => {
  const isTablesType = data.product_type?.trim().toLowerCase() === 'tables';
  if (!isTablesType) {
    return;
  }

  if (!data.material_id_table_top) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['material_id_table_top'],
      message: 'Table top material is required for Tables',
    });
  }

  if (!data.material_id_table_foot) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['material_id_table_foot'],
      message: 'Table foot material is required for Tables',
    });
  }
};

export const createRfqSchema = rfqSchemaBase.superRefine((data, ctx) => {
  validateShapeThickness(data, ctx);
  validateTableMaterials(data, ctx);
});

export const updateRfqSchema = rfqSchemaBase.partial().superRefine((data, ctx) => {
  validateShapeThickness(data, ctx);
  validateTableMaterials(data, ctx);
});

export const submitQuoteSchema = z.object({
  basePrice: z.coerce
    .number()
    .positive('Base price must be positive'),
  areaM2: z.coerce
    .number()
    .positive('Area must be positive')
    .refine((v) => {
      const parts = v.toString().split('.');
      return !parts[1] || parts[1].length <= 3;
    }, 'Area may have at most 3 decimal places'),
  leadTimeDays: z.coerce.number().int().positive().optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
});

export const rfqCommentBodySchema = z.string().trim().min(1, 'Message is required').max(2000, 'Message may be at most 2000 characters');

export const updateRfqNotesSchema = z.object({
  notes: z.string().max(5000, 'Notes may be at most 5000 characters').nullable(),
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
export type UpdateRfqNotesInput = z.infer<typeof updateRfqNotesSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type LinkMaterialSupplierInput = z.infer<typeof linkMaterialSupplierSchema>;
