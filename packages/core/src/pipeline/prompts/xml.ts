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

export function userPrompt(instructions: string, context: string): string {
  return `<user_prompt><instructions>${escapeXml(instructions)}</instructions><context>${escapeXml(context)}</context></user_prompt>`;
}
