import { describe, expect, it } from 'vitest';
import { formatVpsCapacity } from './vps-capacity';

describe('VPS capacity formatting', () => {
  it('keeps only the compact CPU capacity', () => {
    expect(formatVpsCapacity('4 vCPU / AMD EPYC Genoa', 'cpu')).toBe('4 vCPU');
  });

  it('normalizes memory and storage capacity units', () => {
    expect(formatVpsCapacity('7.75 GiB', 'memory')).toBe('7.75 GB');
    expect(formatVpsCapacity('502.85 GiB root volume', 'storage')).toBe('502.85 GB');
  });

  it('uses a placeholder when capacity is missing', () => {
    expect(formatVpsCapacity(null, 'cpu')).toBe('-');
  });
});
