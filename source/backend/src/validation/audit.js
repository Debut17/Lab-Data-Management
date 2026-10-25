import { z } from 'zod';

const positiveInteger = (maximum) => z.string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().max(maximum));

export const auditHistoryQuerySchema = z.object({
  page: positiveInteger(10000).default(1),
  limit: positiveInteger(50).default(20),
}).strict();
