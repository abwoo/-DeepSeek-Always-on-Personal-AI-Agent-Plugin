import { z } from 'zod';
export const text = z.string().trim().min(1).max(12000);
export const timingSchema = z.discriminatedUnion('kind',[
 z.object({kind:z.literal('after'),after_seconds:z.number().int().min(60).max(31536000)}),
 z.object({kind:z.literal('at'),at:z.iso.datetime({offset:true})}),
 z.object({kind:z.literal('every'),every_seconds:z.number().int().min(60).max(31536000)}),
 z.object({kind:z.literal('daily'),daily:z.object({time:z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),time_zone:z.string().min(1).max(100)})}),
]);
export const taskSchema = z.object({title:text.max(120),instruction:text,timing:timingSchema,goal:z.string().max(4000).optional(),maxRuns:z.number().int().min(1).max(1000).default(30),maxSteps:z.number().int().min(1).max(50).default(8),timeoutSeconds:z.number().int().min(15).max(1800).default(180),allowedTools:z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).max(30).default([])}).strict();
export type TaskInput = z.infer<typeof taskSchema>;
export const memorySchema = z.object({id:z.string().optional(),kind:z.enum(['fact','preference','project','goal']),content:text.max(4000),source:text.max(500),consent:z.literal(true)}).strict();
export const findingSchema = z.object({summary:text.max(2000),sources:z.array(z.url().refine(s=>s.startsWith('https://'))).max(20),changed:z.boolean()}).strict();
export type Finding = z.infer<typeof findingSchema>;
