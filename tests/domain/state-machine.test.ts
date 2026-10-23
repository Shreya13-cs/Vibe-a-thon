import { describe, expect, it } from 'vitest';
import { InvalidTransitionError } from '../../src/domain/errors.ts';
import { transitionClaim, transitionJob } from '../../src/domain/state-machine.ts';

describe('state transitions', () => {
  it('accepts the normal job lifecycle', () => {
    expect(transitionJob('planned', 'claimed')).toBe('claimed');
    expect(transitionJob('claimed', 'en_route_pickup')).toBe('en_route_pickup');
    expect(transitionJob('en_route_pickup', 'at_pickup')).toBe('at_pickup');
    expect(transitionJob('at_pickup', 'picked_up')).toBe('picked_up');
    expect(transitionJob('picked_up', 'in_transit')).toBe('in_transit');
    expect(transitionJob('in_transit', 'arrived')).toBe('arrived');
    expect(transitionJob('arrived', 'accepted')).toBe('accepted');
  });

  it('rejects skipping a safety-relevant state', () => {
    expect(() => transitionJob('planned', 'accepted')).toThrow(InvalidTransitionError);
  });

  it('allows claim release but not reuse of a released claim', () => {
    expect(transitionClaim('held', 'released')).toBe('released');
    expect(() => transitionClaim('released', 'held')).toThrow(InvalidTransitionError);
  });
});
