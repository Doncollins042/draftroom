// WhatsApp's 24-hour customer service window: free-form messages are only
// allowed within 24h of the client's last inbound message. Outside it, only
// pre-approved template messages can be sent.

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowState(lastInboundAt: Date | null | undefined) {
  if (!lastInboundAt) return { open: false, hoursLeft: 0 };
  const elapsed = Date.now() - lastInboundAt.getTime();
  const remaining = SERVICE_WINDOW_MS - elapsed;
  return {
    open: remaining > 0,
    hoursLeft: Math.max(0, remaining / 3_600_000),
  };
}
