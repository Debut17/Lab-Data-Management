import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createResourceExtractionService } from '../src/services/resourceExtractionService.js';

describe('Resource extraction service', () => {
  test('extracts PDF text before requesting structured resource fields', async () => {
    const calls = [];
    const file = {
      buffer: Buffer.from('%PDF-1.7'),
      originalName: 'resource.pdf',
      mimeType: 'application/pdf',
      size: 8,
    };
    const expectedSuggestions = {
      name: 'BX53 Upright Microscope',
      category: 'Microscope',
      location: null,
    };
    const service = createResourceExtractionService({
      pdfExtractionService: {
        async extractText(receivedFile) {
          calls.push(['pdf', receivedFile]);
          return { text: 'BX53 source text', method: 'embedded' };
        },
      },
      aiGatewayService: {
        async extractResource(text) {
          calls.push(['ai', text]);
          return expectedSuggestions;
        },
      },
    });

    const suggestions = await service.extract(file);

    assert.equal(suggestions, expectedSuggestions);
    assert.deepEqual(calls, [
      ['pdf', file],
      ['ai', 'BX53 source text'],
    ]);
  });
});
