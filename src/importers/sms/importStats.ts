export class ImportStatistics {
  private totalMessages: number = 0;
  private failedMessages: number = 0;

  incrementTotalMessages(count: number): void {
    this.totalMessages += count;
  }

  incrementFailedMessages(count: number): void {
    this.failedMessages += count;
  }

  getSummary(): { total: number; failed: number; successRate: number } {
    const successRate = this.totalMessages > 0 ? (this.totalMessages - this.failedMessages) / this.totalMessages : 0;
    return {
      total: this.totalMessages,
      failed: this.failedMessages,
      successRate: parseFloat(successRate.toFixed(2)),
    };
  }
}