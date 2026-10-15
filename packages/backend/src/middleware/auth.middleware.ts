import type { Request, Response, NextFunction } from 'express';
import { authService } from '@/services/auth.service.js';
import { authorizationService, Permission } from '@/services/authorization.service.js';
import { UnauthorizedError, ForbiddenError } from '@/utils/errors.js';
import { prisma } from '@/config/database.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
      };
      organizationId?: string;
    }
  }
}

/**
 * Middleware to authenticate user via JWT token
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    // Verify JWT
    const payload = authService.verifyAccessToken(token);

    // Check if session is valid
    const session = await authService.getSessionByToken(token);

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to extract organization ID from request
 */
export function extractOrganization(req: Request, _res: Response, next: NextFunction): void {
  const orgId = req.params.organizationId || req.headers['x-organization-id'];

  if (!orgId || typeof orgId !== 'string') {
    throw new ForbiddenError('Organization ID is required');
  }

  req.organizationId = orgId;
  next();
}

/**
 * Middleware to verify user is member of organization
 */
export async function requireMembership(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!req.organizationId) {
      throw new ForbiddenError('Organization ID is required');
    }

    await authorizationService.requireMembership(req.user.id, req.organizationId);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware factory to require specific permission
 */
export function requirePermission(...permissions: Permission[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (!req.organizationId) {
        throw new ForbiddenError('Organization ID is required');
      }

      await authorizationService.requireAnyPermission(
        req.user.id,
        req.organizationId,
        permissions
      );

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
}
