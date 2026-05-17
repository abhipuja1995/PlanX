import { supabaseAdmin } from '@/lib/supabase';

type EntityType = 'quote' | 'pricing' | 'approval' | 'vendor' | 'config';

export async function writeAuditLog({
  entityType,
  entityId,
  action,
  changedBy,
  previousValue,
  updatedValue,
  remarks,
}: {
  entityType: EntityType;
  entityId: string;
  action: string;
  changedBy: string;
  previousValue?: object;
  updatedValue?: object;
  remarks?: string;
}) {
  await supabaseAdmin.from('audit_logs').insert({
    entity_type:    entityType,
    entity_id:      entityId,
    action,
    changed_by:     changedBy,
    previous_value: previousValue ?? null,
    updated_value:  updatedValue ?? null,
    remarks:        remarks ?? null,
  });
}
