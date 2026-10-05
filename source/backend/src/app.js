import express from 'express';
import { z } from 'zod';

import { createSessionService, readCookie } from './auth/session.js';
import {
  BookingDecisionError,
  BookingRepositoryError,
} from './repositories/mysqlBookingRepository.js';
import {
  hasPdfSignature,
  mapPdfUploadError,
  receiveResourcePdf,
} from './middleware/pdfUpload.js';
import {
  createResourceSchema,
  formatValidationIssues,
} from './validation/resource.js';
import { UserRoleError } from './repositories/mysqlUserRepository.js';
import { AiGatewayError } from './services/aiGatewayService.js';
import { PdfExtractionError } from './services/pdfExtractionService.js';
import {
  bookingIdParamsSchema,
  bookingListQuerySchema,
  createBookingSchema,
  reviewBookingSchema,
} from './validation/booking.js';
import { updateUserRoleSchema, userIdParamsSchema } from './validation/user.js';

const SESSION_COOKIE = 'lab_session';
const adminRole = 'SYSTEM_ADMIN';
const memberRole = 'LAB_MEMBER';
const loginSchema = z.object({ email: z.email().max(255) }).strict();

function errorResponse(res, status, code, message, details) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

function mapResourceExtractionError(error) {
  if (error instanceof AiGatewayError) {
    if (error.code === 'AI_GATEWAY_INVALID_RESPONSE') {
      return {
        status: 502,
        code: 'AI_RESPONSE_INVALID',
        message: 'AI-assisted extraction returned an invalid result. You can continue by entering the resource information manually.',
      };
    }
    if (error.code === 'SOURCE_TEXT_INVALID') {
      return {
        status: 422,
        code: 'PDF_TEXT_INVALID',
        message: 'The extracted PDF text cannot be processed. You can continue by entering the resource information manually.',
      };
    }
    return {
      status: 503,
      code: 'AI_ASSISTANCE_UNAVAILABLE',
      message: 'AI-assisted extraction is currently unavailable. You can continue by entering the resource information manually.',
    };
  }

  if (error instanceof PdfExtractionError) {
    if (error.code === 'PDF_UNREADABLE') {
      return {
        status: 422,
        code: 'PDF_UNREADABLE',
        message: 'The uploaded PDF could not be read. You can continue by entering the resource information manually.',
      };
    }
    if (error.code === 'OCR_EMPTY') {
      return {
        status: 422,
        code: 'OCR_EMPTY',
        message: 'No usable text was found in the PDF. You can continue by entering the resource information manually.',
      };
    }
    return {
      status: 503,
      code: 'AI_ASSISTANCE_UNAVAILABLE',
      message: 'AI-assisted extraction is currently unavailable. You can continue by entering the resource information manually.',
    };
  }

  return null;
}

function mapBookingError(error) {
  if (!(error instanceof BookingRepositoryError)) {
    return null;
  }

  if (error.code === 'RESOURCE_NOT_FOUND') {
    return { status: 404, code: error.code, message: error.message };
  }
  if (error.code === 'RESOURCE_UNAVAILABLE' || error.code === 'BOOKING_CONFLICT') {
    return { status: 409, code: error.code, message: error.message };
  }
  return null;
}

