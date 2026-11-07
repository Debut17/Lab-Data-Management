import { z } from 'zod';

export const createResourceReportSchema = z.object({
  resourceId: z.uuid({ error: 'Select a valid resource.' }),
  problemType: z.enum(['INCORRECT_RECORD', 'DAMAGE', 'MALFUNCTION', 'OTHER'], {
    error: 'Select a valid problem type.',
  }),
  description: z.string()
    .transform((value) => value.normalize('NFKC')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim())
    .pipe(z.string()
      .min(1, 'Describe the resource problem.')
      .max(2000, 'The description must be 2000 characters or fewer.')),
}).strict();

export const reportNotificationIdParamsSchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,19}$/, 'The notification identifier is invalid.')
    .refine((value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n,
      'The notification identifier is invalid.'),
}).strict();
