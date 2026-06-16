export class KibanError extends Error {
  constructor(
    message: string,
    public code = 1
  ) {
    super(message);
  }
}

export function kibanError(message: string, code = 1) {
  return new KibanError(message, code);
}