export function createApp({
  bookingRepository = null,
  resourceRepository,
  userRepository,
  resourceExtractionService = null,
  authSecret,
  allowDevLogin = false,
  secureCookies = false,
  logger = console,
}) {
  const app = express();
  const sessions = createSessionService({ secret: authSecret });

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  async function authenticate(request, response, next) {
    const token = readCookie(request, SESSION_COOKIE);
    const session = sessions.verify(token);
    // The role is reloaded on every request so that role changes and
    // deactivations take effect immediately instead of when the cookie expires.
    const user = session ? await userRepository.findActiveById(session.sub) : null;
    if (!user) {
      return errorResponse(
        response,
        401,
        'UNAUTHENTICATED',
        'Authentication is required.',
      );
    }
    request.user = {
      ...session,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
    return next();
  }

  function requireAdministrator(request, response, next) {
    if (request.user.role !== adminRole) {
      return errorResponse(
        response,
        403,
        'FORBIDDEN',
        'System Administrator access is required.',
      );
    }
    return next();
  }

  function requireLabMember(request, response, next) {
    if (request.user.role !== memberRole) {
      return errorResponse(
        response,
        403,
        'FORBIDDEN',
        'Lab Member access is required.',
      );
    }
    return next();
  }

  app.get('/health', (_request, response) => {
    response.json({ success: true, data: { status: 'ok' } });
  });

  app.post('/api/auth/dev-login', async (request, response) => {
    if (!allowDevLogin) {
      return errorResponse(response, 404, 'NOT_FOUND', 'Route not found.');
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return errorResponse(response, 422, 'VALIDATION_ERROR', 'Invalid email.');
    }

    const user = await userRepository.findByEmail(parsed.data.email.toLowerCase());
    if (!user) {
      return errorResponse(response, 401, 'INVALID_LOGIN', 'User is not permitted.');
    }

    response.cookie(SESSION_COOKIE, sessions.issue(user), {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 1000,
    });
    return response.json({ success: true, data: { user } });
  });

  app.post('/api/auth/logout', (_request, response) => {
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'strict',
      path: '/',
    });
    return response.json({ success: true });
  });

  app.get('/api/auth/session', authenticate, (request, response) => {
    return response.json({
      success: true,
      data: {
        user: {
          id: request.user.sub,
          email: request.user.email,
          displayName: request.user.displayName,
          role: request.user.role,
        },
      },
    });
  });

  app.get('/api/resources', authenticate, async (_request, response) => {
    const resources = await resourceRepository.listBookable();
    return response.json({ success: true, data: resources });
  });

  app.get(
    '/api/bookings/mine',
    authenticate,
    requireLabMember,
    async (request, response) => {
      // The requester always comes from the session, never from the request.
      const bookings = await bookingRepository.listByRequester(request.user.sub);
      return response.json({ success: true, data: { bookings } });
    },
  );

  app.post(
    '/api/bookings',
    authenticate,
    requireLabMember,
    async (request, response) => {
      const parsed = createBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        return errorResponse(
          response,
          422,
          'VALIDATION_ERROR',
          'Booking request data is invalid.',
          formatValidationIssues(parsed.error.issues),
        );
      }

      const booking = await bookingRepository.create(parsed.data, request.user.sub);
      return response.status(201).json({ success: true, data: booking });
    },
  );

  app.post(
    '/api/resources/extract',
    authenticate,
    requireAdministrator,
    receiveResourcePdf,
    async (request, response) => {
      if (!request.file) {
        return errorResponse(
          response,
          400,
          'PDF_REQUIRED',
          'Select a PDF file to extract resource information.',
        );
      }

      if (!hasPdfSignature(request.file.buffer)) {
        return errorResponse(
          response,
          415,
          'INVALID_PDF',
          'The uploaded file does not contain a valid PDF signature.',
        );
      }

      if (!resourceExtractionService) {
        return errorResponse(
          response,
          503,
          'AI_ASSISTANCE_UNAVAILABLE',
          'AI-assisted extraction is currently unavailable. You can continue by entering the resource information manually.',
        );
      }

      const suggestions = await resourceExtractionService.extract({
        buffer: request.file.buffer,
        originalName: request.file.originalname,
        mimeType: request.file.mimetype,
        size: request.file.size,
      });

      return response.json({ success: true, data: suggestions });
    },
  );

  app.get(
    '/api/admin/bookings',
    authenticate,
    requireAdministrator,
    async (request, response) => {
      const parsedQuery = bookingListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return errorResponse(
          response,
          422,
          'VALIDATION_ERROR',
          'Booking filters are invalid.',
          formatValidationIssues(parsedQuery.error.issues),
        );
      }

      const bookings = await bookingRepository.listPending();
      return response.json({ success: true, data: { bookings } });
    },
  );

  app.patch(
    '/api/admin/bookings/:id',
    authenticate,
    requireAdministrator,
    async (request, response) => {
      const parsedParams = bookingIdParamsSchema.safeParse(request.params);
      const parsedDecision = reviewBookingSchema.safeParse(request.body);
      if (!parsedParams.success || !parsedDecision.success) {
        const issues = [
          ...(parsedParams.success ? [] : parsedParams.error.issues),
          ...(parsedDecision.success ? [] : parsedDecision.error.issues),
        ];
        return errorResponse(
          response,
          422,
          'VALIDATION_ERROR',
          'The booking decision is invalid.',
          formatValidationIssues(issues),
        );
      }

      const booking = await bookingRepository.decide(
        parsedParams.data.id,
        parsedDecision.data,
        request.user.sub,
      );
      return response.json({ success: true, data: booking });
    },
  );

  app.get(
    '/api/admin/users',
    authenticate,
    requireAdministrator,
    async (_request, response) => {
      const users = await userRepository.list();
      return response.json({ success: true, data: { users } });
    },
  );

  app.patch(
    '/api/admin/users/:id/role',
    authenticate,
    requireAdministrator,
    async (request, response) => {
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedRole = updateUserRoleSchema.safeParse(request.body);
      if (!parsedParams.success || !parsedRole.success) {
        const issues = [
          ...(parsedParams.success ? [] : parsedParams.error.issues),
          ...(parsedRole.success ? [] : parsedRole.error.issues),
        ];
        return errorResponse(
          response,
          422,
          'VALIDATION_ERROR',
          'The role change is invalid.',
          formatValidationIssues(issues),
        );
      }

      // Administrators cannot change their own role, which also guarantees
      // that at least one administrator remains after any change.
      if (parsedParams.data.id === request.user.sub) {
        return errorResponse(
          response,
          409,
          'SELF_ROLE_CHANGE',
          'You cannot change your own role.',
        );
      }

      const user = await userRepository.updateRole(
        parsedParams.data.id,
        parsedRole.data.role,
        request.user.sub,
      );
      return response.json({ success: true, data: user });
    },
  );

  app.post(
    '/api/resources',
    authenticate,
    requireAdministrator,
    async (request, response) => {
      const parsed = createResourceSchema.safeParse(request.body);
      if (!parsed.success) {
        return errorResponse(
          response,
          422,
          'VALIDATION_ERROR',
          'Resource data is invalid.',
          formatValidationIssues(parsed.error.issues),
        );
      }

      const resource = await resourceRepository.create(parsed.data, request.user.sub);
      return response.status(201).json({ success: true, data: resource });
    },
  );

  app.use((_request, response) =>
    errorResponse(response, 404, 'NOT_FOUND', 'Route not found.'),
  );

  app.use((error, request, response, _next) => {
    const requestId = request.headers['x-request-id'] ?? 'not-provided';
    logger.error('Request failed.', {
      requestId,
      errorName: error?.name ?? 'UnknownError',
    });

    const uploadError = mapPdfUploadError(error);
    if (uploadError) {
      return errorResponse(
        response,
        uploadError.status,
        uploadError.code,
        uploadError.message,
      );
    }
    const extractionError = mapResourceExtractionError(error);
    if (extractionError) {
      return errorResponse(
        response,
        extractionError.status,
        extractionError.code,
        extractionError.message,
      );
    }
    if (error instanceof BookingDecisionError || error instanceof UserRoleError) {
      return errorResponse(response, error.status, error.code, error.message);
    }
    const bookingError = mapBookingError(error);
    if (bookingError) {
      return errorResponse(
        response,
        bookingError.status,
        bookingError.code,
        bookingError.message,
      );
    }
    if (error?.type === 'entity.too.large') {
      return errorResponse(response, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }
    if (error instanceof SyntaxError && error?.type === 'entity.parse.failed') {
      return errorResponse(response, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
    }
    return errorResponse(
      response,
      500,
      'INTERNAL_ERROR',
      'The request could not be completed.',
    );
  });

  return app;
}
