export class KibacoError extends Error {
  constructor(
    message: string,
    public code = 1
  ) {
    super(message);
  }
}

export function kibacoError(message: string, code = 1) {
  return new KibacoError(message, code);
}
