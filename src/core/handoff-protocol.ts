const HANDOFF_PREFIX = 'SUPERTASK_HANDOFF_V1:';
const MAX_HANDOFF_MESSAGE_CHARS = 4_000;

export function encodeHandoffMarker(message: string): string {
    const normalized = message.trim();
    if (!normalized) throw new Error('handoff message is required');
    if (normalized.length > MAX_HANDOFF_MESSAGE_CHARS) {
        throw new Error(`handoff message exceeds ${MAX_HANDOFF_MESSAGE_CHARS} characters`);
    }
    return `${HANDOFF_PREFIX}${Buffer.from(normalized, 'utf8').toString('base64url')}`;
}

export function extractHandoffMessage(output: string): string | null {
    const match = output.match(new RegExp(`${HANDOFF_PREFIX}([A-Za-z0-9_-]+)`));
    if (!match?.[1]) return null;
    try {
        const message = Buffer.from(match[1], 'base64url').toString('utf8').trim();
        if (!message || message.length > MAX_HANDOFF_MESSAGE_CHARS) return null;
        return message;
    } catch {
        return null;
    }
}
