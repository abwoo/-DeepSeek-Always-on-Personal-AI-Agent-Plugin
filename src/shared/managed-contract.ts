import { z } from 'zod';
import { taskSchema, memorySchema } from './schemas.js';
export const opaqueId = z.string().min(1).max(256).regex(/^[^\x00-\x1f\x7f]+$/);
export const operationId = z.uuid();
export const pairClaim = z.object({ code: z.string().min(16).max(200), name: z.string().trim().min(1).max(80), platform: z.enum(['ios', 'android', 'macos', 'windows', 'other']) }).strict();
export const credentialsSchema = z.object({ authorityId: z.uuid(), ownerId: z.uuid(), deviceId: z.uuid(), token: z.string().regex(/^ao_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/), expiresAt: z.iso.datetime() }).strict();
export type DeviceCredentials = z.infer<typeof credentialsSchema>;
export const managedAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('task.create'), data: taskSchema }),
  z.object({ action: z.literal('task.control'), data: z.object({ id: opaqueId, state: z.enum(['active','paused','cancelled']) }).strict() }),
  z.object({ action: z.literal('task.run'), data: z.object({ id: opaqueId }).strict() }),
  z.object({ action: z.literal('memory.save'), data: memorySchema }),
  z.object({ action: z.literal('memory.delete'), data: z.object({ id: opaqueId }).strict() }),
  z.object({ action: z.literal('inbox.read'), data: z.object({ id: opaqueId }).strict() }),
  z.object({ action: z.literal('session.create'), data: z.object({ creationId: opaqueId }).strict() }),
  z.object({ action: z.literal('session.prompt'), data: z.object({ sessionId: opaqueId, text: z.string().trim().min(1).max(12000) }).strict() }),
  z.object({ action: z.literal('session.cancel'), data: z.object({ sessionId: opaqueId }).strict() }),
]);
export type ManagedAction = z.input<typeof managedAction>;
export const mutationSchema = z.object({ operationId, command: managedAction }).strict();
export const goalSchema = z.object({ title: z.string().trim().min(1).max(120), instruction: z.string().trim().min(1).max(12000), everySeconds: z.number().int().min(60).max(31536000), allowedTools: z.array(z.enum(['web_search','web_fetch'])).max(2).default([]), maxRuns: z.number().int().min(1).max(1000).default(30) }).strict();
export const expoToken = z.string().max(256).regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/);
export const snapshotSchema=z.object({
 authorityId:z.uuid(),ownerId:z.uuid(),revision:z.number().int().nonnegative(),serverTime:z.string(),online:z.boolean(),
 tasks:z.array(taskSchema.extend({id:opaqueId,state:z.string(),sessionId:opaqueId.optional(),createdAt:z.string(),nextScheduledAt:z.string().optional()}).passthrough()),
 memories:z.array(z.object({id:opaqueId,kind:z.string(),content:z.string(),source:z.string(),consent:z.boolean(),updatedAt:z.string()}).passthrough()),
 inbox:z.array(z.object({id:opaqueId,runId:opaqueId,title:z.string(),summary:z.string(),read:z.boolean(),createdAt:z.string()}).passthrough()),
 runs:z.array(z.object({id:opaqueId,taskId:opaqueId,sessionId:opaqueId,status:z.string(),startedAt:z.string(),result:z.object({summary:z.string(),sources:z.array(z.string()),changed:z.boolean()}).optional()}).passthrough()),
 goals:z.array(goalSchema.extend({id:opaqueId,taskId:opaqueId,createdAt:z.string()}).passthrough()),
});
export type ManagedSnapshot=z.infer<typeof snapshotSchema>;

export type GoalInput=z.input<typeof goalSchema>;
