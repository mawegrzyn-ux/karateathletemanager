export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    const message = body?.error?.message ?? res.statusText;
    throw new ApiError(message, res.status);
  }

  return body as T;
}

export function useApi() {
  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, data: unknown) =>
      request<T>(path, { method: "POST", body: JSON.stringify(data) }),
    put: <T>(path: string, data: unknown) =>
      request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
    patch: <T>(path: string, data: unknown) =>
      request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
    del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}
