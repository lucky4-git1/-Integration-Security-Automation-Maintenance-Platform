import { Router } from 'express';
import { z } from 'zod';
import { authService } from '@/services/auth.service.js';
import { authenticate } from '@/middleware/auth.middleware.js';
import { validateBody } from '@/middleware/validation.middleware.js';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const passwordResetSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post('/register', validateBody(registerSchema), async (req, res) => {
  const user = await authService.register(req.body);

  res.status(201).json({
    success: true,
    data: { user },
  });
});

/**
 * POST /api/v1/auth/login
 * Login user
 */
router.post('/login', validateBody(loginSchema), async (req, res) => {
  const result = await authService.login({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  const { accessToken } = await authService.refreshAccessToken(req.body.refreshToken);

  res.json({
    success: true,
    data: { accessToken },
  });
});

/**
 * POST /api/v1/auth/logout
 * Logout user (revoke session)
 */
router.post('/logout', authenticate, async (req, res) => {
  const token = req.headers.authorization?.substring(7);

  if (token) {
    await authService.logout(token);
  }

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/v1/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user },
  });
});

/**
 * POST /api/v1/auth/password-reset/request
 * Request password reset
 */
router.post(
  '/password-reset/request',
  validateBody(passwordResetRequestSchema),
  async (req, res) => {
    // Always return success to prevent email enumeration
    await authService.requestPasswordReset(req.body.email);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
    });
  }
);

/**
 * POST /api/v1/auth/password-reset/confirm
 * Reset password using token
 */
router.post('/password-reset/confirm', validateBody(passwordResetSchema), async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.newPassword);

  res.json({
    success: true,
    message: 'Password reset successfully',
  });
});

/**
 * POST /api/v1/auth/password/change
 * Change password (authenticated)
 */
router.post('/password/change', authenticate, validateBody(changePasswordSchema), async (req, res) => {
  if (!req.user) {
    throw new Error('User not authenticated');
  }

  await authService.changePassword(
    req.user.id,
    req.body.currentPassword,
    req.body.newPassword
  );

  res.json({
    success: true,
    message: 'Password changed successfully',
  });
});

/**
 * GET /api/v1/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user },
  });
});

export default router;
