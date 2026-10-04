import { z } from 'zod';

function sanitizeText(value) {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

const rejectionReasonSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'A rejection reason is required.')
      .max(1000, 'The rejection reason must be 1000 characters or fewer.'),
  );

export const createBookingSchema = z
  .object({
    resourceId: z.uuid({ error: 'Select a valid resource.' }),
    startTime: z.iso.datetime({ offset: true, error: 'Enter a valid start time.' }),
    endTime: z.iso.datetime({ offset: true, error: 'Enter a valid end time.' }),
  })
  .strict()
  .superRefine((booking, context) => {
    const startTime = Date.parse(booking.startTime);
    const endTime = Date.parse(booking.endTime);

    if (Number.isFinite(startTime) && Number.isFinite(endTime) && endTime <= startTime) {
      context.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be after start time.',
      });
    }
  });

export const bookingListQuerySchema = z
  .object({
    status: z.literal('PENDING').default('PENDING'),
  })
  .strict();

export const bookingIdParamsSchema = z
  .object({
    id: z.uuid('The booking identifier is invalid.'),
  })
  .strict();

export const reviewBookingSchema = z
  .discriminatedUnion('decision', [
    z.object({ decision: z.literal('APPROVE') }).strict(),
    z.object({
      decision: z.literal('REJECT'),
      reason: rejectionReasonSchema,
    }).strict(),
  ])
  .transform((value) => ({
    decision: value.decision,
    reason: value.decision === 'REJECT' ? value.reason : null,
  }));
