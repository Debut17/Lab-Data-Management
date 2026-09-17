export function createResourceExtractionService({
  pdfExtractionService,
  aiGatewayService,
}) {
  if (!pdfExtractionService || typeof pdfExtractionService.extractText !== 'function') {
    throw new TypeError('PDF extraction service is required.');
  }
  if (!aiGatewayService || typeof aiGatewayService.extractResource !== 'function') {
    throw new TypeError('AI gateway service is required.');
  }

  return {
    async extract(file) {
      const { text } = await pdfExtractionService.extractText(file);
      return aiGatewayService.extractResource(text);
    },
  };
}
