export function successEnvelope<T>(data: T) {
  return {
    request_id: `req_${Math.random().toString(36).slice(2, 10)}`,
    data,
    meta: {
      served_at: new Date().toISOString(),
    },
  };
}
