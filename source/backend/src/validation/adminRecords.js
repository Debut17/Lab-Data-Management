import { z } from 'zod';

export const adminBookingRecordsQuerySchema = z
  .object({
    status: z
      .enum(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], {
        error: 'Select a valid booking status.',
      })
      .default('ALL'),
  })
  .strict();
