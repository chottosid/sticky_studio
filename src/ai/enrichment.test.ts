import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from './enrichment';

describe('enrichment network safety', () => {
  it.each(['127.0.0.1', '10.0.0.1', '172.16.1.1', '192.168.1.1', '::1', 'fd00::1'])(
    'rejects private address %s',
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'permits public address %s',
    (address) => expect(isPrivateAddress(address)).toBe(false),
  );
});

