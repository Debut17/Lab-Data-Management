import { z } from 'zod';

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
