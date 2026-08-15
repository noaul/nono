import { describe, expect, it } from 'vitest';
import { classifyAuditMutation } from '../src/plugins/audit.js';

describe('Clipper audit classification', () => {
  it('classifies clip mutations as clipper rather than falling through', () => {
    expect(classifyAuditMutation('POST', '/api/clipper/clips')!.resourceType).toBe('clipper');
    expect(classifyAuditMutation('PATCH', '/api/clipper/clips/1')!.resourceType).toBe('clipper');
    expect(classifyAuditMutation('DELETE', '/api/clipper/clips/1')!.resourceType).toBe('clipper');
    expect(classifyAuditMutation('POST', '/api/clipper/tags')!.resourceType).toBe('clipper');
    expect(classifyAuditMutation('POST', '/api/clipper/clips/1/highlights')!.resourceType).toBe('clipper');
    expect(classifyAuditMutation('POST', '/api/clipper/clips/1/refetch')!.resourceType).toBe('clipper');
  });

  it('does not misclassify other product routes', () => {
    expect(classifyAuditMutation('POST', '/api/nostar/sync')!.resourceType).toBe('nostar');
    expect(classifyAuditMutation('POST', '/api/nodesk/articles')!.resourceType).toBe('nodesk');
  });
});
