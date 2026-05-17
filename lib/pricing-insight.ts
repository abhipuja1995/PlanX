import Anthropic from '@anthropic-ai/sdk';
import type { PricingResult } from '@/lib/pricing-engine';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function getPricingInsight(result: PricingResult, customerName: string): Promise<string> {
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are a B2B pricing advisor for a telecom/communications company.
Given this quote pricing data for ${customerName}, provide a 2-3 sentence recommendation covering:
1. Win probability based on margin positioning
2. Whether the discount headroom should be used now or held in reserve
3. One negotiation tip

Data:
- Margin: ${result.gross_margin_pct.toFixed(1)}% (${result.profit_status})
- Final price vs floor: ${result.final_price} vs ${result.floor_price} (buffer: ${(result.final_price - result.floor_price).toFixed(4)})
- Manual discount applied: ${result.manual_discount_pct}%
- Recommended additional discount available: ${result.recommended_discount_pct}%
- Approval required: ${result.approval_required}
- Commitment: provided separately

Respond in plain text, 2-3 sentences, no bullet points, no markdown.`
      }]
    });

    const block = msg.content[0];
    return block.type === 'text' ? block.text : '';
  } catch {
    return '';
  }
}
