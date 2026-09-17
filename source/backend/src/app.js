import express from 'express';
import { z } from 'zod';

import { createSessionService, readCookie } from './auth/session.js';
import {
  hasPdfSignature,
  mapPdfUploadError,
  receiveResourcePdf,
} from './middleware/pdfUpload.js';
import {
  createResourceSchema,
  formatValidationIssues,
} from './validation/resource.js';

const SESSION_COOKIE = 'lab_session';
const adminRole = 'SYSTEM_ADMIN';
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

export function createApp({
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

  function authenticate(request, response, next) {
    const token = readCookie(request, SESSION_COOKIE);
    const session = sessions.verify(token);
    if (!session) {
      return errorResponse(
        response,
        401,
        'UNAUTHENTICATED',
        'Authentication is required.',
      );
    }
    request.user = session;
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
