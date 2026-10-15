import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/errors.js';
import { logger } from '@/utils/logger.js';
import { env } from '@/config/env.js';
import { ZodError } from 'zod';

interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    details?: unknown;
    stack?: string;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Log error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    organizationId: req.organizationId,
  });

  // Handle known application errors
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        message: err.message,
        code: err.code,
        details: err.details,
      },
    };

    if (env.NODE_ENV !== 'production') {
      response.error.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.errors,
      },
    });
    return;
  }

  // Handle unknown errors
  const response: ErrorResponse = {
    error: {
      message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      code: 'INTERNAL_ERROR',
    },
  };

  if (env.NODE_ENV !== 'production') {
    response.error.stack = err.stack;
  }

  res.status(500).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
  });
}
