export type ResponseType<T = any> = {
  success: boolean;
  message: string | null;
  data: T | null;
};
export function makerResponse<T>(
  success: 0 | 1,
  message?: string,
  data?: T,
): ResponseType<T> {
  return {
    success: success === 1,
    message: message ?? null,
    data: data ?? null,
  };
}
