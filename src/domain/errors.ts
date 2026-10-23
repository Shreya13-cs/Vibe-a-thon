export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} -> ${to}`, 'INVALID_TRANSITION');
  }
}

export class InvariantViolationError extends DomainError {
  constructor(message: string) {
    super(message, 'INVARIANT_VIOLATION');
  }
}
