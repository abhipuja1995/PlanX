import { supabaseAdmin } from '@/lib/supabase';

export async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `NRM-${year}-`;

  const { data } = await supabaseAdmin
    .from('quotes')
    .select('quote_number')
    .like('quote_number', `${prefix}%`)
    .order('quote_number', { ascending: false })
    .limit(1)
    .single();

  if (!data) return `${prefix}0001`;

  const last = parseInt(data.quote_number.replace(prefix, ''), 10);
  const next = (last + 1).toString().padStart(4, '0');
  return `${prefix}${next}`;
}
