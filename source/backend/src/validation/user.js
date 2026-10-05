import { z } from 'zod';

export const USER_ROLES = ['SYSTEM_ADMIN', 'LAB_STAFF', 'LAB_MEMBER'];

export const userIdParamsSchema = z
  .object({
    id: z.uuid('The user identifier is invalid.'),
  })
  .strict();

export const updateUserRoleSchema = z
  .object({
    role: z.enum(USER_ROLES, { error: 'Select a valid role.' }),
  })
  .strict();
