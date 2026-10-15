import { prisma } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import { NotFoundError } from '@/utils/errors.js';
import type { Incident, NotificationChannel, Prisma } from '@prisma/client';

export class NotificationService {
  async createChannel(data: {
    organizationId: string;
    name: string;
    type: 'email' | 'slack' | 'webhook';
    config: Record<string, unknown>;
    createdBy: string;
  }) {
    return prisma.notificationChannel.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        type: data.type,
        config: data.config as unknown as Prisma.InputJsonValue,
        enabled: true,
      },
    });
  }

  async listChannels(organizationId: string) {
    return prisma.notificationChannel.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, type: true, enabled: true, createdAt: true, updatedAt: true },
    });
  }

  async updateChannel(id: string, organizationId: string, data: Partial<{ name: string; config: Record<string, unknown>; enabled: boolean }>) {
    const existing = await prisma.notificationChannel.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundError('Notification channel not found');
    }
    return prisma.notificationChannel.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.config !== undefined ? { config: data.config as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async deleteChannel(id: string, organizationId: string) {
    await prisma.notificationChannel.deleteMany({ where: { id, organizationId } });
  }

  async sendIncidentNotification(incident: Incident) {
    const channels = await prisma.notificationChannel.findMany({
      where: { organizationId: incident.organizationId, enabled: true },
    });

    const results = await Promise.allSettled(
      channels.map((ch) => this.deliverToChannel(incident, ch))
    );

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error('Notification delivery failed', { channelId: channels[i].id, incidentId: incident.id, error: r.reason });
      }
    });
  }

  private async deliverToChannel(incident: Incident, channel: NotificationChannel) {
    const notification = await prisma.notification.create({
      data: {
        incidentId: incident.id,
        channelId: channel.id,
        status: 'pending',
      },
    });

    try {
      const config = channel.config as Record<string, unknown>;
      let success = false;
      let error: string | undefined;

      switch (channel.type) {
        case 'slack':
          ({ success, error } = await this.sendSlackNotification(incident, config));
          break;
        case 'email':
          ({ success, error } = await this.sendEmailNotification(incident, config));
          break;
        case 'webhook':
          ({ success, error } = await this.sendWebhookNotification(incident, config));
          break;
        default:
          error = `Unknown channel type: ${channel.type}`;
      }

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: success ? 'sent' : 'failed',
          attempts: { increment: 1 },
          sentAt: success ? new Date() : undefined,
          failedAt: success ? undefined : new Date(),
          error: error,
        },
      });

    } catch (err) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          attempts: { increment: 1 },
          failedAt: new Date(),
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      });
    }
  }

  private async sendSlackNotification(incident: Incident, config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) return { success: false, error: 'Slack webhook URL not configured' };

    const severityEmoji: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️' };
    const emoji = severityEmoji[incident.severity] ?? '⚠️';

    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${emoji} *Incident ${incident.severity.toUpperCase()}*: ${incident.title}`,
          attachments: [{
            color: incident.severity === 'critical' ? 'danger' : incident.severity === 'high' ? 'warning' : 'good',
            fields: [
              { title: 'Status', value: incident.status, short: true },
              { title: 'Source', value: incident.source, short: true },
              ...(incident.description ? [{ title: 'Description', value: incident.description, short: false }] : []),
            ],
          }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      return r.ok ? { success: true } : { success: false, error: `Slack returned ${r.status}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Request failed' };
    }
  }

  private async sendEmailNotification(incident: Incident, config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    // Requires nodemailer and SMTP configured. Return not-configured if missing.
    const to = config.to as string;
    if (!to) return { success: false, error: 'Email recipient not configured' };

    try {
      const { createTransport } = await import('nodemailer');
      const { env } = await import('@/config/env.js');

      if (!env.SMTP_HOST) return { success: false, error: 'SMTP not configured' };

      const transporter = createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      });

      await transporter.sendMail({
        from: env.SMTP_FROM ?? 'noreply@platform.local',
        to,
        subject: `[${incident.severity.toUpperCase()}] Incident: ${incident.title}`,
        text: `Incident detected:\n\nTitle: ${incident.title}\nSeverity: ${incident.severity}\nStatus: ${incident.status}\nSource: ${incident.source}\n${incident.description ? `\nDescription: ${incident.description}` : ''}`,
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Email send failed' };
    }
  }

  private async sendWebhookNotification(incident: Incident, config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    const url = config.url as string;
    if (!url) return { success: false, error: 'Webhook URL not configured' };

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.secret ? { 'X-Webhook-Secret': config.secret as string } : {}),
        },
        body: JSON.stringify({
          event: 'incident.created',
          incident: {
            id: incident.id,
            title: incident.title,
            severity: incident.severity,
            status: incident.status,
            source: incident.source,
            createdAt: incident.createdAt,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      return r.ok ? { success: true } : { success: false, error: `Webhook returned ${r.status}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Request failed' };
    }
  }

  async getDeliveryHistory(organizationId: string, incidentId?: string, limit = 50, offset = 0) {
    const where: Record<string, unknown> = {};
    if (incidentId) where.incidentId = incidentId;

    const notifications = await prisma.notification.findMany({
      where: {
        ...where,
        incident: { organizationId },
      },
      include: {
        incident: { select: { id: true, title: true, severity: true } },
        channel: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return notifications;
  }
}

export const notificationService = new NotificationService();
