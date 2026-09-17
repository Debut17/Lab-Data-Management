import { z } from 'zod';

function sanitizeText(value) {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function requiredText(maxLength) {
  return z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(1, 'This field is required.').max(maxLength));
}

function optionalText(maxLength) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) {
        return null;
      }
      return sanitizeText(value) || null;
    })
    .pipe(z.string().max(maxLength).nullable());
}

export const createResourceSchema = z
  .object({
    name: requiredText(150),
    category: requiredText(100),
    location: requiredText(255),
    description: optionalText(2000),
    responsiblePerson: optionalText(150),
    availabilityStatus: z.enum(['AVAILABLE', 'UNAVAILABLE']).default('AVAILABLE'),
    currentStatus: z
      .enum(['OPERATIONAL', 'MAINTENANCE', 'OUT_OF_SERVICE'])
      .default('OPERATIONAL'),
    specifications: optionalText(4000),
  })
  .strict();

export function formatValidationIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path[0]?.toString() ?? 'request',
    message: issue.message,
  }));
}
