export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&apos;';
    }
  });
}

export function systemPrompt(instructions: string): string {
  return `<system_prompt><instructions>${escapeXml(instructions)}</instructions></system_prompt>`;
}

/** Put `preamble` ahead of a system prompt's own instructions, inside the same element. */
export function withPreamble(system: string, preamble: string): string {
  return system.replace('<instructions>', `<instructions>${escapeXml(preamble)}\n\n`);
}

export function userPrompt(instructions: string, context: string): string {
  return `<user_prompt><instructions>${escapeXml(instructions)}</instructions><context>${escapeXml(context)}</context></user_prompt>`;
}
